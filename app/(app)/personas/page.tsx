// Personas: administración del equipo (solo admin). Los datos vienen de Supabase.
import { Suspense } from "react";
import VistaPersonas, { type Persona, type PuestoResumen } from "@/components/personas/VistaPersonas";
import { SoloAdmin } from "@/lib/rol";
import { aRol } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export default function PersonasPage() {
  return (
    <SoloAdmin>
      {/* Suspense: los datos se leen en cada visita (cacheComponents lo exige) */}
      <Suspense fallback={<p className="text-marca-gris">Cargando personas...</p>}>
        <PersonasDesdeSupabase />
      </Suspense>
    </SoloAdmin>
  );
}

async function PersonasDesdeSupabase() {
  const supabase = await createClient();
  const [{ data: personas, error }, { data: puestos }, { data: sesion }] = await Promise.all([
    supabase.from("personas").select("id, user_id, email, nombre, rol, varios_puestos").eq("activa", true),
    supabase.from("estacionamientos").select("id, numero, tipo, dueno_id").order("numero"),
    supabase.auth.getUser(),
  ]);
  if (error) return <p className="text-rose-700">No se pudo cargar la lista de personas.</p>;

  const lista: Persona[] = (personas ?? []).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    correo: p.email,
    rol: aRol(p.rol),
    entro: p.user_id !== null,
    variosPuestos: p.varios_puestos ?? false,
    fijo: puestos?.find((e) => e.dueno_id === p.id)?.numero ?? null,
    soyYo: p.user_id === sesion.user?.id,
  }));
  const resumen: PuestoResumen[] = (puestos ?? []).map((e) => ({ id: e.id, numero: e.numero, tipo: e.tipo, duenoId: e.dueno_id }));
  return <VistaPersonas personas={lista} puestos={resumen} />;
}
