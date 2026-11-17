import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Script from "next/script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "The House Advisory · Parking",
  description: "Estacionamientos de TheHouse",
};

// En el teléfono la app se ve IGUAL que en el computador (pedido 17-nov-2026): la página se arma con
// 540 px de ancho (antes 1024, 768 y 640: quedaba chico) y el teléfono la achica para que quepa (zoom con dos dedos).
// Para volver a la versión adaptada al teléfono, borrar este bloque.
export const viewport: Viewport = {
  width: 540,
  initialScale: undefined, // sin "initial-scale=1": así el teléfono achica la página para que quepa
};

// Plan B (17-nov-2026): apenas abre la página, se mide el ancho de la pantalla del teléfono y se le dice
// EXACTAMENTE cuánto achicar (ej. 390 ÷ 540 ≈ 0,72), para no depender de que el teléfono lo calcule solo.
// Se repite al girar el teléfono. En pantallas de 540 o más no hace nada.
const ACHICAR_EN_TELEFONO = `(function () {
  function ajustar() {
    var ancho = window.screen.width;
    if (!ancho || ancho >= 540) return;
    var escala = (ancho / 540).toFixed(3);
    var contenido = "width=540, initial-scale=" + escala + ", minimum-scale=" + escala + ", maximum-scale=5";
    var metas = document.querySelectorAll('meta[name="viewport"]');
    if (metas.length === 0) {
      var m = document.createElement("meta");
      m.name = "viewport";
      document.head.appendChild(m);
      metas = [m];
    }
    for (var i = 0; i < metas.length; i++) metas[i].setAttribute("content", contenido);
  }
  ajustar();
  document.addEventListener("DOMContentLoaded", ajustar);
  window.addEventListener("orientationchange", function () { setTimeout(ajustar, 300); });
})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* beforeInteractive: corre antes de que la página se dibuje */}
        <Script id="achicar-en-telefono" strategy="beforeInteractive">
          {ACHICAR_EN_TELEFONO}
        </Script>
        {children}
      </body>
    </html>
  );
}
