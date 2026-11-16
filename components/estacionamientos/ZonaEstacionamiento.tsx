// Un grupo del plano (Fijos / Rotación / Libres): letrero + asfalto con cajones + pista con línea amarilla.
import type { ReactNode } from "react";
import { ASFALTO } from "./asfalto";

type Props = {
  letra: string;
  colorLetrero: string; // clases Tailwind del letrero
  titulo: string;
  subtitulo: string;
  cantidad: number;
  children: ReactNode; // los cajones
};

export default function ZonaEstacionamiento({ letra, colorLetrero, titulo, subtitulo, cantidad, children }: Props) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-black shadow ${colorLetrero}`}>{letra}</span>
        <h2 className="font-semibold text-marca">{titulo}</h2>
        <span className="text-xs text-marca-gris">
          {subtitulo} · {cantidad}
        </span>
      </div>

      {/* Asfalto */}
      <div className="overflow-hidden rounded-xl shadow-inner" style={ASFALTO}>
        {cantidad === 0 ? (
          <p className="px-4 pt-4 text-sm text-white/60">Ninguno hoy</p>
        ) : (
          <div className="grid grid-cols-3 px-3 pt-3 sm:grid-cols-4 xl:grid-cols-6">{children}</div>
        )}
        {/* Pista de circulación con línea amarilla discontinua */}
        <div className="flex h-8 items-center px-3">
          <div className="w-full border-t-4 border-dashed border-amber-300/80" />
        </div>
      </div>
    </section>
  );
}
