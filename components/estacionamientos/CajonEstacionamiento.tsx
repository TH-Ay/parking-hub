// Un cajón pintado sobre el asfalto. Se dibuja según cómo está ese día:
// fijo (auto azul + dueño), rotación (auto ámbar + quien lo usa), libre (P verde),
// fijo aún sin dueño (punteado, solo admin) o especial (ej. Visitas).
import { CircleParking, Users } from "lucide-react";
import AutoCenital from "./AutoCenital";
import type { EstadoDelDia, Puesto } from "./datosPrueba";

type Props = {
  puesto: Puesto;
  estado: EstadoDelDia;
  elegido: boolean;
  onElegir: () => void;
  escondido?: boolean; // true mientras el autito maneja hacia este cajón
  paraRotacion?: boolean; // libre, pero reservado para la lista de espera
  diaADia?: boolean; // variable que cualquiera toma día a día
  reservasDelDia?: number; // solo Especiales: cuántas reservas por hora tiene ese día (undefined = no se ve)
};

const chip = "max-w-full truncate rounded bg-white px-1.5 py-0.5 text-[11px] font-semibold text-marca";

export default function CajonEstacionamiento({ puesto, estado, elegido, onElegir, escondido = false, paraRotacion = false, diaADia = false, reservasDelDia }: Props) {
  let centro;
  if (puesto.tipo === "especial") {
    centro = (
      <>
        <Users size={26} className="text-amber-300" />
        <span className={chip}>{estado.quien}</span>
        {reservasDelDia !== undefined && (
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${reservasDelDia ? "bg-amber-400 text-amber-950" : "bg-emerald-300 text-emerald-950"}`}>
            {reservasDelDia ? `${reservasDelDia} reserva${reservasDelDia > 1 ? "s" : ""}` : "Sin reservas"}
          </span>
        )}
      </>
    );
  } else if (estado.zona === "libres") {
    centro = (
      <>
        <CircleParking size={28} className="text-emerald-300" />
        <span className="max-w-full truncate text-[11px] font-medium text-emerald-200">
          {estado.deQuien ? `de ${estado.deQuien}` : "Libre"}
        </span>
        {/* Reservado para la lista de espera: nadie lo toma día a día */}
        {paraRotacion && (
          <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">Esperando rotación</span>
        )}
        {diaADia && !paraRotacion && (
          <span className="rounded bg-emerald-300 px-1.5 py-0.5 text-[10px] font-bold text-emerald-950">Día a día</span>
        )}
      </>
    );
  } else if (!estado.quien) {
    centro = (
      <>
        <div className="h-[60px] w-8 rounded-lg border-2 border-dashed border-white/50" />
        <span className="rounded border border-dashed border-white/50 px-1.5 py-0.5 text-[11px] text-white/80">Sin dueño aún</span>
      </>
    );
  } else {
    centro = (
      <>
        <AutoCenital className="h-16" color={estado.zona === "rotacion" ? "#ef9f27" : estado.zona === "tomados" ? "#8b5cf6" : "#378add"} />
        <span className={chip}>{estado.quien}</span>
      </>
    );
  }

  return (
    <button
      onClick={onElegir}
      data-numero={puesto.numero} // el plano lo usa para saber dónde está (animación del autito)
      className={`flex h-40 flex-col items-center justify-between border-x-2 border-t-2 border-white/70 px-1.5 pb-1.5 pt-2 text-left transition hover:bg-white/5 ${
        estado.zona === "libres" ? "bg-emerald-400/15" : ""
      } ${elegido ? "outline outline-3 -outline-offset-4 outline-acento" : ""} ${escondido ? "opacity-0" : "opacity-100"}`}
    >
      <span className="self-start rounded bg-black/40 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-white/80">
        N{puesto.piso}
      </span>
      <div className="flex max-w-full flex-col items-center gap-1">{centro}</div>
      <span className="self-start font-mono text-xl font-black tracking-wider text-white/90">{puesto.numero}</span>
    </button>
  );
}
