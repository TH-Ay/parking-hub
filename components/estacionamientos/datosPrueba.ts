// Modelo de un estacionamiento y reglas para saber cómo está en una fecha (lo usan el plano y los calendarios).
// Cada puesto es fijo (con dueño o "aún sin dueño"), variable, o especial (ej. Visitas).
// Sobre eso hay excepciones por periodo: liberaciones del fijo y asignaciones a una persona (rotación).
// Los datos reales vienen de Supabase (lib/puestosBD.ts). (Antes aquí había datos de ejemplo.)
import { diaSemana, fechaCorta } from "./fechas";

// hasta null = sin fecha de término; cadaDia = se repite ese día de la semana; para = persona elegida (sin "para" = cualquiera lo toma)
// id = id del periodo en Supabase (no existe en los datos de ejemplo)
export type Liberacion = { id?: number; desde: string; hasta: string | null; cadaDia?: number; motivo?: string; para?: string };
export type Asignacion = { id?: number; desde: string; hasta: string; persona: string };

export type Puesto = {
  id?: number; // id del estacionamiento en Supabase
  numero: string;
  piso: "-3" | "-4";
  tipo: "fijo" | "variable" | "especial";
  dueno: string | null; // solo fijos; null en un fijo = "aún sin dueño" (solo lo ve el admin)
  duenoId?: string | null; // id de la persona dueña en Supabase
  especial?: string; // ej. "Visitas"
  liberaciones: Liberacion[];
  asignaciones: Asignacion[];
};

export type Zona = "fijos" | "rotacion" | "libres";

// Cómo está un puesto en una fecha: en qué zona va y qué nombre se muestra
export type EstadoDelDia = { zona: Zona; quien: string | null; deQuien?: string };

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function liberadoEn(l: Liberacion, fecha: string): boolean {
  if (fecha < l.desde || (l.hasta && fecha > l.hasta)) return false;
  return l.cadaDia === undefined || diaSemana(fecha) === l.cadaDia;
}

export function estadoEn(p: Puesto, fecha: string): EstadoDelDia {
  if (p.tipo === "especial") return { zona: "fijos", quien: p.especial ?? "Especial" };
  const asignada = p.asignaciones.find((a) => fecha >= a.desde && fecha <= a.hasta);
  if (asignada) return { zona: "rotacion", quien: asignada.persona };
  if (p.tipo === "variable") return { zona: "libres", quien: null };
  const libs = p.dueno ? p.liberaciones.filter((l) => liberadoEn(l, fecha)) : [];
  const paraAlguien = libs.find((l) => l.para); // si se lo liberó a una persona, gana sobre "para cualquiera"
  if (paraAlguien) return { zona: "rotacion", quien: paraAlguien.para!, deQuien: p.dueno! };
  if (libs.length) return { zona: "libres", quien: null, deQuien: p.dueno! };
  return { zona: "fijos", quien: p.dueno };
}

// Lista "Programado" (desde hoy en adelante). "clave" identifica qué borrar con la ✕.
export type Programado = { texto: string; clave: string };

export function programadoDe(p: Puesto, hoy: string): Programado[] {
  const rango = (d: string, h: string) => (d === h ? fechaCorta(d) : `${fechaCorta(d)} – ${fechaCorta(h)}`);
  const lib = p.liberaciones
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => !l.hasta || l.hasta >= hoy)
    .map(({ l, i }) => {
      const cuando =
        l.cadaDia !== undefined ? `Cada ${DIAS[l.cadaDia]}` : l.hasta ? rango(l.desde, l.hasta) : `Desde ${fechaCorta(l.desde)}, sin fecha de término`;
      const quien = l.para ? `Liberado para ${l.para}` : "Liberado para cualquiera";
      return { texto: `${cuando} · ${quien}${l.motivo ? ` (${l.motivo})` : ""}`, clave: `lib-${i}` };
    });
  const asig = p.asignaciones
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a.hasta >= hoy)
    .map(({ a, i }) => ({ texto: `${rango(a.desde, a.hasta)} · Asignado a ${a.persona}`, clave: `asig-${i}` }));
  return [...lib, ...asig];
}

// Borra lo programado indicado por su clave (la ✕ de la lista)
export function quitarProgramado(p: Puesto, clave: string): Puesto {
  const [tipo, n] = clave.split("-");
  const i = Number(n);
  return tipo === "lib"
    ? { ...p, liberaciones: p.liberaciones.filter((_, j) => j !== i) }
    : { ...p, asignaciones: p.asignaciones.filter((_, j) => j !== i) };
}
