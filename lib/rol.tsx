"use client";
// Rol de quien inició sesión ("admin" o "usuario"), disponible en todas las páginas internas.
// OJO: esto solo cambia lo que se VE. La protección real está en los permisos (RLS) de Supabase.
import { createContext, useContext } from "react";
import { Lock } from "lucide-react";

export type Rol = "admin" | "usuario";

const ContextoRol = createContext<Rol>("usuario");

export function RolProvider({ rol, children }: { rol: Rol; children: React.ReactNode }) {
  return <ContextoRol.Provider value={rol}>{children}</ContextoRol.Provider>;
}

export const useRol = () => useContext(ContextoRol);

// Páginas solo del admin. El portero (proxy.ts) ya manda al usuario a Disponibilidad;
// esto es un respaldo: si igual llegara aquí, no ve el contenido.
export function SoloAdmin({ children }: { children: React.ReactNode }) {
  const rol = useRol();
  if (rol === "admin") return <>{children}</>;
  return (
    <p className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <Lock size={16} className="shrink-0" />
      Esta página es solo para el admin. Para tomar o liberar un puesto, usa Disponibilidad.
    </p>
  );
}
