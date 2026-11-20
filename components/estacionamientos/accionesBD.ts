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
    // Reservas por hora (solo Especiales): la BD revisa horario, cruces y fechas pasadas
    reservarHora: (estId: number, fecha: string, desde: string, hasta: string, descripcion: string) =>
      resultado(supabase.from("reservas_horas").insert({ estacionamiento_id: estId, fecha, desde, hasta, descripcion })),
    borrarHora: (id: number) => resultado(supabase.from("reservas_horas").delete().eq("id", id)),

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
          para_todos: l.paraTodos ?? true,
          origen: l.rotacion ? "rotacion" : "manual",
        }),
      ),

    // Asignar por un periodo (variables y fijos sin dueño)
    asignar: (estId: number, a: Asignacion) =>
      resultado(
        supabase.from("periodos").insert({
          estacionamiento_id: estId,
          desde: a.desde,
          hasta: a.hasta,
          para_id: idDe(a.persona),
          origen: a.rotacion ? "rotacion" : "manual",
        }),
      ),

    // "Dar a la siguiente de la lista" (un puesto): la BD asigna como rotación y la pasa al final de la lista
    darRotacion: (estId: number, personaId: string, desde: string, hasta: string) =>
      resultado(supabase.rpc("asignar_rotacion", { p_items: [{ estacionamiento_id: estId, persona_id: personaId, desde, hasta }] })),

    // Etiqueta en "Programado": Préstamo ↔ Rotación (solo corrige la marca; no mueve la lista de espera)
    cambiarOrigen: (periodoId: number, rotacion: boolean) =>
      resultado(supabase.from("periodos").update({ origen: rotacion ? "rotacion" : "manual" }).eq("id", periodoId)),

    // La ✕ de "Programado" = terminar antes: si ya empezó, termina ayer (queda el historial); si no, se borra
    terminar: (periodoId: number, desde: string, hoy: string) =>
      desde < hoy
        ? resultado(supabase.from("periodos").update({ hasta: sumarDias(hoy, -1) }).eq("id", periodoId))
        : resultado(supabase.from("periodos").delete().eq("id", periodoId)),

    // Cambiar la persona de un préstamo o rotación (la BD corta lo que ya pasó, avisa y mueve la lista de espera)
    cambiarPersona: (periodoId: number, nueva: string, lugar: "primero" | "final" | null) =>
      resultado(supabase.rpc("cambiar_persona", { p_periodo: periodoId, p_nueva: idDe(nueva), p_lugar: lugar })),

    // Liberación larga de un fijo: para todos (true) o para la rotación (false)
    cambiarParaTodos: (periodoId: number, valor: boolean) =>
      resultado(supabase.from("periodos").update({ para_todos: valor }).eq("id", periodoId)),

    // Quitar un día que alguien tomó (la BD borra la reserva y le deja un aviso a la persona)
    quitarReserva: (reservaId: number) => resultado(supabase.rpc("quitar_reserva", { p_reserva: reservaId })),

    // Cambios del puesto: dueño, tipo (fijo / variable / especial) y uso especial
    cambiarPuesto: (estId: number, cambios: { tipo?: string; dueno?: string | null; usoEspecial?: string | null; diaADia?: boolean }) =>
      resultado(
        supabase
          .from("estacionamientos")
          .update({
            // al pasar a variable parte "día a día" (para todos); en otro tipo no aplica
            ...(cambios.tipo !== undefined && { tipo: cambios.tipo, dia_a_dia: cambios.tipo === "variable" }),
            ...(cambios.diaADia !== undefined && { dia_a_dia: cambios.diaADia }),
            ...(cambios.dueno !== undefined && { dueno_id: idDe(cambios.dueno) }),
            ...(cambios.usoEspecial !== undefined && { uso_especial: cambios.usoEspecial }),
          })
          .eq("id", estId),
      ),
  };
}
