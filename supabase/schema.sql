-- Script ORIGINAL de la base de datos (versión 1), copiado desde el SQL Editor de Supabase el 16-nov-2026.
-- Proyecto: "Gestión estacionamientos". Se guarda como referencia: los cambios van en archivos nuevos (migraciones).

-- ===== TABLAS =====
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  nombre text,
  rol text not null default 'usuario' check (rol in ('admin','usuario')),
  created_at timestamptz default now()
);

create table public.estacionamientos (
  id serial primary key,
  numero text not null unique,
  tipo text not null default 'fijo' check (tipo in ('fijo','variable')),
  dueno_id uuid references public.profiles(id) on delete set null
);

create table public.liberaciones (
  id serial primary key,
  estacionamiento_id int not null references public.estacionamientos(id) on delete cascade,
  fecha date not null,
  unique (estacionamiento_id, fecha)
);

create table public.reservas (
  id serial primary key,
  estacionamiento_id int not null references public.estacionamientos(id) on delete cascade,
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  fecha date not null,
  unique (estacionamiento_id, fecha),
  unique (usuario_id, fecha)
);

-- ===== FUNCIONES DE APOYO =====
create function public.es_admin() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from profiles where id = auth.uid() and rol = 'admin');
$$;

create function public.hoy_chile() returns date
language sql stable as $$
  select (now() at time zone 'America/Santiago')::date;
$$;

-- Crea el perfil automáticamente al registrarse (solo correos @thehouse.cl)
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email not ilike '%@thehouse.cl' then
    raise exception 'Solo se permiten correos @thehouse.cl';
  end if;
  insert into profiles (id, email) values (new.id, new.email);
  return new;
end $$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ===== REGLAS AL TOMAR UN ESTACIONAMIENTO =====
create function public.validar_reserva() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_tipo text;
  v_dueno uuid;
  ayer boolean; anteayer boolean; manana boolean; pasado boolean;
begin
  if new.fecha < hoy_chile() then
    raise exception 'No puedes tomar estacionamientos en fechas pasadas';
  end if;

  select tipo, dueno_id into v_tipo, v_dueno
  from estacionamientos where id = new.estacionamiento_id;

  if new.usuario_id = v_dueno then
    raise exception 'Este estacionamiento ya es tuyo';
  end if;

  if v_tipo = 'fijo' and v_dueno is not null and not exists (
    select 1 from liberaciones
    where estacionamiento_id = new.estacionamiento_id and fecha = new.fecha
  ) then
    raise exception 'Este estacionamiento no está liberado ese día';
  end if;

  -- Máximo 2 días seguidos por persona
  select exists(select 1 from reservas where usuario_id = new.usuario_id and fecha = new.fecha - 1),
         exists(select 1 from reservas where usuario_id = new.usuario_id and fecha = new.fecha - 2),
         exists(select 1 from reservas where usuario_id = new.usuario_id and fecha = new.fecha + 1),
         exists(select 1 from reservas where usuario_id = new.usuario_id and fecha = new.fecha + 2)
  into ayer, anteayer, manana, pasado;

  if (ayer and anteayer) or (ayer and manana) or (manana and pasado) then
    raise exception 'No puedes tomar más de 2 días seguidos';
  end if;

  return new;
end $$;

create trigger trg_validar_reserva
before insert on public.reservas
for each row execute function public.validar_reserva();

-- ===== REGLAS AL LIBERAR / RECUPERAR =====
create function public.validar_liberacion() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.fecha < hoy_chile() then
      raise exception 'No puedes liberar fechas pasadas';
    end if;
    return new;
  end if;
  -- DELETE: el dueño quiere recuperar su lugar
  if exists (select 1 from reservas
             where estacionamiento_id = old.estacionamiento_id and fecha = old.fecha) then
    raise exception 'Alguien ya tomó este estacionamiento ese día';
  end if;
  return old;
end $$;

create trigger trg_validar_liberacion
before insert or delete on public.liberaciones
for each row execute function public.validar_liberacion();

-- ===== PERMISOS (Row Level Security) =====
alter table public.profiles enable row level security;
alter table public.estacionamientos enable row level security;
alter table public.liberaciones enable row level security;
alter table public.reservas enable row level security;

create policy "ver perfiles" on public.profiles for select to authenticated using (true);
create policy "admin edita perfiles" on public.profiles for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

create policy "ver estacionamientos" on public.estacionamientos for select to authenticated using (true);
create policy "admin gestiona estacionamientos" on public.estacionamientos for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

create policy "ver liberaciones" on public.liberaciones for select to authenticated using (true);
create policy "dueno libera" on public.liberaciones for insert to authenticated
  with check (public.es_admin() or exists (
    select 1 from public.estacionamientos e where e.id = estacionamiento_id and e.dueno_id = auth.uid()));
create policy "dueno recupera" on public.liberaciones for delete to authenticated
  using (public.es_admin() or exists (
    select 1 from public.estacionamientos e where e.id = estacionamiento_id and e.dueno_id = auth.uid()));

create policy "ver reservas" on public.reservas for select to authenticated using (true);
create policy "tomar para mi" on public.reservas for insert to authenticated
  with check (usuario_id = auth.uid() or public.es_admin());
create policy "soltar lo mio" on public.reservas for delete to authenticated
  using (usuario_id = auth.uid() or public.es_admin());

-- ===== DATOS INICIALES: 19 estacionamientos =====
insert into public.estacionamientos (numero)
select 'E-' || lpad(g::text, 2, '0') from generate_series(1, 19) g;
