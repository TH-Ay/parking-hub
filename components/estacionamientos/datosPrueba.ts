// Modelo de un estacionamiento y reglas para saber cómo está en una fecha (lo usan el plano y los calendarios).
// Cada puesto es fijo (con dueño o "aún sin dueño"), variable, o especial (ej. Visitas).
// Sobre eso hay excepciones por periodo: liberaciones del fijo y asignaciones a una persona (rotación).
// Los datos reales vienen de Supabase (lib/puestosBD.ts). (Antes aquí había datos de ejemplo.)
import { diaSemana, fechaCorta } from "./fechas";

// hasta null = sin fecha de término; cadaDia = se repite ese día de la semana; para = persona elegida (sin "para" = cualquiera lo toma)
// id = id del periodo en Supabase (no existe en los datos de ejemplo)
// paraTodos = el admin dijo que una liberación larga la puede tomar cualquiera (no va a la rotación)
// de = persona con el puesto por rotación que liberó esos días (solo en "cedidos"); porPrestamo = lo cedió por un préstamo del admin
// rotacion = el préstamo a una persona viene de la lista de espera (periodos.origen = 'rotacion'); si no, es un Préstamo
export type Liberacion = {
  id?: number;
  desde: string;
  hasta: string | null;
  cadaDia?: number;
  motivo?: string;
  para?: string;
  paraTodos?: boolean;
  de?: string;
  porPrestamo?: boolean;
  rotacion?: boolean;
};
export type Asignacion = { id?: number; desde: string; hasta: string; persona: string; rotacion?: boolean };

export type Puesto = {
  id?: number; // id del estacionamiento en Supabase
  numero: string;
  piso: "-3" | "-4";
  tipo: "fijo" | "variable" | "especial";
  dueno: string | null; // solo fijos; null en un fijo = "aún sin dueño" (solo lo ve el admin)
  duenoId?: string | null; // id de la persona dueña en Supabase
  especial?: string; // ej. "Visitas"
  diaADia?: boolean; // variable que cualquiera toma día a día (no va a la rotación)
  liberaciones: Liberacion[];
  asignaciones: Asignacion[];
  cedidos?: Liberacion[]; // días que quien lo tiene por rotación liberó ("No voy"): quedan para todos
  tomados?: { id?: number; fecha: string; persona: string }[]; // días que alguien tomó este puesto (reservas); lo usa la vista del admin
  horas?: ReservaHora[]; // solo Especiales: reservas por hora (ej. clientes); solo admin y recruiting
};

// Reserva por hora de un puesto Especial (tabla reservas_horas). Horas "HH:MM", bloques de 30 min, 08:00–20:00.
export type ReservaHora = { id: number; fecha: string; desde: string; hasta: string; descripcion: string; creadoPor?: string | null };

// "tomados" = Prestados: un libre que alguien tomó ese día (solo en estadoAdminEn) o un préstamo corto a una persona
export type Zona = "fijos" | "rotacion" | "tomados" | "libres";

// Cómo está un puesto en una fecha: en qué zona va y qué nombre se muestra
export type EstadoDelDia = { zona: Zona; quien: string | null; deQuien?: string };

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function liberadoEn(l: Liberacion, fecha: string): boolean {
  if (fecha < l.desde || (l.hasta && fecha > l.hasta)) return false;
  return l.cadaDia === undefined || diaSemana(fecha) === l.cadaDia;
}

// Préstamo a una persona: Rotación (sale de la lista de espera) o Prestado (todo lo demás, dure lo que dure).
// Si esa persona cedió ese día (su "No voy" o un préstamo del admin encima), ese día no cuenta como suyo.
export function estadoEn(p: Puesto, fecha: string): EstadoDelDia {
  if (p.tipo === "especial") return { zona: "fijos", quien: p.especial ?? "Especial" };
  const cedio = (persona: string) => !!p.cedidos?.some((c) => c.de === persona && liberadoEn(c, fecha));
  const zonaDe = (rotacion?: boolean): Zona => (rotacion ? "rotacion" : "tomados");
  const asignada = p.asignaciones.find((a) => fecha >= a.desde && fecha <= a.hasta && !cedio(a.persona));
  if (asignada) return { zona: zonaDe(asignada.rotacion), quien: asignada.persona };
  const libs = p.dueno ? p.liberaciones.filter((l) => liberadoEn(l, fecha)) : [];
  const paraAlguien = libs.find((l) => l.para && !cedio(l.para)); // si se lo liberó a una persona, gana sobre "para cualquiera"
  if (paraAlguien) return { zona: zonaDe(paraAlguien.rotacion), quien: paraAlguien.para!, deQuien: p.dueno! };
  const cedido = p.cedidos?.find((c) => liberadoEn(c, fecha));
  if (cedido) return { zona: "libres", quien: null, deQuien: cedido.de };
  if (p.tipo === "variable") return { zona: "libres", quien: null };
  if (libs.length) return { zona: "libres", quien: null, deQuien: p.dueno! };
  return { zona: "fijos", quien: p.dueno };
}

// Vista del admin: igual que estadoEn, pero un libre que alguien tomó ese día aparece "tomado" con su nombre
export function estadoAdminEn(p: Puesto, fecha: string): EstadoDelDia {
  const e = estadoEn(p, fecha);
  const tomado = e.zona === "libres" ? p.tomados?.find((t) => t.fecha === fecha) : undefined;
  return tomado ? { zona: "tomados", quien: tomado.persona, deQuien: e.deQuien } : e;
}

// ¿Liberación "larga"? = sin fecha de término o de un mes o más (y no "cada semana")
export function esLarga(l: Liberacion): boolean {
  if (l.cadaDia !== undefined) return false;
  if (l.hasta === null) return true;
  const [a, m, d] = l.desde.split("-").map(Number);
  const finMes = new Date(a, m, d - 1, 12).toLocaleDateString("en-CA"); // desde + 1 mes - 1 día
  return l.hasta >= finMes;
}

// ¿Ese día el puesto está reservado para la rotación (lista de espera)? Misma regla que es_de_rotacion en Supabase:
// libre, sin nadie asignado, y es variable o un fijo liberado "para cualquiera" con una liberación larga (sin marca paraTodos).
export function esDeRotacion(p: Puesto, fecha: string): boolean {
  if (estadoEn(p, fecha).zona !== "libres") return false;
  if (p.cedidos?.some((c) => liberadoEn(c, fecha))) return false; // "No voy" de la rotación: para todos
  // liberado "para todos" ese día (ej. por una baja): se toma día a día
  if (p.liberaciones.some((l) => !l.para && l.paraTodos && liberadoEn(l, fecha))) return false;
  if (p.tipo === "variable") return !p.diaADia;
  return p.liberaciones.some((l) => !l.para && !l.paraTodos && liberadoEn(l, fecha) && esLarga(l));
}

// Lista "Programado" (desde hoy en adelante). "clave" identifica qué borrar con la ✕.
// paraTodos: solo en liberaciones largas "para cualquiera" (true = para todos, false = para la rotación); se puede cambiar.
// persona / rotacion: préstamos a una persona (se puede cambiar la persona con el lápiz ✎)
export type Programado = { texto: string; clave: string; paraTodos?: boolean; persona?: string; rotacion?: boolean };

export function programadoDe(p: Puesto, hoy: string): Programado[] {
  const rango = (d: string, h: string) => (d === h ? fechaCorta(d) : `${fechaCorta(d)} – ${fechaCorta(h)}`);
  const lib = p.liberaciones
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => !l.hasta || l.hasta >= hoy)
    .map(({ l, i }) => {
      const cuando =
        l.cadaDia !== undefined ? `Cada ${DIAS[l.cadaDia]}` : l.hasta ? rango(l.desde, l.hasta) : `Desde ${fechaCorta(l.desde)}, sin fecha de término`;
      const quien = l.para ? `Liberado para ${l.para}` : "Liberado para cualquiera";
      const cambiable = !l.para && esLarga(l);
      return {
        texto: `${cuando} · ${quien}${l.motivo ? ` (${l.motivo})` : ""}`,
        clave: `lib-${i}`,
        ...(cambiable && { paraTodos: !!l.paraTodos }),
        ...(l.para && { persona: l.para, rotacion: !!l.rotacion }),
      };
    });
  const asig = p.asignaciones
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a.hasta >= hoy)
    .map(({ a, i }) => ({
      texto: `${rango(a.desde, a.hasta)} · Asignado a ${a.persona}`,
      clave: `asig-${i}`,
      persona: a.persona,
      rotacion: !!a.rotacion,
    }));
  const ced = (p.cedidos ?? [])
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => (!c.hasta || c.hasta >= hoy) && !c.porPrestamo) // los cedidos por un préstamo se ven en el préstamo
    .map(({ c, i }) => ({
      texto: `${c.cadaDia !== undefined ? `Cada ${DIAS[c.cadaDia]}` : rango(c.desde, c.hasta ?? c.desde)} · Liberado por ${c.de} (rotación), para todos`,
      clave: `ced-${i}`,
    }));
  return [...lib, ...asig, ...ced];
}

// Borra lo programado indicado por su clave (la ✕ de la lista)
export function quitarProgramado(p: Puesto, clave: string): Puesto {
  const [tipo, n] = clave.split("-");
  const i = Number(n);
  if (tipo === "ced") return { ...p, cedidos: p.cedidos?.filter((_, j) => j !== i) };
  return tipo === "lib"
    ? { ...p, liberaciones: p.liberaciones.filter((_, j) => j !== i) }
    : { ...p, asignaciones: p.asignaciones.filter((_, j) => j !== i) };
}
