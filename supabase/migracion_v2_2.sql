-- =====================================================================================
-- MIGRACIÓN v2.2 — Correr la rotación (16-nov-2026)
-- Se pega COMPLETA en el SQL Editor de Supabase y se aprieta "Run". No borra nada.
-- Crea la función correr_rotacion(): la usa el botón "Correr rotación ahora" del admin
-- y, más adelante, la revisión automática diaria (pg_cron).
--
-- Qué hace (reglas acordadas, ver CLAUDE.md):
--   · Solo en días hábiles (lunes a viernes).
--   · Cada puesto LIBRE PARA ROTAR (libre por al menos un mes, sin nadie asignado) se le da
--     al PRIMERO de la lista de espera (que no se salte y no tenga puesto) por UN MES:
--     desde hoy hasta el día anterior del mes siguiente. Esa persona pasa al FINAL de la lista.
--   · Choques: gana la rotación. Los días sueltos que esa persona había tomado en otros puestos
--     quedan libres; y si otra persona había tomado un día de ese puesto, se le cancela. Ambos con aviso.
--   · Avisos: a la persona ("Te tocó…") y a los admins (resumen).
--   · "Saltar el próximo turno" se consume cuando la rotación asigna algo (la persona conserva su lugar).
-- =====================================================================================

begin;

-- ¿El puesto está libre para rotar desde p_hoy por un mes?
--   variable sin nadie asignado en ese mes, o fijo con dueño liberado "para cualquiera"
--   sin fecha de término o hasta el fin de ese mes o más. Nunca especiales ni fijos sin dueño.
create function public.libre_para_rotar(p_est int, p_hoy date) returns boolean
language sql security definer set search_path = public stable as $$
  select case
    when e.tipo = 'especial' then false
    -- ya hay alguien asignado en algún momento de ese mes
    when exists (select 1 from periodos pe where pe.estacionamiento_id = e.id and pe.para_id is not null
                 and pe.desde <= (p_hoy + interval '1 month')::date - 1
                 and (pe.hasta is null or pe.hasta >= p_hoy)) then false
    when e.tipo = 'variable' then true
    when e.dueno_id is null then false
    else exists (select 1 from periodos pe where pe.estacionamiento_id = e.id
                 and pe.para_id is null and pe.dia_semana is null and pe.desde <= p_hoy
                 and (pe.hasta is null or pe.hasta >= (p_hoy + interval '1 month')::date - 1))
  end
  from estacionamientos e where e.id = p_est;
$$;

create function public.correr_rotacion() returns text
language plpgsql security definer set search_path = public as $$
declare
  v_hoy date := hoy_chile();
  v_fin date := (hoy_chile() + interval '1 month')::date - 1; -- ej. 15-11 → 14-12
  v_est record;
  v_persona uuid;
  v_nombre text;
  r record;
  v_resumen text := '';
  v_asignados int := 0;
begin
  -- Solo el admin (desde la app) o la revisión automática (sin sesión, dentro de la base de datos)
  if auth.uid() is not null and not es_admin() then
    raise exception 'Solo el admin puede correr la rotación';
  end if;
  if extract(isodow from v_hoy) > 5 then
    return 'Hoy no es día hábil: la rotación no corre.';
  end if;

  for v_est in
    select * from estacionamientos where libre_para_rotar(id, v_hoy) order by numero
  loop
    -- El primero de la lista que no se salta, está activo y no tiene puesto en ese mes
    select le.persona_id, p.nombre into v_persona, v_nombre
    from lista_espera le join personas p on p.id = le.persona_id
    where not le.saltar and p.activa
      and not exists (select 1 from estacionamientos e where e.dueno_id = le.persona_id)
      and not exists (select 1 from periodos pe where pe.para_id = le.persona_id
                      and pe.desde <= v_fin and (pe.hasta is null or pe.hasta >= v_hoy))
    order by le.orden
    limit 1;
    exit when v_persona is null; -- no queda nadie en la lista

    -- Choque 1: días sueltos que esa persona tomó en otros puestos durante su mes → quedan libres
    for r in
      select res.id, res.fecha, e.numero from reservas res join estacionamientos e on e.id = res.estacionamiento_id
      where res.persona_id = v_persona and res.fecha between v_hoy and v_fin
    loop
      insert into avisos (persona_id, texto)
      values (v_persona, format('Te tocó la rotación: tu reserva del %s el %s quedó libre para otros.', r.numero, to_char(r.fecha, 'DD-MM-YYYY')));
      delete from reservas where id = r.id;
    end loop;

    -- Choque 2: otra persona había tomado un día de este puesto → gana la rotación
    for r in
      select id, persona_id, fecha from reservas where estacionamiento_id = v_est.id and fecha between v_hoy and v_fin
    loop
      insert into avisos (persona_id, texto)
      values (r.persona_id, format('El %s entró a la rotación: tu reserva del %s se canceló. Toma otro puesto libre.', v_est.numero, to_char(r.fecha, 'DD-MM-YYYY')));
      delete from reservas where id = r.id;
    end loop;

    -- La asignación por un mes (marcada como "rotacion")
    insert into periodos (estacionamiento_id, desde, hasta, para_id, motivo, origen)
    values (v_est.id, v_hoy, v_fin, v_persona, 'rotación', 'rotacion');

    -- Pasa al final de la lista
    update lista_espera set orden = (select coalesce(max(orden), 0) + 1 from lista_espera) where persona_id = v_persona;

    insert into avisos (persona_id, texto)
    values (v_persona, format('¡Te tocó el %s por rotación! Del %s al %s.', v_est.numero, to_char(v_hoy, 'DD-MM-YYYY'), to_char(v_fin, 'DD-MM-YYYY')));

    v_resumen := v_resumen || format('%s → %s; ', v_est.numero, v_nombre);
    v_asignados := v_asignados + 1;
  end loop;

  if v_asignados = 0 then
    return 'No había puestos libres para rotar (o nadie disponible en la lista).';
  end if;

  -- "Saltar el próximo turno" ya se usó: se quita la marca (conservan su lugar)
  update lista_espera set saltar = false where saltar;

  -- Resumen para los admins
  v_resumen := format('Rotación asignada (%s al %s): %s', to_char(v_hoy, 'DD-MM-YYYY'), to_char(v_fin, 'DD-MM-YYYY'), rtrim(v_resumen, '; '));
  insert into avisos (persona_id, texto)
  select id, v_resumen from personas where rol = 'admin' and activa;

  return v_resumen;
end $$;

-- Solo usuarios con sesión pueden llamarla (y adentro se revisa que sea admin). Nadie anónimo.
revoke execute on function public.correr_rotacion() from public, anon;
grant execute on function public.correr_rotacion() to authenticated;

commit;
