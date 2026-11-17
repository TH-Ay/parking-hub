// Ruta de regreso de los correos de Supabase (ej. "Olvidé mi contraseña"): canjea el código por una sesión
// y lleva a "next" (ej. /nueva-clave) o al inicio.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const siguiente = searchParams.get("next") ?? "/";
  // Solo rutas internas (que empiezan con "/"), para no mandar a nadie a otra página
  const destino = siguiente.startsWith("/") && !siguiente.startsWith("//") ? siguiente : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${destino}`);
  }

  // Enlace vencido o inválido: volver al login
  return NextResponse.redirect(`${origin}/login?error=enlace`);
}
