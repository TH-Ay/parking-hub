-- Migración v2.13 (19-nov-2026): "No voy" de un préstamo que se repite cada semana (ej. "cada martes").
--   Antes, al liberar "unas fechas" podía quedar libre un día que no era de esa persona (ej. un miércoles del dueño).
--   Ahora la liberación toma siempre el mismo día de la semana del préstamo. (Base = validar_periodo de v2.11)
begin;

create or replace function public.validar_periodo() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_est estacionamientos;
  f date;
  r record;
  v_asig periodos;
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

  -- "No voy" de quien tiene el puesto asignado: siempre para todos y dentro de su asignación
  if new.cede_id is not null then
    new.para_id := null;
    new.para_todos := true;
    select pe.* into v_asig from periodos pe where pe.estacionamiento_id = new.estacionamiento_id
      and pe.para_id = new.cede_id and pe.desde <= new.desde
      and (pe.hasta is null or (new.hasta is not null and new.hasta <= pe.hasta))
    limit 1;
    if v_asig.id is null then
      raise exception 'Solo puedes liberar días dentro de tu turno del %', v_est.numero;
    end if;
    -- Préstamo "cada martes": solo se liberan sus martes (nunca días que no son suyos)
    if v_asig.dia_semana is not null then
      new.dia_semana := v_asig.dia_semana;
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

commit;
