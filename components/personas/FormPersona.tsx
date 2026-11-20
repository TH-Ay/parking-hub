// Ventana para agregar o editar una persona: nombre, correo (@thehouse.cl) y rol.
import { useState } from "react";
import type { Persona } from "./VistaPersonas";

export type DatosPersona = { nombre: string; correo: string; rol: Persona["rol"]; fijoId: number | null; variosPuestos: boolean };

type Props = {
  persona: Persona | null; // null = agregar nueva
  correosUsados: string[]; // para no repetir correos
  bloquearRol?: boolean; // tu propia ficha: no te puedes quitar el rol de admin
  fijoActual: number | null; // id del estacionamiento que hoy es su fijo
  opcionesFijo: { id: number; etiqueta: string }[]; // su puesto actual + los que no tienen dueño
  onCancelar: () => void;
  onGuardar: (datos: DatosPersona) => Promise<string>; // devuelve el error de Supabase, o "" si salió bien
};

export default function FormPersona(props: Props) {
  const { persona, correosUsados, bloquearRol = false, fijoActual, opcionesFijo, onCancelar, onGuardar } = props;
  const [nombre, setNombre] = useState(persona?.nombre ?? "");
  const [correo, setCorreo] = useState(persona?.correo ?? "");
  const [rol, setRol] = useState<Persona["rol"]>(persona?.rol ?? "usuario");
  const [fijoId, setFijoId] = useState<number | null>(fijoActual);
  const [variosPuestos, setVariosPuestos] = useState(persona?.variosPuestos ?? false);
  const cambiaFijo = fijoId !== fijoActual;
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    const n = nombre.trim();
    const c = correo.trim().toLowerCase();
    if (!n) return setError("Escribe el nombre.");
    if (!/^[^\s@]+@thehouse\.cl$/.test(c)) return setError("El correo debe terminar en @thehouse.cl.");
    if (correosUsados.includes(c)) return setError("Ya hay otra persona con ese correo.");
    setGuardando(true);
    setError(await onGuardar({ nombre: n, correo: c, rol, fijoId, variosPuestos }));
    setGuardando(false);
  }

  const campo = "mt-1 w-full rounded-md border border-black/10 px-2.5 py-2 text-sm text-marca";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancelar}>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-marca">{persona ? "Editar persona" : "Agregar persona"}</h2>

        <div className="mt-4 space-y-3">
          <label className="block text-xs font-semibold text-marca">
            Nombre
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre Apellido" className={campo} autoFocus />
          </label>
          <label className="block text-xs font-semibold text-marca">
            Correo
            <input value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="nombre@thehouse.cl" className={campo} />
          </label>
          <div className="text-xs font-semibold text-marca">
            Rol
            <div className="mt-1 flex rounded-md border border-black/10 p-0.5">
              {(
                [
                  ["usuario", "Usuario"],
                  ["recruiting", "Recruiting"],
                  ["admin", "Admin"],
                ] as const
              ).map(([valor, texto]) => (
                <button
                  key={valor}
                  onClick={() => setRol(valor)}
                  disabled={bloquearRol}
                  className={`flex-1 rounded px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed ${
                    rol === valor ? "bg-marca text-white" : "text-marca hover:bg-marca/5 disabled:opacity-40"
                  }`}
                >
                  {texto}
                </button>
              ))}
            </div>
            <p className="mt-1 font-normal text-marca-gris">
              {bloquearRol
                ? "No puedes cambiar tu propio rol (quedarías sin acceso al admin)."
                : rol === "admin"
                  ? "Puede gestionar puestos y personas."
                  : rol === "recruiting"
                    ? "Como usuario, y además ve los puestos Especiales en Estacionamientos."
                    : "Puede tomar, soltar y liberar su puesto."}
            </p>
          </div>

          {/* Varios puestos el mismo día (ej. "Clientes"): no aplica la regla de un puesto por día */}
          <label className="flex items-start gap-2 text-xs text-marca">
            <input type="checkbox" checked={variosPuestos} onChange={(e) => setVariosPuestos(e.target.checked)} className="mt-0.5" />
            <span>
              <span className="font-semibold">Puede tener varios puestos el mismo día</span>
              <span className="block text-marca-gris">Para cuentas como &quot;Clientes&quot;: el admin le presta varios puestos a la vez.</span>
            </span>
          </label>

          {/* Puesto fijo (máximo 1 por persona) */}
          <label className="block text-xs font-semibold text-marca">
            Puesto fijo
            <select
              value={fijoId ?? ""}
              onChange={(e) => setFijoId(e.target.value === "" ? null : Number(e.target.value))}
              className={campo}
            >
              <option value="">Sin puesto fijo</option>
              {opcionesFijo.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.etiqueta}
                </option>
              ))}
            </select>
            <span className="mt-1 block font-normal text-marca-gris">Solo aparecen los puestos sin dueño. Para quitarle el puesto a otra persona, usa Estacionamientos.</span>
          </label>
          {cambiaFijo && (
            <p className="rounded-md bg-amber-100 p-2 text-xs text-amber-950">
              Se borrará lo programado (liberaciones, asignaciones y reservas futuras) de{" "}
              {fijoActual !== null && fijoId !== null ? "ambos puestos" : "ese puesto"}.
              {fijoActual !== null && " El puesto anterior quedará variable, sin dueño."}
            </p>
          )}
        </div>

        {error && <p className="mt-3 rounded-md bg-rose-50 p-2 text-sm text-rose-700">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button onClick={onCancelar} className="flex-1 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-marca">
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={guardando}
            className="flex-1 rounded-md bg-acento px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {guardando ? "Guardando..." : persona ? "Guardar" : "Agregar"}
          </button>
        </div>
      </div>
    </div>
  );
}
