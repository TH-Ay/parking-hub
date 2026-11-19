-- Migración v2.17 (19-nov-2026): RECORDATORIO SEMANAL por correo a los dueños de fijos.
--   · Lo manda un Apps Script desde una cuenta de Gmail de la empresa (supabase/recordatorio_apps_script.gs),
--     los lunes a las 17:00 (hora de Chile).
--   · recordatorio_fijos(p_clave) entrega nombre, correo y número de puesto de cada dueño de un fijo,
--     SOLO si la clave es correcta (la dirección de Supabase es pública: sin clave nadie ve los correos).
--   · Se salta a quien ya tiene liberados todos los días hábiles desde mañana hasta el viernes de la
--     próxima semana (ej. de vacaciones o con su puesto en rotación).
-- DESPUÉS DE CORRERLA: ejecuta  select valor from public.secretos where clave = 'recordatorio';
-- y copia ese valor en el Apps Script (CLAVE_RECORDATORIO). No lo guardes en ningún archivo.
begin;

-- Claves secretas: nadie las puede leer desde la app (RLS activo y sin permisos)
create table if not exists public.secretos (
  clave text primary key,
  valor text not null
);
alter table public.secretos enable row level security;
insert into public.secretos (clave, valor) values ('recordatorio', replace(gen_random_uuid()::text, '-', ''))
on conflict (clave) do nothing;

create or replace function public.recordatorio_fijos(p_clave text)
returns table (nombre text, email text, numero text)
language plpgsql security definer set search_path = public stable as $$
declare
  v_hoy date := hoy_chile();
  v_hasta date := (date_trunc('week', v_hoy) + interval '11 days')::date; -- viernes de la próxima semana
begin
  if p_clave is null or p_clave is distinct from (select s.valor from secretos s where s.clave = 'recordatorio') then
    raise exception 'Clave incorrecta';
  end if;

  return query
  select p.nombre, p.email, e.numero
  from estacionamientos e join personas p on p.id = e.dueno_id
  where e.tipo = 'fijo' and p.activa
    -- algún día hábil (no feriado) desde mañana en que todavía usaría su puesto
    and exists (
      select 1 from generate_series(v_hoy + 1, v_hasta, interval '1 day') d
      where extract(isodow from d) <= 5
        and not exists (select 1 from feriados fe where fe.fecha = d::date)
        and not exists (select 1 from periodos pe where pe.estacionamiento_id = e.id and periodo_cubre(pe, d::date))
    )
  order by e.numero;
end $$;

revoke execute on function public.recordatorio_fijos(text) from public;
grant execute on function public.recordatorio_fijos(text) to anon, authenticated;

commit;
