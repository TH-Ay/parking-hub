"use client";
// Página de login con CORREO Y CONTRASEÑA (cambio del 17-nov-2026: antes era enlace mágico).
//   · Entrar: correo + contraseña.
//   · Crear mi contraseña (primera vez): solo funciona si el admin cargó ese correo en Personas
//     (la base de datos rechaza los demás). No envía correos: requiere "Confirm email" APAGADO en Supabase.
//   · Olvidé mi contraseña: envía un correo para crear una nueva (usa el correo de Supabase, con su límite por hora).
import { useState, useSyncExternalStore } from "react";
import MarcoLogin from "@/components/MarcoLogin";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const NO_ESTA_EN_LISTA = "Tu correo no está en la lista. Pídele al admin que te agregue.";

// Mensajes que llegan en la dirección (?error=...) desde el portero o el regreso del correo
const MENSAJES: Record<string, string> = {
  lista: NO_ESTA_EN_LISTA,
  enlace: "El enlace venció o ya se usó. Pide uno nuevo.",
};
const sinSuscripcion = () => () => {};
const errorDeLaDireccion = () => new URLSearchParams(window.location.search).get("error") ?? "";

// Traduce los errores de inicio de sesión de Supabase
function traducir(mensaje: string): string {
  if (mensaje.includes("Database error")) return NO_ESTA_EN_LISTA; // la BD rechazó el correo (no está en la lista)
  if (mensaje.includes("Invalid login credentials")) return "Correo o contraseña incorrectos.";
  if (mensaje.includes("already registered")) return "Ya existe una cuenta con ese correo. Usa “Entrar” o “Olvidé mi contraseña”.";
  if (mensaje.includes("Email not confirmed")) return "Tu cuenta aún no está confirmada. Avísale al admin.";
  if (mensaje.toLowerCase().includes("rate limit")) return "Se enviaron muchos correos. Espera un rato y vuelve a intentarlo.";
  if (mensaje.includes("For security purposes")) return "Por seguridad, espera unos segundos antes de pedir otro correo.";
  if (mensaje.includes("Password should be")) return "La contraseña debe tener al menos 8 caracteres.";
  return mensaje;
}

type Modo = "entrar" | "crear" | "olvide";

export default function LoginPage() {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>("entrar");
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [clave2, setClave2] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [listo, setListo] = useState(""); // mensaje de éxito (ej. "te enviamos un correo")
  const codigo = useSyncExternalStore(sinSuscripcion, errorDeLaDireccion, () => "");
  const mensaje = error || (modo === "entrar" ? MENSAJES[codigo] : "") || "";

  function cambiarModo(m: Modo) {
    setModo(m);
    setError("");
    setListo("");
    setClave("");
    setClave2("");
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const correo = email.trim().toLowerCase();
    if (!correo.endsWith("@thehouse.cl")) return setError("Solo se aceptan correos @thehouse.cl");
    if (modo === "crear") {
      if (clave.length < 8) return setError("La contraseña debe tener al menos 8 caracteres.");
      if (clave !== clave2) return setError("Las contraseñas no coinciden.");
    }
    setCargando(true);
    setError("");
    const supabase = createClient();

    if (modo === "entrar") {
      const { error } = await supabase.auth.signInWithPassword({ email: correo, password: clave });
      if (error) {
        setCargando(false);
        return setError(traducir(error.message));
      }
      router.replace("/"); // el portero lo lleva a su página según su rol
    } else if (modo === "crear") {
      const { data, error } = await supabase.auth.signUp({ email: correo, password: clave });
      if (error) {
        setCargando(false);
        return setError(traducir(error.message));
      }
      if (!data.session) {
        // Supabase aún pide confirmar por correo ("Confirm email" encendido)
        setCargando(false);
        return setListo("Tu cuenta quedó creada, pero falta confirmarla. Avísale al admin.");
      }
      router.replace("/");
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(correo, {
        redirectTo: `${window.location.origin}/auth/callback?next=/nueva-clave`,
      });
      setCargando(false);
      if (error) return setError(traducir(error.message));
      setListo(`Si ${correo} tiene cuenta, te enviamos un correo para crear una contraseña nueva. Ábrelo en este mismo navegador.`);
    }
  }

  const campo = "w-full rounded-md border border-black/15 bg-white px-3 py-2 text-marca";
  const titulo = modo === "entrar" ? "Entrar" : modo === "crear" ? "Crear mi contraseña" : "Olvidé mi contraseña";
  const boton = modo === "entrar" ? "Entrar" : modo === "crear" ? "Crear y entrar" : "Enviarme el correo";

  return (
    <MarcoLogin>
        <h1 className="text-2xl font-semibold text-marca">{titulo}</h1>
        {modo === "crear" && (
          <p className="text-sm text-marca-gris">Si es tu primera vez, crea tu contraseña con tu correo de TheHouse.</p>
        )}

        {listo ? (
          <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{listo}</p>
        ) : (
          <form onSubmit={enviar} className="space-y-3">
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="tu.nombre@thehouse.cl"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={campo}
            />
            {modo !== "olvide" && (
              <input
                type="password"
                required
                autoComplete={modo === "crear" ? "new-password" : "current-password"}
                placeholder={modo === "crear" ? "Contraseña (mínimo 8 caracteres)" : "Contraseña"}
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                className={campo}
              />
            )}
            {modo === "crear" && (
              <input
                type="password"
                required
                autoComplete="new-password"
                placeholder="Repite la contraseña"
                value={clave2}
                onChange={(e) => setClave2(e.target.value)}
                className={campo}
              />
            )}
            <button type="submit" disabled={cargando} className="w-full rounded-md bg-marca px-3 py-2 font-semibold text-white disabled:opacity-50">
              {cargando ? "Un momento..." : boton}
            </button>
            {mensaje && <p className="text-sm text-red-600">{mensaje}</p>}
          </form>
        )}

        {/* Cambiar entre las 3 opciones */}
        <div className="space-y-1 text-sm">
          {modo !== "entrar" && (
            <button onClick={() => cambiarModo("entrar")} className="block text-acento hover:underline">
              Ya tengo contraseña: entrar
            </button>
          )}
          {modo !== "crear" && (
            <button onClick={() => cambiarModo("crear")} className="block text-acento hover:underline">
              Primera vez: crear mi contraseña
            </button>
          )}
          {modo !== "olvide" && (
            <button onClick={() => cambiarModo("olvide")} className="block text-marca-gris hover:underline">
              Olvidé mi contraseña
            </button>
          )}
        </div>
    </MarcoLogin>
  );
}
