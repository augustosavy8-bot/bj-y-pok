"use client";

import type { Palo, Valor } from "@/lib/types";
import { SIMBOLO_PALO, esPaloRojo } from "@/lib/poker/cards";

// Cartas estilo Nocturne: cara clara, índices en esquina + un palo grande al
// centro. Los palos "rojos" (corazón/diamante) se dibujan en violeta (accent),
// no rojo, para respetar la paleta del sistema.
const CARD_W = 100;
const CARD_H = 140;
const ROJO = "#796cbf"; // accent-600
const NEGRO = "#292b31"; // neutral-900
const FONT = { fontFamily: "var(--font-inter), ui-sans-serif, sans-serif" } as const;

const TAMANOS = {
  sm: { w: 44, className: "rounded-md" },
  md: { w: 66, className: "rounded-lg" },
  lg: { w: 97, className: "rounded-xl" },
} as const;

export function Carta({
  valor,
  palo,
  size = "md",
  nueva = false,
}: {
  valor: Valor;
  palo: Palo;
  size?: keyof typeof TAMANOS;
  nueva?: boolean;
}) {
  const { w, className } = TAMANOS[size];
  const h = Math.round((w * CARD_H) / CARD_W);
  const color = esPaloRojo(palo) ? ROJO : NEGRO;
  const s = SIMBOLO_PALO[palo];

  const esquina = (
    <>
      <text x="8" y="25" fontSize="19" fontWeight="600" textAnchor="start" fill={color} style={FONT}>
        {valor}
      </text>
      <text x="9" y="41" fontSize="15" textAnchor="start" fill={color}>
        {s}
      </text>
    </>
  );

  return (
    <svg
      viewBox={`0 0 ${CARD_W} ${CARD_H}`}
      width={w}
      height={h}
      className={`${className} select-none ${nueva ? "animate-card-in" : ""}`}
      style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.45))" }}
    >
      <rect x="1" y="1" width="98" height="138" rx="9" fill="#f3f5fe" stroke="#cfd3e5" strokeWidth="1" />
      {esquina}
      <text x="50" y="86" fontSize="50" textAnchor="middle" fill={color}>
        {s}
      </text>
      <g transform="translate(100 140) rotate(180)">{esquina}</g>
    </svg>
  );
}

export function DorsoCarta({ size = "md" }: { size?: keyof typeof TAMANOS }) {
  const { w, className } = TAMANOS[size];
  const h = Math.round((w * CARD_H) / CARD_W);
  const patId = `dorso-${size}`;
  return (
    <svg
      viewBox="0 0 100 140"
      width={w}
      height={h}
      className={`${className} select-none`}
      style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.45))" }}
    >
      <defs>
        <pattern id={patId} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="7" height="7" fill="#2b2741" />
          <rect width="3" height="7" fill="#968ae0" fillOpacity="0.5" />
        </pattern>
      </defs>
      <rect x="1" y="1" width="98" height="138" rx="9" fill="#2b2741" stroke="#595d6c" strokeWidth="1" />
      <rect x="6" y="6" width="88" height="128" rx="6" fill={`url(#${patId})`} stroke="#5d5294" strokeOpacity="0.6" strokeWidth="1" />
    </svg>
  );
}

export function EspacioCarta({ size = "md" }: { size?: keyof typeof TAMANOS }) {
  const { w, className } = TAMANOS[size];
  const h = Math.round((w * CARD_H) / CARD_W);
  return (
    <div
      style={{ width: w, height: h }}
      className={`border-2 border-dashed border-white/15 ${className}`}
    />
  );
}
