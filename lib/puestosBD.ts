// Lee de Supabase los estacionamientos, personas y periodos, y los convierte al formato "Puesto"
// que usan el plano del admin y el calendario de Disponibilidad (tipos en datosPrueba.ts).
// Se usa desde el servidor (páginas), con el cliente de lib/supabase/server.ts.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Asignacion, Liberacion, Puesto } from "@/components/estacionamientos/datosPrueba";
import { hoyEnChile, sumarDias } from "@/components/estacionamientos/fechas";

export type PersonaBD = { id: string; nombre: string };

export async function leerPuestos(supabase: SupabaseClient) {
  const haceUnAno = sumarDias(hoyEnChile(), -366); // reservas del último año (para el calendario del admin)
  const [{ data: ests, error }, { data: personas }, { data: periodos }, { data: reservas }] = await Promise.all([
    supabase.from("estacionamientos").select("id, numero, piso, tipo, dueno_id, uso_especial, dia_a_dia").order("numero"),
    supabase.from("personas").select("id, nombre").eq("activa", true).order("nombre"),
    supabase.from("periodos").select("id, estacionamiento_id, desde, hasta, dia_semana, para_id, motivo, para_todos").order("desde"),
    supabase.from("reservas").select("estacionamiento_id, persona_id, fecha").gte("fecha", haceUnAno),
  ]);
  if (error || !ests) return null;

  const nombreDe = (id: string | null) => (id ? (personas?.find((p) => p.id === id)?.nombre ?? "(dada de baja)") : null);

  const puestos: Puesto[] = ests.map((e) => {
    const liberaciones: Liberacion[] = [];
    const asignaciones: Asignacion[] = [];
    for (const p of (periodos ?? []).filter((x) => x.estacionamiento_id === e.id)) {
      // Asignado a una persona en un puesto sin dueño (variable o fijo sin dueño) = asignación / rotación
      if (p.para_id && (e.tipo !== "fijo" || !e.dueno_id) && p.hasta) {
        asignaciones.push({ id: p.id, desde: p.desde, hasta: p.hasta, persona: nombreDe(p.para_id)! });
      } else {
        // Liberación de un fijo con dueño (para cualquiera o para una persona)
        liberaciones.push({
          id: p.id,
          desde: p.desde,
          hasta: p.hasta,
          cadaDia: p.dia_semana ?? undefined,
          motivo: p.motivo ?? undefined,
          para: nombreDe(p.para_id) ?? undefined,
          paraTodos: p.para_todos ?? false,
        });
      }
    }
    return {
      id: e.id,
      numero: e.numero,
      piso: e.piso,
      tipo: e.tipo,
      dueno: nombreDe(e.dueno_id),
      duenoId: e.dueno_id,
      especial: e.uso_especial ?? undefined,
      diaADia: e.dia_a_dia ?? false,
      liberaciones,
      asignaciones,
      tomados: (reservas ?? [])
        .filter((r) => r.estacionamiento_id === e.id)
        .map((r) => ({ fecha: r.fecha, persona: nombreDe(r.persona_id)! })),
    };
  });

  return { puestos, personas: (personas ?? []) as PersonaBD[] };
}
