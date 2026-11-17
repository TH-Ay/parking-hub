// Marco de las páginas internas: menú lateral + contenido.
// Lee quién inició sesión y su rol (admin / usuario) para el menú y para bloquear páginas solo del admin.
import { Suspense } from "react";
import Sidebar from "@/components/Sidebar";
import { createClient } from "@/lib/supabase/server";
import { RolProvider, type Rol } from "@/lib/rol";

export default function LayoutApp({ children }: { children: React.ReactNode }) {
  return (
    // Suspense: la sesión se lee en cada visita (cacheComponents lo exige)
    <Suspense fallback={<p className="p-10 text-marca-gris">Cargando...</p>}>
      <Marco>{children}</Marco>
    </Suspense>
  );
}

async function Marco({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: persona } = user
    ? await supabase.from("personas").select("rol").eq("user_id", user.id).maybeSingle()
    : { data: null };
  const rol: Rol = persona?.rol === "admin" ? "admin" : "usuario";

  return (
    <RolProvider rol={rol}>
      <div className="flex min-h-screen flex-col md:flex-row">
        <Sidebar usuario={user?.email ?? ""} rol={rol} />
        <main className="min-w-0 flex-1 p-6 lg:p-10">{children}</main>
      </div>
    </RolProvider>
  );
}
