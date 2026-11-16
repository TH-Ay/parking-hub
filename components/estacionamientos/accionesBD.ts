// Acciones del ADMIN en Estacionamientos que escriben en Supabase.
// Cada una devuelve "" si salió bien, o el mensaje de error en español.
// Lo que borra lo programado al cambiar dueño/tipo lo hace la base de datos (trigger al_cambiar_puesto).
import { createClient } from "@/lib/supabase/client";
import { mensajeError } from "@/lib/errores";
import { sumarDias } from "./fechas";
import type { Asignacion, Liberacion } from "./datosPrueba";

export type PersonaBD = { id: string; nombre: string };

export function accionesBD(personas: PersonaBD[]) {
  const supabase = createClient();
  const idDe = (nombre: string | null | undefined) => (nombre ? (personas.find((p) => p.nombre === nombre)?.id ?? null) : null);
  const resultado = async (consulta: PromiseLike<{ error: { code?: string; message: string } | null }>) => mensajeError((await consulta).error);

  return {
    // Liberar (admin): fechas / sin término / cada semana; para cualquiera o para una persona
    liberar: (estId: number, l: Liberacion) =>
      resultado(
        supabase.from("periodos").insert({
          estacionamiento_id: estId,
          desde: l.desde,
          hasta: l.hasta,
          dia_semana: l.cadaDia ?? null,
          para_id: idDe(l.para),
          motivo: l.motivo ?? null,
        }),
      ),

    // Asignar por un periodo (variables y fijos sin dueño)
    asignar: (estId: number, a: Asignacion) =>
      resultado(supabase.from("periodos").insert({ estacionamiento_id: estId, desde: a.desde, hasta: a.hasta, para_id: idDe(a.persona) })),

    // La ✕ de "Programado" = terminar antes: si ya empezó, termina ayer (queda el historial); si no, se borra
    terminar: (periodoId: number, desde: string, hoy: string) =>
      desde < hoy
        ? resultado(supabase.from("periodos").update({ hasta: sumarDias(hoy, -1) }).eq("id", periodoId))
        : resultado(supabase.from("periodos").delete().eq("id", periodoId)),

    // Cambios del puesto: dueño, tipo (fijo / variable / especial) y uso especial
    cambiarPuesto: (estId: number, cambios: { tipo?: string; dueno?: string | null; usoEspecial?: string | null }) =>
      resultado(
        supabase
          .from("estacionamientos")
          .update({
            ...(cambios.tipo !== undefined && { tipo: cambios.tipo }),
            ...(cambios.dueno !== undefined && { dueno_id: idDe(cambios.dueno) }),
            ...(cambios.usoEspecial !== undefined && { uso_especial: cambios.usoEspecial }),
          })
          .eq("id", estId),
      ),
  };
}
