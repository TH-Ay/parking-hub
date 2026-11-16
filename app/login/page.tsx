"use client";
// Página de login: pide el correo y Supabase envía un enlace mágico.
import { useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";

const NO_ESTA_EN_LISTA = "Tu correo no está en la lista. Pídele al admin que te agregue.";

// Mensajes que llegan en la dirección (?error=...) desde el portero o el regreso del enlace
const MENSAJES: Record<string, string> = {
  lista: NO_ESTA_EN_LISTA,
  enlace: "El enlace venció o ya se usó. Pide uno nuevo.",
};
const sinSuscripcion = () => () => {};
const errorDeLaDireccion = () => new URLSearchParams(window.location.search).get("error") ?? "";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [estado, setEstado] = useState<"inicio" | "enviando" | "enviado">("inicio");
  const [error, setError] = useState("");
  const codigo = useSyncExternalStore(sinSuscripcion, errorDeLaDireccion, () => "");
  const mensaje = error || MENSAJES[codigo] || "";

  async function enviarEnlace(e: React.FormEvent) {
    e.preventDefault();
    const correo = email.trim().toLowerCase();
    if (!correo.endsWith("@thehouse.cl")) return setError("Solo se aceptan correos @thehouse.cl");
    setEstado("enviando");
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: correo,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (error) {
      // Si la BD rechaza el correo (no está en la lista del equipo), Supabase responde "Database error..."
      setError(error.message.includes("Database error") ? NO_ESTA_EN_LISTA : error.message);
      setEstado("inicio");
    } else {
      setEstado("enviado");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Estacionamientos TheHouse</h1>

        {estado === "enviado" ? (
          <p>
            Te enviamos un enlace a <b>{email}</b>. Ábrelo en este mismo navegador para entrar.
          </p>
        ) : (
          <form onSubmit={enviarEnlace} className="space-y-3">
            <input
              type="email"
              required
              placeholder="tu.nombre@thehouse.cl"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border px-3 py-2"
            />
            <button
              type="submit"
              disabled={estado === "enviando"}
              className="w-full rounded bg-marca px-3 py-2 text-white disabled:opacity-50"
            >
              {estado === "enviando" ? "Enviando..." : "Enviarme el enlace"}
            </button>
            {mensaje && <p className="text-sm text-red-600">{mensaje}</p>}
          </form>
        )}
      </div>
    </main>
  );
}
