"use client";
// Editor de la rotación (dentro del recuadro "Lista de espera"): el admin elige desde qué fecha,
// y para cada puesto libre para rotar puede cambiar la persona (o "nadie") y las fechas antes de confirmar.
// Al confirmar llama a asignar_rotacion en Supabase (choques, avisos y mover al final de la lista los hace la BD).
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { mensajeError } from "@/lib/errores";
import { finDelTurno, turnoSiguiente } from "./fechas";
import type { EnLista } from "./ListaEspera";

type Fila = { estId: number; numero: string; personaId: string; desde: string; hasta: string };

type Props = {
  hoy: string;
  lista: EnLista[];
  puestosParaRotarEn: (fecha: string) => { id: number; numero: string }[];
  onCancelar: () => void;
  onListo: (texto: string, ok: boolean) => void;
};

// Propuesta por defecto para una fecha: cada puesto libre → el siguiente de la lista (sin los que se saltan), hasta el fin del turno
function propuesta(fecha: string, lista: EnLista[], puestos: { id: number; numero: string }[]): Fila[] {
  const siguientes = lista.filter((l) => !l.saltar);
  const hasta = finDelTurno(fecha);
  return puestos.map((p, i) => ({ estId: p.id, numero: p.numero, personaId: siguientes[i]?.personaId ?? "", desde: fecha, hasta }));
}

export default function EditorRotacion({ hoy, lista, puestosParaRotarEn, onCancelar, onListo }: Props) {
  // Por defecto: el próximo turno mensual (ej. lun 30 nov → vie 1 ene)
  const [fecha, setFecha] = useState(() => turnoSiguiente(hoy).desde);
  const [filas, setFilas] = useState<Fila[]>(() => propuesta(fecha, lista, puestosParaRotarEn(fecha)));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  // Al cambiar "Desde", se vuelve a armar la propuesta para esa fecha
  function cambiarFecha(f: string) {
    if (!f || f < hoy) return;
    setFecha(f);
    setFilas(propuesta(f, lista, puestosParaRotarEn(f)));
    setError("");
  }
  const editar = (i: number, cambios: Partial<Fila>) => setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, ...cambios } : f)));

  async function confirmar() {
    const elegidas = filas.filter((f) => f.personaId);
    const repetidas = elegidas.filter((f, i) => elegidas.findIndex((g) => g.personaId === f.personaId) !== i);
    if (elegidas.length === 0) return setError("Elige al menos una persona.");
    if (repetidas.length) return setError("Una persona no puede recibir dos puestos.");
    if (elegidas.some((f) => f.desde < hoy || f.hasta < f.desde)) return setError("Revisa las fechas (no pueden ser pasadas y 'hasta' va después de 'desde').");
    setGuardando(true);
    const { data, error } = await createClient().rpc("asignar_rotacion", {
      p_items: elegidas.map((f) => ({ estacionamiento_id: f.estId, persona_id: f.personaId, desde: f.desde, hasta: f.hasta })),
    });
    setGuardando(false);
    if (error) return setError(mensajeError(error));
    onListo(String(data), true);
  }

  const campo = "w-full rounded border border-amber-300 bg-white px-1 py-1 text-[11px] text-marca";

  return (
    <div className="mt-2 space-y-2">
      {/* Fechas generales: "Desde" rearma la propuesta; "Hasta" cambia todas las filas de una vez */}
      <div className="flex flex-wrap items-center gap-2 font-semibold">
        <label className="flex items-center gap-1">
          Desde
          <input type="date" value={fecha} min={hoy} onChange={(e) => cambiarFecha(e.target.value)} className={`${campo} w-auto`} />
        </label>
        <label className="flex items-center gap-1">
          Hasta
          <input
            type="date"
            value={filas[0]?.hasta ?? finDelTurno(fecha)}
            min={fecha}
            onChange={(e) => e.target.value && setFilas((fs) => fs.map((f) => ({ ...f, hasta: e.target.value })))}
            className={`${campo} w-auto`}
          />
        </label>
      </div>

      {filas.length === 0 ? (
        <p>No hay puestos libres para rotar desde esa fecha (libres por al menos un mes).</p>
      ) : (
        <div className="space-y-2">
          {filas.map((f, i) => (
            <div key={f.estId} className="space-y-1 rounded-md bg-white/70 p-2">
              <div className="flex items-center gap-2">
                <span className="w-9 shrink-0 font-mono font-bold">{f.numero}</span>
                <select value={f.personaId} onChange={(e) => editar(i, { personaId: e.target.value })} className={campo}>
                  <option value="">Nadie (queda fuera)</option>
                  {lista.map((l) => (
                    <option key={l.personaId} value={l.personaId}>
                      {l.nombre}
                    </option>
                  ))}
                </select>
              </div>
              {/* Fechas de este puesto, una debajo de la otra para que quepan en la columna */}
              <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1">
                <span>Desde</span>
                <input type="date" value={f.desde} min={hoy} onChange={(e) => editar(i, { desde: e.target.value })} className={`${campo} min-w-0`} />
                <span>Hasta</span>
                <input type="date" value={f.hasta} min={f.desde} onChange={(e) => editar(i, { hasta: e.target.value })} className={`${campo} min-w-0`} />
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px]">Quienes reciban puesto pasan al final de la lista. Si alguien tenía días tomados que chocan, se le cancelan con aviso.</p>
      {error && <p className="rounded bg-rose-50 p-2 text-rose-700">{error}</p>}

      <div className="flex gap-2">
        <button onClick={onCancelar} className="flex-1 rounded-md border border-amber-300 bg-white px-2 py-1.5 font-semibold">
          Cancelar
        </button>
        <button
          onClick={confirmar}
          disabled={guardando || filas.length === 0}
          className="flex-1 rounded-md bg-amber-500 px-2 py-1.5 font-semibold text-white disabled:opacity-50"
        >
          {guardando ? "Asignando..." : "Confirmar"}
        </button>
      </div>
    </div>
  );
}
