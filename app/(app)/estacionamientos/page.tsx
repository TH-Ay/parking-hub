// Estacionamientos (solo admin): plano del día y calendario, con datos de Supabase.
import { Suspense } from "react";
import PlanoEstacionamientos from "@/components/estacionamientos/PlanoEstacionamientos";
import { SoloAdmin } from "@/lib/rol";
import { createClient } from "@/lib/supabase/server";
import { leerPuestos } from "@/lib/puestosBD";
import type { EnLista } from "@/components/estacionamientos/ListaEspera";

export default function EstacionamientosPage() {
  return (
    <SoloAdmin>
      {/* Suspense: los datos se leen en cada visita (cacheComponents lo exige) */}
      <Suspense fallback={<p className="text-marca-gris">Cargando estacionamientos...</p>}>
        <PlanoDesdeSupabase />
      </Suspense>
    </SoloAdmin>
  );
}

async function PlanoDesdeSupabase() {
  const supabase = await createClient();
  const [datos, { data: lista }] = await Promise.all([
    leerPuestos(supabase),
    supabase.from("lista_espera").select("persona_id, orden, saltar").order("orden"), // lista de espera de la rotación
  ]);
  if (!datos) return <p className="text-rose-700">No se pudieron cargar los estacionamientos.</p>;
  const listaEspera: EnLista[] = (lista ?? []).map((l) => ({
    personaId: l.persona_id,
    nombre: datos.personas.find((p) => p.id === l.persona_id)?.nombre ?? "(dada de baja)",
    orden: l.orden,
    saltar: l.saltar,
  }));
  return <PlanoEstacionamientos puestos={datos.puestos} personas={datos.personas} listaEspera={listaEspera} />;
}
