-- =====================================================================================
-- MIGRACIÓN v2.3 — Rotación editable (16-nov-2026)
-- Se pega COMPLETA en el SQL Editor de Supabase y se aprieta "Run". No borra nada.
--   · asignar_rotacion(p_items): recibe la propuesta EDITADA por el admin
--     [{estacionamiento_id, persona_id, desde, hasta}, ...] y la aplica:
--     choques (gana la rotación, con avisos), asignación marcada 'rotacion',
--     la persona pasa al final de la lista, avisos a la persona y resumen a los admins.
--   · correr_rotacion(): (la usará la revisión automática diaria) arma la propuesta por defecto
--     (hoy → un mes, primeros de la lista) y llama a asignar_rotacion.
-- Todo ocurre de una vez: si algo choca (ej. esa persona ya tiene puesto esos días), no se guarda nada
-- y el error llega en español.
-- =====================================================================================

begin;

create function public.asignar_rotacion(p_items jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  it jsonb;
  v_est int;
  v_numero text;
  v_persona uuid;
  v_nombre text;
  v_desde date;
  v_hasta date;
  r record;
  v_resumen text := '';
  v_asignados int := 0;
begin
  -- Solo el admin (desde la app) o la revisión automática (sin sesión, dentro de la base de datos)
  if auth.uid() is not null and not es_admin() then
    raise exception 'Solo el admin puede asignar la rotación';
  end if;

  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_est := (it ->> 'estacionamiento_id')::int;
    v_persona := (it ->> 'persona_id')::uuid;
    v_desde := (it ->> 'desde')::date;
    v_hasta := (it ->> 'hasta')::date;
    select numero into v_numero from estacionamientos where id = v_est;
    select nombre into v_nombre from personas where id = v_persona and activa;
    if v_numero is null or v_nombre is null then
      raise exception 'Puesto o persona no válidos en la rotación';
    end if;
    if v_hasta < v_desde then
      raise exception 'En el %, la fecha "hasta" es anterior a "desde"', v_numero;
    end if;

    -- Choque 1: días sueltos que esa persona tomó en otros puestos durante ese periodo → quedan libres
    for r in
      select res.id, res.fecha, e.numero from reservas res join estacionamientos e on e.id = res.estacionamiento_id
      where res.persona_id = v_persona and res.fecha between v_desde and v_hasta
    loop
      insert into avisos (persona_id, texto)
      values (v_persona, format('Te tocó la rotación: tu reserva del %s el %s quedó libre para otros.', r.numero, to_char(r.fecha, 'DD-MM-YYYY')));
      delete from reservas where id = r.id;
    end loop;

    -- Choque 2: otra persona había tomado un día de este puesto → gana la rotación
    for r in
      select id, persona_id, fecha from reservas where estacionamiento_id = v_est and fecha between v_desde and v_hasta
    loop
      insert into avisos (persona_id, texto)
      values (r.persona_id, format('El %s entró a la rotación: tu reserva del %s se canceló. Toma otro puesto libre.', v_numero, to_char(r.fecha, 'DD-MM-YYYY')));
      delete from reservas where id = r.id;
    end loop;

    -- La asignación (marcada como "rotacion"). Las reglas de siempre las revisa validar_periodo.
    insert into periodos (estacionamiento_id, desde, hasta, para_id, motivo, origen)
    values (v_est, v_desde, v_hasta, v_persona, 'rotación', 'rotacion');

    -- Pasa al final de la lista (si está en ella)
    update lista_espera set orden = (select coalesce(max(orden), 0) + 1 from lista_espera) where persona_id = v_persona;

    insert into avisos (persona_id, texto)
    values (v_persona, format('¡Te tocó el %s por rotación! Del %s al %s.', v_numero, to_char(v_desde, 'DD-MM-YYYY'), to_char(v_hasta, 'DD-MM-YYYY')));

    v_resumen := v_resumen || format('%s → %s (%s al %s); ', v_numero, v_nombre, to_char(v_desde, 'DD-MM'), to_char(v_hasta, 'DD-MM'));
    v_asignados := v_asignados + 1;
  end loop;

  if v_asignados = 0 then
    return 'No se asignó nada.';
  end if;

  -- "Saltar el próximo turno" ya se usó: se quita la marca (conservan su lugar)
  update lista_espera set saltar = false where saltar;

  v_resumen := 'Rotación asignada: ' || rtrim(v_resumen, '; ');
  insert into avisos (persona_id, texto)
  select id, v_resumen from personas where rol = 'admin' and activa;
  return v_resumen;
end $$;

-- correr_rotacion (revisión automática): propuesta por defecto = hoy → un mes, primeros de la lista
create or replace function public.correr_rotacion() returns text
language plpgsql security definer set search_path = public as $$
declare
  v_hoy date := hoy_chile();
  v_fin date := (hoy_chile() + interval '1 month')::date - 1; -- ej. 15-11 → 14-12
  v_est record;
  v_persona uuid;
  v_items jsonb := '[]'::jsonb;
  v_usadas uuid[] := '{}';
begin
  if auth.uid() is not null and not es_admin() then
    raise exception 'Solo el admin puede correr la rotación';
  end if;
  if extract(isodow from v_hoy) > 5 then
    return 'Hoy no es día hábil: la rotación no corre.';
  end if;

  for v_est in select * from estacionamientos where libre_para_rotar(id, v_hoy) order by numero loop
    select le.persona_id into v_persona
    from lista_espera le join personas p on p.id = le.persona_id
    where not le.saltar and p.activa and not (le.persona_id = any (v_usadas))
      and not exists (select 1 from estacionamientos e where e.dueno_id = le.persona_id)
      and not exists (select 1 from periodos pe where pe.para_id = le.persona_id
                      and pe.desde <= v_fin and (pe.hasta is null or pe.hasta >= v_hoy))
    order by le.orden
    limit 1;
    exit when v_persona is null;
    v_usadas := v_usadas || v_persona;
    v_items := v_items || jsonb_build_object('estacionamiento_id', v_est.id, 'persona_id', v_persona, 'desde', v_hoy, 'hasta', v_fin);
  end loop;

  if jsonb_array_length(v_items) = 0 then
    return 'No había puestos libres para rotar (o nadie disponible en la lista).';
  end if;
  return asignar_rotacion(v_items);
end $$;

-- Solo usuarios con sesión pueden llamarlas (y adentro se revisa que sea admin). Nadie anónimo.
revoke execute on function public.asignar_rotacion(jsonb) from public, anon;
grant execute on function public.asignar_rotacion(jsonb) to authenticated;

commit;
