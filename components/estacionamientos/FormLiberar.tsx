// Formulario "Liberar" (dentro de la tarjeta): el dueño conserva su puesto, pero esos días queda libre.
// Cuándo: unas fechas (desde–hasta), sin fecha de término, o cada semana (un día fijo).
// Para quién: cualquiera (lo toma el primero) o una persona elegida por el admin.
import { useState } from "react";
// Con soloAsignar = true sirve para "Asignar por un periodo" (variables): solo fechas y persona.
import { esLarga, type Liberacion } from "./datosPrueba";

type Props = {
  hoy: string;
  personas: string[]; // quienes se pueden elegir (sin puesto fijo)
  soloAsignar?: boolean;
  paraDueno?: boolean; // "No voy" del dueño: solo "Unas fechas" o "Cada semana", siempre para cualquiera
  onGuardar: (l: Liberacion) => void;
  onCancelar: () => void;
};

const DIAS_HABILES = [
  [1, "Lunes"],
  [2, "Martes"],
  [3, "Miércoles"],
  [4, "Jueves"],
  [5, "Viernes"],
] as const;

export default function FormLiberar({ hoy, personas, soloAsignar = false, paraDueno = false, onGuardar, onCancelar }: Props) {
  const [forma, setForma] = useState<"fechas" | "sinFin" | "semanal">("fechas");
  const [para, setPara] = useState<"cualquiera" | "persona">(soloAsignar ? "persona" : "cualquiera");
  const [persona, setPersona] = useState("");
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [dia, setDia] = useState(5); // viernes
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [paraTodos, setParaTodos] = useState(false); // liberación larga que igual puede tomar cualquiera (no va a la rotación)
  // La casilla solo aplica a liberaciones largas "para cualquiera" que hace el admin
  const larga = forma === "sinFin" || (forma === "fechas" && esLarga({ desde, hasta }));
  const muestraParaTodos = !soloAsignar && !paraDueno && para === "cualquiera" && larga;

  function guardar() {
    if (!desde || desde < hoy) return setError("La fecha de inicio no puede ser anterior a hoy.");
    if (forma === "fechas" && (!hasta || hasta < desde)) return setError("La fecha de término debe ser igual o posterior al inicio.");
    if (para === "persona" && !persona) return setError(soloAsignar ? "Elige a quién se le asigna." : "Elige a qué persona se le libera.");
    onGuardar({
      desde,
      hasta: forma === "fechas" ? hasta : null,
      cadaDia: forma === "semanal" ? dia : undefined,
      motivo: motivo.trim() || undefined,
      para: para === "persona" ? persona : undefined,
      paraTodos: muestraParaTodos && paraTodos,
    });
  }

  // Botón de opción (se marca en azul el elegido)
  const boton = (activo: boolean, texto: string, alElegir: () => void) => (
    <button
      key={texto}
      onClick={() => {
        alElegir();
        setError("");
      }}
      className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-semibold ${
        activo ? "border-marca bg-marca text-white" : "border-black/10 text-marca hover:bg-marca/5"
      }`}
    >
      {texto}
    </button>
  );
  const opcion = (valor: typeof forma, texto: string) => boton(forma === valor, texto, () => setForma(valor));

  const campo = "w-full rounded-md border border-black/10 px-2 py-1.5 text-sm text-marca";

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-acento/40 bg-acento/5 p-3">
      <p className="text-sm font-semibold text-marca">{soloAsignar ? "Asignar por un periodo" : paraDueno ? "No voy" : "Liberar"}</p>
      <p className="text-xs text-marca-gris">
        {soloAsignar
          ? "Esa persona usa el puesto entre esas fechas (ideal: un mes entero)."
          : paraDueno
            ? "Esos días tu puesto queda libre para que otra persona lo tome. Puedes recuperarlo después."
            : "El dueño conserva su puesto; esos días lo usa otra persona."}
      </p>

      {!soloAsignar && (
        <>
          <p className="text-xs font-semibold text-marca">¿Cuándo?</p>
          <div className="flex gap-1.5">
            {opcion("fechas", "Unas fechas")}
            {!paraDueno && opcion("sinFin", "Sin fecha de término")}
            {opcion("semanal", "Cada semana")}
          </div>
        </>
      )}

      {forma === "semanal" ? (
        <label className="block text-xs text-marca">
          Todos los
          <select value={dia} onChange={(e) => setDia(Number(e.target.value))} className={`${campo} mt-1`}>
            {DIAS_HABILES.map(([n, nombre]) => (
              <option key={n} value={n}>{nombre}</option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="flex gap-2">
        <label className="block flex-1 text-xs text-marca">
          {forma === "semanal" ? "A partir del" : "Desde"}
          <input type="date" value={desde} min={hoy} onChange={(e) => setDesde(e.target.value)} className={`${campo} mt-1`} />
        </label>
        {forma === "fechas" && (
          <label className="block flex-1 text-xs text-marca">
            Hasta
            <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} className={`${campo} mt-1`} />
          </label>
        )}
      </div>

      {!paraDueno && <p className="text-xs font-semibold text-marca">{soloAsignar ? "¿A quién?" : "¿Para quién?"}</p>}
      {!soloAsignar && !paraDueno && (
        <div className="flex gap-1.5">
          {boton(para === "cualquiera", "Para cualquiera", () => setPara("cualquiera"))}
          {boton(para === "persona", "Para una persona", () => setPara("persona"))}
        </div>
      )}
      {para === "persona" && (
        <select value={persona} onChange={(e) => setPersona(e.target.value)} className={campo}>
          <option value="">Elegir persona…</option>
          {personas.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      )}

      {/* Liberación larga para cualquiera: por defecto va a la rotación (lista de espera) */}
      {muestraParaTodos && (
        <label className="flex items-start gap-2 rounded-md bg-amber-50 p-2 text-xs text-amber-950">
          <input type="checkbox" checked={paraTodos} onChange={(e) => setParaTodos(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#13a699]" />
          <span>
            Que cualquiera lo pueda tomar día a día (no va a la rotación).
            <span className="block text-amber-800">Si no lo marcas, queda reservado para la lista de espera.</span>
          </span>
        </label>
      )}

      <label className="block text-xs text-marca">
        Motivo (opcional)
        <input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="vacaciones, viaje, postnatal…"
          className={`${campo} mt-1`}
        />
      </label>

      {error && <p className="text-xs text-rose-600">{error}</p>}

      <div className="flex gap-2">
        <button onClick={onCancelar} className="flex-1 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-marca">
          Cancelar
        </button>
        <button onClick={guardar} className="flex-1 rounded-md bg-acento px-3 py-2 text-sm font-semibold text-white">
          {soloAsignar ? "Asignar" : paraDueno ? "Confirmar" : "Liberar"}
        </button>
      </div>
    </div>
  );
}
