-- Migración v2.12 (19-nov-2026): personas que pueden tener VARIOS puestos el mismo día (ej. "Clientes").
--   · Casilla nueva personas.varios_puestos (la marca el admin en Personas).
--   · Con la casilla marcada, no aplica la regla "una persona, un puesto por día" (tiene_puesto).
begin;

alter table public.personas
  add column if not exists varios_puestos boolean not null default false;

-- ¿Esa persona ya tiene un puesto ese día? (base = v2.11) Si puede tener varios, nunca "ya tiene".
create or replace function public.tiene_puesto(p_persona uuid, p_fecha date, p_excluir_periodo int default null) returns boolean
language sql security definer set search_path = public stable as $$
  select case
    when exists (select 1 from personas where id = p_persona and varios_puestos) then false
    else exists (select 1 from reservas r where r.persona_id = p_persona and r.fecha = p_fecha)
      or exists (select 1 from periodos pe where pe.para_id = p_persona
                 and pe.id is distinct from p_excluir_periodo and periodo_cubre(pe, p_fecha)
                 and not cedido(pe.estacionamiento_id, p_persona, p_fecha))
      or exists (select 1 from estacionamientos e where e.dueno_id = p_persona and e.tipo = 'fijo'
                 and not exists (select 1 from periodos pe where pe.estacionamiento_id = e.id
                                 and periodo_cubre(pe, p_fecha)))
  end;
$$;

commit;
