-- =====================================================================================
-- MIGRACIÓN v2 — App de Estacionamientos TheHouse (16-nov-2026)
-- Rehace la base de datos según lo acordado (ver CLAUDE.md). Se pega COMPLETA en el
-- SQL Editor de Supabase y se aprieta "Run". Es seguro: hoy no hay datos reales
-- (solo 19 puestos de prueba "E-01".."E-19").
--
-- Cambios principales respecto a la v1 (supabase/schema.sql):
--   1. "personas" reemplaza a "profiles": el admin carga a cada persona ANTES de que entre;
--      al iniciar sesión se une por el correo. Si el correo no está en la lista, no entra.
--   2. Los 20 estacionamientos reales, con piso y tipo fijo / variable / especial.
--   3. "periodos" reemplaza a "liberaciones": desde, hasta (o sin fin), cada semana, para quién.
--      Sirve para el "No voy" del dueño, el Liberar del admin y las asignaciones/rotaciones.
--   4. El dueño SÍ puede recuperar aunque alguien lo haya tomado: a esa persona se le quita
--      el día y le llega un aviso "Al final sí voy" (tabla "avisos").
--   5. Reglas: un puesto no tiene dos personas el mismo día; una persona no tiene dos puestos
--      el mismo día; máximo 1 fijo por persona; máximo 2 días seguidos al tomar.
-- =====================================================================================

begin;

-- ===== 0. LIMPIAR LA VERSIÓN 1 =====
drop trigger if exists on_auth_user_created on auth.users;
drop table if exists public.reservas cascade;
drop table if exists public.liberaciones cascade;
drop table if exists public.estacionamientos cascade;
drop table if exists public.profiles cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.validar_reserva() cascade;
drop function if exists public.validar_liberacion() cascade;
drop function if exists public.es_admin() cascade;

-- ===== 1. TABLAS =====

-- Personas del equipo (las carga el admin). user_id se llena solo cuando la persona inicia sesión.
create table public.personas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  email text not null unique check (email = lower(email) and email like '%@thehouse.cl'),
  nombre text not null,
  rol text not null default 'usuario' check (rol in ('admin', 'usuario')),
  activa boolean not null default true, -- false = dada de baja (se fue de la empresa)
  created_at timestamptz not null default now()
);

-- Estacionamientos. dueno_id es único: una persona tiene como máximo 1 fijo.
create table public.estacionamientos (
  id serial primary key,
  numero text not null unique,
  piso text not null check (piso in ('-3', '-4')),
  tipo text not null default 'variable' check (tipo in ('fijo', 'variable', 'especial')),
  dueno_id uuid unique references public.personas(id) on delete set null,
  uso_especial text, -- ej. 'Visitas' (solo si es especial)
  check (tipo = 'fijo' or dueno_id is null),
  check (tipo <> 'especial' or uso_especial is not null)
);

-- Periodos: liberaciones ("No voy" / Liberar) y asignaciones (rotación).
--   para_id vacío = libre para cualquiera (lo toma el primero) · para_id = asignado a esa persona
--   hasta vacío = sin fecha de término · dia_semana: 1=lunes … 5=viernes (vacío = todos los días)
create table public.periodos (
  id serial primary key,
  estacionamiento_id int not null references public.estacionamientos(id) on delete cascade,
  desde date not null,
  hasta date,
  dia_semana int check (dia_semana between 1 and 5),
  para_id uuid references public.personas(id) on delete cascade,
  motivo text,
  created_at timestamptz not null default now(),
  check (hasta is null or hasta >= desde)
);

-- Reservas: un puesto libre que alguien tomó para un día.
create table public.reservas (
  id serial primary key,
  estacionamiento_id int not null references public.estacionamientos(id) on delete cascade,
  persona_id uuid not null references public.personas(id) on delete cascade,
  fecha date not null,
  created_at timestamptz not null default now(),
  unique (estacionamiento_id, fecha), -- un puesto, una persona por día
  unique (persona_id, fecha)          -- una persona, un puesto por día
);

-- Avisos dentro de la app (ej. "Al final sí voy").
create table public.avisos (
  id serial primary key,
  persona_id uuid not null references public.personas(id) on delete cascade,
  texto text not null,
  leido boolean not null default false,
  created_at timestamptz not null default now()
);

-- ===== 2. FUNCIONES DE APOYO =====

create or replace function public.hoy_chile() returns date
language sql stable as $$
  select (now() at time zone 'America/Santiago')::date;
$$;

-- La persona (activa) que inició sesión
create function public.mi_persona_id() returns uuid
language sql security definer set search_path = public stable as $$
  select id from personas where user_id = auth.uid() and activa;
$$;

create function public.es_admin() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from personas where user_id = auth.uid() and activa and rol = 'admin');
$$;

-- ¿Ese periodo incluye esa fecha?
create function public.periodo_cubre(p public.periodos, f date) returns boolean
language sql immutable as $$
  select f >= p.desde
     and (p.hasta is null or f <= p.hasta)
     and (p.dia_semana is null or extract(isodow from f) = p.dia_semana);
$$;

-- ¿Se puede tomar ese puesto ese día? (variable sin asignar, o fijo con dueño liberado "para cualquiera")
create function public.libre_para_tomar(p_est int, p_fecha date) returns boolean
language sql security definer set search_path = public stable as $$
  select case
    when e.tipo = 'especial' then false
    when exists (select 1 from periodos pe where pe.estacionamiento_id = e.id
                 and pe.para_id is not null and periodo_cubre(pe, p_fecha)) then false
    when e.tipo = 'variable' then true
    when e.dueno_id is null then false -- fijo sin dueño: bloqueado
    else exists (select 1 from periodos pe where pe.estacionamiento_id = e.id
                 and pe.para_id is null and periodo_cubre(pe, p_fecha))
  end
  from estacionamientos e where e.id = p_est;
$$;

-- ¿Esa persona ya tiene un puesto ese día? (reserva, asignación, o su fijo sin liberar)
create function public.tiene_puesto(p_persona uuid, p_fecha date, p_excluir_periodo int default null) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from reservas r where r.persona_id = p_persona and r.fecha = p_fecha)
      or exists (select 1 from periodos pe where pe.para_id = p_persona
                 and pe.id is distinct from p_excluir_periodo and periodo_cubre(pe, p_fecha))
      or exists (select 1 from estacionamientos e where e.dueno_id = p_persona and e.tipo = 'fijo'
                 and not exists (select 1 from periodos pe where pe.estacionamiento_id = e.id
                                 and periodo_cubre(pe, p_fecha)));
$$;

-- ===== 3. LOGIN: solo entran las personas que el admin cargó =====
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update personas set user_id = new.id
  where email = lower(new.email) and activa and user_id is null;
  if not found then
    raise exception 'Tu correo no está en la lista. Pídele al admin que te agregue.';
  end if;
  return new;
end $$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ===== 4. REGLAS AL TOMAR (reservas) =====
create function public.validar_reserva() returns trigger
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

create trigger trg_validar_reserva
before insert on public.reservas
for each row execute function public.validar_reserva();

-- ===== 5. REGLAS AL LIBERAR / ASIGNAR (periodos) =====
create function public.validar_periodo() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_est estacionamientos;
  f date;
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
      if exists (select 1 from reservas r where r.estacionamiento_id = new.estacionamiento_id and r.fecha = f) then
        raise exception 'El % ya fue tomado por alguien el %', v_est.numero, to_char(f, 'DD-MM-YYYY');
      end if;
      if tiene_puesto(new.para_id, f, new.id) then
        raise exception 'Esa persona ya tiene un estacionamiento el %', to_char(f, 'DD-MM-YYYY');
      end if;
    end loop;
  end if;

  return new;
end $$;

create trigger trg_validar_periodo
before insert or update on public.periodos
for each row execute function public.validar_periodo();

-- Al borrar o acortar un periodo (ej. el dueño recupera: "Al final sí voy"):
--   · a quien había tomado esos días se le quita la reserva y le llega un aviso
--   · si era una asignación, a esa persona le llega un aviso
create function public.al_recuperar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_numero text;
  v_nuevo public.periodos; -- el periodo después del cambio (vacío si se borró)
  v_acorto boolean := true;
begin
  select numero into v_numero from estacionamientos where id = old.estacionamiento_id;
  if tg_op = 'UPDATE' then
    v_nuevo := new;
    v_acorto := new.hasta is distinct from old.hasta;
  end if;

  for r in
    select * from reservas
    where estacionamiento_id = old.estacionamiento_id and fecha >= hoy_chile()
      and periodo_cubre(old, fecha)
      and (v_nuevo.id is null or not periodo_cubre(v_nuevo, fecha))
  loop
    if not libre_para_tomar(r.estacionamiento_id, r.fecha) then
      insert into avisos (persona_id, texto)
      values (r.persona_id, format('Al final sí voy: el dueño del %s recuperó su puesto el %s.', v_numero, to_char(r.fecha, 'DD-MM-YYYY')));
      delete from reservas where id = r.id;
    end if;
  end loop;

  if old.para_id is not null and (old.hasta is null or old.hasta >= hoy_chile()) and v_acorto then
    insert into avisos (persona_id, texto)
    values (old.para_id, format('Se terminó tu asignación del %s.', v_numero));
  end if;

  return null;
end $$;

create trigger trg_al_recuperar
after delete or update on public.periodos
for each row execute function public.al_recuperar();

-- ===== 6. CAMBIOS DEL ADMIN QUE BORRAN LO PROGRAMADO =====

-- Al cambiar el dueño o el tipo de un puesto, se termina todo lo programado desde hoy
create function public.al_cambiar_puesto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.dueno_id is distinct from old.dueno_id or new.tipo is distinct from old.tipo then
    -- Primero las reservas futuras: se cancelan con un aviso claro (no es "Al final sí voy")
    insert into avisos (persona_id, texto)
    select persona_id, format('El admin cambió el estacionamiento %s: tu reserva del %s se canceló.', new.numero, to_char(fecha, 'DD-MM-YYYY'))
    from reservas where estacionamiento_id = new.id and fecha >= hoy_chile();
    delete from reservas where estacionamiento_id = new.id and fecha >= hoy_chile();
    -- Después lo programado: lo futuro se borra y lo que está en curso termina ayer
    delete from periodos where estacionamiento_id = new.id and desde >= hoy_chile();
    update periodos set hasta = hoy_chile() - 1
    where estacionamiento_id = new.id and desde < hoy_chile() and (hasta is null or hasta >= hoy_chile());
  end if;
  return null;
end $$;

create trigger trg_al_cambiar_puesto
after update on public.estacionamientos
for each row execute function public.al_cambiar_puesto();

-- Al dar de baja a una persona: su fijo queda sin dueño y se borran sus reservas y asignaciones futuras
create function public.al_dar_de_baja() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.activa and not new.activa then
    update estacionamientos set dueno_id = null where dueno_id = new.id;
    delete from reservas where persona_id = new.id and fecha >= hoy_chile();
    delete from periodos where para_id = new.id and desde >= hoy_chile();
    update periodos set hasta = hoy_chile() - 1
    where para_id = new.id and desde < hoy_chile() and (hasta is null or hasta >= hoy_chile());
  end if;
  return null;
end $$;

create trigger trg_al_dar_de_baja
after update on public.personas
for each row execute function public.al_dar_de_baja();

-- ===== 7. PERMISOS (Row Level Security) =====
alter table public.personas enable row level security;
alter table public.estacionamientos enable row level security;
alter table public.periodos enable row level security;
alter table public.reservas enable row level security;
alter table public.avisos enable row level security;

-- Personas: todos los que entraron ven la lista; solo el admin agrega, edita o da de baja
create policy "ver personas" on public.personas for select to authenticated using (public.mi_persona_id() is not null);
create policy "admin gestiona personas" on public.personas for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- Estacionamientos: todos ven; solo el admin cambia
create policy "ver estacionamientos" on public.estacionamientos for select to authenticated using (public.mi_persona_id() is not null);
create policy "admin gestiona estacionamientos" on public.estacionamientos for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- Periodos: todos ven; el dueño libera ("No voy", solo para cualquiera) y recupera los de su puesto; el admin todo
create policy "ver periodos" on public.periodos for select to authenticated using (public.mi_persona_id() is not null);
create policy "dueno libera" on public.periodos for insert to authenticated
  with check (public.es_admin() or (para_id is null and exists (
    select 1 from public.estacionamientos e where e.id = estacionamiento_id and e.dueno_id = public.mi_persona_id())));
create policy "dueno recupera (acortar)" on public.periodos for update to authenticated
  using (public.es_admin() or exists (
    select 1 from public.estacionamientos e where e.id = estacionamiento_id and e.dueno_id = public.mi_persona_id()));
create policy "dueno recupera (borrar)" on public.periodos for delete to authenticated
  using (public.es_admin() or exists (
    select 1 from public.estacionamientos e where e.id = estacionamiento_id and e.dueno_id = public.mi_persona_id()));

-- Reservas: todos ven; cada uno toma y suelta lo suyo; el admin todo
create policy "ver reservas" on public.reservas for select to authenticated using (public.mi_persona_id() is not null);
create policy "tomar para mi" on public.reservas for insert to authenticated
  with check (persona_id = public.mi_persona_id() or public.es_admin());
create policy "soltar lo mio" on public.reservas for delete to authenticated
  using (persona_id = public.mi_persona_id() or public.es_admin());

-- Avisos: cada uno ve, marca como leído y borra los suyos (los crea la base de datos)
create policy "ver mis avisos" on public.avisos for select to authenticated using (persona_id = public.mi_persona_id());
create policy "marcar mis avisos" on public.avisos for update to authenticated
  using (persona_id = public.mi_persona_id()) with check (persona_id = public.mi_persona_id());
create policy "borrar mis avisos" on public.avisos for delete to authenticated using (persona_id = public.mi_persona_id());

-- ===== 8. DATOS INICIALES: los 20 estacionamientos reales =====
-- Todos parten como "variable" (el admin los pasa a fijo y les asigna dueño en la app), salvo el 307 = Visitas.
insert into public.estacionamientos (numero, piso, tipo, uso_especial) values
  ('142', '-3', 'variable', null), ('143', '-3', 'variable', null), ('148', '-3', 'variable', null),
  ('150', '-3', 'variable', null), ('152', '-3', 'variable', null), ('212', '-3', 'variable', null),
  ('302', '-4', 'variable', null), ('303', '-4', 'variable', null), ('304', '-4', 'variable', null),
  ('305', '-4', 'variable', null), ('306', '-4', 'variable', null), ('307', '-4', 'especial', 'Visitas'),
  ('308', '-4', 'variable', null), ('309', '-4', 'variable', null), ('310', '-4', 'variable', null),
  ('311', '-4', 'variable', null), ('314', '-4', 'variable', null), ('331', '-4', 'variable', null),
  ('334', '-4', 'variable', null), ('335', '-4', 'variable', null);

commit;

-- =====================================================================================
-- DESPUÉS de correr esto, falta UN paso que NO se guarda aquí (tiene un correo personal):
-- cargar a la primera admin y unirla con su usuario de login. Ver instrucciones en el chat.
-- =====================================================================================
