"use client";
// Menú lateral: logo, las 3 páginas y (abajo) usuario + cerrar sesión.
// PLEGABLE (pedido 17-nov-2026): plegado = franja angosta solo con íconos; desplegado = logo y nombres.
//   · Por defecto ("auto"): plegado en el teléfono / pantallas medianas y desplegado en el computador (≥ 1024 px).
//   · El botón de arriba lo pliega o despliega, y la elección se recuerda en este navegador (localStorage).
// En pantallas muy angostas (< 540 px virtuales, hoy no ocurre en el teléfono) se muestra como barra arriba.
import { useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Car, CalendarDays, ChevronsLeft, ChevronsRight, Users, LogOut } from "lucide-react";
import type { Rol } from "@/lib/rol";

// soloAdmin: el usuario (rol "usuario") no ve esa página en el menú
const paginas = [
  { href: "/estacionamientos", nombre: "Estacionamientos", icono: Car, soloAdmin: true },
  { href: "/disponibilidad", nombre: "Disponibilidad", icono: CalendarDays, soloAdmin: false },
  { href: "/personas", nombre: "Personas", icono: Users, soloAdmin: true },
];

// ---- Preferencia guardada: "auto" | "plegado" | "desplegado" ----
type Modo = "auto" | "plegado" | "desplegado";
const CLAVE = "menu-lateral";
const EVENTO = "menu-lateral-cambio";
function leerModo(): Modo {
  try {
    const v = localStorage.getItem(CLAVE);
    return v === "plegado" || v === "desplegado" ? v : "auto";
  } catch {
    return "auto";
  }
}
function suscribir(aviso: () => void) {
  window.addEventListener(EVENTO, aviso);
  window.addEventListener("storage", aviso);
  return () => {
    window.removeEventListener(EVENTO, aviso);
    window.removeEventListener("storage", aviso);
  };
}
function guardarModo(m: Modo) {
  try {
    localStorage.setItem(CLAVE, m);
  } catch {
    // sin almacenamiento: igual funciona mientras la página esté abierta
  }
  window.dispatchEvent(new Event(EVENTO));
}

export default function Sidebar({ usuario, rol }: { usuario: string; rol: Rol }) {
  const rutaActual = usePathname();
  const visibles = paginas.filter((p) => rol === "admin" || !p.soloAdmin);
  const modo = useSyncExternalStore(suscribir, leerModo, () => "auto" as Modo);

  // Clases para lo que se ve SOLO desplegado / SOLO plegado (desde 540 px; abajo de eso, barra superior normal).
  // Escritas completas para que Tailwind las encuentre.
  const EN_AUTO = { block: "sm:hidden lg:block", inline: "sm:hidden lg:inline" } as const;
  const desplegado = (d: "block" | "inline") => (modo === "desplegado" ? "" : modo === "plegado" ? "sm:hidden" : EN_AUTO[d]);
  const plegado = modo === "desplegado" ? "hidden" : modo === "plegado" ? "hidden sm:flex" : "hidden sm:flex lg:hidden";
  const plegadoEnLinea = modo === "desplegado" ? "hidden" : modo === "plegado" ? "hidden sm:inline" : "hidden sm:inline lg:hidden";
  const ancho = modo === "desplegado" ? "sm:w-40 md:w-48 lg:w-64" : modo === "plegado" ? "sm:w-14" : "sm:w-14 lg:w-64";

  // El botón invierte lo que se ve ahora (en "auto" depende del ancho de la pantalla)
  function alternar() {
    const seVeDesplegado = modo === "desplegado" || (modo === "auto" && window.matchMedia("(min-width: 1024px)").matches);
    guardarModo(seVeDesplegado ? "plegado" : "desplegado");
  }

  return (
    <aside
      className={`flex flex-col gap-4 border-b border-black/10 bg-white p-3 transition-[width] sm:sticky sm:top-0 sm:h-screen sm:shrink-0 sm:border-b-0 sm:border-r sm:px-2 lg:p-4 ${ancho}`}
    >
      {/* Logo (desplegado) o letrero "P" (plegado) + botón para plegar / desplegar */}
      <div className="flex items-start justify-between gap-1">
        <div className={`px-2 ${desplegado("block")}`}>
          <Image src="/logo.png" alt="The House Advisory" width={160} height={43} priority className="h-auto w-full max-w-32 lg:max-w-40" />
          <p className="mt-1 text-xs font-semibold tracking-[0.3em] text-acento">PARKING</p>
        </div>
        <span className={`h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-700 text-lg font-black text-white ${plegado}`} title="Parking TheHouse">
          P
        </span>
      </div>
      <button
        onClick={alternar}
        className="hidden items-center justify-center gap-1 rounded-md border border-black/10 py-1 text-[11px] font-semibold text-marca-gris hover:bg-marca/5 sm:flex"
        aria-label="Plegar o desplegar el menú"
        title="Plegar o desplegar el menú"
      >
        <ChevronsLeft size={14} className={desplegado("inline")} />
        <span className={desplegado("inline")}>Plegar</span>
        <ChevronsRight size={14} className={plegadoEnLinea} />
      </button>

      <nav className="flex gap-1 overflow-x-auto sm:flex-col">
        {visibles.map(({ href, nombre, icono: Icono }) => {
          const activa = rutaActual.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={nombre}
              className={`flex items-center gap-2 whitespace-nowrap rounded-md px-2 py-2 text-xs font-medium transition-colors md:text-sm lg:gap-3 lg:px-3 ${
                activa ? "bg-marca text-white" : "text-marca hover:bg-marca/5"
              }`}
            >
              <Icono size={18} className={`shrink-0 ${activa ? "text-acento" : "text-marca-gris"}`} />
              <span className={desplegado("inline")}>{nombre}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto hidden border-t border-black/10 pt-4 sm:block">
        <div className={`truncate px-2 text-xs text-marca-gris ${desplegado("block")}`}>{usuario}</div>
        <div className={`px-2 text-[11px] font-semibold uppercase tracking-wider text-acento ${desplegado("block")}`}>
          {rol === "admin" ? "Admin" : "Usuario"}
        </div>
        <form action="/auth/salir" method="post">
          <button title="Cerrar sesión" className="mt-2 flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm text-marca hover:bg-marca/5">
            <LogOut size={18} className="shrink-0 text-marca-gris" />
            <span className={desplegado("inline")}>Cerrar sesión</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
