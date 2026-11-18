-- Migración v2.6 (18-nov-2026): nueva regla al TOMAR un puesto día a día.
--   · Máximo 1 día por semana (lunes a viernes).
-- Reemplaza la v2.5 ("máx. 2 por semana y nunca 2 días hábiles seguidos").
-- Lo que asigna el admin (periodos / rotación) NO cuenta para este límite.
-- Las reservas ya hechas no se borran: la regla aplica a lo que se tome desde ahora.

create or replace function public.validar_reserva() returns trigger
language plpgsql security definer set search_path = public as $$
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

  -- Máximo 1 día por semana (lunes a viernes)
  if exists (select 1 from reservas where persona_id = new.persona_id and id is distinct from new.id
             and date_trunc('week', fecha) = date_trunc('week', new.fecha)) then
    raise exception 'Ya tomaste un día esa semana (máximo 1 por semana)';
  end if;

  return new;
end $$;
