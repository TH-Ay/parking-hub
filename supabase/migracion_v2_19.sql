-- v2_19 (20-nov-2026): reservas POR HORA, solo para puestos Especiales (ej. 307 Visitas).
-- Ej.: un día vienen 3 clientes distintos al 307 → 3 reservas de horario, sin cruzarse.
-- Reglas: lunes a viernes, de 08:00 a 20:00, en bloques de 30 min, sin fechas pasadas, sin cruces.
-- Solo el admin y Recruiting la ven y la usan.
-- Pegar completo en Supabase → SQL Editor → Run.

-- ¿Quien inició sesión es admin o recruiting?
create or replace function public.es_admin_o_recruiting() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from personas where user_id = auth.uid() and activa and rol in ('admin', 'recruiting'));
$$;

create table if not exists public.reservas_horas (
  id serial primary key,
  estacionamiento_id int not null references public.estacionamientos(id) on delete cascade,
  fecha date not null,
  desde time not null,
  hasta time not null,
  descripcion text not null check (length(trim(descripcion)) between 1 and 120), -- ej. "Cliente ACME"
  creado_por uuid references public.personas(id) on delete set null default public.mi_persona_id(),
  creado_en timestamptz not null default now(),
  check (desde < hasta),
  check (desde >= '08:00' and hasta <= '20:00'),
  check (extract(minute from desde) in (0, 30) and extract(second from desde) = 0),
  check (extract(minute from hasta) in (0, 30) and extract(second from hasta) = 0)
);
create index if not exists reservas_horas_dia on public.reservas_horas (estacionamiento_id, fecha);

-- Reglas con mensaje en español
create or replace function public.validar_reserva_hora() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_numero text;
  v_tipo text;
  v_choque record;
begin
  select numero, tipo into v_numero, v_tipo from estacionamientos where id = new.estacionamiento_id;
  if v_tipo is distinct from 'especial' then
    raise exception 'Solo los puestos especiales se reservan por hora.';
  end if;
  if new.fecha < hoy_chile() then
    raise exception 'No se puede reservar en una fecha pasada.';
  end if;
  if extract(isodow from new.fecha) > 5 then
    raise exception 'Solo se reserva de lunes a viernes.';
  end if;
  -- Evita que dos personas reserven a la vez el mismo puesto y se crucen
  perform pg_advisory_xact_lock(new.estacionamiento_id);
  select desde, hasta, descripcion into v_choque from reservas_horas
   where estacionamiento_id = new.estacionamiento_id and fecha = new.fecha and id <> coalesce(new.id, -1)
     and desde < new.hasta and hasta > new.desde
   order by desde limit 1;
  if found then
    raise exception 'El % ya está ocupado de % a % (%).',
      v_numero, to_char(v_choque.desde, 'HH24:MI'), to_char(v_choque.hasta, 'HH24:MI'), v_choque.descripcion;
  end if;
  new.descripcion := trim(new.descripcion);
  return new;
end;
$$;

drop trigger if exists validar_reserva_hora on public.reservas_horas;
create trigger validar_reserva_hora before insert or update on public.reservas_horas
  for each row execute function public.validar_reserva_hora();

-- Si a un puesto se le quita la marca especial, se borran sus reservas por hora desde hoy
create or replace function public.al_quitar_especial() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.tipo = 'especial' and new.tipo <> 'especial' then
    delete from reservas_horas where estacionamiento_id = new.id and fecha >= hoy_chile();
  end if;
  return new;
end;
$$;

drop trigger if exists al_quitar_especial on public.estacionamientos;
create trigger al_quitar_especial after update of tipo on public.estacionamientos
  for each row execute function public.al_quitar_especial();

-- Permisos (RLS): solo admin y recruiting leen, crean, cambian y borran
alter table public.reservas_horas enable row level security;
drop policy if exists "reservas_horas admin y recruiting" on public.reservas_horas;
create policy "reservas_horas admin y recruiting" on public.reservas_horas
  for all to authenticated
  using (public.es_admin_o_recruiting())
  with check (public.es_admin_o_recruiting());
