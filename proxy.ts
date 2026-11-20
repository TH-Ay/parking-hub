// "Portero": refresca la sesión y manda a /login a quien no la tenga.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Interruptor del login: true = encendido (encendido el 16-nov-2026, al conectar Supabase v2).
const LOGIN_ACTIVO = true;

export async function proxy(request: NextRequest) {
  if (!LOGIN_ACTIVO) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Páginas públicas: login y el regreso del enlace
  const ruta = request.nextUrl.pathname;
  const esPublica = ruta.startsWith("/login") || ruta.startsWith("/auth");

  if (!user && !esPublica) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Con sesión, pero ¿está en la lista del equipo y activa? Si no (o fue dada de baja), se cierra la sesión.
  if (user && !esPublica) {
    const { data: persona } = await supabase.from("personas").select("id, rol").eq("user_id", user.id).eq("activa", true).maybeSingle();
    if (!persona) {
      await supabase.auth.signOut(); // deja en "response" las cookies que borran la sesión
      const salida = NextResponse.redirect(new URL("/login?error=lista", request.url));
      response.cookies.getAll().forEach((c) => salida.cookies.set(c));
      return salida;
    }
    // Página de inicio según el rol
    if (ruta === "/") {
      return NextResponse.redirect(new URL(persona.rol === "admin" ? "/estacionamientos" : "/disponibilidad", request.url));
    }
    // Páginas solo del admin: un usuario no entra, se va a Disponibilidad.
    // Recruiting sí entra a Estacionamientos (ahí solo ve los Especiales), pero no a Personas.
    const permitida =
      persona.rol === "admin" || (persona.rol === "recruiting" && ruta.startsWith("/estacionamientos"));
    const soloAdmin = ruta.startsWith("/estacionamientos") || ruta.startsWith("/personas");
    if (soloAdmin && !permitida) {
      return NextResponse.redirect(new URL("/disponibilidad", request.url));
    }
  }
  if (user && ruta.startsWith("/login")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

// No pasar por el portero para archivos estáticos (imágenes, íconos, etc.)
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
