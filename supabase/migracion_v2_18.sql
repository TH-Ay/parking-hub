-- v2_18 (20-nov-2026): nuevo acceso "recruiting".
-- Ve Disponibilidad (como un usuario) y Estacionamientos, pero solo los puestos Especiales.
-- Por ahora solo MIRA esos puestos: sus acciones se definen en la próxima iteración.
-- Pegar completo en Supabase → SQL Editor → Run.

alter table public.personas drop constraint if exists personas_rol_check;
alter table public.personas add constraint personas_rol_check
  check (rol in ('admin', 'usuario', 'recruiting'));
