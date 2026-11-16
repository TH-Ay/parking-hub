// Disponibilidad: vista del usuario (calendario de libres + "Lo tuyo"), con datos de Supabase.
import { Suspense } from "react";
import VistaDisponibilidad, { type Aviso, type Reserva } from "@/components/disponibilidad/VistaDisponibilidad";
import { createClient } from "@/lib/supabase/server";
import { leerPuestos } from "@/lib/puestosBD";
import { hoyEnChile, sumarDias } from "@/components/estacionamientos/fechas";

export default function DisponibilidadPage() {
  return (
    // Suspense: los datos se leen en cada visita (cacheComponents lo exige)
    <Suspense fallback={<p className="text-marca-gris">Cargando disponibilidad...</p>}>
      <DisponibilidadDesdeSupabase />
    </Suspense>
  );
}

async function DisponibilidadDesdeSupabase() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ayer = sumarDias(hoyEnChile(), -1); // reservas desde ayer (margen)
  const [datos, { data: yo }, { data: reservas }, { data: avisos }] = await Promise.all([
    leerPuestos(supabase),
    supabase.from("personas").select("id, nombre").eq("user_id", user?.id ?? "").maybeSingle(),
    supabase.from("reservas").select("id, estacionamiento_id, persona_id, fecha").gte("fecha", ayer).order("fecha"),
    supabase.from("avisos").select("id, texto").eq("leido", false).order("created_at"),
  ]);
  if (!datos || !yo) return <p className="text-rose-700">No se pudo cargar la disponibilidad.</p>;

  const numeroDe = (estId: number) => datos.puestos.find((p) => p.id === estId)?.numero ?? "?";
  const nombreDe = (id: string) => datos.personas.find((p) => p.id === id)?.nombre ?? "alguien";
  const todas: Reserva[] = (reservas ?? []).map((r) => ({
    id: r.id,
    numero: numeroDe(r.estacionamiento_id),
    fecha: r.fecha,
    persona: nombreDe(r.persona_id),
    mia: r.persona_id === yo.id,
  }));

  return (
    <VistaDisponibilidad
      puestos={datos.puestos}
      reservas={todas}
      avisos={(avisos ?? []) as Aviso[]}
      yo={yo}
      miFijo={datos.puestos.find((p) => p.tipo === "fijo" && p.duenoId === yo.id)?.numero ?? null}
    />
  );
}
