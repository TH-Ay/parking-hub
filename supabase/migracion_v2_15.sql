-- Migración v2.15 (19-nov-2026): PRÉSTAMO vs ROTACIÓN y prestar un día encima de una rotación.
--   · Rotación = periodos.origen 'rotacion' (sale de la lista de espera o el admin enciende "Es rotación").
--     Todo lo demás es Préstamo, dure lo que dure.
--   · Al dar una rotación a mano (origen 'rotacion'), la persona pasa al final de la lista de espera.
--   · El admin puede PRESTAR un puesto que otra persona tiene (rotación o préstamo largo): esa persona
--     "cede" esos días (periodo con cede_id y por_prestamo = el préstamo) y recibe un aviso.
--     Si el préstamo se cancela o se acorta, esos días vuelven a ella. Ella no puede borrar esas cesiones.
begin;

-- ===== 1. Cesiones hechas por un préstamo del admin =====
alter table public.periodos
  add column if not exists por_prestamo int references public.periodos(id) on delete cascade deferrable initially deferred;

-- La persona solo recupera los "No voy" que hizo ella (no los que vienen de un préstamo del admin)
drop policy if exists "rotacion recupera (acortar)" on public.periodos;
drop policy if exists "rotacion recupera (borrar)" on public.periodos;
create policy "rotacion recupera (acortar)" on public.periodos for update to authenticated
  using (cede_id = public.mi_persona_id() and por_prestamo is null) with check (cede_id = public.mi_persona_id());
create policy "rotacion recupera (borrar)" on public.periodos for delete to authenticated
  using (cede_id = public.mi_persona_id() and por_prestamo is null);

-- ===== 2. Validar periodos (base = v2.13): un préstamo encima de otra persona gana =====
create or replace function public.validar_periodo() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_est estacionamientos;
  f date;
  r record;
  v_asig periodos;
  v_otro periodos;
  v_dias text;
  v_avisar uuid;
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
      -- Otra persona lo tiene ese día (rotación o préstamo largo), y no lo había liberado
      select pe.* into v_otro from periodos pe where pe.id <> new.id and pe.estacionamiento_id = new.estacionamiento_id
        and pe.para_id is not null and periodo_cubre(pe, f) and not cedido(pe.estacionamiento_id, pe.para_id, f)
      limit 1;
      if v_otro.id is not null then
        if new.origen = 'rotacion' then
          raise exception 'El % ya está asignado a otra persona el %', v_est.numero, to_char(f, 'DD-MM-YYYY');
        end if;
        -- Un PRÉSTAMO gana: esa persona cede ese día (vuelve a ser suyo si se cancela el préstamo)
        insert into periodos (estacionamiento_id, desde, hasta, cede_id, para_todos, motivo, por_prestamo)
        values (new.estacionamiento_id, f, f, v_otro.para_id, true, 'Prestado por el admin', new.id);
        v_dias := coalesce(v_dias || ', ', '') || to_char(f, 'DD-MM');
        v_avisar := v_otro.para_id;
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
    if v_dias is not null then
      insert into avisos (persona_id, texto)
      values (v_avisar, format('El admin prestó el %s a otra persona (%s). Los demás días lo sigues teniendo.', v_est.numero, v_dias));
    end if;
  end if;

  return new;
end $$;

-- ===== 3. Al borrar o acortar (base = v2.11): los días cedidos por un préstamo vuelven =====
create or replace function public.al_recuperar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_numero text;
  v_nuevo public.periodos; -- el periodo después del cambio (vacío si se borró)
  v_acorto boolean := true;
  v_texto text;
begin
  select numero into v_numero from estacionamientos where id = old.estacionamiento_id;
  if tg_op = 'UPDATE' then
    v_nuevo := new;
    v_acorto := new.hasta is distinct from old.hasta;
  end if;

  -- Préstamo acortado: los días que otra persona cedió por él (desde el nuevo fin) vuelven a ser suyos
  -- (si se borra, se borran solos: por_prestamo ... on delete cascade)
  if tg_op = 'UPDATE' and v_nuevo.hasta is not null and v_acorto then
    delete from periodos where por_prestamo = old.id and desde > v_nuevo.hasta;
  end if;

  -- Asignación terminada antes o borrada: sus "No voy" no pueden quedar sueltos
  if old.para_id is not null and v_acorto then
    if v_nuevo.id is null then
      delete from periodos where estacionamiento_id = old.estacionamiento_id and cede_id = old.para_id
        and desde >= old.desde and (old.hasta is null or desde <= old.hasta);
    elsif v_nuevo.hasta is not null then
      delete from periodos where estacionamiento_id = old.estacionamiento_id and cede_id = old.para_id
        and desde > v_nuevo.hasta;
      update periodos set hasta = v_nuevo.hasta
      where estacionamiento_id = old.estacionamiento_id and cede_id = old.para_id
        and desde <= v_nuevo.hasta and (hasta is null or hasta > v_nuevo.hasta);
    end if;
  end if;

  for r in
    select * from reservas
    where estacionamiento_id = old.estacionamiento_id and fecha >= hoy_chile()
      and periodo_cubre(old, fecha)
      and (v_nuevo.id is null or not periodo_cubre(v_nuevo, fecha))
  loop
    if not libre_para_tomar(r.estacionamiento_id, r.fecha) then
      v_texto := case
        when old.cede_id is null then format('Al final sí voy: el dueño del %s recuperó su puesto el %s.', v_numero, to_char(r.fecha, 'DD-MM-YYYY'))
        when pg_trigger_depth() > 1 then format('El %s ya no está disponible el %s: tu reserva se canceló. Toma otro puesto libre.', v_numero, to_char(r.fecha, 'DD-MM-YYYY'))
        else format('Al final sí voy: quien tiene el %s por rotación lo recuperó el %s.', v_numero, to_char(r.fecha, 'DD-MM-YYYY'))
      end;
      insert into avisos (persona_id, texto) values (r.persona_id, v_texto);
      delete from reservas where id = r.id;
    end if;
  end loop;

  if old.para_id is not null and (old.hasta is null or old.hasta >= hoy_chile()) and v_acorto then
    insert into avisos (persona_id, texto)
    values (old.para_id, format('Se terminó tu asignación del %s.', v_numero));
  end if;

  return null;
end $$;

-- ===== 4. Rotación dada a mano: la persona pasa al final de la lista de espera =====
create or replace function public.rotacion_al_final() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.origen = 'rotacion' and new.para_id is not null then
    update lista_espera set orden = (select coalesce(max(orden), 0) + 1 from lista_espera) where persona_id = new.para_id;
  end if;
  return null;
end $$;

drop trigger if exists trg_rotacion_al_final on public.periodos;
create trigger trg_rotacion_al_final
after insert on public.periodos
for each row execute function public.rotacion_al_final();

commit;
