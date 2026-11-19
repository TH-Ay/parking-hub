-- =====================================================================================
-- REVISIÓN AUTOMÁTICA DIARIA DE LA ROTACIÓN (pg_cron) — 16-nov-2026
-- Requisito: tener activada la extensión "pg_cron" en Supabase (Database → Extensions → pg_cron).
-- Se pega en el SQL Editor y se aprieta "Run" UNA sola vez.
--
-- De lunes a viernes a las 10:00 UTC (= 7:00 en Chile en horario de verano, 6:00 en invierno)
-- llama a correr_rotacion() (desde v2.16): UNA SEMANA ANTES del próximo turno mensual (lunes a viernes,
-- semanas del mes donde cae su jueves) reparte los puestos que esperan rotación entre los
-- primeros de la lista de espera por todo ese turno (con avisos). Si ya se repartió, no hace nada.
-- =====================================================================================

select cron.schedule(
  'rotacion-diaria',            -- nombre de la tarea
  '0 10 * * 1-5',               -- minuto 0, hora 10 UTC, lunes a viernes
  $$ select public.correr_rotacion(); $$
);

-- ---- Útiles (no hace falta correrlos) ----
-- Ver las tareas programadas:
--   select jobid, jobname, schedule, command from cron.job;
-- Ver las últimas ejecuciones y su resultado:
--   select start_time, status, return_message from cron.job_run_details order by start_time desc limit 10;
-- Apagar la revisión automática:
--   select cron.unschedule('rotacion-diaria');
