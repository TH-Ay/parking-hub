// Traduce los errores de Supabase a mensajes claros en español.
// Los errores de nuestras reglas (triggers) ya vienen en español: se muestran tal cual.
type ErrorSupabase = { code?: string; message: string } | null;

export function mensajeError(error: ErrorSupabase): string {
  if (!error) return "";
  switch (error.code) {
    case "23505": // dato repetido (ej. correo o reserva duplicada)
      if (error.message.includes("email")) return "Ya hay otra persona con ese correo.";
      if (error.message.includes("dueno_id")) return "Esa persona ya tiene un puesto fijo.";
      return "Eso ya existe.";
    case "23514": // regla de la tabla (check)
      return error.message.includes("email") ? "El correo debe terminar en @thehouse.cl." : "Algún dato no es válido.";
    case "42501": // permisos (RLS)
      return "No tienes permiso para hacer esto.";
    case "P0001": // nuestras reglas (raise exception): ya vienen en español
      return error.message;
    default:
      return "No se pudo guardar. Intenta de nuevo.";
  }
}
