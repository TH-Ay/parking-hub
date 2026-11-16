-- =====================================================================================
-- MIGRACIÓN v2.1 — Lista de espera para la rotación (16-nov-2026)
-- Se pega COMPLETA en el SQL Editor de Supabase y se aprieta "Run". No borra nada.
--   · lista_espera: personas sin fijo, en orden; "saltar" = se salta su próximo turno (conserva su lugar)
--   · ajustes: valores que el admin puede cambiar (ej. el 50% de la regla de la rotación)
--   · periodos.origen: 'manual' o 'rotacion' (para el historial y la regla del 50%)
--   · quien recibe un puesto fijo o es dado de baja sale solo de la lista
-- =====================================================================================

begin;

-- ===== 1. TABLAS =====
create table public.lista_espera (
  persona_id uuid primary key references public.personas(id) on delete cascade,
  orden int not null,              -- 1 = le toca primero
  saltar boolean not null default false,
  agregado timestamptz not null default now()
);

create table public.ajustes (
  clave text primary key,
  valor numeric not null
);
insert into public.ajustes (clave, valor) values ('rotacion_umbral_porcentaje', 50);

alter table public.periodos
  add column origen text not null default 'manual' check (origen in ('manual', 'rotacion'));

-- ===== 2. SALIR SOLO DE LA LISTA =====
-- Al recibir un puesto fijo
create function public.sacar_de_lista_al_tener_fijo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.dueno_id is not null and new.dueno_id is distinct from old.dueno_id then
    delete from lista_espera where persona_id = new.dueno_id;
  end if;
  return null;
end $$;

create trigger trg_sacar_de_lista_al_tener_fijo
after update on public.estacionamientos
for each row execute function public.sacar_de_lista_al_tener_fijo();

-- Al ser dado de baja
create function public.sacar_de_lista_al_dar_de_baja() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.activa and not new.activa then
    delete from lista_espera where persona_id = new.id;
  end if;
  return null;
end $$;

create trigger trg_sacar_de_lista_al_dar_de_baja
after update on public.personas
for each row execute function public.sacar_de_lista_al_dar_de_baja();

-- ===== 3. PERMISOS: solo el admin ve y cambia la lista y los ajustes =====
alter table public.lista_espera enable row level security;
alter table public.ajustes enable row level security;

create policy "admin gestiona lista de espera" on public.lista_espera for all to authenticated
  using (public.es_admin()) with check (public.es_admin());
create policy "admin gestiona ajustes" on public.ajustes for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

commit;
