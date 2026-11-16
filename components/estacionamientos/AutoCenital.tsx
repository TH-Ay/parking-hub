// Silueta de un auto visto desde arriba (SVG simple).
export default function AutoCenital({ color = "#e8766b", className = "" }: { color?: string; className?: string }) {
  return (
    <svg viewBox="0 0 60 110" className={className} aria-hidden="true">
      {/* ruedas */}
      <rect x="3" y="18" width="7" height="16" rx="2" fill="#1f2328" />
      <rect x="50" y="18" width="7" height="16" rx="2" fill="#1f2328" />
      <rect x="3" y="76" width="7" height="16" rx="2" fill="#1f2328" />
      <rect x="50" y="76" width="7" height="16" rx="2" fill="#1f2328" />
      {/* carrocería */}
      <rect x="7" y="4" width="46" height="102" rx="14" fill={color} />
      {/* parabrisas, techo y vidrio trasero */}
      <path d="M13 30 Q30 22 47 30 L44 42 Q30 38 16 42 Z" fill="#20303a" opacity="0.85" />
      <rect x="15" y="44" width="30" height="30" rx="5" fill="#000" opacity="0.12" />
      <path d="M16 78 Q30 82 44 78 L46 88 Q30 93 14 88 Z" fill="#20303a" opacity="0.85" />
      {/* focos */}
      <rect x="12" y="6" width="9" height="4" rx="2" fill="#fff6d6" />
      <rect x="39" y="6" width="9" height="4" rx="2" fill="#fff6d6" />
    </svg>
  );
}
