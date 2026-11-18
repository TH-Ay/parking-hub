-- Migración v2.9 (18-nov-2026): lo que queda libre es "para todos" POR DEFECTO.
-- La rotación solo toma lo que el admin apaga a propósito.
--   · Variables: dia_a_dia parte en true (y se encienden todos los variables actuales).
--   · Liberaciones (del admin o "No voy" del dueño): para_todos parte en true.
-- Las rotaciones ya asignadas a alguien no cambian. Las liberaciones ya existentes quedan como están.
begin;

alter table public.estacionamientos alter column dia_a_dia set default true;
alter table public.periodos alter column para_todos set default true;

update public.estacionamientos set dia_a_dia = true where tipo = 'variable';

commit;
