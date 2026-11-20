// Roles de acceso (sirve tanto en el servidor como en el navegador).
// Recruiting (20-nov-2026): ve Disponibilidad y Estacionamientos (solo los puestos Especiales).
export type Rol = "admin" | "usuario" | "recruiting";

export const NOMBRE_ROL: Record<Rol, string> = { admin: "Admin", usuario: "Usuario", recruiting: "Recruiting" };

// Convierte el texto que viene de Supabase en un Rol válido (cualquier otro valor = usuario)
export const aRol = (valor: unknown): Rol => (valor === "admin" || valor === "recruiting" ? valor : "usuario");
