-- Migración v2.8 (18-nov-2026): el ADMIN quita un día que alguien tomó (ficha del puesto → "Tomado por").
-- Borra la reserva y le deja a la persona el aviso "El admin canceló tu 307 del jue 20-11".
-- Los avisos solo los crea la base de datos, por eso se hace con esta función.
begin;

create or replace function public.quitar_reserva(p_reserva int) returns void
language plpgsql security definer set search_path = public as $$
declare
  v record;
  dias text[] := array['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
begin
  if not es_admin() then
    raise exception 'Solo el admin puede quitar un día que tomó otra persona';
  end if;
  select r.persona_id, r.fecha, e.numero into v
  from reservas r join estacionamientos e on e.id = r.estacionamiento_id
  where r.id = p_reserva;
  if not found then
    raise exception 'Ese día ya no estaba tomado';
  end if;
  delete from reservas where id = p_reserva;
  insert into avisos (persona_id, texto)
  values (v.persona_id, format('El admin canceló tu %s del %s %s', v.numero,
          dias[extract(isodow from v.fecha)::int], to_char(v.fecha, 'DD-MM')));
end $$;

revoke execute on function public.quitar_reserva(int) from public, anon;
grant execute on function public.quitar_reserva(int) to authenticated;

commit;
