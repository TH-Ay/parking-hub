// Ruta de regreso del enlace mágico: canjea el código por una sesión y entra a la app.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/`);
  }

  // Enlace vencido o inválido: volver al login
  return NextResponse.redirect(`${origin}/login?error=enlace`);
}
