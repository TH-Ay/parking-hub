"use client";
// Recuadro plegable "Lista de espera" (columna derecha del plano, solo admin).
// Personas sin fijo, en orden: la primera recibe el próximo puesto libre para rotar (por un mes) y pasa al final.
// Aquí el admin agrega, quita, reordena (↑↓) y marca "saltar el próximo turno". Guarda en Supabase (tabla lista_espera).
// "Correr rotación" abre el editor (EditorRotacion): fecha, persona y fechas por puesto, editables antes de confirmar.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronDown, ListOrdered, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { mensajeError } from "@/lib/errores";
import EditorRotacion from "./EditorRotacion";

export type EnLista = { personaId: string; nombre: string; orden: number; saltar: boolean };

type Props = {
  lista: EnLista[];
  candidatos: { id: string; nombre: string }[]; // personas sin fijo que aún no están en la lista
  hoy: string;
  puestosParaRotarEn: (fecha: string) => { id: number; numero: string }[]; // puestos libres para rotar desde esa fecha
  ultimaVez: (nombre: string) => string | null; // ej. "nov 2026"
  onAviso: (texto: string) => void;
  abierto: boolean; // lo guarda el plano, así no se vuelve a plegar al actualizar la lista
  onAlternar: () => void;
};

export default function ListaEspera({ lista: listaBD, candidatos, hoy, puestosParaRotarEn, ultimaVez, onAviso, abierto, onAlternar }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [nuevo, setNuevo] = useState("");
  const [editando, setEditando] = useState(false); // editor de la rotación abierto
  // Copia local: los cambios (mover, saltar) se ven al instante mientras se guardan.
  // Cuando llegan los datos nuevos de Supabase, el plano vuelve a montar este recuadro (key) y se usa la lista real.
  const [lista, setLista] = useState(listaBD);

  // Ejecuta una o más escrituras; si alguna falla muestra el error; si no, recarga los datos
  async function guardar(...consultas: PromiseLike<{ error: { code?: string; message: string } | null }>[]) {
    for (const c of consultas) {
      const { error } = await c;
      if (error) return onAviso(mensajeError(error));
    }
    router.refresh();
  }

  const agregar = () => {
    if (!nuevo) return;
    const orden = Math.max(0, ...lista.map((l) => l.orden)) + 1; // al final
    guardar(supabase.from("lista_espera").insert({ persona_id: nuevo, orden }));
    setNuevo("");
  };
  const quitar = (l: EnLista) => guardar(supabase.from("lista_espera").delete().eq("persona_id", l.personaId));
  const alternarSaltar = (l: EnLista) => {
    setLista((ls) => ls.map((x) => (x.personaId === l.personaId ? { ...x, saltar: !x.saltar } : x))); // se ve al instante
    guardar(supabase.from("lista_espera").update({ saltar: !l.saltar }).eq("persona_id", l.personaId));
  };
  // Sube (-1) o baja (+1) a una persona y renumera TODA la lista (1, 2, 3…) para que nunca haya números repetidos
  const mover = async (i: number, dir: -1 | 1) => {
    if (!lista[i + dir]) return;
    const nueva = [...lista];
    [nueva[i], nueva[i + dir]] = [nueva[i + dir], nueva[i]];
    const renumerada = nueva.map((l, j) => ({ ...l, orden: j + 1 }));
    setLista(renumerada); // se ve al instante
    const cambios = renumerada.filter((l) => listaBD.find((x) => x.personaId === l.personaId)?.orden !== l.orden);
    const resultados = await Promise.all(
      cambios.map((l) => supabase.from("lista_espera").update({ orden: l.orden }).eq("persona_id", l.personaId)),
    );
    const fallo = resultados.find((r) => r.error);
    if (fallo) onAviso(mensajeError(fallo.error));
    router.refresh();
  };

  // Vista previa de hoy: a quién le tocarían los puestos libres para rotar (se saltan los marcados)
  const libresHoy = puestosParaRotarEn(hoy);
  const siguientes = lista.filter((l) => !l.saltar);
  const previa = libresHoy.map((p, i) => ({ numero: p.numero, nombre: siguientes[i]?.nombre ?? null }));

  return (
    <section className="rounded-xl border border-black/10 bg-white shadow-sm">
      {/* Encabezado: clic para plegar / desplegar */}
      <button onClick={onAlternar} className="flex w-full items-center justify-between gap-2 p-4 text-left">
        <span className="flex items-center gap-2 text-sm font-semibold text-marca">
          <ListOrdered size={16} className="text-acento" /> Lista de espera
          <span className="rounded bg-black/5 px-1.5 text-xs font-normal text-marca-gris">{lista.length}</span>
        </span>
        <ChevronDown size={16} className={`text-marca-gris transition ${abierto ? "rotate-180" : ""}`} />
      </button>

      {abierto && (
        <div className="space-y-4 border-t border-black/10 p-4">
          {/* Vista previa + editor de la rotación */}
          <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-950">
            {editando ? (
              <EditorRotacion
                hoy={hoy}
                lista={lista}
                puestosParaRotarEn={puestosParaRotarEn}
                onCancelar={() => setEditando(false)}
                onListo={(texto) => {
                  setEditando(false);
                  onAviso(texto);
                  router.refresh();
                }}
              />
            ) : (
              <>
                {libresHoy.length === 0 ? (
                  <p>Hoy no hay puestos libres para rotar (libres por al menos un mes).</p>
                ) : (
                  <>
                    <p className="font-semibold">Si la rotación corriera hoy:</p>
                    <ul className="mt-1 space-y-0.5">
                      {previa.map((p) => (
                        <li key={p.numero}>
                          <span className="font-mono font-bold">{p.numero}</span> → {p.nombre ?? "nadie en la lista (queda para cualquiera)"}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {/* Abre el editor: se puede elegir otra fecha (ej. el 1 del mes siguiente) aunque hoy no haya libres */}
                <button
                  onClick={() => setEditando(true)}
                  className="mt-2 w-full rounded-md bg-amber-400 px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-300"
                >
                  Elegir personas y fechas
                </button>
              </>
            )}
          </div>

          {/* La lista */}
          {lista.length === 0 ? (
            <p className="text-xs text-marca-gris">La lista está vacía. Agrega personas sin puesto fijo.</p>
          ) : (
            <ol className="space-y-1.5">
              {lista.map((l, i) => {
                const ultima = ultimaVez(l.nombre);
                return (
                  <li
                    key={l.personaId}
                    className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs ${
                      l.saltar ? "border-dashed border-black/15 bg-black/[0.02] text-marca-gris" : "border-black/10 text-marca"
                    }`}
                  >
                    <span className="w-5 shrink-0 text-center font-bold text-marca-gris">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{l.nombre}</p>
                      <p className="text-[11px] text-marca-gris">
                        {l.saltar ? "Se salta el próximo turno" : ultima ? `Última vez: ${ultima}` : "Aún no le ha tocado"}
                      </p>
                    </div>
                    <button onClick={() => mover(i, -1)} disabled={i === 0} className="rounded p-0.5 hover:bg-marca/5 disabled:opacity-25" title="Subir">
                      <ArrowUp size={13} />
                    </button>
                    <button
                      onClick={() => mover(i, 1)}
                      disabled={i === lista.length - 1}
                      className="rounded p-0.5 hover:bg-marca/5 disabled:opacity-25"
                      title="Bajar"
                    >
                      <ArrowDown size={13} />
                    </button>
                    <button
                      onClick={() => alternarSaltar(l)}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${l.saltar ? "bg-amber-200 text-amber-950" : "hover:bg-marca/5"}`}
                      title="Saltar su próximo turno (conserva su lugar)"
                    >
                      Saltar
                    </button>
                    <button onClick={() => quitar(l)} className="rounded p-0.5 text-marca-gris hover:text-rose-600" title="Quitar de la lista">
                      <X size={13} />
                    </button>
                  </li>
                );
              })}
            </ol>
          )}

          {/* Agregar al final */}
          <div className="flex gap-2">
            <select value={nuevo} onChange={(e) => setNuevo(e.target.value)} className="min-w-0 flex-1 rounded-md border border-black/10 px-2 py-1.5 text-xs text-marca">
              <option value="">Agregar persona sin fijo…</option>
              {candidatos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <button onClick={agregar} disabled={!nuevo} className="rounded-md bg-acento px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
              Agregar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
