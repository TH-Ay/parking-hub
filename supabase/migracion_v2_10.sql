-- Migración v2.10 (18-nov-2026): huecos detectados al revisar los casos.
--   1. FERIADOS: tabla feriados (fecha, nombre). No se pueden tomar puestos un feriado. La app los muestra en gris.
--   2. ANTICIPACIÓN: al TOMAR, solo esta semana y la siguiente (hasta el viernes de la próxima semana).
--   3. ASIGNAR un puesto (periodo para una persona) que alguien ya tomó algún día: gana la asignación,
--      a esa persona se le cancela el día con aviso (antes daba error).
--   4. BAJA en plena rotación/asignación: los días que le quedaban
--        · si queda 1 mes o más → se le dan a la siguiente persona de la lista de espera (si hay alguien);
--        · si queda menos de 1 mes (o no hay nadie en la lista) → quedan "para todos" día a día.
-- Lo que asigna el admin no tiene límite de anticipación.
begin;

-- ===== 1. Feriados =====
create table if not exists public.feriados (
  fecha date primary key,
  nombre text not null
);
alter table public.feriados enable row level security;
create policy "todos leen feriados" on public.feriados for select to authenticated using (true);
create policy "admin edita feriados" on public.feriados for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- Feriados de Chile 2026-2027 (REVISAR con feriados.cl; los de fin de semana no afectan, quedan por completitud)
insert into public.feriados (fecha, nombre) values
  ('2026-01-01', 'Año Nuevo'),
  ('2026-04-03', 'Viernes Santo'),
  ('2026-04-04', 'Sábado Santo'),
  ('2026-05-01', 'Día del Trabajo'),
  ('2026-05-21', 'Glorias Navales'),
  ('2026-06-21', 'Día de los Pueblos Indígenas'),
  ('2026-06-29', 'San Pedro y San Pablo'),
  ('2026-07-16', 'Virgen del Carmen'),
  ('2026-08-15', 'Asunción de la Virgen'),
  ('2026-09-18', 'Independencia Nacional'),
  ('2026-09-19', 'Glorias del Ejército'),
  ('2026-10-12', 'Encuentro de Dos Mundos'),
  ('2026-10-31', 'Día de las Iglesias Evangélicas'),
  ('2026-11-01', 'Todos los Santos'),
  ('2026-12-08', 'Inmaculada Concepción'),
  ('2026-12-25', 'Navidad'),
  ('2027-01-01', 'Año Nuevo'),
  ('2027-03-26', 'Viernes Santo'),
  ('2027-03-27', 'Sábado Santo'),
  ('2027-05-01', 'Día del Trabajo'),
  ('2027-05-21', 'Glorias Navales'),
  ('2027-06-21', 'Día de los Pueblos Indígenas'),
  ('2027-06-28', 'San Pedro y San Pablo'),
  ('2027-07-16', 'Virgen del Carmen'),
  ('2027-08-15', 'Asunción de la Virgen'),
  ('2027-09-18', 'Independencia Nacional'),
  ('2027-09-19', 'Glorias del Ejército'),
  ('2027-10-11', 'Encuentro de Dos Mundos'),
  ('2027-10-31', 'Día de las Iglesias Evangélicas'),
  ('2027-11-01', 'Todos los Santos'),
  ('2027-12-08', 'Inmaculada Concepción'),
  ('2027-12-25', 'Navidad')
on conflict (fecha) do nothing;

-- ===== 1 y 2. Al TOMAR: feriados y anticipación (se reemplaza la función completa; base = v2.6) =====
create or replace function public.validar_reserva() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_limite date := (date_trunc('week', hoy_chile()) + interval '11 days')::date; -- viernes de la próxima semana
  v_feriado text;
begin
  if new.fecha < hoy_chile() then
    raise exception 'No puedes tomar estacionamientos en fechas pasadas';
  end if;
  if extract(isodow from new.fecha) > 5 then
    raise exception 'Solo se pueden tomar estacionamientos de lunes a viernes';
  end if;
  select nombre into v_feriado from feriados where fecha = new.fecha;
  if v_feriado is not null then
    raise exception 'Ese día es feriado (%)', v_feriado;
  end if;
  if new.fecha > v_limite then
    raise exception 'Solo puedes tomar hasta el viernes de la próxima semana (%)', to_char(v_limite, 'DD-MM');
  end if;
  if exists (select 1 from estacionamientos where id = new.estacionamiento_id and dueno_id = new.persona_id) then
    raise exception 'Este estacionamiento ya es tuyo: recupéralo desde "Lo tuyo"';
  end if;
  if es_de_rotacion(new.estacionamiento_id, new.fecha) then
    raise exception 'Este estacionamiento está reservado para la rotación (lista de espera)';
  end if;
  if not libre_para_tomar(new.estacionamiento_id, new.fecha) then
    raise exception 'Este estacionamiento no está disponible ese día';
  end if;
  if tiene_puesto(new.persona_id, new.fecha) then
    raise exception 'Ya tienes un estacionamiento ese día';
  end if;

  -- Máximo 1 día por semana (lunes a viernes)
  if exists (select 1 from reservas where persona_id = new.persona_id and id is distinct from new.id
             and date_trunc('week', fecha) = date_trunc('week', new.fecha)) then
    raise exception 'Ya tomaste un día esa semana (máximo 1 por semana)';
  end if;

  return new;
end $$;

-- ===== 3. Al ASIGNAR: los días ya tomados por otra persona se le cancelan con aviso =====
create or replace function public.validar_periodo() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_est estacionamientos;
  f date;
  r record;
begin
  select * into v_est from estacionamientos where id = new.estacionamiento_id;

  if tg_op = 'INSERT' then
    if new.desde < hoy_chile() then
      raise exception 'No puedes programar fechas pasadas';
    end if;
    if v_est.tipo = 'especial' then
      raise exception 'Un puesto especial no se libera ni se asigna';
    end if;
  end if;

  -- Asignación a una persona: revisar choques día por día (hasta 1 año si no tiene fin)
  if new.para_id is not null then
    for f in
      select d::date from generate_series(greatest(new.desde, hoy_chile()), coalesce(new.hasta, new.desde + 365), interval '1 day') d
    loop
      continue when extract(isodow from f) > 5
                 or (new.dia_semana is not null and extract(isodow from f) <> new.dia_semana);
      if exists (select 1 from periodos pe where pe.id <> new.id and pe.estacionamiento_id = new.estacionamiento_id
                 and pe.para_id is not null and periodo_cubre(pe, f)) then
        raise exception 'El % ya está asignado a otra persona el %', v_est.numero, to_char(f, 'DD-MM-YYYY');
      end if;
      -- Alguien lo había tomado ese día: gana la asignación (antes era error)
      for r in select id, persona_id from reservas
               where estacionamiento_id = new.estacionamiento_id and fecha = f and persona_id <> new.para_id loop
        insert into avisos (persona_id, texto)
        values (r.persona_id, format('El %s fue asignado a otra persona: tu reserva del %s se canceló. Toma otro puesto libre.', v_est.numero, to_char(f, 'DD-MM-YYYY')));
        delete from reservas where id = r.id;
      end loop;
      if tiene_puesto(new.para_id, f, new.id) then
        raise exception 'Esa persona ya tiene un estacionamiento el %', to_char(f, 'DD-MM-YYYY');
      end if;
    end loop;
  end if;

  return new;
end $$;

-- ===== 4. Un periodo "para todos" (para_todos, sin persona) manda sobre la rotación esos días =====
-- (lo crea la baja; también aplica a un "No voy" o liberación para todos sobre un fijo)
create or replace function public.es_de_rotacion(p_est int, p_fecha date) returns boolean
language sql security definer set search_path = public stable as $$
  select case
    when e.tipo = 'especial' then false
    -- ya asignado a alguien ese día: no está "esperando" rotación
    when exists (select 1 from periodos pe where pe.estacionamiento_id = e.id
                 and pe.para_id is not null and periodo_cubre(pe, p_fecha)) then false
    -- liberado "para todos" ese día: se toma día a día
    when exists (select 1 from periodos pe where pe.estacionamiento_id = e.id
                 and pe.para_id is null and pe.para_todos and periodo_cubre(pe, p_fecha)) then false
    when e.tipo = 'variable' then not e.dia_a_dia
    when e.dueno_id is null then false
    else exists (select 1 from periodos pe where pe.estacionamiento_id = e.id
                 and pe.para_id is null and pe.dia_semana is null and not pe.para_todos
                 and periodo_cubre(pe, p_fecha)
                 and (pe.hasta is null or pe.hasta >= (pe.desde + interval '1 month')::date - 1))
  end
  from estacionamientos e where e.id = p_est;
$$;

create or replace function public.libre_para_rotar(p_est int, p_hoy date) returns boolean
language sql security definer set search_path = public stable as $$
  select case
    when e.tipo = 'especial' then false
    when exists (select 1 from periodos pe where pe.estacionamiento_id = e.id and pe.para_id is not null
                 and pe.desde <= (p_hoy + interval '1 month')::date - 1
                 and (pe.hasta is null or pe.hasta >= p_hoy)) then false
    -- un variable liberado "para todos" en ese mes no entra a la rotación
    when e.tipo = 'variable' and exists (select 1 from periodos pe where pe.estacionamiento_id = e.id
                 and pe.para_id is null and pe.para_todos and pe.desde <= (p_hoy + interval '1 month')::date - 1
                 and (pe.hasta is null or pe.hasta >= p_hoy)) then false
    when e.tipo = 'variable' then not e.dia_a_dia
    when e.dueno_id is null then false
    else exists (select 1 from periodos pe where pe.estacionamiento_id = e.id
                 and pe.para_id is null and pe.dia_semana is null and not pe.para_todos and pe.desde <= p_hoy
                 and (pe.hasta is null or pe.hasta >= (p_hoy + interval '1 month')::date - 1))
  end
  from estacionamientos e where e.id = p_est;
$$;

-- ===== 4. BAJA: qué pasa con los días de rotación/asignación que le quedaban =====
create or replace function public.al_dar_de_baja() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pe record;
  v_desde date;
  v_hasta date;
  v_sig uuid;
begin
  if old.activa and not new.activa then
    update estacionamientos set dueno_id = null where dueno_id = new.id;
    delete from reservas where persona_id = new.id and fecha >= hoy_chile();

    for pe in select * from periodos where para_id = new.id and (hasta is null or hasta >= hoy_chile()) loop
      v_desde := greatest(pe.desde, hoy_chile());
      v_hasta := coalesce(pe.hasta, (v_desde + interval '1 month')::date - 1);
      -- Se le quita: lo futuro se borra, lo que está en curso termina ayer
      if pe.desde >= hoy_chile() then
        delete from periodos where id = pe.id;
      else
        update periodos set hasta = hoy_chile() - 1 where id = pe.id;
      end if;

      -- Queda 1 mes o más → la siguiente persona de la lista de espera
      v_sig := null;
      if v_hasta >= (v_desde + interval '1 month')::date - 1 then
        select le.persona_id into v_sig
        from lista_espera le join personas p on p.id = le.persona_id
        where not le.saltar and p.activa and le.persona_id <> new.id
          and not exists (select 1 from estacionamientos e where e.dueno_id = le.persona_id)
          and not exists (select 1 from periodos x where x.para_id = le.persona_id
                          and x.desde <= v_hasta and (x.hasta is null or x.hasta >= v_desde))
        order by le.orden
        limit 1;
      end if;

      if v_sig is not null then
        perform asignar_rotacion(jsonb_build_array(jsonb_build_object(
          'estacionamiento_id', pe.estacionamiento_id, 'persona_id', v_sig, 'desde', v_desde, 'hasta', v_hasta)));
      else
        -- Menos de 1 mes (o nadie en la lista) → para todos, día a día
        insert into periodos (estacionamiento_id, desde, hasta, para_todos, motivo)
        values (pe.estacionamiento_id, v_desde, v_hasta, true, 'Libre para todos (baja)');
      end if;
    end loop;
  end if;
  return null;
end $$;

commit;
