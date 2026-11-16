-- =====================================================================================
-- MIGRACIÓN v2.4 — Puestos de rotación reservados para la lista de espera (16-nov-2026)
-- Se pega COMPLETA en el SQL Editor de Supabase y se aprieta "Run". No borra nada.
--
-- Regla: un puesto "de rotación" NO se puede tomar día a día; solo se asigna por la rotación.
--   De rotación = fijo con dueño liberado "para cualquiera" SIN fecha de término o por UN MES o más
--                 (sin "cada semana"), o variable sin nadie asignado.
--   Excepción ("mientras no se diga lo contrario"): si el admin marcó la liberación como
--   para_todos = true, ese puesto sí lo puede tomar cualquiera día a día y no entra a la rotación.
-- =====================================================================================

begin;

-- 1. Nueva marca en los periodos
alter table public.periodos add column para_todos boolean not null default false;

-- 2. ¿Ese puesto está reservado para la rotación ese día?
create function public.es_de_rotacion(p_est int, p_fecha date) returns boolean
language sql security definer set search_path = public stable as $$
  select case
    when e.tipo = 'especial' then false
    -- ya asignado a alguien ese día: no está "esperando" rotación
    when exists (select 1 from periodos pe where pe.estacionamiento_id = e.id
                 and pe.para_id is not null and periodo_cubre(pe, p_fecha)) then false
    when e.tipo = 'variable' then true
    when e.dueno_id is null then false
    else exists (select 1 from periodos pe where pe.estacionamiento_id = e.id
                 and pe.para_id is null and pe.dia_semana is null and not pe.para_todos
                 and periodo_cubre(pe, p_fecha)
                 and (pe.hasta is null or pe.hasta >= (pe.desde + interval '1 month')::date - 1))
  end
  from estacionamientos e where e.id = p_est;
$$;

-- 3. Al tomar un puesto: los de rotación no se pueden tomar (se reemplaza la función completa)
create or replace function public.validar_reserva() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ayer boolean; anteayer boolean; manana boolean; pasado boolean;
begin
  if new.fecha < hoy_chile() then
    raise exception 'No puedes tomar estacionamientos en fechas pasadas';
  end if;
  if extract(isodow from new.fecha) > 5 then
    raise exception 'Solo se pueden tomar estacionamientos de lunes a viernes';
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

  -- Máximo 2 días calendario seguidos por persona
  select exists(select 1 from reservas where persona_id = new.persona_id and fecha = new.fecha - 1),
         exists(select 1 from reservas where persona_id = new.persona_id and fecha = new.fecha - 2),
         exists(select 1 from reservas where persona_id = new.persona_id and fecha = new.fecha + 1),
         exists(select 1 from reservas where persona_id = new.persona_id and fecha = new.fecha + 2)
  into ayer, anteayer, manana, pasado;
  if (ayer and anteayer) or (ayer and manana) or (manana and pasado) then
    raise exception 'No puedes tomar más de 2 días seguidos';
  end if;

  return new;
end $$;

-- 4. La rotación no toma las liberaciones marcadas "para todos" (se reemplaza la función completa)
create or replace function public.libre_para_rotar(p_est int, p_hoy date) returns boolean
language sql security definer set search_path = public stable as $$
  select case
    when e.tipo = 'especial' then false
    when exists (select 1 from periodos pe where pe.estacionamiento_id = e.id and pe.para_id is not null
                 and pe.desde <= (p_hoy + interval '1 month')::date - 1
                 and (pe.hasta is null or pe.hasta >= p_hoy)) then false
    when e.tipo = 'variable' then true
    when e.dueno_id is null then false
    else exists (select 1 from periodos pe where pe.estacionamiento_id = e.id
                 and pe.para_id is null and pe.dia_semana is null and not pe.para_todos and pe.desde <= p_hoy
                 and (pe.hasta is null or pe.hasta >= (p_hoy + interval '1 month')::date - 1))
  end
  from estacionamientos e where e.id = p_est;
$$;

commit;
