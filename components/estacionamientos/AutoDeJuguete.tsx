// Autito de juguete que "maneja" por encima del plano desde el cajón antiguo al nuevo.
// Recorrido en ángulo recto: sale del cajón hacia abajo (al pasillo), avanza de lado y entra al nuevo cajón.
// El auto gira para mirar hacia donde avanza. Acelera al partir y frena al llegar.
import { useLayoutEffect, useRef } from "react";
import AutoCenital from "./AutoCenital";

export type Punto = { x: number; y: number };
export type Viaje = { id: number; numero: string; desde: Punto; hasta: Punto; altoCajon: number; color: string };

const VELOCIDAD = 0.55; // píxeles por milisegundo
const GIRO = 35; // un giro "cuesta" lo mismo que avanzar 35 px

// Hacia dónde mira el auto (el dibujo mira hacia arriba = 0°)
function angulo(a: Punto, b: Punto) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dy) >= Math.abs(dx)) return dy > 0 ? 180 : 0;
  return dx > 0 ? 90 : -90;
}

// Gira por el lado más corto (ej. de 180° a -90° gira 90°, no 270°)
function girarCorto(anterior: number, nuevo: number) {
  let n = nuevo;
  while (n - anterior > 180) n -= 360;
  while (n - anterior < -180) n += 360;
  return n;
}

export default function AutoDeJuguete({ viaje, onLlegar }: { viaje: Viaje; onLlegar: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  // Guarda el aviso de llegada sin reiniciar la animación cada vez que el plano se redibuja
  const llegar = useRef(onLlegar);
  useLayoutEffect(() => {
    llegar.current = onLlegar;
  });

  // useLayoutEffect: parte antes de pintar, así el auto no aparece un instante en la esquina
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { desde: a, hasta: b } = viaje;
    const pasillo = { x: a.x, y: a.y + viaje.altoCajon / 2 + 16 }; // justo bajo el cajón
    const esquina = { x: b.x, y: pasillo.y };
    const puntos = [a, pasillo, esquina, b];

    // Arma los "fotogramas clave": posición, giro y cuánto lleva recorrido
    const fotos: { p: Punto; ang: number; d: number }[] = [];
    let recorrido = 0;
    let ang: number | null = null;
    for (let i = 0; i < puntos.length - 1; i++) {
      const [p, q] = [puntos[i], puntos[i + 1]];
      const largo = Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
      if (largo < 2) continue; // tramo sin movimiento
      const nuevo = angulo(p, q);
      if (ang === null) {
        ang = nuevo;
        fotos.push({ p, ang, d: 0 });
      } else if (nuevo !== ang) {
        ang = girarCorto(ang, nuevo);
        recorrido += GIRO;
        fotos.push({ p, ang, d: recorrido });
      }
      recorrido += largo;
      fotos.push({ p: q, ang, d: recorrido });
    }
    if (fotos.length < 2) return llegar.current();

    const animacion = el.animate(
      fotos.map((f) => ({
        transform: `translate(${f.p.x}px, ${f.p.y}px) translate(-50%, -50%) rotate(${f.ang}deg)`,
        offset: f.d / recorrido,
      })),
      { duration: Math.min(2800, Math.max(1000, recorrido / VELOCIDAD)), easing: "ease-in-out", fill: "forwards" },
    );
    animacion.onfinish = () => llegar.current();
    return () => animacion.cancel();
  }, [viaje]);

  return (
    <div ref={ref} className="pointer-events-none absolute left-0 top-0 z-40 w-8 drop-shadow-[0_6px_6px_rgba(0,0,0,0.45)]">
      <AutoCenital color={viaje.color} className="w-8" />
    </div>
  );
}
