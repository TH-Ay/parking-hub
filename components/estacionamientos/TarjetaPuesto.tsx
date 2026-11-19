// Tarjeta del admin (a la derecha): datos del puesto elegido, sus acciones y lo programado.
// Acciones listas: Liberar. Las demás se programan una por una en los siguientes pasos.
import { useState } from "react";
import { ArrowLeftRight, CalendarOff, Lock, LockOpen, Pencil, Star, User, UserMinus, X, type LucideIcon } from "lucide-react";
import FormLiberar from "./FormLiberar";
import FormDueno from "./FormDueno";
import type { Asignacion, EstadoDelDia, Liberacion, Programado, Puesto } from "./datosPrueba";
import { fechaTexto, finDelTurno } from "./fechas";

type Tomado = NonNullable<Puesto["tomados"]>[number];

type Props = {
  puesto: Puesto;
  estado: EstadoDelDia;
  programado: Programado[];
  hoy: string;
  onLiberar: (l: Liberacion) => void;
  onQuitar: (clave: string) => void;
  disponibles: string[]; // personas sin puesto fijo (para elegir dueño)
  onCambiarDueno: (nuevo: string | null) => void;
  onPasarAVariable: () => void;
  onMarcarEspecial: (nombre: string) => void;
  onQuitarEspecial: () => void;
  onPasarAFijo: (dueno: string | null) => void;
  onAsignar: (a: Asignacion) => void;
  onDiaADia: (valor: boolean) => void;
  onQuitarTomado: (t: Tomado) => void;
  onParaTodos: (clave: string, valor: boolean) => void;
  listaEspera: string[]; // nombres en orden (sin quienes saltan el turno)
  onCambiarPersona: (clave: string, nueva: string, lugar: "primero" | "final" | null) => void;
  onRotacion: (clave: string, valor: boolean) => void;
  esperandoRotacion: boolean; // hoy está libre esperando la lista de espera
  siguienteEn: (desde: string, hasta: string) => string | null; // a quién le tocaría entre esas fechas
  onDarSiguiente: (desde: string, hasta: string) => void;
};

export default function TarjetaPuesto(props: Props) {
  const { puesto, estado, programado, hoy: fechaHoy, onLiberar, onQuitar, disponibles, onCambiarDueno, onPasarAVariable, onMarcarEspecial, onQuitarEspecial, onPasarAFijo, onAsignar, onDiaADia, onQuitarTomado, onParaTodos, listaEspera, onCambiarPersona, onRotacion, esperandoRotacion, siguienteEn, onDarSiguiente } =
    props;
  // Fechas al "Dar a la siguiente de la lista" (por defecto desde hoy hasta el fin del turno del mes; se pueden editar)
  const [desdeRot, setDesdeRot] = useState(fechaHoy);
  const [hastaRot, setHastaRot] = useState(finDelTurno(fechaHoy));
  const fechasOk = desdeRot >= fechaHoy && hastaRot >= desdeRot;
  const siguiente = fechasOk ? siguienteEn(desdeRot, hastaRot) : null;
  const [cambiando, setCambiando] = useState<string | null>(null); // clave del préstamo al que se le cambia la persona
  const [nombreEspecial, setNombreEspecial] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null); // acción con su formulario abierto
  const [porQuitar, setPorQuitar] = useState<number | null>(null); // id de la reserva que se está confirmando quitar
  // "Tomado por": días que alguien tomó este puesto, desde hoy en adelante
  const tomados = (puesto.tomados ?? []).filter((t) => t.fecha >= fechaHoy).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const diaTexto = (f: string) => fechaTexto(f, { weekday: "short", day: "numeric", month: "short" });
  const tipo = puesto.tipo === "fijo" ? "Fijo" : puesto.tipo === "variable" ? "Variable" : "Especial";
  const hoy =
    estado.zona === "libres" ? "Libre" : estado.zona === "tomados" ? `Prestado a ${estado.quien}` : (estado.quien ?? "Sin dueño aún");

  const acciones: [LucideIcon, string][] =
    puesto.tipo === "fijo"
      ? puesto.dueno
        ? [
            [User, `Dueño: ${puesto.dueno}`],
            [UserMinus, "Quitar dueño"],
            [CalendarOff, "Liberar"], // incluye "para una persona" (rotación)
          ]
        : [
            // Fijo aún sin dueño: no hay nada que liberar
            [User, "Dueño: aún sin asignar"],
            [UserMinus, "Pasar a variable"],
            [ArrowLeftRight, "Asignar por un periodo"],
          ]
      : puesto.tipo === "variable"
        ? [
            [Lock, "Pasar a fijo"],
            [ArrowLeftRight, "Asignar por un periodo"],
            [Star, "Marcar como especial (visitas, etc.)"],
          ]
        : [[LockOpen, "Quitar marca especial"]];

  return (
    <aside className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-marca">Estacionamiento {puesto.numero}</h3>
      <p className="text-xs text-marca-gris">
        Subterráneo {puesto.piso} · {tipo}
        {puesto.dueno ? ` · dueño: ${puesto.dueno}` : ""}
      </p>
      <p className="mt-0.5 text-xs text-marca-gris">Hoy: {hoy}</p>

      <div className="mt-4 space-y-2">
        {acciones.map(([Icono, texto]) => (
          <button
            key={texto}
            onClick={() =>
              setAbierto(
                texto === "Liberar" ? "Liberar"
                : texto.startsWith("Dueño") ? "Dueño"
                : texto === "Quitar dueño" || texto === "Pasar a variable" ? "Variable"
                : texto.startsWith("Marcar como especial") ? "Especial"
                : texto === "Pasar a fijo" ? "Fijo"
                : texto === "Asignar por un periodo" ? "Asignar"
                : texto === "Quitar marca especial" ? "QuitarEspecial"
                : null,
              )
            }
            className="flex w-full items-center gap-2 rounded-md border border-black/10 px-3 py-2 text-left text-sm text-marca hover:bg-marca/5"
          >
            <Icono size={16} className="shrink-0 text-marca-gris" />
            <span className="truncate">{texto}</span>
          </button>
        ))}
      </div>

      {/* Solo variables: interruptor permanente "día a día" (si está apagado, el puesto es para la rotación) */}
      {puesto.tipo === "variable" && (
        <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-md border border-black/10 px-3 py-2 text-sm text-marca">
          <input
            type="checkbox"
            checked={!!puesto.diaADia}
            onChange={(e) => onDiaADia(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-acento"
          />
          <span>
            Que cualquiera lo pueda tomar día a día
            <span className="block text-xs text-marca-gris">
              {puesto.diaADia ? "Aparece en Disponibilidad. Apágalo para dejarlo para la rotación." : "Apagado: queda reservado para la rotación."}
            </span>
          </span>
        </label>
      )}

      {abierto === "Liberar" && (
        <FormLiberar
          hoy={fechaHoy}
          personas={disponibles}
          onCancelar={() => setAbierto(null)}
          onGuardar={(l) => {
            onLiberar(l);
            setAbierto(null);
          }}
        />
      )}

      {abierto === "Dueño" && (
        <FormDueno
          actual={puesto.dueno}
          disponibles={disponibles}
          programado={programado}
          onCancelar={() => setAbierto(null)}
          onConfirmar={(nuevo) => {
            onCambiarDueno(nuevo);
            setAbierto(null);
          }}
        />
      )}

      {/* "Asignar por un periodo": fechas desde–hasta y una persona sin fijo */}
      {abierto === "Asignar" && (
        <FormLiberar
          soloAsignar
          hoy={fechaHoy}
          personas={disponibles}
          onCancelar={() => setAbierto(null)}
          onGuardar={(l) => {
            onAsignar({ desde: l.desde, hasta: l.hasta!, persona: l.para!, rotacion: l.rotacion });
            setAbierto(null);
          }}
        />
      )}

      {/* "Pasar a fijo" (variables): elegir dueño o "Aún sin asignar"; se borra lo programado */}
      {abierto === "Fijo" && (
        <FormDueno
          pasarAFijo
          actual={null}
          disponibles={disponibles}
          programado={programado}
          onCancelar={() => setAbierto(null)}
          onConfirmar={(dueno) => {
            onPasarAFijo(dueno);
            setAbierto(null);
          }}
        />
      )}

      {/* "Quitar dueño" / "Pasar a variable": el puesto queda variable y se borra lo programado */}
      {abierto === "Variable" && (
        <Confirmacion
          titulo={puesto.dueno ? "Quitar dueño" : "Pasar a variable"}
          texto={`El ${puesto.numero} pasará a ser variable${puesto.dueno ? ` y ${puesto.dueno} quedará sin puesto fijo` : ""}.`}
          programado={programado}
          onCancelar={() => setAbierto(null)}
          onConfirmar={() => {
            onPasarAVariable();
            setAbierto(null);
          }}
        />
      )}

      {/* "Marcar como especial": se escribe el uso (ej. Visitas); no rota ni se puede tomar */}
      {abierto === "Especial" && (
        <Confirmacion
          titulo="Marcar como especial"
          texto={`El ${puesto.numero} no entrará en la rotación y nadie lo podrá tomar.`}
          programado={programado}
          puedeConfirmar={nombreEspecial.trim() !== ""}
          onCancelar={() => setAbierto(null)}
          onConfirmar={() => {
            onMarcarEspecial(nombreEspecial.trim());
            setAbierto(null);
          }}
        >
          <label className="block text-xs text-marca">
            ¿Para qué es?
            <input
              value={nombreEspecial}
              onChange={(e) => setNombreEspecial(e.target.value)}
              placeholder="Visitas, Gerencia, Bicicletas…"
              className="mt-1 w-full rounded-md border border-black/10 px-2 py-1.5 text-sm text-marca"
            />
          </label>
        </Confirmacion>
      )}

      {/* "Quitar marca especial": vuelve a ser variable */}
      {abierto === "QuitarEspecial" && (
        <Confirmacion
          titulo="Quitar marca especial"
          texto={`El ${puesto.numero} dejará de ser "${puesto.especial}" y pasará a ser variable.`}
          programado={programado}
          onCancelar={() => setAbierto(null)}
          onConfirmar={() => {
            onQuitarEspecial();
            setAbierto(null);
          }}
        />
      )}

      {/* Libre esperando la rotación: se le da a la siguiente de la lista por un mes */}
      {esperandoRotacion && (
        <div className="mt-4 space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
          <p className="font-semibold">Esperando rotación</p>
          {/* Fechas editables: al cambiar "Desde", "Hasta" se ajusta solo al fin de ese turno */}
          <div className="space-y-2">
            <label className="block flex-1">
              Desde
              <input
                type="date"
                value={desdeRot}
                min={fechaHoy}
                onChange={(e) => {
                  setDesdeRot(e.target.value);
                  if (e.target.value) setHastaRot(finDelTurno(e.target.value));
                }}
                className="mt-1 block w-full min-w-0 rounded-md border border-black/10 bg-white px-2 py-1.5 text-sm text-marca"
              />
            </label>
            <label className="block flex-1">
              Hasta
              <input
                type="date"
                value={hastaRot}
                min={desdeRot}
                onChange={(e) => setHastaRot(e.target.value)}
                className="mt-1 block w-full min-w-0 rounded-md border border-black/10 bg-white px-2 py-1.5 text-sm text-marca"
              />
            </label>
          </div>
          {!fechasOk ? (
            <p className="text-rose-700">Revisa las fechas: no pueden ser pasadas y &quot;Hasta&quot; va después de &quot;Desde&quot;.</p>
          ) : siguiente ? (
            <>
              <p>
                Le toca a <b>{siguiente}</b>: {diaTexto(desdeRot)} – {diaTexto(hastaRot)}. Pasará al final de la lista.
              </p>
              <button onClick={() => onDarSiguiente(desdeRot, hastaRot)} className="w-full rounded-md bg-acento px-3 py-2 text-sm font-semibold text-white">
                Dar a la siguiente de la lista
              </button>
            </>
          ) : (
            <p>No hay nadie disponible en la lista de espera para esas fechas.</p>
          )}
        </div>
      )}

      <h4 className="mt-5 text-sm font-semibold text-marca">Programado</h4>
      {programado.length === 0 ? (
        <p className="mt-1 text-xs text-marca-gris">Nada programado</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {programado.map((p) => (
            <li key={p.clave} className="rounded-md border border-black/10 px-3 py-1.5 text-xs text-marca">
              <div className="flex items-center justify-between gap-2">
              <span>
                {p.texto}
                {/* Liberación larga: para todos (por defecto) o para la rotación; un clic lo cambia */}
                {p.paraTodos !== undefined && (
                  <button
                    onClick={() => onParaTodos(p.clave, !p.paraTodos)}
                    title={p.paraTodos ? "Clic para dejarlo para la rotación" : "Clic para dejarlo para todos"}
                    className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${p.paraTodos ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}
                  >
                    {p.paraTodos ? "Para todos" : "Para rotación"}
                  </button>
                )}
                {/* Préstamo a una persona: Préstamo o Rotación (cuenta para la lista de espera); un clic lo cambia */}
                {p.persona && (
                  <button
                    onClick={() => onRotacion(p.clave, !p.rotacion)}
                    title={p.rotacion ? "Clic para dejarlo como préstamo" : "Clic para marcarlo como rotación"}
                    className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${p.rotacion ? "bg-amber-100 text-amber-900" : "bg-violet-100 text-violet-900"}`}
                  >
                    {p.rotacion ? "Rotación" : "Préstamo"}
                  </button>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {p.persona && (
                  <button
                    onClick={() => setCambiando(cambiando === p.clave ? null : p.clave)}
                    className="text-marca-gris hover:text-acento"
                    aria-label="Cambiar persona"
                    title="Cambiar persona"
                  >
                    <Pencil size={13} />
                  </button>
                )}
                <button onClick={() => onQuitar(p.clave)} className="text-marca-gris hover:text-rose-600" aria-label="Cancelar">
                  <X size={14} />
                </button>
              </span>
              </div>
              {cambiando === p.clave && p.persona && (
                <FormCambiarPersona
                  actual={p.persona}
                  rotacion={!!p.rotacion}
                  personas={disponibles.filter((n) => n !== p.persona)}
                  siguiente={listaEspera.find((n) => n !== p.persona) ?? null}
                  onCancelar={() => setCambiando(null)}
                  onConfirmar={(nueva, lugar) => {
                    onCambiarPersona(p.clave, nueva, lugar);
                    setCambiando(null);
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {/* "Tomado día a día": quién tomó el puesto desde Disponibilidad y qué días; la ✕ se lo quita (pide confirmar; la persona recibe aviso) */}
      <h4 className="mt-5 text-sm font-semibold text-marca">Tomado día a día</h4>
      {tomados.length === 0 ? (
        <p className="mt-1 text-xs text-marca-gris">Nadie lo ha tomado</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {tomados.map((t) => (
            <li key={t.id ?? t.fecha} className="rounded-md border border-black/10 px-3 py-1.5 text-xs text-marca">
              <div className="flex items-center justify-between gap-2">
                <span>
                  {diaTexto(t.fecha)} · {t.persona}
                </span>
                <button onClick={() => setPorQuitar(t.id ?? null)} className="shrink-0 text-marca-gris hover:text-rose-600" aria-label="Quitar">
                  <X size={14} />
                </button>
              </div>
              {porQuitar !== null && porQuitar === t.id && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-marca">
                    ¿Quitarle el {puesto.numero} del {diaTexto(t.fecha)} a {t.persona}?
                  </span>
                  <button
                    onClick={() => {
                      onQuitarTomado(t);
                      setPorQuitar(null);
                    }}
                    className="rounded bg-rose-600 px-2 py-0.5 font-medium text-white hover:bg-rose-700"
                  >
                    Sí, quitar
                  </button>
                  <button onClick={() => setPorQuitar(null)} className="rounded border border-black/10 px-2 py-0.5 hover:bg-marca/5">
                    No
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

// "Cambiar persona" de un préstamo o rotación: otra persona o la siguiente de la lista de espera.
// En rotaciones se elige además qué pasa con quien lo deja: vuelve al primer lugar o pasa al final.
function FormCambiarPersona(props: {
  actual: string;
  rotacion: boolean;
  personas: string[];
  siguiente: string | null;
  onCancelar: () => void;
  onConfirmar: (nueva: string, lugar: "primero" | "final" | null) => void;
}) {
  const { actual, rotacion, personas, siguiente, onCancelar, onConfirmar } = props;
  const [modo, setModo] = useState<"lista" | "otra">(siguiente ? "lista" : "otra");
  const [otra, setOtra] = useState("");
  const [lugar, setLugar] = useState<"primero" | "final">("primero");
  const nueva = modo === "lista" ? siguiente : otra;
  const opcion = (activo: boolean, texto: string, alElegir: () => void) => (
    <button
      onClick={alElegir}
      className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-semibold ${activo ? "border-marca bg-marca text-white" : "border-black/10 text-marca hover:bg-marca/5"}`}
    >
      {texto}
    </button>
  );
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-acento/40 bg-acento/5 p-3">
      <p className="text-sm font-semibold text-marca">Cambiar a {actual} por…</p>
      <div className="flex gap-1.5">
        {siguiente && opcion(modo === "lista", `Siguiente de la lista: ${siguiente}`, () => setModo("lista"))}
        {opcion(modo === "otra", "Otra persona", () => setModo("otra"))}
      </div>
      {modo === "otra" && (
        <select value={otra} onChange={(e) => setOtra(e.target.value)} className="w-full rounded-md border border-black/10 px-2 py-1.5 text-sm text-marca">
          <option value="">Elige a quién…</option>
          {personas.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      )}
      {rotacion && (
        <>
          <p className="text-xs font-semibold text-marca">¿Y {actual} en la lista de espera?</p>
          <div className="flex gap-1.5">
            {opcion(lugar === "primero", "Vuelve al primer lugar", () => setLugar("primero"))}
            {opcion(lugar === "final", "Pasa al final", () => setLugar("final"))}
          </div>
        </>
      )}
      <p className="text-xs text-marca-gris">
        Si ya empezó, {actual} lo usa hasta ayer y la nueva persona desde hoy hasta el mismo fin. A ambos les llega un aviso.
      </p>
      <div className="flex gap-2">
        <button onClick={onCancelar} className="flex-1 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-marca">
          Cancelar
        </button>
        <button
          onClick={() => nueva && onConfirmar(nueva, rotacion ? lugar : null)}
          disabled={!nueva}
          className="flex-1 rounded-md bg-acento px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Confirmar
        </button>
      </div>
    </div>
  );
}

// Recuadro de confirmación: título, explicación, aviso de lo que se borrará y botones.
function Confirmacion(props: {
  titulo: string;
  texto: string;
  programado: Programado[];
  puedeConfirmar?: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
  children?: React.ReactNode;
}) {
  const { titulo, texto, programado, puedeConfirmar = true, onCancelar, onConfirmar, children } = props;
  return (
    <div className="mt-4 space-y-3 rounded-lg border border-acento/40 bg-acento/5 p-3">
      <p className="text-sm font-semibold text-marca">{titulo}</p>
      <p className="text-xs text-marca-gris">{texto}</p>
      {children}
      {programado.length > 0 && (
        <div className="rounded-md bg-amber-100 p-2 text-xs text-amber-950">
          Se borrará lo programado:
          <ul className="mt-1 list-disc pl-4">
            {programado.map((p) => (
              <li key={p.clave}>{p.texto}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={onCancelar} className="flex-1 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-marca">
          Cancelar
        </button>
        <button
          onClick={() => puedeConfirmar && onConfirmar()}
          disabled={!puedeConfirmar}
          className="flex-1 rounded-md bg-acento px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Confirmar
        </button>
      </div>
    </div>
  );
}
