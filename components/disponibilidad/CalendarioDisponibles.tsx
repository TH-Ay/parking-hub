// Calendario de puestos disponibles: vista Mes (por defecto), Semana o Día.
// Mes y Semana marcan cuántos libres hay cada día; al tocar un día se abre la vista Día con el detalle.
import { useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CircleParking } from "lucide-react";
import { diaSemana, esHabil, fechaTexto, habil, lunesDe, mesDe, sumarDias, sumarMeses } from "@/components/estacionamientos/fechas";
import type { Puesto } from "@/components/estacionamientos/datosPrueba";
import { ASFALTO } from "@/components/estacionamientos/asfalto";
import AutoCenital from "@/components/estacionamientos/AutoCenital";

export type Libre = { puesto: Puesto; deQuien?: string };
// Puesto del dueño que él mismo liberó ese día (solo informativo: no se puede tomar ni suma al contador)
export type Propio = { puesto: Puesto; tomadoPor?: string };
type Vista = "mes" | "semana" | "dia";

type Props = {
  hoy: string;
  libresEn: (fecha: string) => Libre[];
  onElegir: (puesto: Puesto, fecha: string) => void; // el usuario tocó un puesto libre
  propioEn?: (fecha: string) => Propio | null;
};

// Solo días hábiles (lunes a viernes): la oficina no usa los estacionamientos el fin de semana
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie"];
const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export default function CalendarioDisponibles({ hoy, libresEn, onElegir, propioEn = () => null }: Props) {
  const [vista, setVista] = useState<Vista>("mes");
  const [foco, setFoco] = useState(habil(hoy)); // fecha que se está mirando

  const [pasada, setPasada] = useState<Pasada | null>(null); // autito que cruza la pista al cambiar de fecha

  // Flechas ‹ ›: mueven un mes, una semana o un día hábil según la vista
  function mover(n: number) {
    setPasada({ id: Date.now(), direccion: n > 0 ? 1 : -1 });
    if (vista === "mes") setFoco(sumarMeses(foco, n));
    else if (vista === "semana") setFoco(sumarDias(foco, 7 * n));
    else setFoco(habil(sumarDias(foco, n), n));
  }

  const lunes = lunesDe(foco);
  const titulo =
    vista === "mes"
      ? mayuscula(fechaTexto(foco, { month: "long", year: "numeric" }))
      : vista === "semana"
        ? `${fechaTexto(lunes, { day: "numeric", month: "short" })} – ${fechaTexto(sumarDias(lunes, 4), { day: "numeric", month: "short" })}`
        : mayuscula(fechaTexto(foco, { weekday: "long", day: "numeric", month: "long" }));

  const abrirDia = (fecha: string) => {
    setFoco(fecha);
    setVista("dia");
  };

  return (
    <section className="overflow-hidden rounded-xl border border-black/10 bg-white p-3 shadow-sm lg:p-5">
      {/* Franja de barrera (amarilla y negra), como la entrada de un estacionamiento */}
      <div
        className="-mx-3 -mt-3 mb-3 h-2.5 lg:-mx-5 lg:-mt-5 lg:mb-4"
        style={{ backgroundImage: "repeating-linear-gradient(45deg, #facc15 0 10px, #1f2328 10px 20px)" }}
      />

      {/* Encabezado: título, flechas, "Hoy" y selector de vista (en pantallas angostas pasa a dos líneas) */}
      <div className="flex flex-wrap items-center justify-between gap-2 lg:gap-3">
        <div className="flex flex-wrap items-center gap-1 lg:gap-2">
          <button onClick={() => mover(-1)} className="rounded-md p-1.5 text-marca hover:bg-marca/5" aria-label="Anterior">
            <ChevronLeft size={18} />
          </button>
          <h2 className="text-center text-base font-semibold text-marca md:min-w-44 md:text-lg">{titulo}</h2>
          <button onClick={() => mover(1)} className="rounded-md p-1.5 text-marca hover:bg-marca/5" aria-label="Siguiente">
            <ChevronRight size={18} />
          </button>
          <button onClick={() => setFoco(habil(hoy))} className="ml-1 rounded-md border border-black/10 px-2.5 py-1 text-xs font-semibold text-marca hover:bg-marca/5">
            Hoy
          </button>
        </div>
        <div className="flex rounded-md border border-black/10 p-0.5">
          {(["dia", "semana", "mes"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={`rounded px-3 py-1 text-xs font-semibold ${vista === v ? "bg-marca text-white" : "text-marca hover:bg-marca/5"}`}
            >
              {v === "dia" ? "Día" : v === "semana" ? "Semana" : "Mes"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {vista === "mes" && <VistaMes foco={foco} hoy={hoy} libresEn={libresEn} onDia={abrirDia} />}
        {vista === "semana" && (
          <VistaSemana lunes={lunes} hoy={hoy} libresEn={libresEn} onDia={abrirDia} onElegir={onElegir} propioEn={propioEn} />
        )}
        {vista === "dia" && (
          <VistaDia fecha={foco} hoy={hoy} libres={libresEn(foco)} onElegir={onElegir} propio={foco < hoy ? null : propioEn(foco)} />
        )}
      </div>

      <Pista pasada={pasada} />
    </section>
  );
}

type VistaProps = { hoy: string; libresEn: (fecha: string) => Libre[]; onDia: (fecha: string) => void };
type Elegir = (puesto: Puesto, fecha: string) => void; // tocar un puesto libre para tomarlo

type Pasada = { id: number; direccion: 1 | -1 };

// Pista de abajo del calendario: al avanzar (›) un autito la cruza hacia la derecha; al retroceder (‹), hacia la izquierda
function Pista({ pasada }: { pasada: Pasada | null }) {
  const auto = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = auto.current;
    if (!el || !pasada || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ancho = el.parentElement!.clientWidth;
    const [inicio, fin] = pasada.direccion > 0 ? [-50, ancho + 50] : [ancho + 50, -50];
    const giro = pasada.direccion > 0 ? 90 : -90; // el dibujo mira hacia arriba: lo giramos hacia donde avanza
    const animacion = el.animate(
      [
        { transform: `translateX(${inicio}px) translateY(-50%) rotate(${giro}deg)` },
        { transform: `translateX(${fin}px) translateY(-50%) rotate(${giro}deg)` },
      ],
      { duration: 1400, easing: "ease-in-out" },
    );
    return () => animacion.cancel();
  }, [pasada]);

  return (
    <div className="relative -mx-3 -mb-3 mt-3 h-10 overflow-hidden lg:-mx-5 lg:-mb-5 lg:mt-4" style={ASFALTO}>
      <div className="absolute inset-x-0 top-1/2 border-t-2 border-dashed border-amber-300/80" />
      <div ref={auto} className="absolute left-0 top-1/2" style={{ transform: "translateX(-60px) translateY(-50%)" }}>
        <AutoCenital color="#13a699" className="h-8" />
      </div>
    </div>
  );
}

// Mes: cuadrícula de lunes a viernes; cada día dice cuántos libres hay
function VistaMes({ foco, hoy, libresEn, onDia }: VistaProps & { foco: string }) {
  const { desde, hasta } = mesDe(foco);
  const dias: string[] = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) if (esHabil(f)) dias.push(f);
  const vacios = diaSemana(dias[0]) - 1; // casillas vacías antes del primer día hábil

  return (
    <div className="grid grid-cols-5 gap-1.5">
      {DIAS.map((d) => (
        <div key={d} className="pb-1 text-center text-xs font-semibold text-marca-gris">{d}</div>
      ))}
      {Array.from({ length: vacios }, (_, i) => <div key={`v${i}`} />)}
      {dias.map((f) => {
        const pasado = f < hoy;
        const n = pasado ? 0 : libresEn(f).length;
        return (
          <button
            key={f}
            onClick={() => onDia(f)}
            className={`flex h-20 flex-col items-start justify-between rounded-lg border p-2 text-left transition hover:border-acento ${
              f === hoy ? "border-acento ring-1 ring-acento" : "border-black/10"
            } ${pasado ? "bg-black/[0.02] text-marca-gris/60" : n > 0 ? "bg-emerald-50" : "bg-white"}`}
          >
            <span className={`text-sm font-semibold ${pasado ? "" : "text-marca"}`}>{Number(f.slice(8))}</span>
            {!pasado &&
              (n > 0 ? (
                <span className="flex items-center gap-1 whitespace-nowrap rounded bg-emerald-500 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                  <CircleParking size={12} className="shrink-0" />
                  {n}
                  {/* en pantallas angostas solo el número */}
                  <span className="hidden xl:inline"> {n === 1 ? "libre" : "libres"}</span>
                </span>
              ) : (
                <span className="text-[11px] text-marca-gris">Sin libres</span>
              ))}
          </button>
        );
      })}
    </div>
  );
}

// Semana: 5 columnas (lunes a viernes) con los números de los puestos libres de cada día
// Cada columna: el encabezado (día) abre la vista Día; cada etiqueta verde abre "¿Quieres tomar…?"
function VistaSemana({
  lunes,
  hoy,
  libresEn,
  onDia,
  onElegir,
  propioEn,
}: VistaProps & { lunes: string; onElegir: Elegir; propioEn: (fecha: string) => Propio | null }) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {DIAS.map((d, i) => {
        const f = sumarDias(lunes, i);
        const pasado = f < hoy;
        const libres = pasado ? [] : libresEn(f);
        const propio = pasado ? null : propioEn(f);
        return (
          <div
            key={f}
            className={`flex min-h-48 flex-col gap-1.5 rounded-lg border p-2 ${
              f === hoy ? "border-acento ring-1 ring-acento" : "border-black/10"
            } ${pasado ? "bg-black/[0.02] text-marca-gris/60" : ""}`}
          >
            <button onClick={() => onDia(f)} className="flex flex-col items-start rounded text-left hover:text-acento">
              <span className="text-xs font-semibold text-marca-gris">{d}</span>
              <span className={`text-lg font-semibold ${pasado ? "" : "text-marca"}`}>{Number(f.slice(8))}</span>
            </button>
            {!pasado && libres.length === 0 && !propio && <span className="text-[11px] text-marca-gris">Sin libres</span>}
            {/* Tu puesto liberado (turquesa claro, no se toma) */}
            {propio && (
              <span
                title={propio.tomadoPor ? `Lo tomó ${propio.tomadoPor}` : "Liberado por ti"}
                className="rounded border border-dashed border-acento bg-acento/10 px-1 py-1 text-center font-mono text-xs font-black text-acento"
              >
                {propio.puesto.numero} · tuyo
              </span>
            )}
            {libres.map(({ puesto }) => (
              // Etiqueta verde (el mismo verde de la vista Mes) con la "P" y el número del puesto
              <button
                key={puesto.numero}
                onClick={() => onElegir(puesto, f)}
                title={`Tomar el ${puesto.numero}`}
                className="flex items-center justify-center gap-1 rounded bg-emerald-500 px-1 py-1 font-mono text-xs font-black text-white transition hover:bg-emerald-600"
              >
                <CircleParking size={12} className="hidden shrink-0 xl:block" />
                {puesto.numero}
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// Día: los puestos libres dibujados como cajones vacíos sobre asfalto; al tocar uno se abre "¿Quieres tomar…?"
function VistaDia(props: { fecha: string; hoy: string; libres: Libre[]; onElegir: Elegir; propio: Propio | null }) {
  const { fecha, hoy, libres, onElegir, propio } = props;
  if (fecha < hoy) return <p className="py-10 text-center text-sm text-marca-gris">Este día ya pasó.</p>;
  if (libres.length === 0 && !propio) return <p className="py-10 text-center text-sm text-marca-gris">No hay estacionamientos libres este día.</p>;
  return (
    <div className="overflow-hidden rounded-xl shadow-inner" style={ASFALTO}>
      <div className="grid grid-cols-2 px-3 pt-3 sm:grid-cols-3 xl:grid-cols-5">
        {/* Tu puesto liberado: borde punteado turquesa, no se puede tomar */}
        {propio && (
          <div className="flex h-40 flex-col items-center justify-between border-x-2 border-t-2 border-dashed border-acento bg-acento/15 px-1.5 pb-1.5 pt-2">
            <span className="self-start rounded bg-black/40 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-white/80">
              N{propio.puesto.piso}
            </span>
            <span className="max-w-full text-center text-[11px] font-semibold text-teal-200">
              {propio.tomadoPor ? `Lo tomó ${propio.tomadoPor}` : "Liberado por ti"}
            </span>
            <span className="self-start font-mono text-xl font-black tracking-wider text-white/90">{propio.puesto.numero}</span>
          </div>
        )}
        {libres.map(({ puesto, deQuien }) => (
          <button
            key={puesto.numero}
            onClick={() => onElegir(puesto, fecha)}
            title={`Tomar el ${puesto.numero}`}
            className="flex h-40 flex-col items-center justify-between border-x-2 border-t-2 border-white/70 bg-emerald-400/15 px-1.5 pb-1.5 pt-2 transition hover:bg-emerald-400/30"
          >
            <span className="self-start rounded bg-black/40 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-white/80">
              N{puesto.piso}
            </span>
            <div className="flex max-w-full flex-col items-center gap-1">
              <CircleParking size={30} className="text-emerald-300" />
              <span className="max-w-full truncate text-[11px] font-medium text-emerald-200">
                {deQuien ? `de ${deQuien}` : "Libre"}
              </span>
            </div>
            <span className="self-start font-mono text-xl font-black tracking-wider text-white/90">{puesto.numero}</span>
          </button>
        ))}
      </div>
      {/* Pista de circulación con línea amarilla discontinua */}
      <div className="flex h-8 items-center px-3">
        <div className="w-full border-t-4 border-dashed border-amber-300/80" />
      </div>
    </div>
  );
}
