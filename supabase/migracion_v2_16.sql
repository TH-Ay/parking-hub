-- Migración v2.16 (19-nov-2026): TURNOS DE ROTACIÓN POR MES, de lunes a viernes.
--   · Cada semana (lunes a viernes) es del mes donde cae su JUEVES (= donde están la mayoría de sus días).
--     Turno de un mes = del lunes de su primera semana al viernes antes del turno siguiente.
--     Ej.: dic-2026 = lun 30-11 → vie 01-01 (incluye 28, 29, 30 y 31 dic); ene-2027 = lun 04-01 → vie 29-01.
--   · correr_rotacion() (la llama el programa automático cada mañana hábil): UNA SEMANA ANTES del
--     próximo turno reparte los puestos que esperan rotación entre los primeros de la lista de espera,
--     por todo ese turno. Cada persona recibe el aviso "¡Te tocó el X por rotación! Del … al …"
--     (lo hace asignar_rotacion) y lo ve en "Lo tuyo" como "Próximamente". Si ya se repartió, no hace nada.
begin;

-- Mes (día 1) al que pertenece la semana de esa fecha
create or replace function public.mes_del_turno(p_fecha date) returns date
language sql immutable as $$
  select date_trunc('month', p_fecha - extract(isodow from p_fecha)::int + 4)::date;
$$;

-- Lunes en que parte el turno del mes de p_mes (cualquier día de ese mes)
create or replace function public.inicio_turno(p_mes date) returns date
language sql immutable as $$
  select (m + ((4 - extract(isodow from m)::int + 7) % 7) - 3)::date
  from (select date_trunc('month', p_mes)::date as m) x;
$$;

-- Viernes en que termina el turno del mes de p_mes
create or replace function public.fin_turno(p_mes date) returns date
language sql immutable as $$
  select inicio_turno((date_trunc('month', p_mes) + interval '1 month')::date) - 3;
$$;

-- ¿Está libre para rotar entre esas fechas? (misma regla que libre_para_rotar de v2.10, con un rango)
create or replace function public.libre_para_rotar_en(p_est int, p_desde date, p_hasta date) returns boolean
language sql security definer set search_path = public stable as $$
  select case
    when e.tipo = 'especial' then false
    when exists (select 1 from periodos pe where pe.estacionamiento_id = e.id and pe.para_id is not null
                 and pe.desde <= p_hasta and (pe.hasta is null or pe.hasta >= p_desde)) then false
    -- un variable liberado "para todos" en esas fechas no entra a la rotación
    when e.tipo = 'variable' and exists (select 1 from periodos pe where pe.estacionamiento_id = e.id
                 and pe.para_id is null and pe.cede_id is null and pe.para_todos
                 and pe.desde <= p_hasta and (pe.hasta is null or pe.hasta >= p_desde)) then false
    when e.tipo = 'variable' then not e.dia_a_dia
    when e.dueno_id is null then false
    else exists (select 1 from periodos pe where pe.estacionamiento_id = e.id
                 and pe.para_id is null and pe.cede_id is null and pe.dia_semana is null and not pe.para_todos
                 and pe.desde <= p_desde and (pe.hasta is null or pe.hasta >= p_hasta))
  end
  from estacionamientos e where e.id = p_est;
$$;

-- Reparto automático: una semana antes del próximo turno, para todo ese turno
create or replace function public.correr_rotacion() returns text
language plpgsql security definer set search_path = public as $$
declare
  v_hoy date := hoy_chile();
  v_mes date := (mes_del_turno(v_hoy) + interval '1 month')::date; -- el próximo turno
  v_desde date := inicio_turno(v_mes);
  v_hasta date := fin_turno(v_mes);
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
  if v_hoy < v_desde - 7 then
    return format('Aún no: el turno del %s al %s se reparte desde el %s.',
                  to_char(v_desde, 'DD-MM'), to_char(v_hasta, 'DD-MM'), to_char(v_desde - 7, 'DD-MM'));
  end if;

  for v_est in select * from estacionamientos where libre_para_rotar_en(id, v_desde, v_hasta) order by numero loop
    select le.persona_id into v_persona
    from lista_espera le join personas p on p.id = le.persona_id
    where not le.saltar and p.activa and not p.varios_puestos and not (le.persona_id = any (v_usadas))
      and not exists (select 1 from estacionamientos e where e.dueno_id = le.persona_id)
      and not exists (select 1 from periodos pe where pe.para_id = le.persona_id
                      and pe.desde <= v_hasta and (pe.hasta is null or pe.hasta >= v_desde))
    order by le.orden
    limit 1;
    exit when v_persona is null;
    v_usadas := v_usadas || v_persona;
    v_items := v_items || jsonb_build_object('estacionamiento_id', v_est.id, 'persona_id', v_persona, 'desde', v_desde, 'hasta', v_hasta);
  end loop;

  if jsonb_array_length(v_items) = 0 then
    return 'No había puestos esperando rotación (o nadie disponible en la lista).';
  end if;
  return asignar_rotacion(v_items);
end $$;

commit;
