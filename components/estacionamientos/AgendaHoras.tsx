"use client";
// Agenda por hora de un puesto Especial (ej. 307 Visitas): qué clientes lo usan ese día y qué horarios quedan libres.
// Horario 08:00–20:00 en bloques de 30 min. Solo admin y recruiting (la BD lo protege con RLS).
// Las reglas (sin cruces, sin fechas pasadas, lunes a viernes) las revisa la BD: aquí solo se ayuda a elegir.
import { useState } from "react";
import { Clock, Plus, X } from "lucide-react";
import type { ReservaHora } from "./datosPrueba";
import { esHabil, habil } from "./fechas";

// "08:00", "08:30", ... "20:00"
const HORAS = Array.from({ length: 25 }, (_, i) => `${String(8 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
const aMin = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const INICIO = aMin("08:00");
const TOTAL = aMin("20:00") - INICIO;

type Tramo = { desde: string; hasta: string; reserva: ReservaHora | null }; // reserva null = libre

// Arma el día completo: reservas + huecos libres entre ellas
function tramosDelDia(reservas: ReservaHora[]): Tramo[] {
  const tramos: Tramo[] = [];
  let cursor = "08:00";
  for (const r of [...reservas].sort((a, b) => a.desde.localeCompare(b.desde))) {
    if (r.desde > cursor) tramos.push({ desde: cursor, hasta: r.desde, reserva: null });
    tramos.push({ desde: r.desde, hasta: r.hasta, reserva: r });
    if (r.hasta > cursor) cursor = r.hasta;
  }
  if (cursor < "20:00") tramos.push({ desde: cursor, hasta: "20:00", reserva: null });
  return tramos;
}

const duracion = (min: number) => (min % 60 ? `${Math.floor(min / 60) ? `${Math.floor(min / 60)} h ` : ""}${min % 60} min` : `${min / 60} h`);

type Props = {
  dia: string; // día que se está mirando en el plano
  hoy: string;
  reservas: ReservaHora[]; // las de ese día
  onReservar: (desde: string, hasta: string, descripcion: string) => void;
  onBorrar: (r: ReservaHora) => void;
  onCambiarDia: (fecha: string) => void; // elegir otra fecha (mueve también el plano a ese día)
};

export default function AgendaHoras({ dia, hoy, reservas, onReservar, onBorrar, onCambiarDia }: Props) {
  const [formulario, setFormulario] = useState<{ desde: string; hasta: string } | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [borrando, setBorrando] = useState<number | null>(null);

  const tramos = tramosDelDia(reservas);
  const libres = tramos.filter((t) => !t.reserva);
  const minLibres = libres.reduce((s, t) => s + aMin(t.hasta) - aMin(t.desde), 0);
  const sePuede = dia >= hoy; // días pasados: solo mirar

  // Abre el formulario; si viene de un hueco libre, parte con ese horario (máx. 1 hora)
  function abrir(desde = "09:00", hasta?: string) {
    const fin = hasta && aMin(hasta) - aMin(desde) <= 60 ? hasta : HORAS[Math.min(HORAS.indexOf(desde) + 2, HORAS.length - 1)];
    setFormulario({ desde, hasta: fin });
    setDescripcion("");
  }
  function guardar() {
    if (!formulario || !descripcion.trim()) return;
    onReservar(formulario.desde, formulario.hasta, descripcion.trim());
    setFormulario(null);
  }

  return (
    <div className="mt-4 border-t border-black/10 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-marca">
          <Clock size={15} /> Agenda del
          {/* Elegir cualquier fecha (ej. la próxima semana); sábado o domingo saltan al lunes */}
          <input
            type="date"
            value={dia}
            onChange={(e) => e.target.value && onCambiarDia(esHabil(e.target.value) ? e.target.value : habil(e.target.value, 1))}
            aria-label="Fecha de la agenda"
            className="rounded-md border border-black/10 bg-white px-1.5 py-0.5 text-sm font-semibold text-marca"
          />
        </h4>
        <span className="text-right text-xs text-marca-gris">
          {reservas.length === 0 ? "Libre todo el día" : `${reservas.length} reserva${reservas.length > 1 ? "s" : ""} · ${duracion(minLibres)} libres`}
        </span>
      </div>

      {/* Franja 08:00–20:00: ámbar = reservado, verde = libre */}
      <div className="relative mt-2 h-6 overflow-hidden rounded bg-emerald-100" aria-hidden>
        {reservas.map((r) => (
          <div
            key={r.id}
            title={`${r.desde}–${r.hasta} · ${r.descripcion}`}
            className="absolute inset-y-0 border-x border-white bg-amber-400"
            style={{ left: `${((aMin(r.desde) - INICIO) / TOTAL) * 100}%`, width: `${((aMin(r.hasta) - aMin(r.desde)) / TOTAL) * 100}%` }}
          />
        ))}
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] text-marca-gris">
        {["08", "10", "12", "14", "16", "18", "20"].map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>

      {/* Lista del día: reservas y huecos libres en orden */}
      <ul className="mt-2 space-y-1">
        {tramos.map((t) =>
          t.reserva ? (
            <li key={`r${t.reserva.id}`} className="flex items-center gap-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-950">
              <span className="font-semibold tabular-nums">
                {t.desde}–{t.hasta}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{t.reserva.descripcion}</span>
                {t.reserva.creadoPor && <span className="block truncate text-[10px] text-amber-800/80">Reservó: {t.reserva.creadoPor}</span>}
              </span>
              {sePuede &&
                (borrando === t.reserva.id ? (
                  <span className="flex shrink-0 gap-1">
                    <button onClick={() => (onBorrar(t.reserva!), setBorrando(null))} className="rounded bg-rose-600 px-1.5 py-0.5 font-semibold text-white">
                      Borrar
                    </button>
                    <button onClick={() => setBorrando(null)} className="rounded border border-black/10 bg-white px-1.5 py-0.5">
                      No
                    </button>
                  </span>
                ) : (
                  <button onClick={() => setBorrando(t.reserva!.id)} aria-label={`Borrar reserva ${t.reserva.descripcion}`} className="shrink-0 text-amber-800 hover:text-rose-700">
                    <X size={14} />
                  </button>
                ))}
            </li>
          ) : (
            <li key={`l${t.desde}`}>
              <button
                onClick={() => sePuede && abrir(t.desde, t.hasta)}
                disabled={!sePuede}
                className="flex w-full items-center gap-2 rounded-md border border-dashed border-emerald-300 px-2 py-1.5 text-left text-xs text-emerald-800 enabled:hover:bg-emerald-50"
              >
                <span className="font-semibold tabular-nums">
                  {t.desde}–{t.hasta}
                </span>
                <span className="flex-1">Libre</span>
                {sePuede && <Plus size={14} className="shrink-0" />}
              </button>
            </li>
          ),
        )}
      </ul>

      {/* Formulario para reservar */}
      {sePuede &&
        (formulario ? (
          <div className="mt-3 space-y-2 rounded-lg border border-black/10 bg-black/[0.02] p-3">
            <div className="flex gap-2">
              <label className="flex-1 text-xs font-semibold text-marca">
                Desde
                <select
                  value={formulario.desde}
                  onChange={(e) => {
                    const desde = e.target.value;
                    setFormulario({ desde, hasta: formulario.hasta > desde ? formulario.hasta : HORAS[HORAS.indexOf(desde) + 1] });
                  }}
                  className="mt-1 w-full rounded-md border border-black/10 bg-white px-2 py-1.5 text-sm font-normal"
                >
                  {HORAS.slice(0, -1).map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </select>
              </label>
              <label className="flex-1 text-xs font-semibold text-marca">
                Hasta
                <select
                  value={formulario.hasta}
                  onChange={(e) => setFormulario({ ...formulario, hasta: e.target.value })}
                  className="mt-1 w-full rounded-md border border-black/10 bg-white px-2 py-1.5 text-sm font-normal"
                >
                  {HORAS.filter((h) => h > formulario.desde).map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-xs font-semibold text-marca">
              Nombre / descripción
              <input
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && guardar()}
                maxLength={120}
                placeholder="Ej. Cliente ACME – reunión"
                className="mt-1 w-full rounded-md border border-black/10 bg-white px-2 py-1.5 text-sm font-normal"
                autoFocus
              />
            </label>
            <div className="flex gap-2">
              <button onClick={() => setFormulario(null)} className="flex-1 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-marca">
                Cancelar
              </button>
              <button
                onClick={guardar}
                disabled={!descripcion.trim()}
                className="flex-1 rounded-md bg-marca px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                Reservar
              </button>
            </div>
          </div>
        ) : (
          libres.length > 0 && (
            <button
              onClick={() => abrir(libres[0].desde, libres[0].hasta)}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-marca hover:bg-marca/5"
            >
              <Plus size={15} /> Reservar horario
            </button>
          )
        ))}
    </div>
  );
}
