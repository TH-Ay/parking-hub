-- Migración v2.11 (19-nov-2026): quien tiene un puesto por ROTACIÓN (o asignación) puede decir "No voy".
--   · Los días que libera quedan PARA TODOS (se toman día a día). Su rotación sigue igual (no pierde el mes).
--   · Se guarda como un periodo sin persona (para_id null, para_todos) con periodos.cede_id = quien libera.
--   · Puede recuperarlos ("Al final sí voy"): a quien lo había tomado se le cancela con aviso.
--   · Si la asignación se termina antes o se borra, sus días liberados se ajustan solos.
begin;

-- ===== 1. Columna nueva: quién cede días de su asignación =====
alter table public.periodos
  add column if not exists cede_id uuid references public.personas(id) on delete cascade;

-- ¿Esa persona liberó ese día su puesto asignado?
create or replace function public.cedido(p_est int, p_persona uuid, p_fecha date) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from periodos c where c.estacionamiento_id = p_est and c.cede_id = p_persona
                 and periodo_cubre(c, p_fecha));
$$;

-- ===== 2. Se puede tomar: una asignación no cuenta los días que su persona liberó =====
create or replace function public.libre_para_tomar(p_est int, p_fecha date) returns boolean
language sql security definer set search_path = public stable as $$
  select case
    when e.tipo = 'especial' then false
    when exists (select 1 from periodos pe where pe.estacionamiento_id = e.id
                 and pe.para_id is not null and periodo_cubre(pe, p_fecha)
                 and not cedido(e.id, pe.para_id, p_fecha)) then false
    when exists (select 1 from periodos c where c.estacionamiento_id = e.id
                 and c.cede_id is not null and periodo_cubre(c, p_fecha)) then true
    when e.tipo = 'variable' then true
    when e.dueno_id is null then false -- fijo sin dueño: bloqueado
    else exists (select 1 from periodos pe where pe.estacionamiento_id = e.id
                 and pe.para_id is null and periodo_cubre(pe, p_fecha))
  end
  from estacionamientos e where e.id = p_est;
$$;

-- ===== 3. ¿Ya tiene puesto ese día? Los días que liberó de su asignación no cuentan =====
create or replace function public.tiene_puesto(p_persona uuid, p_fecha date, p_excluir_periodo int default null) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from reservas r where r.persona_id = p_persona and r.fecha = p_fecha)
      or exists (select 1 from periodos pe where pe.para_id = p_persona
                 and pe.id is distinct from p_excluir_periodo and periodo_cubre(pe, p_fecha)
                 and not cedido(pe.estacionamiento_id, p_persona, p_fecha))
      or exists (select 1 from estacionamientos e where e.dueno_id = p_persona and e.tipo = 'fijo'
                 and not exists (select 1 from periodos pe where pe.estacionamiento_id = e.id
                                 and periodo_cubre(pe, p_fecha)));
$$;

-- ===== 4. Validar periodos (base = v2.10) + revisar el "No voy" de la rotación =====
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

  -- "No voy" de quien tiene el puesto asignado: siempre para todos y dentro de su asignación
  if new.cede_id is not null then
    new.para_id := null;
    new.para_todos := true;
    if not exists (select 1 from periodos pe where pe.estacionamiento_id = new.estacionamiento_id
                   and pe.para_id = new.cede_id and pe.desde <= new.desde
                   and (pe.hasta is null or (new.hasta is not null and new.hasta <= pe.hasta))) then
      raise exception 'Solo puedes liberar días dentro de tu rotación del %', v_est.numero;
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

-- ===== 5. Al borrar o acortar un periodo (base = v2) =====
--   · si era una asignación: los días que esa persona había liberado se ajustan al nuevo fin
--   · a quien había tomado días que ya no están libres se le quita la reserva con aviso
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

-- ===== 6. Permisos: quien tiene la asignación libera y recupera SUS días =====
create policy "rotacion libera" on public.periodos for insert to authenticated
  with check (cede_id = public.mi_persona_id() and para_id is null);
create policy "rotacion recupera (acortar)" on public.periodos for update to authenticated
  using (cede_id = public.mi_persona_id()) with check (cede_id = public.mi_persona_id());
create policy "rotacion recupera (borrar)" on public.periodos for delete to authenticated
  using (cede_id = public.mi_persona_id());

commit;
