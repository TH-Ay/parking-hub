// Marco de las pantallas de entrada (login y contraseña nueva): toda la pantalla es un estacionamiento
// visto desde arriba (asfalto, una fila de cajones arriba y otra abajo con autos estacionados, dos calles
// con línea amarilla y autitos que pasan en movimiento) y la tarjeta del formulario va al centro.
// Las animaciones "manejar-derecha" / "manejar-izquierda" están en app/globals.css.
import Image from "next/image";
import { CircleParking } from "lucide-react";
import AutoCenital from "@/components/estacionamientos/AutoCenital";
import { ASFALTO } from "@/components/estacionamientos/asfalto";

// Colores de los autos (los mismos del plano: azul = dueño, ámbar = rotación, turquesa = acento)
const COLORES = ["#378add", "#ef9f27", "#13a699", "#e8766b", "#8397a0"];
// Fila de cajones: color del auto o null = libre (se repite para cubrir pantallas anchas)
const FILA: (string | null)[] = ["#378add", null, "#ef9f27", "#13a699", "#378add", null, "#e8766b", "#378add", "#8397a0", null, "#ef9f27", "#378add"];

// Autitos que pasan: calle, color, duración de la vuelta y en qué parte de la vuelta parten (retraso negativo)
const PASAN = [
  { calle: "arriba", color: COLORES[0], duracion: 14, retraso: -2 },
  { calle: "arriba", color: COLORES[2], duracion: 18, retraso: -10 },
  { calle: "abajo", color: COLORES[1], duracion: 16, retraso: -5 },
  { calle: "abajo", color: COLORES[3], duracion: 20, retraso: -14 },
] as const;

function FilaCajones({ abajo = false }: { abajo?: boolean }) {
  return (
    <div className={`absolute inset-x-0 flex ${abajo ? "bottom-0" : "top-0"}`}>
      {[...FILA, ...FILA].map((color, i) => (
        <div
          key={i}
          className={`flex h-24 w-20 shrink-0 items-center justify-center border-x-2 border-white/60 sm:h-28 sm:w-24 ${
            abajo ? "border-t-2" : "border-b-2"
          } ${color ? "" : "bg-emerald-400/10"}`}
        >
          {color ? (
            <AutoCenital color={color} className={`h-14 sm:h-16 ${abajo ? "rotate-180" : ""}`} />
          ) : (
            <CircleParking size={24} className="text-emerald-300/80" />
          )}
        </div>
      ))}
    </div>
  );
}

// Calle con línea amarilla discontinua y los autitos que la recorren
function Calle({ cual }: { cual: "arriba" | "abajo" }) {
  return (
    <div className={`absolute inset-x-0 h-16 ${cual === "arriba" ? "top-24 sm:top-28" : "bottom-24 sm:bottom-28"}`}>
      <div className="absolute inset-x-0 top-1/2 border-t-4 border-dashed border-amber-300/70" />
      {PASAN.filter((a) => a.calle === cual).map((a, i) => (
        <div
          key={i}
          // La animación se arma con clases de Tailwind (velocidad y punto de partida vienen de --duracion / --retraso)
          className={`auto-en-movimiento absolute left-0 top-1/2 -mt-6 ${
            cual === "arriba"
              ? "animate-[manejar-derecha_var(--duracion)_linear_var(--retraso)_infinite]"
              : "animate-[manejar-izquierda_var(--duracion)_linear_var(--retraso)_infinite]"
          }`}
          style={{ "--duracion": `${a.duracion}s`, "--retraso": `${a.retraso}s` } as React.CSSProperties}
        >
          <AutoCenital color={a.color} className="h-12" />
        </div>
      ))}
    </div>
  );
}

export default function MarcoLogin({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-6" style={ASFALTO}>
      {/* El estacionamiento de fondo (decorativo) */}
      <div aria-hidden="true">
        <FilaCajones />
        <Calle cual="arriba" />
        <Calle cual="abajo" />
        <FilaCajones abajo />
      </div>

      {/* Tarjeta con el formulario, al centro */}
      <div className="relative z-10 my-40 w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-2xl">
        {/* Franja de barrera (amarilla y negra), como la entrada de un estacionamiento */}
        <div className="h-2.5" style={{ backgroundImage: "repeating-linear-gradient(45deg, #facc15 0 10px, #1f2328 10px 20px)" }} />
        <div className="space-y-5 p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <Image src="/logo.png" alt="The House Advisory" width={160} height={43} priority className="h-auto" />
              <p className="mt-1 text-xs font-semibold tracking-[0.3em] text-acento">PARKING</p>
            </div>
            {/* Letrero azul con "P" blanca, como la señal de tránsito */}
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-white bg-blue-700 text-xl font-black text-white shadow-md ring-1 ring-blue-900/30">
              P
            </span>
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
