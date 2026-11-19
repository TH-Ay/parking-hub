// Ayudas para fechas en formato "AAAA-MM-DD" (como las guarda la BD), en hora de Chile.

export function hoyEnChile(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
}

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toLocaleDateString("en-CA");
}

// Primer y último día del mes de una fecha
export function mesDe(fecha: string): { desde: string; hasta: string } {
  const [a, m] = fecha.split("-").map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  const mm = String(m).padStart(2, "0");
  return { desde: `${a}-${mm}-01`, hasta: `${a}-${mm}-${ultimo}` };
}

// Primer día del mes, n meses antes/después (ej. sumarMeses("2026-11-16", 1) = "2026-12-01")
export function sumarMeses(fecha: string, n: number): string {
  const [a, m] = fecha.split("-").map(Number);
  return new Date(a, m - 1 + n, 1, 12).toLocaleDateString("en-CA");
}

// El mismo día del mes siguiente (ej. 15-11 → 15-12). Una rotación dura desde f hasta el día anterior a esto.
export function sumarUnMes(fecha: string): string {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(a, m, d, 12).toLocaleDateString("en-CA");
}

// Lunes de la semana de esa fecha
export function lunesDe(fecha: string): string {
  return sumarDias(fecha, -((diaSemana(fecha) + 6) % 7));
}

// Formato libre en español, ej. { month: "long", year: "numeric" } → "noviembre de 2026"
export function fechaTexto(fecha: string, formato: Intl.DateTimeFormatOptions): string {
  return new Date(`${fecha}T12:00:00`).toLocaleDateString("es-CL", formato);
}

// Día hábil = lunes a viernes (la oficina no usa los estacionamientos el fin de semana)
export const esHabil = (f: string) => diaSemana(f) >= 1 && diaSemana(f) <= 5;

// Si cae en fin de semana, salta al día hábil siguiente (o anterior si direccion = -1)
export function habil(f: string, direccion = 1): string {
  let d = f;
  while (!esHabil(d)) d = sumarDias(d, direccion);
  return d;
}

// 0 = domingo ... 5 = viernes
export function diaSemana(fecha: string): number {
  return new Date(`${fecha}T12:00:00`).getDay();
}

// "18 nov"
export function fechaCorta(fecha: string): string {
  return new Date(`${fecha}T12:00:00`).toLocaleDateString("es-CL", { day: "numeric", month: "short" });
}

// TURNOS DE ROTACIÓN (misma regla que Supabase, migracion_v2_16.sql): cada semana (lunes a viernes) es del mes
// donde cae su jueves. Turno de un mes = del lunes de su primera semana al viernes antes del turno siguiente.
// Ej.: diciembre 2026 = lun 30 nov → vie 1 ene; enero 2027 = lun 4 ene → vie 29 ene.
const isoDia = (f: string) => diaSemana(f) || 7; // 1 = lunes ... 7 = domingo

function inicioTurnoDelMes(mes: string): string {
  const primerJueves = sumarDias(mes, (4 - isoDia(mes) + 7) % 7);
  return sumarDias(primerJueves, -3);
}

// Turno que contiene esa fecha
export function turnoDe(fecha: string): { desde: string; hasta: string } {
  const mes = `${sumarDias(fecha, 4 - isoDia(fecha)).slice(0, 7)}-01`;
  return { desde: inicioTurnoDelMes(mes), hasta: sumarDias(inicioTurnoDelMes(sumarUnMes(mes)), -3) };
}

export const finDelTurno = (fecha: string) => turnoDe(fecha).hasta;
export const turnoSiguiente = (fecha: string) => turnoDe(sumarDias(turnoDe(fecha).hasta, 3));
