"use client";
// Vista del ADMIN: plano agrupado (Fijos / Rotación / Libres, según cómo está hoy) a la izquierda
// y la tarjeta del puesto elegido a la derecha. Los datos vienen de Supabase (app/(app)/estacionamientos/page.tsx);
// cada acción escribe en Supabase (accionesBD.ts) y luego se vuelve a pedir la lista (router.refresh).
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import ZonaEstacionamiento from "./ZonaEstacionamiento";
import AutoDeJuguete, { type Punto, type Viaje } from "./AutoDeJuguete";
import CajonEstacionamiento from "./CajonEstacionamiento";
import TarjetaPuesto from "./TarjetaPuesto";
import CalendarioAdmin from "./CalendarioAdmin";
import { fechaTexto, hoyEnChile, sumarDias, sumarUnMes } from "./fechas";
import ListaEspera, { type EnLista } from "./ListaEspera";
import { accionesBD, type PersonaBD } from "./accionesBD";
import { esDeRotacion, estadoEn, programadoDe, type Asignacion, type Liberacion, type Puesto, type Zona } from "./datosPrueba";

const sinSuscripcion = () => () => {};

type Props = { puestos: Puesto[]; personas: PersonaBD[]; listaEspera: EnLista[] };

// ¿Está libre para rotar desde esa fecha por un mes? (misma regla que libre_para_rotar en Supabase)
// = nadie asignado en ese mes, y: variable, o fijo con dueño liberado "para cualquiera" sin término o hasta el fin de ese mes o más.
function libreParaRotar(p: Puesto, fecha: string) {
  if (p.tipo === "especial") return false;
  const finMes = sumarDias(sumarUnMes(fecha), -1);
  const choca = (desde: string, hasta: string | null) => desde <= finMes && (hasta === null || hasta >= fecha);
  if (p.asignaciones.some((a) => choca(a.desde, a.hasta)) || p.liberaciones.some((l) => l.para && choca(l.desde, l.hasta))) return false;
  if (p.tipo === "variable") return true;
  if (!p.dueno) return false;
  return p.liberaciones.some(
    (l) => !l.para && !l.paraTodos && l.cadaDia === undefined && l.desde <= fecha && (l.hasta === null || l.hasta >= finMes),
  );
}

export default function PlanoEstacionamientos(props: Props) {
  // "Hoy" se calcula solo en el navegador, para que Next no lo congele al pre-armar la página
  const hoy = useSyncExternalStore(sinSuscripcion, hoyEnChile, () => null);
  if (!hoy) return <p className="text-marca-gris">Cargando plano...</p>;
  if (props.puestos.length === 0) return <p className="text-marca-gris">No hay estacionamientos cargados.</p>;
  return <Plano hoy={hoy} {...props} />;
}

const ZONAS: { zona: Zona; letra: string; color: string; titulo: string; subtitulo: string }[] = [
  { zona: "fijos", letra: "F", color: "bg-sky-200 text-sky-950", titulo: "Fijos", subtitulo: "Con su dueño" },
  { zona: "rotacion", letra: "R", color: "bg-amber-300 text-amber-950", titulo: "Rotación", subtitulo: "Asignados por un periodo" },
  { zona: "libres", letra: "L", color: "bg-emerald-200 text-emerald-950", titulo: "Libres", subtitulo: "Disponibles para tomar" },
];

function Plano({ hoy, puestos, personas, listaEspera }: Props & { hoy: string }) {
  const router = useRouter();
  const [aviso, setAviso] = useState("");
  const bd = accionesBD(personas);

  // --- Autito de juguete: si un puesto cambia de zona, un auto maneja del cajón antiguo al nuevo ---
  const raiz = useRef<HTMLDivElement>(null);
  const antes = useRef<Map<string, { zona: Zona; centro: Punto }> | null>(null);
  const [viaje, setViaje] = useState<Viaje | null>(null);

  // Centro de cada cajón, medido desde la esquina del plano (así no importa el scroll)
  function medir() {
    const base = raiz.current!.getBoundingClientRect();
    const mapa = new Map<string, { centro: Punto; alto: number }>();
    raiz.current!.querySelectorAll<HTMLElement>("[data-numero]").forEach((el) => {
      const r = el.getBoundingClientRect();
      mapa.set(el.dataset.numero!, { centro: { x: r.left - base.left + r.width / 2, y: r.top - base.top + r.height / 2 }, alto: r.height });
    });
    return mapa;
  }

  // Guarda en Supabase. Antes anota dónde estaba cada puesto (para animar al que cambie de zona);
  // si sale bien, vuelve a pedir los datos y muestra el aviso; si no, muestra el error.
  async function guardar(accion: Promise<string>, avisoOk: string) {
    const sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (raiz.current && !sinMovimiento) {
      const pos = medir();
      antes.current = new Map(puestos.map((p) => [p.numero, { zona: estadoEn(p, hoy).zona, centro: pos.get(p.numero)!.centro }]));
    }
    const error = await accion;
    if (error) {
      antes.current = null;
      return mostrarAviso(error);
    }
    router.refresh();
    mostrarAviso(avisoOk);
  }

  // Después de redibujar con los datos nuevos (antes de pintar): busca el puesto que cambió de zona y lanza el autito
  useLayoutEffect(() => {
    const previo = antes.current;
    if (!previo || !raiz.current) return;
    const movido = puestos.map((p) => ({ p, zona: estadoEn(p, hoy).zona })).find((x) => previo.get(x.p.numero)?.zona !== x.zona);
    if (!movido) return; // aún no llegan los datos nuevos (o nada cambió de zona)
    antes.current = null;
    const destino = medir().get(movido.p.numero)!;
    const colores: Record<Zona, string | null> = { fijos: "#378add", rotacion: "#ef9f27", libres: null };
    setViaje({
      id: Date.now(),
      numero: movido.p.numero,
      desde: previo.get(movido.p.numero)!.centro,
      hasta: destino.centro,
      altoCajon: destino.alto,
      color: colores[movido.zona] ?? colores[previo.get(movido.p.numero)!.zona] ?? "#378add",
    });
    // Si el destino no se ve, la página baja/sube sola para mostrarlo
    raiz.current.querySelector(`[data-numero="${movido.p.numero}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [puestos, hoy]);

  function mostrarAviso(texto: string) {
    setAviso(texto);
    setTimeout(() => setAviso(""), 4000);
  }

  const idDe = (numero: string) => puestos.find((p) => p.numero === numero)!.id!;

  // Liberar (fechas / sin término / cada semana; para cualquiera o para una persona)
  function liberar(numero: string, l: Liberacion) {
    guardar(bd.liberar(idDe(numero), l), l.para ? `El ${numero} quedó liberado para ${l.para}` : `El ${numero} quedó liberado`);
  }

  // La ✕ de "Programado": terminar antes (si ya empezó) o borrar (si aún no empieza)
  function quitar(numero: string, clave: string) {
    const p = puestos.find((x) => x.numero === numero)!;
    const [tipo, i] = clave.split("-");
    const periodo = tipo === "lib" ? p.liberaciones[Number(i)] : p.asignaciones[Number(i)];
    if (!periodo?.id) return;
    guardar(bd.terminar(periodo.id, periodo.desde, hoy), periodo.desde < hoy ? "Terminado desde hoy" : "Cancelado");
  }

  // Cambia el dueño de un fijo (la base de datos borra lo programado)
  function cambiarDueno(numero: string, nuevo: string | null) {
    guardar(bd.cambiarPuesto(idDe(numero), { dueno: nuevo }), nuevo ? `${nuevo} es ahora dueño/a del ${numero}` : `El ${numero} quedó sin dueño`);
  }

  // Quitar dueño / pasar a variable
  function pasarAVariable(numero: string) {
    guardar(bd.cambiarPuesto(idDe(numero), { tipo: "variable", dueno: null }), `El ${numero} ahora es variable`);
  }

  // Marcar como especial (solo variables): no rota, nadie lo toma
  function marcarEspecial(numero: string, nombre: string) {
    guardar(bd.cambiarPuesto(idDe(numero), { tipo: "especial", dueno: null, usoEspecial: nombre }), `El ${numero} ahora es especial: ${nombre}`);
  }

  // Quitar marca especial: vuelve a ser variable
  function quitarEspecial(numero: string) {
    guardar(bd.cambiarPuesto(idDe(numero), { tipo: "variable", usoEspecial: null }), `El ${numero} ahora es variable`);
  }

  // Asignar por un periodo (variables y fijos sin dueño)
  function asignar(numero: string, a: Asignacion) {
    guardar(bd.asignar(idDe(numero), a), `El ${numero} quedó asignado a ${a.persona}`);
  }

  // Pasar a fijo (variables): con dueño o "aún sin asignar"
  function pasarAFijo(numero: string, dueno: string | null) {
    guardar(
      bd.cambiarPuesto(idDe(numero), { tipo: "fijo", dueno }),
      dueno ? `El ${numero} ahora es fijo de ${dueno}` : `El ${numero} ahora es fijo (aún sin dueño)`,
    );
  }

  // Personas sin puesto fijo (máximo 1 fijo por persona), en orden alfabético
  const duenos = new Set(puestos.map((p) => p.dueno));
  const disponibles = personas.map((p) => p.nombre).filter((n) => !duenos.has(n)).sort((a, b) => a.localeCompare(b, "es"));

  // Lista de espera: cuándo le tocó por última vez a alguien (su asignación o liberación-para-ella más reciente)
  const ultimaVez = (nombre: string) => {
    const fechas = puestos.flatMap((p) => [
      ...p.asignaciones.filter((a) => a.persona === nombre).map((a) => a.desde),
      ...p.liberaciones.filter((l) => l.para === nombre).map((l) => l.desde),
    ]);
    if (fechas.length === 0) return null;
    return fechaTexto(fechas.sort().at(-1)!, { month: "short", year: "numeric" });
  };
  const [elegido, setElegido] = useState(puestos[0].numero);
  const [pestana, setPestana] = useState<"plano" | "calendario">("plano");

  const conEstado = puestos.map((p) => ({ puesto: p, estado: estadoEn(p, hoy) }));
  const actual = conEstado.find((x) => x.puesto.numero === elegido) ?? conEstado[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-marca">Estacionamientos</h1>
          <p className="text-sm text-marca-gris">
            {pestana === "plano"
              ? "Cómo están hoy. Toca un puesto para ver y cambiar su configuración."
              : "La situación en el tiempo: quién usa cada puesto y qué queda sin usar."}
          </p>
        </div>
        {/* Pestañas */}
        <div className="flex rounded-md border border-black/10 bg-white p-0.5">
          {(
            [
              ["plano", "Plano de hoy"],
              ["calendario", "Calendario"],
            ] as const
          ).map(([valor, texto]) => (
            <button
              key={valor}
              onClick={() => setPestana(valor)}
              className={`rounded px-3 py-1.5 text-sm font-semibold ${pestana === valor ? "bg-marca text-white" : "text-marca hover:bg-marca/5"}`}
            >
              {texto}
            </button>
          ))}
        </div>
      </div>

      {pestana === "calendario" ? (
        <CalendarioAdmin
          hoy={hoy}
          puestos={puestos}
          onIrAPuesto={(numero) => {
            setElegido(numero);
            setPestana("plano");
          }}
        />
      ) : (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        {/* Plano */}
        <div ref={raiz} className="relative space-y-6">
          {/* Autito de juguete en camino (va por encima del plano) */}
          {viaje && <AutoDeJuguete key={viaje.id} viaje={viaje} onLlegar={() => setViaje(null)} />}
          {ZONAS.map((z) => {
            const delGrupo = conEstado.filter((x) => x.estado.zona === z.zona);
            return (
              <ZonaEstacionamiento
                key={z.zona}
                letra={z.letra}
                colorLetrero={z.color}
                titulo={z.titulo}
                subtitulo={z.subtitulo}
                cantidad={delGrupo.length}
              >
                {delGrupo.map(({ puesto, estado }) => (
                  <CajonEstacionamiento
                    key={puesto.numero}
                    puesto={puesto}
                    estado={estado}
                    elegido={puesto.numero === elegido}
                    onElegir={() => setElegido(puesto.numero)}
                    escondido={viaje?.numero === puesto.numero}
                    paraRotacion={esDeRotacion(puesto, hoy)}
                  />
                ))}
              </ZonaEstacionamiento>
            );
          })}
        </div>

        {/* Tarjeta del puesto (queda a la vista al bajar) + lista de espera plegable debajo */}
        <div className="space-y-4 lg:sticky lg:top-6">
          <TarjetaPuesto
            key={actual.puesto.numero}
            puesto={actual.puesto}
            estado={actual.estado}
            programado={programadoDe(actual.puesto, hoy)}
            hoy={hoy}
            onLiberar={(l) => liberar(actual.puesto.numero, l)}
            onQuitar={(clave) => quitar(actual.puesto.numero, clave)}
            disponibles={disponibles}
            onCambiarDueno={(nuevo) => cambiarDueno(actual.puesto.numero, nuevo)}
            onPasarAVariable={() => pasarAVariable(actual.puesto.numero)}
            onMarcarEspecial={(nombre) => marcarEspecial(actual.puesto.numero, nombre)}
            onQuitarEspecial={() => quitarEspecial(actual.puesto.numero)}
            onPasarAFijo={(dueno) => pasarAFijo(actual.puesto.numero, dueno)}
            onAsignar={(a) => asignar(actual.puesto.numero, a)}
          />
          <ListaEspera
            // al llegar datos nuevos de Supabase, el recuadro se vuelve a montar con la lista real
            key={listaEspera.map((l) => `${l.personaId}:${l.orden}:${l.saltar}`).join("|")}
            lista={listaEspera}
            candidatos={personas.filter((p) => !duenos.has(p.nombre) && !listaEspera.some((l) => l.personaId === p.id))}
            hoy={hoy}
            puestosParaRotarEn={(fecha) => puestos.filter((p) => libreParaRotar(p, fecha)).map((p) => ({ id: p.id!, numero: p.numero }))}
            ultimaVez={ultimaVez}
            onAviso={mostrarAviso}
          />
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
