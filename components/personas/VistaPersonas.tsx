"use client";
// Vista PERSONAS (solo admin): lista del equipo con buscador y filtros; agregar, editar y dar de baja.
// Los datos llegan desde Supabase (app/(app)/personas/page.tsx). Al guardar, se escribe en Supabase
// y se vuelve a pedir la lista (router.refresh). El puesto fijo solo se muestra: se asigna en Estacionamientos.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Search, UserPlus, Users, UserX } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { mensajeError } from "@/lib/errores";
import FormPersona, { type DatosPersona } from "./FormPersona";

export type Persona = {
  id: string;
  nombre: string;
  correo: string;
  rol: "admin" | "usuario";
  entro: boolean; // ya inició sesión al menos una vez
  fijo: string | null; // número de su puesto fijo
  soyYo: boolean; // es quien está usando la app
};
type Filtro = "todas" | "conFijo" | "sinFijo" | "admins";
export type PuestoResumen = { id: number; numero: string; tipo: string; duenoId: string | null };

export default function VistaPersonas({ personas, puestos }: { personas: Persona[]; puestos: PuestoResumen[] }) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [editando, setEditando] = useState<Persona | "nueva" | null>(null);
  const [porDarDeBaja, setPorDarDeBaja] = useState<Persona | null>(null);
  const [errorBaja, setErrorBaja] = useState("");
  const [aviso, setAviso] = useState("");

  function mostrarAviso(texto: string) {
    setAviso(texto);
    setTimeout(() => setAviso(""), 3500);
  }

  // Puesto fijo actual de una persona (id del estacionamiento) y los que se le pueden asignar:
  // su puesto actual + los que no tienen dueño (variables o fijos sin dueño). Nunca los especiales.
  const fijoDe = (personaId: string | null) => puestos.find((e) => personaId && e.duenoId === personaId)?.id ?? null;
  const opcionesFijo = (personaId: string | null) =>
    puestos
      .filter((e) => (personaId && e.duenoId === personaId) || (e.tipo !== "especial" && e.duenoId === null))
      .map((e) => ({
        id: e.id,
        etiqueta:
          e.duenoId === personaId && personaId
            ? `${e.numero} · su puesto actual`
            : e.tipo === "variable"
              ? `${e.numero} · variable (pasará a fijo)`
              : `${e.numero} · fijo sin dueño`,
      }));

  // Agregar o editar en Supabase (y su puesto fijo). Devuelve el error (texto) o "" si salió bien.
  async function guardar(datos: DatosPersona): Promise<string> {
    const supabase = createClient();
    const campos = { email: datos.correo, nombre: datos.nombre, rol: datos.rol };
    let personaId: string;
    if (editando === "nueva") {
      const { data, error } = await supabase.from("personas").insert(campos).select("id").single();
      if (error) return mensajeError(error);
      personaId = data.id;
    } else {
      personaId = (editando as Persona).id;
      const { error } = await supabase.from("personas").update(campos).eq("id", personaId);
      if (error) return mensajeError(error);
    }

    // Puesto fijo: si cambió, el anterior queda variable sin dueño y el nuevo pasa a fijo de esta persona
    // (la base de datos borra lo programado de ambos puestos)
    const anterior = fijoDe(personaId);
    let errorPuesto = "";
    if (datos.fijoId !== anterior) {
      if (anterior !== null) {
        const { error } = await supabase.from("estacionamientos").update({ tipo: "variable", dueno_id: null }).eq("id", anterior);
        if (error) errorPuesto = mensajeError(error);
      }
      if (!errorPuesto && datos.fijoId !== null) {
        const { error } = await supabase.from("estacionamientos").update({ tipo: "fijo", dueno_id: personaId }).eq("id", datos.fijoId);
        if (error) errorPuesto = mensajeError(error);
      }
    }

    setEditando(null);
    router.refresh(); // vuelve a leer la lista desde Supabase
    if (errorPuesto) mostrarAviso(`Se guardó ${datos.nombre}, pero no su puesto fijo: ${errorPuesto}`);
    else mostrarAviso(editando === "nueva" ? `Agregaste a ${datos.nombre}. Ya puede entrar con su correo.` : `Guardaste los cambios de ${datos.nombre}.`);
    return "";
  }

  // Dar de baja: no se borra, se marca inactiva (la BD libera su fijo y cancela sus reservas futuras)
  async function darDeBaja(p: Persona) {
    const { error } = await createClient().from("personas").update({ activa: false }).eq("id", p.id);
    if (error) return setErrorBaja(mensajeError(error));
    setPorDarDeBaja(null);
    mostrarAviso(`Diste de baja a ${p.nombre}.`);
    router.refresh();
  }

  const q = busqueda.trim().toLowerCase();
  const visibles = personas
    .filter((p) => !q || p.nombre.toLowerCase().includes(q) || p.correo.includes(q))
    .filter((p) => (filtro === "conFijo" ? p.fijo : filtro === "sinFijo" ? !p.fijo : filtro === "admins" ? p.rol === "admin" : true))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const totalAdmins = personas.filter((p) => p.rol === "admin").length;
  const totalConFijo = personas.filter((p) => p.fijo).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-marca">
            <Users size={24} className="text-acento" /> Personas
          </h1>
          <p className="text-sm text-marca-gris">
            {personas.length} {personas.length === 1 ? "persona" : "personas"} · {totalAdmins} {totalAdmins === 1 ? "admin" : "admins"} ·{" "}
            {totalConFijo} con puesto fijo
          </p>
        </div>
        <button
          onClick={() => setEditando("nueva")}
          className="flex items-center gap-2 rounded-md bg-acento px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          <UserPlus size={16} /> Agregar persona
        </button>
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
        {/* Buscador y filtros */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-w-56 flex-1 items-center gap-2 rounded-md border border-black/10 px-2.5 py-1.5">
            <Search size={16} className="text-marca-gris" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o correo"
              className="w-full text-sm text-marca outline-none"
            />
          </label>
          <div className="flex rounded-md border border-black/10 p-0.5">
            {(
              [
                ["todas", "Todas"],
                ["conFijo", "Con fijo"],
                ["sinFijo", "Sin fijo"],
                ["admins", "Admins"],
              ] as const
            ).map(([valor, texto]) => (
              <button
                key={valor}
                onClick={() => setFiltro(valor)}
                className={`rounded px-3 py-1 text-xs font-semibold ${filtro === valor ? "bg-marca text-white" : "text-marca hover:bg-marca/5"}`}
              >
                {texto}
              </button>
            ))}
          </div>
        </div>

        {/* Tabla */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-xs text-marca-gris">
                <th className="py-2 pr-3 font-semibold">Nombre</th>
                <th className="py-2 pr-3 font-semibold">Correo</th>
                <th className="py-2 pr-3 font-semibold">Rol</th>
                <th className="py-2 pr-3 font-semibold">Puesto fijo</th>
                <th className="py-2 pr-3 font-semibold">Estado</th>
                <th className="py-2 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) => (
                <tr key={p.id} className="border-b border-black/5 hover:bg-marca/[0.02]">
                  <td className="py-2 pr-3 font-medium text-marca">
                    {p.nombre}
                    {p.soyYo && <span className="ml-2 text-xs font-normal text-acento">(tú)</span>}
                  </td>
                  <td className="py-2 pr-3 text-marca-gris">{p.correo}</td>
                  <td className="py-2 pr-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${p.rol === "admin" ? "bg-marca text-white" : "bg-black/5 text-marca"}`}>
                      {p.rol === "admin" ? "Admin" : "Usuario"}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    {p.fijo ? (
                      <Link
                        href="/estacionamientos"
                        title="Ver en Estacionamientos"
                        className="rounded bg-sky-100 px-2 py-0.5 font-mono text-xs font-bold text-sky-900 hover:bg-sky-200"
                      >
                        {p.fijo}
                      </Link>
                    ) : (
                      <span className="text-marca-gris">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-xs">
                    {p.entro ? <span className="text-emerald-700">✓ Activa</span> : <span className="text-amber-700">⏳ Aún no entra</span>}
                  </td>
                  <td className="whitespace-nowrap py-2 text-right">
                    <button onClick={() => setEditando(p)} className="rounded p-1.5 text-marca-gris hover:bg-marca/5 hover:text-marca" title="Editar">
                      <Pencil size={15} />
                    </button>
                    {/* No puedes darte de baja a ti misma (quedarías fuera de la app) */}
                    {!p.soyYo && (
                      <button
                        onClick={() => {
                          setErrorBaja("");
                          setPorDarDeBaja(p);
                        }}
                        className="rounded p-1.5 text-marca-gris hover:bg-rose-50 hover:text-rose-600"
                        title="Dar de baja"
                      >
                        <UserX size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibles.length === 0 && (
            <p className="py-8 text-center text-sm text-marca-gris">
              {personas.length === 0 ? "Aún no hay personas. Agrega la primera con el botón de arriba." : "No hay personas que coincidan."}
            </p>
          )}
        </div>
      </section>

      {/* Agregar / editar */}
      {editando && (
        <FormPersona
          persona={editando === "nueva" ? null : editando}
          bloquearRol={editando !== "nueva" && editando.soyYo} // no te quitas a ti misma el rol de admin
          correosUsados={personas.filter((p) => editando === "nueva" || p.id !== editando.id).map((p) => p.correo)}
          fijoActual={fijoDe(editando === "nueva" ? null : editando.id)}
          opcionesFijo={opcionesFijo(editando === "nueva" ? null : editando.id)}
          onCancelar={() => setEditando(null)}
          onGuardar={guardar}
        />
      )}

      {/* Dar de baja */}
      {porDarDeBaja && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPorDarDeBaja(null)}>
          <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-marca">¿Dar de baja a {porDarDeBaja.nombre}?</h2>
            <p className="mt-2 text-sm text-marca-gris">Ya no podrá entrar a la app. Se borrarán sus reservas futuras.</p>
            {porDarDeBaja.fijo && (
              <p className="mt-3 rounded-md bg-amber-100 p-2 text-sm text-amber-950">
                Es dueño/a del {porDarDeBaja.fijo}: el puesto quedará sin dueño.
              </p>
            )}
            {errorBaja && <p className="mt-3 rounded-md bg-rose-50 p-2 text-sm text-rose-700">{errorBaja}</p>}
            <div className="mt-5 flex gap-2">
              <button onClick={() => setPorDarDeBaja(null)} className="flex-1 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-marca">
                Cancelar
              </button>
              <button onClick={() => darDeBaja(porDarDeBaja)} className="flex-1 rounded-md bg-rose-600 px-3 py-2 text-sm font-semibold text-white">
                Dar de baja
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Aviso flotante */}
      {aviso && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-marca px-4 py-3 text-sm font-medium text-white shadow-lg">
          {aviso}
        </div>
      )}
    </div>
  );
}
