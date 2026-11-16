// Ventana emergente "¿Quieres tomar el [número]?" (o "¿Quieres soltar…?") con Cancelar / Confirmar.
// Al soltar un puesto que tienes varios días seguidos, muestra una casilla por día (todas marcadas).
// Si no se puede, muestra el error (ej. ya tienes uno ese día) y la ventana sigue abierta.
import { useState } from "react";
import { CircleParking, LogOut, X } from "lucide-react";
import { fechaTexto } from "@/components/estacionamientos/fechas";
import type { Puesto } from "@/components/estacionamientos/datosPrueba";

type Props = {
  accion: "tomar" | "soltar";
  puesto: Puesto;
  fechas: string[]; // tomar: 1 día; soltar: los días seguidos que tienes ese puesto
  error: string;
  onCancelar: () => void;
  onConfirmar: (fechas: string[]) => void; // los días elegidos
};

const dia = (f: string) => fechaTexto(f, { weekday: "long", day: "numeric", month: "long" });

export default function ModalTomar({ accion, puesto, fechas, error, onCancelar, onConfirmar }: Props) {
  const soltar = accion === "soltar";
  const [marcadas, setMarcadas] = useState<string[]>(fechas); // por defecto, todos los días
  const conCasillas = soltar && fechas.length > 1;

  const alternar = (f: string) => setMarcadas((m) => (m.includes(f) ? m.filter((x) => x !== f) : [...m, f]));

  return (
    // Fondo oscuro: al tocarlo fuera de la ventana se cancela
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancelar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-tomar"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white ${soltar ? "bg-marca-gris" : "bg-emerald-500"}`}
            >
              {soltar ? <LogOut size={22} /> : <CircleParking size={26} />}
            </span>
            <h2 id="titulo-tomar" className="text-lg font-semibold text-marca">
              ¿Quieres {accion} el {puesto.numero}?
            </h2>
          </div>
          <button onClick={onCancelar} className="text-marca-gris hover:text-marca" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        {conCasillas ? (
          // Una casilla por día: se sueltan solo los marcados
          <div className="mt-3 space-y-1.5">
            <p className="text-sm text-marca-gris">Subterráneo {puesto.piso} · ¿Qué días quieres soltar?</p>
            {fechas.map((f) => (
              <label key={f} className="flex cursor-pointer items-center gap-2 rounded-md border border-black/10 px-3 py-2 text-sm text-marca hover:bg-marca/5">
                <input type="checkbox" checked={marcadas.includes(f)} onChange={() => alternar(f)} className="h-4 w-4 accent-[#13a699]" />
                {dia(f)}
              </label>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-marca-gris">
            {dia(fechas[0])} · Subterráneo {puesto.piso}
          </p>
        )}
        {soltar && <p className="mt-2 text-sm text-marca-gris">Quedará libre para que otra persona lo tome.</p>}

        {error && <p className="mt-3 rounded-md bg-rose-50 p-2 text-sm text-rose-700">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button onClick={onCancelar} className="flex-1 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-marca">
            Cancelar
          </button>
          <button
            onClick={() => marcadas.length > 0 && onConfirmar(marcadas)}
            disabled={marcadas.length === 0}
            className="flex-1 rounded-md bg-acento px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
