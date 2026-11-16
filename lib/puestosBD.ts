// Lee de Supabase los estacionamientos, personas y periodos, y los convierte al formato "Puesto"
// que usan el plano del admin y el calendario de Disponibilidad (tipos en datosPrueba.ts).
// Se usa desde el servidor (páginas), con el cliente de lib/supabase/server.ts.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Asignacion, Liberacion, Puesto } from "@/components/estacionamientos/datosPrueba";

export type PersonaBD = { id: string; nombre: string };

export async function leerPuestos(supabase: SupabaseClient) {
  const [{ data: ests, error }, { data: personas }, { data: periodos }] = await Promise.all([
    supabase.from("estacionamientos").select("id, numero, piso, tipo, dueno_id, uso_especial").order("numero"),
    supabase.from("personas").select("id, nombre").eq("activa", true).order("nombre"),
    supabase.from("periodos").select("id, estacionamiento_id, desde, hasta, dia_semana, para_id, motivo").order("desde"),
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
      liberaciones,
      asignaciones,
    };
  });

  return { puestos, personas: (personas ?? []) as PersonaBD[] };
}
