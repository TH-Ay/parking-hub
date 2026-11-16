// Panel "Dueño" (dentro de la tarjeta): elegir nuevo dueño entre quienes no tienen fijo, o dejarlo sin asignar.
// Al confirmar se borra lo programado del puesto (opción A, acordada): se avisa antes qué se borrará.
import { useState } from "react";
import type { Programado } from "./datosPrueba";

type Props = {
  actual: string | null;
  disponibles: string[]; // personas sin puesto fijo
  programado: Programado[];
  onConfirmar: (nuevo: string | null) => void;
  onCancelar: () => void;
  pasarAFijo?: boolean; // true = el puesto es variable y pasará a fijo (también vale "Aún sin asignar")
};

export default function FormDueno({ actual, disponibles, programado, onConfirmar, onCancelar, pasarAFijo = false }: Props) {
  // undefined = aún no elige; null = "Aún sin asignar"
  const [elegido, setElegido] = useState<string | null | undefined>(undefined);
  const cambia = elegido !== undefined && (pasarAFijo || elegido !== actual);

  const fila = (valor: string | null, texto: string) => (
    <li key={texto}>
      <button
        onClick={() => setElegido(valor)}
        className={`w-full rounded-md px-3 py-1.5 text-left text-sm ${
          elegido === valor ? "bg-marca font-semibold text-white" : "text-marca hover:bg-marca/5"
        }`}
      >
        {texto}
      </button>
    </li>
  );

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-acento/40 bg-acento/5 p-3">
      <p className="text-sm font-semibold text-marca">{pasarAFijo ? "Pasar a fijo" : "Cambiar dueño"}</p>
      <p className="text-xs text-marca-gris">
        {pasarAFijo ? "Elige su dueño o déjalo sin asignar. " : ""}Solo aparecen personas que no tienen puesto fijo.
      </p>

      <ul className="max-h-60 space-y-0.5 overflow-y-auto rounded-md border border-black/10 bg-white p-1">
        {(actual || pasarAFijo) && fila(null, "Aún sin asignar")}
        {disponibles.map((n) => fila(n, n))}
      </ul>

      {cambia && programado.length > 0 && (
        <div className="rounded-md bg-amber-100 p-2 text-xs text-amber-950">
          Al confirmar se borrará lo programado de este puesto:
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
          onClick={() => cambia && onConfirmar(elegido ?? null)}
          disabled={!cambia}
          className="flex-1 rounded-md bg-acento px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Confirmar
        </button>
      </div>
    </div>
  );
}
