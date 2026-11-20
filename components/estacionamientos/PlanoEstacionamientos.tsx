"use client";
// Vista del ADMIN: plano agrupado (Fijos / Rotación / Libres, según cómo está hoy) a la izquierda
// y la tarjeta del puesto elegido a la derecha. Los datos vienen de Supabase (app/(app)/estacionamientos/page.tsx);
// cada acción escribe en Supabase (accionesBD.ts) y luego se vuelve a pedir la lista (router.refresh).
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import ZonaEstacionamiento from "./ZonaEstacionamiento";
import AutoDeJuguete, { type Punto, type Viaje } from "./AutoDeJuguete";
import CajonEstacionamiento from "./CajonEstacionamiento";
import TarjetaPuesto from "./TarjetaPuesto";
import CalendarioAdmin from "./CalendarioAdmin";
import { fechaCorta, fechaTexto, finDelTurno, habil, hoyEnChile, lunesDe, sumarDias } from "./fechas";
import ListaEspera, { type EnLista } from "./ListaEspera";
import { useRol } from "@/lib/rol";
import { accionesBD, type PersonaBD } from "./accionesBD";
import { esDeRotacion, estadoAdminEn, estadoEn, programadoDe, type Asignacion, type Liberacion, type Puesto, type Zona } from "./datosPrueba";

const sinSuscripcion = () => () => {};

type Props = { puestos: Puesto[]; personas: PersonaBD[]; listaEspera: EnLista[]; feriados: Record<string, string> };

// ¿Está libre para rotar desde esa fecha hasta el fin de su turno? (misma regla que libre_para_rotar_en en Supabase)
// = nadie asignado en ese mes, y: variable, o fijo con dueño liberado "para cualquiera" sin término o hasta el fin de ese mes o más.
function libreParaRotar(p: Puesto, fecha: string) {
  if (p.tipo === "especial") return false;
  const finMes = finDelTurno(fecha);
  const choca = (desde: string, hasta: string | null) => desde <= finMes && (hasta === null || hasta >= fecha);
  if (p.asignaciones.some((a) => choca(a.desde, a.hasta)) || p.liberaciones.some((l) => l.para && choca(l.desde, l.hasta))) return false;
  if (p.tipo === "variable" && p.liberaciones.some((l) => !l.para && l.paraTodos && choca(l.desde, l.hasta))) return false;
  if (p.tipo === "variable") return !p.diaADia;
  if (!p.dueno) return false;
  return p.liberaciones.some(
    (l) => !l.para && !l.paraTodos && l.cadaDia === undefined && l.desde <= fecha && (l.hasta === null || l.hasta >= finMes),
  );
}

export default function PlanoEstacionamientos(props: Props) {
  // "Hoy" se calcula solo en el navegador, para que Next no lo congele al pre-armar la página
  const hoy = useSyncExternalStore(sinSuscripcion, hoyEnChile, () => null);
  // Recruiting solo ve los puestos Especiales (ej. 307 Visitas)
  const esAdmin = useRol() === "admin";
  const puestos = esAdmin ? props.puestos : props.puestos.filter((p) => p.tipo === "especial");
  if (!hoy) return <p className="text-marca-gris">Cargando plano...</p>;
  if (puestos.length === 0) return <p className="text-marca-gris">No hay estacionamientos para mostrar.</p>;
  return <Plano hoy={hoy} {...props} puestos={puestos} />;
}

const ZONAS: { zona: Zona; letra: string; color: string; titulo: string; subtitulo: string }[] = [
  { zona: "fijos", letra: "F", color: "bg-sky-200 text-sky-950", titulo: "Fijos", subtitulo: "Con su dueño" },
  { zona: "rotacion", letra: "R", color: "bg-amber-300 text-amber-950", titulo: "Rotación", subtitulo: "Por la lista de espera (o esperándola)" },
  { zona: "tomados", letra: "P", color: "bg-violet-200 text-violet-950", titulo: "Prestados", subtitulo: "Alguien lo tiene prestado ese día" },
  { zona: "libres", letra: "L", color: "bg-emerald-200 text-emerald-950", titulo: "Libres", subtitulo: "Disponibles para tomar" },
];

// Grupo del plano: igual que la zona, pero un libre que espera la rotación (lista de espera) va en "Rotación"
function grupoEn(p: Puesto, fecha: string): Zona {
  const zona = estadoAdminEn(p, fecha).zona;
  return zona === "libres" && esDeRotacion(p, fecha) ? "rotacion" : zona;
}

function Plano({ hoy, puestos, personas, listaEspera, feriados }: Props & { hoy: string }) {
  const esAdmin = useRol() === "admin"; // recruiting: sin lista de espera
  const router = useRouter();
  const [aviso, setAviso] = useState("");
  const bd = accionesBD(personas);
  // Día que se mira en el plano (flechas ‹ ›). Las acciones de la ficha siguen usando "hoy".
  const [dia, setDia] = useState(hoy);

  // --- Autito de juguete: si un puesto cambia de zona, un auto maneja del cajón antiguo al nuevo ---
  const raiz = useRef<HTMLDivElement>(null);
  const antes = useRef<Map<string, { zona: Zona; centro: Punto }> | null>(null);
  const [viaje, setViaje] = useState<Viaje | null>(null);
  const numViaje = useRef(0); // id de cada viaje del autito

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
  function anotarPosiciones() {
    const sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (raiz.current && !sinMovimiento) {
      const pos = medir();
      antes.current = new Map(puestos.map((p) => [p.numero, { zona: grupoEn(p, dia), centro: pos.get(p.numero)!.centro }]));
    }
  }

  // Flechas: día hábil anterior / siguiente (los autitos manejan al grupo que les toca ese día)
  function cambiarDia(nuevo: string) {
    anotarPosiciones();
    setDia(nuevo);
  }

  async function guardar(accion: Promise<string>, avisoOk: string) {
    anotarPosiciones();
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
    const movido = puestos.map((p) => ({ p, zona: grupoEn(p, dia) })).find((x) => previo.get(x.p.numero)?.zona !== x.zona);
    if (!movido) return; // aún no llegan los datos nuevos (o nada cambió de zona)
    antes.current = null;
    const destino = medir().get(movido.p.numero)!;
    const colores: Record<Zona, string | null> = { fijos: "#378add", rotacion: "#ef9f27", tomados: "#8b5cf6", libres: null };
    setViaje({
      id: ++numViaje.current,
      numero: movido.p.numero,
      desde: previo.get(movido.p.numero)!.centro,
      hasta: destino.centro,
      altoCajon: destino.alto,
      color: colores[movido.zona] ?? colores[previo.get(movido.p.numero)!.zona] ?? "#378add",
    });
    // Si el destino no se ve, la página baja/sube sola para mostrarlo
    raiz.current.querySelector(`[data-numero="${movido.p.numero}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [puestos, dia]);

  function mostrarAviso(texto: string) {
    setAviso(texto);
    setTimeout(() => setAviso(""), 4000);
  }

  const idDe = (numero: string) => puestos.find((p) => p.numero === numero)!.id!;

  // Prestar a una persona un puesto que otra ya tiene esos días (rotación o préstamo): se pide confirmar.
  // Devuelve false si el admin no confirma. (La BD hace que la otra persona ceda esos días y le avisa.)
  function confirmarEncima(numero: string, nueva: string, desde: string, hasta: string | null, cadaDia?: number) {
    const p = puestos.find((x) => x.numero === numero)!;
    const quienes = new Set<string>();
    const fin = hasta ?? sumarDias(desde, 60);
    for (let f = desde; f <= fin; f = sumarDias(f, 1)) {
      if (cadaDia !== undefined && new Date(`${f}T12:00:00`).getDay() !== cadaDia) continue;
      const e = estadoEn(p, f);
      if ((e.zona === "rotacion" || e.zona === "tomados") && e.quien && e.quien !== nueva) quienes.add(e.quien);
    }
    if (quienes.size === 0) return true;
    return window.confirm(
      `${[...quienes].join(", ")} tiene el ${numero} algunos de esos días. Si se lo prestas a ${nueva}, esos días dejan de ser suyos y le llega un aviso (los demás días lo sigue teniendo). ¿Continuar?`,
    );
  }

  // Liberar (fechas / sin término / cada semana; para cualquiera o para una persona)
  function liberar(numero: string, l: Liberacion) {
    if (l.para && !l.rotacion && !confirmarEncima(numero, l.para, l.desde, l.hasta, l.cadaDia)) return;
    guardar(bd.liberar(idDe(numero), l), l.para ? `El ${numero} quedó liberado para ${l.para}` : `El ${numero} quedó liberado`);
  }

  // La ✕ de "Tomado por": le quita ese día a la persona (recibe aviso) y vuelve a quedar libre
  function quitarTomado(numero: string, t: { id?: number; fecha: string; persona: string }) {
    if (!t.id) return;
    guardar(bd.quitarReserva(t.id), `Se le quitó el ${numero} del ${fechaCorta(t.fecha)} a ${t.persona}`);
  }

  // La ✕ de "Programado": terminar antes (si ya empezó) o borrar (si aún no empieza)
  function quitar(numero: string, clave: string) {
    const p = puestos.find((x) => x.numero === numero)!;
    const [tipo, i] = clave.split("-");
    const periodo = tipo === "lib" ? p.liberaciones[Number(i)] : tipo === "ced" ? p.cedidos?.[Number(i)] : p.asignaciones[Number(i)];
    if (!periodo?.id) return;
    guardar(bd.terminar(periodo.id, periodo.desde, hoy), periodo.desde < hoy ? "Terminado desde hoy" : "Cancelado");
  }

  // En "Programado": el lápiz ✎ cambia la persona de un préstamo o rotación
  function cambiarPersona(numero: string, clave: string, nueva: string, lugar: "primero" | "final" | null) {
    const p = puestos.find((x) => x.numero === numero)!;
    const [tipo, i] = clave.split("-");
    const periodo = tipo === "lib" ? p.liberaciones[Number(i)] : p.asignaciones[Number(i)];
    if (!periodo?.id) return;
    guardar(bd.cambiarPersona(periodo.id, nueva, lugar), `El ${numero} ahora es de ${nueva}`);
  }

  // En "Programado": etiqueta Préstamo ↔ Rotación de un préstamo a una persona
  function cambiarRotacion(numero: string, clave: string, valor: boolean) {
    const p = puestos.find((x) => x.numero === numero)!;
    const [tipo, i] = clave.split("-");
    const periodo = tipo === "lib" ? p.liberaciones[Number(i)] : p.asignaciones[Number(i)];
    if (!periodo?.id) return;
    guardar(bd.cambiarOrigen(periodo.id, valor), valor ? `El ${numero} ahora cuenta como rotación` : `El ${numero} ahora es un préstamo`);
  }

  // En "Programado": cambia una liberación larga entre "para todos" y "para la rotación"
  function cambiarParaTodos(numero: string, clave: string, valor: boolean) {
    const l = puestos.find((x) => x.numero === numero)!.liberaciones[Number(clave.split("-")[1])];
    if (!l?.id) return;
    guardar(bd.cambiarParaTodos(l.id, valor), valor ? `El ${numero} ahora es para todos` : `El ${numero} ahora es para la rotación`);
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

  // Variable "día a día": cualquiera lo toma (no va a la rotación). Permanente hasta apagarlo.
  function cambiarDiaADia(numero: string, valor: boolean) {
    guardar(
      bd.cambiarPuesto(idDe(numero), { diaADia: valor }),
      valor ? `El ${numero} ahora se toma día a día` : `El ${numero} vuelve a ser para rotación`,
    );
  }

  // Asignar por un periodo (variables y fijos sin dueño)
  function asignar(numero: string, a: Asignacion) {
    if (!a.rotacion && !confirmarEncima(numero, a.persona, a.desde, a.hasta)) return;
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
      ...p.asignaciones.filter((a) => a.persona === nombre && a.rotacion).map((a) => a.desde),
      ...p.liberaciones.filter((l) => l.para === nombre && l.rotacion).map((l) => l.desde),
    ]);
    if (fechas.length === 0) return null;
    return fechaTexto(fechas.sort().at(-1)!, { month: "short", year: "numeric" });
  };
  // Lista de espera en orden (sin quienes saltan el turno): para "Siguiente de la lista" al cambiar la persona
  const enOrden = [...listaEspera].sort((a, b) => a.orden - b.orden).filter((l) => !l.saltar).map((l) => l.nombre);
  // "Dar a la siguiente de la lista": entre esas fechas (por defecto desde hoy al fin del turno), a la primera de la lista
  // que no tenga puesto esos días
  const tienePrestamo = (nombre: string, desde: string, hasta: string) =>
    puestos.some(
      (p) =>
        p.asignaciones.some((a) => a.persona === nombre && a.desde <= hasta && a.hasta >= desde) ||
        p.liberaciones.some((l) => l.para === nombre && l.desde <= hasta && (!l.hasta || l.hasta >= desde)),
    );
  const siguienteEn = (desde: string, hasta: string) =>
    [...listaEspera]
      .sort((a, b) => a.orden - b.orden)
      .find((l) => !l.saltar && !duenos.has(l.nombre) && !tienePrestamo(l.nombre, desde, hasta)) ?? null;
  function darSiguiente(numero: string, desde: string, hasta: string) {
    const s = siguienteEn(desde, hasta);
    if (!s) return;
    guardar(bd.darRotacion(idDe(numero), s.personaId, desde, hasta), `El ${numero} ahora es de ${s.nombre} por rotación`);
  }
  const [elegido, setElegido] = useState(puestos[0].numero);
  const [esperaAbierta, setEsperaAbierta] = useState(false); // "Lista de espera" parte plegada
  const ficha = useRef<HTMLDivElement>(null);

  // Al elegir un puesto en el plano: muestra su ficha y sube la pantalla hasta ella
  // Teléfono: la ficha parte plegada; se abre al tocar un puesto o con su botón (en computador siempre se ve)
  const [fichaAbierta, setFichaAbierta] = useState(false);
  function elegir(numero: string) {
    setElegido(numero);
    setFichaAbierta(true);
    const sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ficha.current?.scrollIntoView({ behavior: sinMovimiento ? "auto" : "smooth", block: "start" });
  }
  const [pestana, setPestana] = useState<"plano" | "calendario">("plano");

  const conEstado = puestos.map((p) => ({ puesto: p, estado: estadoAdminEn(p, dia) }));
  const actual = conEstado.find((x) => x.puesto.numero === elegido) ?? conEstado[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-marca">Estacionamientos</h1>
          <p className="text-sm text-marca-gris">
            {pestana === "plano"
              ? `Cómo están ${dia === hoy ? "hoy" : "ese día"}. Toca un puesto para ver y cambiar su configuración.`
              : "La situación en el tiempo: quién usa cada puesto y qué queda sin usar."}
          </p>
        </div>
        {/* Pestañas */}
        <div className="flex rounded-md border border-black/10 bg-white p-0.5">
          {(
            [
              ["plano", "Plano del día"],
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
          feriados={feriados}
          onIrAPuesto={(numero) => {
            setElegido(numero);
            setPestana("plano");
          }}
        />
      ) : (
      // Teléfono y pantallas medianas: ficha arriba y plano abajo (como Disponibilidad). Computador (lg): lado a lado
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6">
        {/* Plano */}
        <div ref={raiz} className="relative space-y-6">
          {/* Autito de juguete en camino (va por encima del plano) */}
          {viaje && <AutoDeJuguete key={viaje.id} viaje={viaje} onLlegar={() => setViaje(null)} />}
          {/* Día que se mira: ‹ anterior · fecha · siguiente › (solo lunes a viernes) */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => cambiarDia(habil(sumarDias(dia, -1), -1))}
              className="rounded-md border border-black/10 bg-white p-1.5 text-marca hover:bg-marca/5"
              aria-label="Día anterior"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="min-w-44 text-center text-sm font-semibold capitalize text-marca">
              {dia === hoy ? "Hoy, " : ""}
              {fechaTexto(dia, { weekday: "long", day: "numeric", month: "short" })}
            </span>
            <button
              onClick={() => cambiarDia(habil(sumarDias(dia, 1), 1))}
              className="rounded-md border border-black/10 bg-white p-1.5 text-marca hover:bg-marca/5"
              aria-label="Día siguiente"
            >
              <ChevronRight size={18} />
            </button>
            {dia !== hoy && (
              <button onClick={() => cambiarDia(hoy)} className="rounded-md px-2 py-1 text-xs font-semibold text-acento hover:bg-acento/10">
                Volver a hoy
              </button>
            )}
            {feriados[dia] && (
              <span className="rounded bg-black/[0.06] px-1.5 py-0.5 text-xs font-semibold text-marca-gris">Feriado · {feriados[dia]}</span>
            )}
          </div>
          {ZONAS.map((z) => {
            const delGrupo = conEstado.filter((x) => grupoEn(x.puesto, dia) === z.zona);
            return (
              <div key={z.zona} className="space-y-2">
              <ZonaEstacionamiento
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
                    onElegir={() => elegir(puesto.numero)}
                    escondido={viaje?.numero === puesto.numero}
                    paraRotacion={esDeRotacion(puesto, dia)}
                    diaADia={puesto.tipo === "variable" && !!puesto.diaADia}
                    reservasDelDia={puesto.horas?.filter((h) => h.fecha === dia).length}
                  />
                ))}
              </ZonaEstacionamiento>
              {z.zona === "tomados" && <PrestadosSemana puestos={puestos} hoy={hoy} dia={dia} onElegir={elegir} />}
              {z.zona === "libres" && <LibresSemana puestos={puestos} hoy={hoy} dia={dia} onElegir={elegir} feriados={feriados} />}
              </div>
            );
          })}
        </div>

        {/* Tarjeta del puesto (queda a la vista al bajar) + lista de espera plegable debajo */}
        <div ref={ficha} className="order-first scroll-mt-6 space-y-4 lg:order-none lg:sticky lg:top-6">
          {/* Teléfono: barra para plegar / desplegar la ficha */}
          <button
            onClick={() => setFichaAbierta(!fichaAbierta)}
            aria-expanded={fichaAbierta}
            className="flex w-full items-center justify-between gap-2 rounded-xl border border-black/10 bg-white px-4 py-3 text-left shadow-sm lg:hidden"
          >
            <span className="min-w-0 text-sm text-marca">
              <span className="font-semibold">Estacionamiento {actual.puesto.numero}</span>
              <span className="text-marca-gris"> · {fichaAbierta ? "Ocultar ficha" : "Ver ficha"}</span>
            </span>
            <ChevronDown size={18} className={`shrink-0 text-marca-gris transition-transform ${fichaAbierta ? "rotate-180" : ""}`} />
          </button>
          <div className={fichaAbierta ? "" : "hidden lg:block"}>
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
            onDiaADia={(v) => cambiarDiaADia(actual.puesto.numero, v)}
            onQuitarTomado={(t) => quitarTomado(actual.puesto.numero, t)}
            onParaTodos={(clave, v) => cambiarParaTodos(actual.puesto.numero, clave, v)}
            listaEspera={enOrden}
            onCambiarPersona={(clave, nueva, lugar) => cambiarPersona(actual.puesto.numero, clave, nueva, lugar)}
            onRotacion={(clave, v) => cambiarRotacion(actual.puesto.numero, clave, v)}
            esperandoRotacion={esDeRotacion(actual.puesto, hoy)}
            siguienteEn={(desde, hasta) => siguienteEn(desde, hasta)?.nombre ?? null}
            onDarSiguiente={(desde, hasta) => darSiguiente(actual.puesto.numero, desde, hasta)}
            dia={dia}
            onReservarHora={(desde, hasta, descripcion) =>
              guardar(bd.reservarHora(idDe(actual.puesto.numero), dia, desde, hasta, descripcion), `Reservado el ${actual.puesto.numero} de ${desde} a ${hasta}`)
            }
            onBorrarHora={(r) => guardar(bd.borrarHora(r.id), `Se borró la reserva de ${r.desde} a ${r.hasta}`)}
            onCambiarDia={cambiarDia}
          />
          </div>
          {esAdmin && (
          <ListaEspera
            // al llegar datos nuevos de Supabase, el recuadro se vuelve a montar con la lista real
            key={listaEspera.map((l) => `${l.personaId}:${l.orden}:${l.saltar}`).join("|")}
            lista={listaEspera}
            candidatos={personas.filter((p) => !duenos.has(p.nombre) && !listaEspera.some((l) => l.personaId === p.id))}
            hoy={hoy}
            puestosParaRotarEn={(fecha) => puestos.filter((p) => libreParaRotar(p, fecha)).map((p) => ({ id: p.id!, numero: p.numero }))}
            ultimaVez={ultimaVez}
            onAviso={mostrarAviso}
            abierto={esperaAbierta}
            onAlternar={() => setEsperaAbierta((a) => !a)}
          />
          )}
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

// Debajo del grupo "Prestados": todos los préstamos de esta semana (lunes a viernes), por día:
// días que alguien tomó y préstamos cortos (2 semanas o menos) que asignó el admin.
// Los días que ya pasaron se ven en gris. Clic en una línea = abre la ficha de ese puesto.
function PrestadosSemana({ puestos, hoy, dia, onElegir }: { puestos: Puesto[]; hoy: string; dia: string; onElegir: (numero: string) => void }) {
  const lunes = lunesDe(dia); // la semana del día que se mira en el plano
  const viernes = sumarDias(lunes, 4);
  const lista = [0, 1, 2, 3, 4]
    .map((n) => sumarDias(lunes, n))
    .flatMap((fecha) =>
      puestos
        .map((p) => ({ p, e: estadoAdminEn(p, fecha) }))
        .filter(({ e }) => e.zona === "tomados")
        .map(({ p, e }) => ({ id: undefined as number | undefined, fecha, numero: p.numero, persona: e.quien! })),
    )
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero.localeCompare(b.numero));
  const [abierto, setAbierto] = useState(false); // parte plegado; el botón muestra el detalle
  return (
    <div className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
      <button onClick={() => setAbierto(!abierto)} className="flex w-full items-center justify-between gap-2 text-left" aria-expanded={abierto}>
        <h4 className="text-sm font-semibold text-marca">
          {lunes === lunesDe(hoy) ? "Prestados esta semana" : "Prestados esa semana"} <span className="font-normal text-marca-gris">· {fechaCorta(lunes)} – {fechaCorta(viernes)} · {lista.length}</span>
        </h4>
        <ChevronDown size={16} className={`shrink-0 text-marca-gris transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>
      {!abierto ? null : lista.length === 0 ? (
        <p className="mt-1 text-xs text-marca-gris">Nada prestado esta semana</p>
      ) : (
        <ul className="mt-2 divide-y divide-black/5">
          {lista.map((t) => (
            <li key={t.id ?? `${t.numero}-${t.fecha}`}>
              <button
                onClick={() => onElegir(t.numero)}
                className={`flex w-full items-center gap-3 py-1.5 text-left text-xs hover:bg-marca/5 ${t.fecha < hoy ? "text-marca-gris" : "text-marca"}`}
              >
                <span className="w-24 shrink-0 capitalize">{fechaTexto(t.fecha, { weekday: "short", day: "numeric", month: "short" })}</span>
                <span className="w-10 shrink-0 font-semibold">{t.numero}</span>
                <span className="truncate">{t.persona}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Debajo del grupo "Libres": qué puestos quedan libres (sin prestar) cada día de esta semana (lunes a viernes).
// Verde = cualquiera lo puede tomar; ámbar = reservado para la rotación. Días pasados en gris. Clic = abre la ficha.
function LibresSemana({ puestos, hoy, dia, onElegir, feriados }: { puestos: Puesto[]; hoy: string; dia: string; onElegir: (numero: string) => void; feriados: Record<string, string> }) {
  const lunes = lunesDe(dia); // la semana del día que se mira en el plano
  const dias = [0, 1, 2, 3, 4].map((n) => sumarDias(lunes, n));
  const libresDe = (fecha: string) => puestos.filter((p) => estadoAdminEn(p, fecha).zona === "libres");
  const [abierto, setAbierto] = useState(false); // parte plegado; el botón muestra el detalle
  return (
    <div className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
      <button onClick={() => setAbierto(!abierto)} className="flex w-full items-center justify-between gap-2 text-left" aria-expanded={abierto}>
        <h4 className="text-sm font-semibold text-marca">
          {lunes === lunesDe(hoy) ? "Libres esta semana" : "Libres esa semana"} <span className="font-normal text-marca-gris">· {fechaCorta(dias[0])} – {fechaCorta(dias[4])}</span>
        </h4>
        <ChevronDown size={16} className={`shrink-0 text-marca-gris transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>
      {abierto && (
      <>
      <ul className="mt-2 divide-y divide-black/5">
        {dias.map((fecha) => {
          const libres = libresDe(fecha);
          const pasado = fecha < hoy;
          return (
            <li key={fecha} className={`flex items-start gap-3 py-1.5 text-xs ${pasado ? "text-marca-gris" : "text-marca"}`}>
              <span className="w-24 shrink-0 pt-0.5 capitalize">{fechaTexto(fecha, { weekday: "short", day: "numeric", month: "short" })}</span>
              {feriados[fecha] ? (
                <span className="rounded bg-black/[0.06] px-1.5 py-0.5 font-semibold text-marca-gris">Feriado · {feriados[fecha]}</span>
              ) : libres.length === 0 ? (
                <span className="pt-0.5 text-marca-gris">Ninguno libre</span>
              ) : (
                <span className="flex flex-wrap gap-1">
                  {libres.map((p) => (
                    <button
                      key={p.numero}
                      onClick={() => onElegir(p.numero)}
                      title={esDeRotacion(p, fecha) ? "Reservado para la rotación" : "Cualquiera lo puede tomar"}
                      className={`rounded px-1.5 py-0.5 font-mono font-bold ${pasado ? "opacity-50 " : ""}${
                        esDeRotacion(p, fecha) ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"
                      }`}
                    >
                      {p.numero}
                    </button>
                  ))}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 flex gap-3 text-[11px] text-marca-gris">
        <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded bg-emerald-200" /> Para todos</span>
        <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded bg-amber-200" /> Para rotación</span>
      </p>
      </>
      )}
    </div>
  );
}
