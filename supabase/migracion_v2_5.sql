-- Migración v2.5 (17-nov-2026): nueva regla al TOMAR un puesto día a día.
--   · Máximo 2 días por semana (lunes a viernes).
--   · Nunca 2 días hábiles seguidos (viernes y el lunes siguiente cuentan como seguidos).
-- Reemplaza la regla anterior ("máximo 2 días calendario seguidos").
-- Lo que asigna el admin (periodos / rotación) NO cuenta para este límite.
-- Las reservas ya hechas no se borran: la regla aplica a lo que se tome desde ahora.

create or replace function public.validar_reserva() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  dia_antes date;    -- día hábil anterior (lunes → viernes previo)
  dia_despues date;  -- día hábil siguiente (viernes → lunes siguiente)
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

  -- Nunca 2 días hábiles seguidos
  dia_antes   := new.fecha - case when extract(isodow from new.fecha) = 1 then 3 else 1 end;
  dia_despues := new.fecha + case when extract(isodow from new.fecha) = 5 then 3 else 1 end;
  if exists (select 1 from reservas where persona_id = new.persona_id and id is distinct from new.id
             and fecha in (dia_antes, dia_despues)) then
    raise exception 'No puedes tomar 2 días seguidos: deja al menos un día entre medio';
  end if;

  -- Máximo 2 días por semana (lunes a viernes)
  if (select count(*) from reservas where persona_id = new.persona_id and id is distinct from new.id
      and date_trunc('week', fecha) = date_trunc('week', new.fecha)) >= 2 then
    raise exception 'Ya tomaste 2 días esa semana (máximo 2 por semana)';
  end if;

  return new;
end $$;
