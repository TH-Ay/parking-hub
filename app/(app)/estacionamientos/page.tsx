// Estacionamientos (admin; recruiting solo ve los Especiales): plano del día y calendario, con datos de Supabase.
import { Suspense } from "react";
import PlanoEstacionamientos from "@/components/estacionamientos/PlanoEstacionamientos";
import { SoloAdmin } from "@/lib/rol";
import { createClient } from "@/lib/supabase/server";
import { leerPuestos } from "@/lib/puestosBD";
import type { EnLista } from "@/components/estacionamientos/ListaEspera";
import { hoyEnChile, sumarDias } from "@/components/estacionamientos/fechas";

export default function EstacionamientosPage() {
  return (
    <SoloAdmin tambien={["recruiting"]}>
      {/* Suspense: los datos se leen en cada visita (cacheComponents lo exige) */}
      <Suspense fallback={<p className="text-marca-gris">Cargando estacionamientos...</p>}>
        <PlanoDesdeSupabase />
      </Suspense>
    </SoloAdmin>
  );
}

async function PlanoDesdeSupabase() {
  const supabase = await createClient();
  const [datos, { data: lista }, { data: horas }] = await Promise.all([
    leerPuestos(supabase),
    supabase.from("lista_espera").select("persona_id, orden, saltar").order("orden"), // lista de espera de la rotación
    // Reservas por hora de los Especiales (desde hace 2 meses; solo admin y recruiting las pueden leer)
    supabase.from("reservas_horas").select("id, estacionamiento_id, fecha, desde, hasta, descripcion, creado_por").gte("fecha", sumarDias(hoyEnChile(), -60)).order("desde"),
  ]);
  if (!datos) return <p className="text-rose-700">No se pudieron cargar los estacionamientos.</p>;
  for (const p of datos.puestos) {
    if (p.tipo !== "especial") continue;
    p.horas = (horas ?? [])
      .filter((h) => h.estacionamiento_id === p.id)
      .map((h) => ({ id: h.id, fecha: h.fecha, desde: h.desde.slice(0, 5), hasta: h.hasta.slice(0, 5), descripcion: h.descripcion,
        creadoPor: datos.personas.find((x) => x.id === h.creado_por)?.nombre ?? null, // quién la creó
      }));
  }
  const listaEspera: EnLista[] = (lista ?? []).map((l) => ({
    personaId: l.persona_id,
    nombre: datos.personas.find((p) => p.id === l.persona_id)?.nombre ?? "(dada de baja)",
    orden: l.orden,
    saltar: l.saltar,
  }));
  return <PlanoEstacionamientos puestos={datos.puestos} personas={datos.personas} listaEspera={listaEspera} feriados={datos.feriados} />;
}
