-- Migración v2.14 (19-nov-2026): el admin CAMBIA LA PERSONA de un préstamo o rotación (sin borrarlo).
--   · Si aún no empieza: solo cambia la persona (mismas fechas).
--   · Si ya empezó: el de la persona anterior termina ayer (queda el historial) y la nueva lo tiene
--     desde hoy hasta el mismo fin.
--   · Los "No voy" de la persona anterior desde hoy se borran (eran suyos).
--   · Lista de espera (solo si p_lugar viene): quien lo deja vuelve al 'primero' o pasa al 'final';
--     la nueva persona, si está en la lista, pasa al final (como en cualquier rotación).
--   · Avisos a las dos personas.
begin;

create or replace function public.cambiar_persona(p_periodo int, p_nueva uuid, p_lugar text default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  pe periodos;
  v_hoy date := hoy_chile();
  v_vieja uuid;
  v_numero text;
  v_desde date;
  v_rango text;
begin
  if not es_admin() then
    raise exception 'Solo el admin puede cambiar la persona';
  end if;
  select * into pe from periodos where id = p_periodo;
  if pe.id is null or pe.para_id is null then
    raise exception 'Ese préstamo ya no existe';
  end if;
  if pe.hasta is not null and pe.hasta < v_hoy then
    raise exception 'Ese préstamo ya terminó';
  end if;
  if p_nueva is null or p_nueva = pe.para_id then
    raise exception 'Elige a otra persona';
  end if;
  if not exists (select 1 from personas where id = p_nueva and activa) then
    raise exception 'Esa persona no está activa';
  end if;
  if p_lugar is not null and p_lugar not in ('primero', 'final') then
    raise exception 'Lugar en la lista no válido';
  end if;

  v_vieja := pe.para_id;
  v_desde := greatest(pe.desde, v_hoy);
  select numero into v_numero from estacionamientos where id = pe.estacionamiento_id;
  v_rango := case when pe.hasta is null then format('desde el %s', to_char(v_desde, 'DD-MM-YYYY'))
                  else format('del %s al %s', to_char(v_desde, 'DD-MM-YYYY'), to_char(pe.hasta, 'DD-MM-YYYY')) end;

  -- 1. Los "No voy" de la persona anterior (desde hoy) se borran
  delete from periodos where estacionamiento_id = pe.estacionamiento_id and cede_id = v_vieja and desde >= v_hoy;
  update periodos set hasta = v_hoy - 1
  where estacionamiento_id = pe.estacionamiento_id and cede_id = v_vieja and desde < v_hoy and (hasta is null or hasta >= v_hoy);

  -- 2. Cambio de persona
  if pe.desde >= v_hoy then
    update periodos set para_id = p_nueva where id = pe.id; -- validar_periodo revisa choques
    insert into avisos (persona_id, texto)
    values (v_vieja, format('El admin cambió el préstamo del %s: ya no lo tienes (%s).', v_numero, v_rango));
  else
    update periodos set hasta = v_hoy - 1 where id = pe.id; -- al_recuperar avisa "Se terminó tu asignación"
    insert into periodos (estacionamiento_id, desde, hasta, dia_semana, para_id, motivo, origen, para_todos)
    values (pe.estacionamiento_id, v_hoy, pe.hasta, pe.dia_semana, p_nueva, pe.motivo, pe.origen, pe.para_todos);
  end if;
  insert into avisos (persona_id, texto) values (p_nueva, format('Te toca el %s %s.', v_numero, v_rango));

  -- 3. Lista de espera (rotación)
  if p_lugar is not null then
    if p_lugar = 'primero' then
      insert into lista_espera (persona_id, orden)
      values (v_vieja, (select coalesce(min(orden), 1) - 1 from lista_espera))
      on conflict (persona_id) do update set orden = excluded.orden;
    else
      insert into lista_espera (persona_id, orden)
      values (v_vieja, (select coalesce(max(orden), 0) + 1 from lista_espera))
      on conflict (persona_id) do update set orden = excluded.orden;
    end if;
    update lista_espera set orden = (select coalesce(max(orden), 0) + 1 from lista_espera) where persona_id = p_nueva;
  end if;

  return format('El %s ahora es de otra persona %s', v_numero, v_rango);
end $$;

commit;
