"use client";
// Al tomar un puesto con éxito: un auto turquesa (como los del login) maneja desde el puesto que tocaste
// en el calendario hasta su cajón en "Lo tuyo" por un camino curvo, y entra al cajón despacio, de frente hacia arriba.
// desde / hasta = puntos en pantalla (centro del auto). Si la persona pidió menos movimiento, no se muestra.
import { useEffect, useRef } from "react";
import AutoCenital from "@/components/estacionamientos/AutoCenital";

export type Punto = { x: number; y: number };
export type ViajeAuto = { id: number; desde: Punto; hasta: Punto };

// Punto de una curva de Bézier cúbica en t (0 a 1)
function bezier(t: number, p0: Punto, p1: Punto, p2: Punto, p3: Punto): Punto {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

export default function AutoViajero({ viaje, onFin }: { viaje: ViajeAuto; onFin: () => void }) {
  const auto = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = auto.current;
    const fin = onFin; // onFin debe ser estable (useCallback en quien lo usa)
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return fin();
    const { desde, hasta } = viaje;
    const dx = hasta.x - desde.x;
    // Camino curvo: sale hacia abajo y llega desde ABAJO del cajón, así entra derecho hacia arriba
    const c1 = { x: desde.x + dx * 0.15, y: desde.y + 220 };
    const c2 = { x: hasta.x, y: hasta.y + 240 }; // justo debajo del cajón: el último tramo es recto hacia arriba
    const pasos = 40;
    const puntos = Array.from({ length: pasos + 1 }, (_, i) => bezier(i / pasos, desde, c1, c2, hasta));
    // El dibujo del auto mira hacia arriba: se gira según hacia dónde avanza (sin saltos de 360°)
    let previo = 0;
    const giros = puntos.map((_, i) => {
      const sig = puntos[Math.min(i + 1, pasos)];
      const ant = puntos[Math.max(i - 1, 0)];
      let g = (Math.atan2(sig.y - ant.y, sig.x - ant.x) * 180) / Math.PI + 90;
      if (i > 0) while (g - previo > 180) g -= 360;
      if (i > 0) while (g - previo < -180) g += 360;
      return (previo = g);
    });
    const marcos: Keyframe[] = puntos.map((p, i) => {
      return {
        transform: `translate(${p.x - desde.x}px, ${p.y - desde.y}px) rotate(${giros[i]}deg)`,
        opacity: i === 0 ? 0 : 1,
        offset: i / pasos,
      };
    });
    // Arranca con soltura y frena muy despacio al final (entrando al cajón)
    const animacion = el.animate(marcos, { duration: 4500, easing: "cubic-bezier(0.3, 0, 0.1, 1)", fill: "forwards" });
    animacion.onfinish = fin;
    return () => animacion.cancel();
  }, [viaje, onFin]);

  return (
    <div
      ref={auto}
      aria-hidden
      className="pointer-events-none fixed z-50 -ml-3.5 -mt-7"
      style={{ left: viaje.desde.x, top: viaje.desde.y, opacity: 0 }}
    >
      <AutoCenital color="#13a699" className="h-14 drop-shadow-lg" />
    </div>
  );
}
