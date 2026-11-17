"use client";
// Crear una contraseña nueva: aquí llega la persona desde el correo de "Olvidé mi contraseña"
// (el regreso /auth/callback ya le abrió la sesión). También sirve para cambiar la contraseña estando dentro.
import { useState } from "react";
import MarcoLogin from "@/components/MarcoLogin";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NuevaClavePage() {
  const router = useRouter();
  const [clave, setClave] = useState("");
  const [clave2, setClave2] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (clave.length < 8) return setError("La contraseña debe tener al menos 8 caracteres.");
    if (clave !== clave2) return setError("Las contraseñas no coinciden.");
    setCargando(true);
    setError("");
    const { error } = await createClient().auth.updateUser({ password: clave });
    if (error) {
      setCargando(false);
      return setError(error.message.includes("different from the old") ? "Usa una contraseña distinta a la anterior." : "No se pudo guardar. Pide otro correo e intenta de nuevo.");
    }
    router.replace("/"); // entra a la app según su rol
  }

  const campo = "w-full rounded-md border border-black/15 bg-white px-3 py-2 text-marca";

  return (
    <MarcoLogin>
        <h1 className="text-2xl font-semibold text-marca">Crea tu contraseña nueva</h1>
        <form onSubmit={guardar} className="space-y-3">
          <input
            type="password"
            required
            autoComplete="new-password"
            placeholder="Contraseña nueva (mínimo 8 caracteres)"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            className={campo}
          />
          <input
            type="password"
            required
            autoComplete="new-password"
            placeholder="Repite la contraseña"
            value={clave2}
            onChange={(e) => setClave2(e.target.value)}
            className={campo}
          />
          <button type="submit" disabled={cargando} className="w-full rounded-md bg-marca px-3 py-2 font-semibold text-white disabled:opacity-50">
            {cargando ? "Guardando..." : "Guardar y entrar"}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
    </MarcoLogin>
  );
}
