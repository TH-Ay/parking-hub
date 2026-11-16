"use client";
// Vista del USUARIO (Disponibilidad): 2/3 izquierda = calendario de disponibles; 1/3 derecha = "Lo tuyo".
// Los datos vienen de Supabase (app/(app)/disponibilidad/page.tsx). Tomar, soltar, "No voy" y recuperar
// escriben en Supabase (las reglas las revisa la base de datos) y luego se vuelve a pedir todo (router.refresh).
import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Car, X } from "lucide-react";
import ModalTomar from "./ModalTomar";
import PanelDueno, { type Afectado } from "./PanelDueno";
import CalendarioDisponibles, { type Libre, type Propio } from "./CalendarioDisponibles";
import AutoCenital from "@/components/estacionamientos/AutoCenital";
import { ASFALTO } from "@/components/estacionamientos/asfalto";
import { esDeRotacion, estadoEn, liberadoEn, type Liberacion, type Puesto } from "@/components/estacionamientos/datosPrueba";
import { fechaTexto, hoyEnChile, sumarDias } from "@/components/estacionamientos/fechas";
import { createClient } from "@/lib/supabase/client";
import { mensajeError } from "@/lib/errores";

const sinSuscripcion = () => () => {};

// Un puesto tuyo dibujado como cajón sobre asfalto, con tu auto (color acento) estacionado.
// Sin número = cajón vacío ("No tienes nada tomado"). Si son varios días seguidos, van juntos en un cajón.
function CajonTuyo({ numero, fechas = [], onSoltar }: { numero?: string; fechas?: string[]; onSoltar?: () => void }) {
  // 1 día: "martes, 17 de noviembre"; varios: "martes 17 y miércoles 18 de noviembre"
  const cuando =
    fechas.length === 1
      ? fechaTexto(fechas[0], { weekday: "long", day: "numeric", month: "long" })
      : fechas.map((f) => fechaTexto(f, { weekday: "long", day: "numeric" }).replace(",", "")).join(" y ");
  return (
    // @container: si el panel es angosto, el texto pasa debajo del cajón
    <li className="@container overflow-hidden rounded-xl p-3 shadow-inner" style={ASFALTO}>
      <div className="flex flex-col items-center gap-3 text-center @[15rem]:flex-row @[15rem]:items-stretch @[15rem]:text-left">
      {/* Cajón con líneas blancas */}
      <div className="flex w-20 shrink-0 flex-col items-center justify-between border-x-2 border-t-2 border-white/70 px-1 pb-1 pt-2">
        {numero ? (
          <AutoCenital color="#13a699" className="h-14" />
        ) : (
          <div className="h-14 w-7 rounded-lg border-2 border-dashed border-white/40" />
        )}
        <span className="font-mono text-lg font-black tracking-wider text-white/90">{numero ?? "—"}</span>
      </div>
      {/* Texto */}
      <div className="flex min-w-0 flex-col justify-center">
        {numero ? (
          <>
            <p className="text-sm font-semibold text-white">Tienes tomado el {numero}</p>
            <p className="text-xs text-white/70">{cuando}</p>
            <button
              onClick={onSoltar}
              className="mt-2 self-center rounded-md border border-white/40 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/10 @[15rem]:self-start"
            >
              Soltar
            </button>
          </>
        ) : (
          <p className="text-sm text-white/70">No tienes nada tomado.</p>
        )}
      </div>
      </div>
    </li>
  );
}

// Un puesto que me toca por rotación (o asignación): cajón con auto ámbar, el color de "Rotación" en el plano
function CajonRotacion({ numero, desde, hasta, hoy }: { numero: string; desde: string; hasta: string | null; hoy: string }) {
  const largo = (f: string) => fechaTexto(f, { weekday: "long", day: "numeric", month: "long" });
  const enCurso = desde <= hoy;
  return (
    <li className="@container overflow-hidden rounded-xl p-3 shadow-inner" style={ASFALTO}>
      <div className="flex flex-col items-center gap-3 text-center @[15rem]:flex-row @[15rem]:items-stretch @[15rem]:text-left">
        <div className="flex w-20 shrink-0 flex-col items-center justify-between border-x-2 border-t-2 border-white/70 px-1 pb-1 pt-2">
          <AutoCenital color="#ef9f27" className="h-14" />
          <span className="font-mono text-lg font-black tracking-wider text-white/90">{numero}</span>
        </div>
        <div className="flex min-w-0 flex-col justify-center">
          <span
            className={`mb-1 self-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider @[15rem]:self-start ${
              enCurso ? "bg-amber-400 text-amber-950" : "bg-white/15 text-white"
            }`}
          >
            {enCurso ? "En curso" : "Próximamente"}
          </span>
          <p className="text-sm font-semibold text-white">Te toca el {numero} por rotación</p>
          <p className="text-xs text-white/70">{hasta ? `Del ${largo(desde)} al ${largo(hasta)}` : `Desde el ${largo(desde)}`}</p>
        </div>
      </div>
    </li>
  );
}

export type Reserva = { id: number; numero: string; fecha: string; persona: string; mia: boolean };
export type Aviso = { id: number; texto: string };

type Props = {
  puestos: Puesto[];
  reservas: Reserva[]; // todas las reservas desde hoy (mías y de otros)
  avisos: Aviso[]; // mis avisos sin leer (ej. "Al final sí voy")
  yo: { id: string; nombre: string };
  miFijo: string | null; // número de mi puesto fijo, si tengo
};

export default function VistaDisponibilidad(props: Props) {
  // "Hoy" se calcula solo en el navegador, para que Next no lo congele al pre-armar la página
  const hoy = useSyncExternalStore(sinSuscripcion, hoyEnChile, () => null);
  if (!hoy) return <p className="text-marca-gris">Cargando disponibilidad...</p>;
  return <Vista hoy={hoy} {...props} />;
}

function Vista({ hoy, puestos, reservas, avisos, yo, miFijo }: Props & { hoy: string }) {
  const router = useRouter();
  const supabase = createClient();
  const misTomados = reservas.filter((r) => r.mia && r.fecha >= hoy);
  const fijo = miFijo ? puestos.find((p) => p.numero === miFijo)! : null;
  const libsFijo = fijo?.liberaciones ?? [];
  // Mis rotaciones / asignaciones (en curso o próximas): puestos que el admin o la rotación me asignaron por un periodo
  const misRotaciones = puestos
    .flatMap((p) => [
      ...p.asignaciones.filter((a) => a.persona === yo.nombre).map((a) => ({ numero: p.numero, desde: a.desde, hasta: a.hasta as string | null })),
      ...p.liberaciones.filter((l) => l.para === yo.nombre).map((l) => ({ numero: p.numero, desde: l.desde, hasta: l.hasta })),
    ])
    .filter((r) => r.hasta === null || r.hasta >= hoy)
    .sort((a, b) => a.desde.localeCompare(b.desde));
  // Ventana abierta: "¿Quieres tomar…?" o "¿Quieres soltar…?"
  const [ventana, setVentana] = useState<{ accion: "tomar" | "soltar"; puesto: Puesto; fechas: string[] } | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const dia = (f: string) => fechaTexto(f, { weekday: "long", day: "numeric", month: "long" });
  function mostrarAviso(texto: string) {
    setAviso(texto);
    setTimeout(() => setAviso(""), 4000);
  }

  function abrir(accion: "tomar" | "soltar", puesto: Puesto, fechas: string[]) {
    setError("");
    setVentana({ accion, puesto, fechas });
  }

  // elegidas = días marcados en la ventana (al tomar es siempre 1). Las reglas las revisa la base de datos.
  async function confirmar(elegidas: string[]) {
    if (!ventana) return;
    const { accion, puesto } = ventana;
    if (accion === "tomar") {
      const fecha = elegidas[0];
      const { error } = await supabase.from("reservas").insert({ estacionamiento_id: puesto.id, persona_id: yo.id, fecha });
      if (error) return setError(mensajeError(error));
      mostrarAviso(`Tomaste el ${puesto.numero} para el ${dia(fecha)}`);
    } else {
      // Soltar: los días elegidos vuelven a quedar libres
      const ids = misTomados.filter((t) => t.numero === puesto.numero && elegidas.includes(t.fecha)).map((t) => t.id);
      const { error } = await supabase.from("reservas").delete().in("id", ids);
      if (error) return setError(mensajeError(error));
      mostrarAviso(
        elegidas.length === 1 ? `Soltaste el ${puesto.numero} del ${dia(elegidas[0])}` : `Soltaste el ${puesto.numero} (${elegidas.length} días)`,
      );
    }
    setVentana(null);
    router.refresh(); // vuelve a leer todo desde Supabase
  }

  // "Lo tuyo": junta en un cajón los días seguidos del mismo puesto (ej. 306 martes y miércoles)
  const grupos: { numero: string; fechas: string[] }[] = [];
  for (const t of misTomados) {
    const ultimo = grupos[grupos.length - 1];
    const sigue = ultimo && ultimo.numero === t.numero && sumarDias(ultimo.fechas[ultimo.fechas.length - 1], 1) === t.fecha;
    if (sigue) ultimo.fechas.push(t.fecha);
    else grupos.push({ numero: t.numero, fechas: [t.fecha] });
  }

  const tomadoPor = (numero: string, fecha: string) => reservas.find((r) => r.numero === numero && r.fecha === fecha);

  // Libres de un día: variables sin asignar o fijos liberados "para cualquiera", que nadie haya tomado.
  // Mi propio puesto fijo no aparece aquí (se muestra aparte, en turquesa).
  const libresEn = (fecha: string): Libre[] =>
    puestos
      .map((p) => ({ puesto: p, estado: estadoEn(p, fecha) }))
      .filter(({ puesto, estado }) => estado.zona === "libres" && puesto.numero !== miFijo && !tomadoPor(puesto.numero, fecha))
      .filter(({ puesto }) => !esDeRotacion(puesto, fecha)) // reservados para la lista de espera: no se toman día a día
      .map(({ puesto, estado }) => ({ puesto, deQuien: estado.deQuien }));

  // Mi puesto fijo en los días que lo liberé (turquesa, no se puede tomar)
  const propioEn = (fecha: string): Propio | null => {
    if (!fijo || estadoEn(fijo, fecha).zona !== "libres") return null;
    return { puesto: fijo, tomadoPor: tomadoPor(fijo.numero, fecha)?.persona };
  };

  // --- Dueño: "No voy" y recuperar ---
  // Quién ya tomó días de esa liberación (desde hoy)
  const afectadosDe = (l: Liberacion): Afectado[] =>
    reservas
      .filter((r) => r.numero === miFijo && r.fecha >= hoy && liberadoEn(l, r.fecha))
      .map((r) => ({ persona: r.persona, fecha: r.fecha }));

  async function noVoy(l: Liberacion) {
    const { error } = await supabase.from("periodos").insert({
      estacionamiento_id: fijo!.id,
      desde: l.desde,
      hasta: l.hasta,
      dia_semana: l.cadaDia ?? null,
      para_id: null,
      motivo: l.motivo ?? null,
    });
    if (error) return mostrarAviso(mensajeError(error));
    mostrarAviso(`Liberaste el ${miFijo}. Quedó libre para que otra persona lo tome.`);
    router.refresh();
  }

  // "Al final sí voy": si ya empezó, la liberación termina ayer; si no, se borra.
  // La base de datos le quita el día a quien lo había tomado y le deja el aviso.
  async function recuperar(i: number) {
    const l = libsFijo[i];
    if (!l?.id) return;
    const afectados = afectadosDe(l);
    const { error } =
      l.desde < hoy
        ? await supabase.from("periodos").update({ hasta: sumarDias(hoy, -1) }).eq("id", l.id)
        : await supabase.from("periodos").delete().eq("id", l.id);
    if (error) return mostrarAviso(mensajeError(error));
    mostrarAviso(
      afectados.length ? `Recuperaste el ${miFijo}. Le avisamos a ${[...new Set(afectados.map((a) => a.persona))].join(", ")}.` : `Recuperaste el ${miFijo}.`,
    );
    router.refresh();
  }

  // Cerrar un aviso = marcarlo como leído
  async function cerrarAviso(id: number) {
    await supabase.from("avisos").update({ leido: true }).eq("id", id);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Título con letrero de estacionamiento (cuadrado azul con "P" blanca, como la señal de tránsito) */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-2 border-white bg-blue-700 text-2xl font-black text-white shadow-md ring-1 ring-blue-900/30">
          P
        </span>
        <div>
          <h1 className="text-2xl font-semibold text-marca">Disponibilidad</h1>
          <p className="text-sm text-marca-gris">Días con estacionamientos libres. Toca un puesto verde para tomarlo.</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        {/* Calendario (2/3) */}
        <div className="lg:col-span-2">
          <CalendarioDisponibles
            hoy={hoy}
            libresEn={libresEn}
            propioEn={propioEn}
            onElegir={(p, f) => abrir("tomar", p, [f])}
          />
        </div>

        {/* Lo tuyo (1/3); en celular va arriba. En pantalla grande, una línea lo separa del calendario */}
        <div className="order-first lg:order-none lg:self-stretch lg:border-l lg:border-black/15 lg:pl-6">
        <aside className="rounded-xl border border-black/10 bg-white p-5 shadow-sm lg:sticky lg:top-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-marca">
            <Car size={20} className="text-acento" /> Lo tuyo
          </h2>
          {/* Avisos (ej. "Al final sí voy"): la ✕ los marca como leídos */}
          {avisos.map((a) => (
            <div key={a.id} className="mt-3 flex items-start justify-between gap-2 rounded-lg bg-amber-100 p-3 text-sm text-amber-950">
              <span>{a.texto}</span>
              <button onClick={() => cerrarAviso(a.id)} className="shrink-0 text-amber-800 hover:text-amber-950" aria-label="Cerrar aviso">
                <X size={14} />
              </button>
            </div>
          ))}

          {/* Si tengo puesto fijo: mi puesto, "No voy" y los días que liberé */}
          {miFijo && (
            <div className="mt-3">
              <PanelDueno numero={miFijo} hoy={hoy} liberaciones={libsFijo} afectadosDe={afectadosDe} onNoVoy={noVoy} onRecuperar={recuperar} />
            </div>
          )}

          {/* Mi rotación: "Te toca el 142 por rotación" (se queda todo el periodo) */}
          {misRotaciones.length > 0 && (
            <ul className="mt-3 space-y-3">
              {misRotaciones.map((r) => (
                <CajonRotacion key={r.numero + r.desde} {...r} hoy={hoy} />
              ))}
            </ul>
          )}

          {/* Lo que tomé de otros (si tengo fijo o rotación, solo aparece si tomé algo) */}
          {((!miFijo && misRotaciones.length === 0) || misTomados.length > 0) && (
            <ul className="mt-3 space-y-3">
              {misTomados.length === 0 ? (
                <CajonTuyo />
              ) : (
                grupos.map((g) => (
                  <CajonTuyo
                    key={g.numero + g.fechas[0]}
                    numero={g.numero}
                    fechas={g.fechas}
                    onSoltar={() => abrir("soltar", puestos.find((p) => p.numero === g.numero)!, g.fechas)}
                  />
                ))
              )}
            </ul>
          )}
        </aside>
        </div>
      </div>

      {/* Ventana "¿Quieres tomar / soltar el …?" */}
      {ventana && (
        <ModalTomar
          accion={ventana.accion}
          puesto={ventana.puesto}
          fechas={ventana.fechas}
          error={error}
          onCancelar={() => setVentana(null)}
          onConfirmar={confirmar}
        />
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
