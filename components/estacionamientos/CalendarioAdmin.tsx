// Vista general del ADMIN (pestaña "Calendario" de Estacionamientos):
// alertas arriba + calendario Semana (puestos × días), Mes (por defecto) o Año. Solo lunes a viernes.
// Usa los mismos datos del plano: lo que el admin cambia allá se ve acá.
import { useState } from "react";
import { AlertTriangle, CalendarClock, ChevronLeft, ChevronRight, CircleParking } from "lucide-react";
import { esDeRotacion, estadoAdminEn, type Puesto } from "./datosPrueba";
import { diaSemana, esHabil, fechaTexto, habil, lunesDe, mesDe, sumarDias, sumarMeses } from "./fechas";

type Vista = "semana" | "mes" | "anio";
type Props = { hoy: string; puestos: Puesto[]; onIrAPuesto: (numero: string) => void; feriados: Record<string, string> };

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie"];
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const corta = (f: string) => fechaTexto(f, { day: "numeric", month: "short" });

// Estado de un puesto en un día, con los mismos colores del plano
type Celda = { tipo: "dueno" | "rotacion" | "tomado" | "libre" | "especial" | "sinDueno"; clase: string; texto: string; detalle: string };
function celdaDe(p: Puesto, f: string): Celda {
  const e = estadoAdminEn(p, f);
  if (p.tipo === "especial") return { tipo: "especial", clase: "bg-slate-200 text-slate-700", texto: p.especial ?? "Especial", detalle: "Puesto especial" };
  if (e.zona === "rotacion") return { tipo: "rotacion", clase: "bg-amber-200 text-amber-950", texto: e.quien!, detalle: "Asignado / rotación" };
  if (e.zona === "tomados")
    return { tipo: "tomado", clase: "bg-violet-200 text-violet-950", texto: `Prestado: ${e.quien}`, detalle: `Prestado a ${e.quien}` + (e.deQuien ? ` (liberado por ${e.deQuien})` : "") };
  if (e.zona === "libres" && esDeRotacion(p, f))
    return { tipo: "libre", clase: "border border-dashed border-amber-500 bg-amber-50 text-amber-900", texto: "Para rotación", detalle: "Reservado para la lista de espera" };
  if (e.zona === "libres")
    return { tipo: "libre", clase: "bg-emerald-200 text-emerald-950", texto: "Libre", detalle: e.deQuien ? `Libre (liberado por ${e.deQuien})` : "Libre (variable)" };
  if (!e.quien) return { tipo: "sinDueno", clase: "border border-dashed border-marca-gris bg-white text-marca-gris", texto: "Sin dueño", detalle: "Fijo sin dueño" };
  return { tipo: "dueno", clase: "bg-sky-200 text-sky-950", texto: e.quien, detalle: "Lo usa su dueño" };
}

// Días hábiles entre dos fechas (incluidas)
function diasHabiles(desde: string, hasta: string) {
  const dias: string[] = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) if (esHabil(f)) dias.push(f);
  return dias;
}

export default function CalendarioAdmin({ hoy, puestos, onIrAPuesto, feriados }: Props) {
  const [vista, setVista] = useState<Vista>("mes");
  const [foco, setFoco] = useState(habil(hoy));
  const ordenados = [...puestos].sort((a, b) => a.numero.localeCompare(b.numero));
  // Los feriados no cuentan (nadie usa los estacionamientos)
  const libresEn = (f: string) => (feriados[f] ? 0 : puestos.filter((p) => celdaDe(p, f).tipo === "libre").length);
  const rotacionEn = (f: string) => (feriados[f] ? 0 : puestos.filter((p) => celdaDe(p, f).tipo === "rotacion").length);

  // ---- Alertas ----
  const sinDueno = ordenados.filter((p) => p.tipo === "fijo" && !p.dueno);
  const restoSemana = diasHabiles(hoy, sumarDias(lunesDe(hoy), 4)); // desde hoy hasta el viernes
  const libresSemana = restoSemana.reduce((total, f) => total + libresEn(f), 0);
  const limite = sumarDias(hoy, 14);
  const terminan = [
    ...puestos.flatMap((p) =>
      p.asignaciones.filter((a) => a.hasta >= hoy && a.hasta <= limite).map((a) => ({ numero: p.numero, persona: a.persona, hasta: a.hasta })),
    ),
    ...puestos.flatMap((p) =>
      p.liberaciones
        .filter((l) => l.para && l.hasta && l.hasta >= hoy && l.hasta <= limite)
        .map((l) => ({ numero: p.numero, persona: l.para!, hasta: l.hasta! })),
    ),
  ].sort((a, b) => a.hasta.localeCompare(b.hasta));

  // ---- Navegación ----
  function mover(n: number) {
    if (vista === "semana") setFoco(sumarDias(foco, 7 * n));
    else if (vista === "mes") setFoco(sumarMeses(foco, n));
    else setFoco(sumarMeses(foco, 12 * n));
  }
  const lunes = lunesDe(foco);
  const titulo =
    vista === "semana"
      ? `${corta(lunes)} – ${corta(sumarDias(lunes, 4))}`
      : vista === "mes"
        ? mayuscula(fechaTexto(foco, { month: "long", year: "numeric" }))
        : foco.slice(0, 4);

  return (
    <div className="space-y-6">
      {/* Alertas */}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-rose-800">
            <AlertTriangle size={16} /> Fijos sin dueño
          </p>
          <p className="mt-1 text-3xl font-bold text-rose-700">{sinDueno.length}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {sinDueno.length === 0 ? (
              <span className="text-xs text-rose-700">Todos tienen dueño</span>
            ) : (
              sinDueno.map((p) => (
                <button
                  key={p.numero}
                  onClick={() => onIrAPuesto(p.numero)}
                  title="Ver en el plano"
                  className="rounded border border-rose-300 bg-white px-2 py-0.5 font-mono text-xs font-bold text-rose-700 hover:bg-rose-100"
                >
                  {p.numero}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
            <CircleParking size={16} /> Libres sin usar esta semana
          </p>
          <p className="mt-1 text-3xl font-bold text-emerald-700">{libresSemana}</p>
          <p className="mt-1 text-xs text-emerald-800">días-puesto libres desde hoy hasta el viernes</p>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
            <CalendarClock size={16} /> Terminan en los próximos 14 días
          </p>
          {terminan.length === 0 ? (
            <p className="mt-2 text-xs text-amber-800">Ninguna asignación termina pronto.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {terminan.map((t) => (
                <li key={t.numero + t.hasta} className="text-xs text-amber-900">
                  <span className="font-mono font-bold">{t.numero}</span> · {t.persona} · termina el {corta(t.hasta)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Calendario */}
      <section className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => mover(-1)} className="rounded-md p-1.5 text-marca hover:bg-marca/5" aria-label="Anterior">
              <ChevronLeft size={18} />
            </button>
            <h2 className="min-w-40 text-center text-lg font-semibold text-marca">{titulo}</h2>
            <button onClick={() => mover(1)} className="rounded-md p-1.5 text-marca hover:bg-marca/5" aria-label="Siguiente">
              <ChevronRight size={18} />
            </button>
            <button
              onClick={() => setFoco(habil(hoy))}
              className="ml-1 rounded-md border border-black/10 px-2.5 py-1 text-xs font-semibold text-marca hover:bg-marca/5"
            >
              Hoy
            </button>
          </div>
          <div className="flex rounded-md border border-black/10 p-0.5">
            {(
              [
                ["semana", "Semana"],
                ["mes", "Mes"],
                ["anio", "Año"],
              ] as const
            ).map(([v, texto]) => (
              <button
                key={v}
                onClick={() => setVista(v)}
                className={`rounded px-3 py-1 text-xs font-semibold ${vista === v ? "bg-marca text-white" : "text-marca hover:bg-marca/5"}`}
              >
                {texto}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          {vista === "semana" && <VistaSemana lunes={lunes} hoy={hoy} puestos={ordenados} feriados={feriados} />}
          {vista === "mes" && (
            <VistaMes
              foco={foco}
              hoy={hoy}
              libresEn={libresEn}
              rotacionEn={rotacionEn}
              feriados={feriados}
              onDia={(f) => {
                setFoco(f);
                setVista("semana");
              }}
            />
          )}
          {vista === "anio" && (
            <VistaAnio
              anio={Number(foco.slice(0, 4))}
              hoy={hoy}
              libresEn={libresEn}
              onMes={(f) => {
                setFoco(f);
                setVista("mes");
              }}
            />
          )}
        </div>
      </section>
    </div>
  );
}

// Semana: tabla con los puestos en filas y los días (lunes a viernes) en columnas
function VistaSemana({ lunes, hoy, puestos, feriados }: { lunes: string; hoy: string; puestos: Puesto[]; feriados: Record<string, string> }) {
  const dias = DIAS.map((_, i) => sumarDias(lunes, i));
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-separate border-spacing-1 text-xs">
          <thead>
            <tr>
              <th className="w-16 text-left font-semibold text-marca-gris">Puesto</th>
              {dias.map((f, i) => (
                <th key={f} className={`font-semibold ${f === hoy ? "text-acento" : "text-marca-gris"}`}>
                  {DIAS[i]} {Number(f.slice(8))}
                  {feriados[f] && <span className="block text-[10px] font-normal text-marca-gris">Feriado</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {puestos.map((p) => (
              <tr key={p.numero}>
                <td className="whitespace-nowrap font-mono font-black text-marca">
                  {p.numero} <span className="font-sans text-[10px] font-semibold text-marca-gris">N{p.piso}</span>
                </td>
                {dias.map((f) => {
                  // Feriado: celda gris "Feriado" (no se usa ese día)
                  const c = feriados[f]
                    ? { clase: "bg-black/[0.06] text-marca-gris", texto: "Feriado", detalle: feriados[f] }
                    : celdaDe(p, f);
                  return (
                    <td key={f}>
                      <div
                        title={`${p.numero} · ${fechaTexto(f, { weekday: "long", day: "numeric", month: "long" })} · ${c.detalle}: ${c.texto}`}
                        className={`truncate rounded px-1.5 py-1 ${c.clase} ${f < hoy ? "opacity-50" : ""} ${f === hoy ? "ring-2 ring-acento" : ""}`}
                      >
                        {c.texto}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Leyenda */}
      <div className="flex flex-wrap gap-3 text-[11px] text-marca-gris">
        <span className="flex items-center gap-1"><i className="h-3 w-3 rounded bg-sky-200" /> Lo usa su dueño</span>
        <span className="flex items-center gap-1"><i className="h-3 w-3 rounded bg-amber-200" /> Asignado / rotación</span>
        <span className="flex items-center gap-1"><i className="h-3 w-3 rounded bg-violet-200" /> Prestado por el día</span>
        <span className="flex items-center gap-1"><i className="h-3 w-3 rounded bg-emerald-200" /> Libre sin tomar</span>
        <span className="flex items-center gap-1"><i className="h-3 w-3 rounded bg-slate-200" /> Especial</span>
        <span className="flex items-center gap-1"><i className="h-3 w-3 rounded border border-dashed border-marca-gris" /> Fijo sin dueño</span>
      </div>
    </div>
  );
}

// Mes: cada día muestra cuántos libres sin tomar (verde) y cuántos en rotación (ámbar). Clic → Semana.
function VistaMes(props: {
  foco: string;
  hoy: string;
  libresEn: (f: string) => number;
  rotacionEn: (f: string) => number;
  feriados: Record<string, string>;
  onDia: (f: string) => void;
}) {
  const { foco, hoy, libresEn, rotacionEn, feriados, onDia } = props;
  const { desde, hasta } = mesDe(foco);
  const dias = diasHabiles(desde, hasta);
  const vacios = diaSemana(dias[0]) - 1;
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {DIAS.map((d) => (
        <div key={d} className="pb-1 text-center text-xs font-semibold text-marca-gris">{d}</div>
      ))}
      {Array.from({ length: vacios }, (_, i) => <div key={`v${i}`} />)}
      {dias.map((f) => {
        const pasado = f < hoy;
        const libres = libresEn(f);
        const rotacion = rotacionEn(f);
        return (
          <button
            key={f}
            onClick={() => onDia(f)}
            title={feriados[f]}
            className={`flex h-20 flex-col items-start justify-between rounded-lg border p-2 text-left transition hover:border-acento ${
              f === hoy ? "border-acento ring-1 ring-acento" : "border-black/10"
            } ${pasado ? "bg-black/[0.02] opacity-60" : feriados[f] ? "bg-black/[0.05]" : "bg-white"}`}
          >
            <span className={`text-sm font-semibold ${feriados[f] ? "text-marca-gris" : "text-marca"}`}>{Number(f.slice(8))}</span>
            {feriados[f] && <span className="text-[11px] font-semibold text-marca-gris">Feriado</span>}
            <div className="flex flex-wrap gap-1">
              {libres > 0 && (
                <span title="Libres sin tomar" className="rounded bg-emerald-500 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                  {libres}
                  <span className="hidden xl:inline"> libres</span>
                </span>
              )}
              {rotacion > 0 && (
                <span title="Asignados / rotación" className="rounded bg-amber-400 px-1.5 py-0.5 text-[11px] font-semibold text-amber-950">
                  {rotacion}
                  <span className="hidden xl:inline"> rot.</span>
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// Año: 12 meses chicos; cada día se pinta más verde mientras más libres quedaron sin usar. Clic → Mes.
function VistaAnio({ anio, hoy, libresEn, onMes }: { anio: number; hoy: string; libresEn: (f: string) => number; onMes: (f: string) => void }) {
  const tono = (n: number) =>
    n === 0 ? "bg-black/5" : n === 1 ? "bg-emerald-200" : n <= 3 ? "bg-emerald-300" : n <= 5 ? "bg-emerald-500" : "bg-emerald-700";
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {MESES.map((nombre, m) => {
          const primero = `${anio}-${String(m + 1).padStart(2, "0")}-01`;
          const { hasta } = mesDe(primero);
          const dias = diasHabiles(primero, hasta);
          const vacios = diaSemana(dias[0]) - 1;
          return (
            <button key={nombre} onClick={() => onMes(primero)} className="rounded-lg border border-black/10 p-2 text-left hover:border-acento">
              <p className="mb-1 text-xs font-semibold text-marca">{nombre}</p>
              <div className="grid grid-cols-5 gap-0.5">
                {Array.from({ length: vacios }, (_, i) => <span key={`v${i}`} />)}
                {dias.map((f) => {
                  const n = libresEn(f);
                  return (
                    <span
                      key={f}
                      title={`${corta(f)}: ${n} libres sin tomar`}
                      className={`h-3 rounded-sm ${tono(n)} ${f === hoy ? "ring-2 ring-acento" : ""}`}
                    />
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>
      {/* Leyenda */}
      <div className="flex items-center gap-1 text-[11px] text-marca-gris">
        Menos
        {["bg-black/5", "bg-emerald-200", "bg-emerald-300", "bg-emerald-500", "bg-emerald-700"].map((c) => (
          <i key={c} className={`h-3 w-3 rounded-sm ${c}`} />
        ))}
        Más libres sin usar
      </div>
    </div>
  );
}
