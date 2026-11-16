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
