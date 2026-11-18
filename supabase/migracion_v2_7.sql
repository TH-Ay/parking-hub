-- Migración v2.7 (18-nov-2026): puestos VARIABLES que se toman "día a día".
-- Casilla nueva estacionamientos.dia_a_dia (permanente, la enciende/apaga el admin).
-- Encendida: el variable NO queda reservado para la rotación → aparece en Disponibilidad
-- y lo toma el primero (con la regla de 1 día por semana). La rotación lo deja de lado.
-- Si el admin lo asigna a alguien por un periodo, esa asignación sigue mandando esos días.
begin;

alter table public.estacionamientos add column if not exists dia_a_dia boolean not null default false;

-- 1. Al tomar: un variable "día a día" no es de rotación (se reemplaza la función completa)
create or replace function public.es_de_rotacion(p_est int, p_fecha date) returns boolean
language sql security definer set search_path = public stable as $$
  select case
    when e.tipo = 'especial' then false
    -- ya asignado a alguien ese día: no está "esperando" rotación
    when exists (select 1 from periodos pe where pe.estacionamiento_id = e.id
                 and pe.para_id is not null and periodo_cubre(pe, p_fecha)) then false
    when e.tipo = 'variable' then not e.dia_a_dia
    when e.dueno_id is null then false
    else exists (select 1 from periodos pe where pe.estacionamiento_id = e.id
                 and pe.para_id is null and pe.dia_semana is null and not pe.para_todos
                 and periodo_cubre(pe, p_fecha)
                 and (pe.hasta is null or pe.hasta >= (pe.desde + interval '1 month')::date - 1))
  end
  from estacionamientos e where e.id = p_est;
$$;

-- 2. La rotación automática tampoco toma los variables "día a día" (se reemplaza la función completa)
create or replace function public.libre_para_rotar(p_est int, p_hoy date) returns boolean
language sql security definer set search_path = public stable as $$
  select case
    when e.tipo = 'especial' then false
    when exists (select 1 from periodos pe where pe.estacionamiento_id = e.id and pe.para_id is not null
                 and pe.desde <= (p_hoy + interval '1 month')::date - 1
                 and (pe.hasta is null or pe.hasta >= p_hoy)) then false
    when e.tipo = 'variable' then not e.dia_a_dia
    when e.dueno_id is null then false
    else exists (select 1 from periodos pe where pe.estacionamiento_id = e.id
                 and pe.para_id is null and pe.dia_semana is null and not pe.para_todos and pe.desde <= p_hoy
                 and (pe.hasta is null or pe.hasta >= (p_hoy + interval '1 month')::date - 1))
  end
  from estacionamientos e where e.id = p_est;
$$;

commit;
