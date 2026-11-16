"use client";
// Menú lateral: logo, las 3 páginas y (abajo) usuario + cerrar sesión.
// En celular se muestra como barra arriba.
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Car, CalendarDays, Users, LogOut } from "lucide-react";
import type { Rol } from "@/lib/rol";

// soloAdmin: el usuario (rol "usuario") no ve esa página en el menú
const paginas = [
  { href: "/estacionamientos", nombre: "Estacionamientos", icono: Car, soloAdmin: true },
  { href: "/disponibilidad", nombre: "Disponibilidad", icono: CalendarDays, soloAdmin: false },
  { href: "/personas", nombre: "Personas", icono: Users, soloAdmin: true },
];

export default function Sidebar({ usuario, rol }: { usuario: string; rol: Rol }) {
  const rutaActual = usePathname();
  const visibles = paginas.filter((p) => rol === "admin" || !p.soloAdmin);

  return (
    <aside className="flex flex-col gap-4 border-b border-black/10 bg-white p-4 md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:border-b-0 md:border-r">
      <div className="px-2">
        <Image src="/logo.png" alt="The House Advisory" width={160} height={43} priority className="h-auto" />
        <p className="mt-1 text-xs font-semibold tracking-[0.3em] text-acento">PARKING</p>
      </div>

      <nav className="flex gap-1 overflow-x-auto md:flex-col">
        {visibles.map(({ href, nombre, icono: Icono }) => {
          const activa = rutaActual.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                activa ? "bg-marca text-white" : "text-marca hover:bg-marca/5"
              }`}
            >
              <Icono size={18} className={activa ? "text-acento" : "text-marca-gris"} />
              {nombre}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto hidden border-t border-black/10 pt-4 md:block">
        <div className="truncate px-2 text-xs text-marca-gris">{usuario}</div>
        <div className="px-2 text-[11px] font-semibold uppercase tracking-wider text-acento">{rol === "admin" ? "Admin" : "Usuario"}</div>
        <form action="/auth/salir" method="post">
          <button className="mt-2 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-marca hover:bg-marca/5">
            <LogOut size={18} className="text-marca-gris" />
            Cerrar sesión
          </button>
        </form>
      </div>
    </aside>
  );
}
