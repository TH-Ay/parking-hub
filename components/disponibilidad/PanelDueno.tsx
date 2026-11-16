// "Lo tuyo" del DUEÑO de un fijo: su puesto (con botón "No voy") y la lista de días que liberó.
// Cada liberación tiene ✕ para recuperarla ("al final sí voy"), aunque alguien ya lo haya tomado:
// en ese caso se pide confirmar y a esa persona le llega el aviso "Al final sí voy".
import { useState } from "react";
import { X } from "lucide-react";
import AutoCenital from "@/components/estacionamientos/AutoCenital";
import FormLiberar from "@/components/estacionamientos/FormLiberar";
import { ASFALTO } from "@/components/estacionamientos/asfalto";
import { diaSemana, fechaTexto, sumarDias } from "@/components/estacionamientos/fechas";
import type { Liberacion } from "@/components/estacionamientos/datosPrueba";

export type Afectado = { persona: string; fecha: string }; // quien ya lo tomó y qué día

type Props = {
  numero: string;
  hoy: string;
  liberaciones: Liberacion[];
  afectadosDe: (l: Liberacion) => Afectado[];
  onNoVoy: (l: Liberacion) => void;
  onRecuperar: (indice: number) => void;
};

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const corta = (f: string) => fechaTexto(f, { weekday: "short", day: "numeric", month: "short" });
const larga = (f: string) => fechaTexto(f, { weekday: "long", day: "numeric", month: "long" });

// "jue 19 nov", "jue 19 nov – vie 20 nov" o "Cada viernes, desde vie 20 nov"
function textoLiberacion(l: Liberacion) {
  if (l.cadaDia !== undefined) {
    let primero = l.desde; // el primer día que de verdad cae en ese día de la semana
    while (diaSemana(primero) !== l.cadaDia) primero = sumarDias(primero, 1);
    return `Cada ${DIAS[l.cadaDia]}, desde ${corta(primero)}`;
  }
  return l.hasta && l.hasta !== l.desde ? `${corta(l.desde)} – ${corta(l.hasta)}` : corta(l.desde);
}

export default function PanelDueno({ numero, hoy, liberaciones, afectadosDe, onNoVoy, onRecuperar }: Props) {
  const [formAbierto, setFormAbierto] = useState(false);
  const [porRecuperar, setPorRecuperar] = useState<number | null>(null); // índice de la liberación a recuperar

  // Solo las que aún no terminan
  const vigentes = liberaciones.map((l, i) => ({ l, i })).filter(({ l }) => !l.hasta || l.hasta >= hoy);

  return (
    <div className="space-y-4">
      {/* Tu puesto fijo: cajón con tu auto azul (el azul de los fijos del plano) */}
      {/* @container: si el panel es angosto, el texto pasa debajo del cajón */}
      <div className="@container rounded-xl p-3 shadow-inner" style={ASFALTO}>
        <div className="flex flex-col items-center gap-3 text-center @[15rem]:flex-row @[15rem]:text-left">
          <div className="flex w-20 shrink-0 flex-col items-center justify-between border-x-2 border-t-2 border-white/70 px-1 pb-1 pt-2">
            <AutoCenital color="#378add" className="h-14" />
            <span className="font-mono text-lg font-black tracking-wider text-white/90">{numero}</span>
          </div>
          <div className="flex min-w-0 flex-col">
            <p className="text-sm font-semibold text-white">Tu puesto fijo</p>
            <p className="text-xs text-white/70">El {numero} es tuyo todos los días.</p>
            <button
              onClick={() => setFormAbierto(true)}
              className="mt-2 self-center rounded-md border border-white/40 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/10 @[15rem]:self-start"
            >
              No voy
            </button>
          </div>
        </div>
      </div>

      {formAbierto && (
        <FormLiberar
          paraDueno
          hoy={hoy}
          personas={[]}
          onCancelar={() => setFormAbierto(false)}
          onGuardar={(l) => {
            onNoVoy({ ...l, para: undefined });
            setFormAbierto(false);
          }}
        />
      )}

      {/* Días que liberaste */}
      <div>
        <h3 className="text-sm font-semibold text-marca">Días que liberaste</h3>
        {vigentes.length === 0 ? (
          <p className="mt-1 text-xs text-marca-gris">Ninguno. Usas tu puesto todos los días.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {vigentes.map(({ l, i }) => {
              const afectados = afectadosDe(l);
              return (
                <li key={i} className="flex items-start justify-between gap-2 rounded-md border border-black/10 px-3 py-2 text-xs text-marca">
                  <div>
                    <p className="font-semibold">{textoLiberacion(l)}</p>
                    {afectados.length === 0 ? (
                      <p className="text-marca-gris">Libre, nadie lo ha tomado</p>
                    ) : (
                      afectados.map((a) => (
                        <p key={a.fecha} className="text-amber-700">
                          Lo tomó {a.persona} el {larga(a.fecha)}
                        </p>
                      ))
                    )}
                  </div>
                  <button
                    onClick={() => setPorRecuperar(i)}
                    className="shrink-0 text-marca-gris hover:text-rose-600"
                    aria-label="Recuperar (al final sí voy)"
                    title="Recuperar: al final sí voy"
                  >
                    <X size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Confirmar "Al final sí voy" */}
      {porRecuperar !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPorRecuperar(null)}>
          <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-marca">¿Recuperar el {numero}?</h2>
            <p className="mt-2 text-sm text-marca-gris">
              Vuelves a usarlo: {textoLiberacion(liberaciones[porRecuperar])}.
            </p>
            {afectadosDe(liberaciones[porRecuperar]).map((a) => (
              <p key={a.fecha} className="mt-2 rounded-md bg-amber-100 p-2 text-sm text-amber-950">
                {a.persona} lo había tomado el {larga(a.fecha)}. Le avisaremos: «Al final sí voy».
              </p>
            ))}
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setPorRecuperar(null)}
                className="flex-1 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-marca"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  onRecuperar(porRecuperar);
                  setPorRecuperar(null);
                }}
                className="flex-1 rounded-md bg-acento px-3 py-2 text-sm font-semibold text-white"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
