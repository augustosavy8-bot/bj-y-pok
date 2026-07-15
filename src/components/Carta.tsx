"use client";

import type { Palo, Valor } from "@/lib/types";

// Mazo vectorial real (Chris Aguilar / svg-cards, licencia LGPL). El sprite se
// sirve desde /public y cada carta se instancia con <use href>. Aspect ratio
// nativo del mazo: 169.075 × 244.640.
const CARD_W = 169.075;
const CARD_H = 244.64;

const TAMANOS = {
  sm: { w: 44, className: "rounded-md" },
  md: { w: 66, className: "rounded-lg" },
  lg: { w: 97, className: "rounded-xl" },
} as const;

const PALO_ID: Record<Palo, string> = {
  corazones: "heart",
  diamantes: "diamond",
  treboles: "club",
  picas: "spade",
};

const VALOR_ID: Record<Valor, string> = {
  A: "1", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7",
  "8": "8", "9": "9", "10": "10", J: "jack", Q: "queen", K: "king",
};

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
  const id = `${PALO_ID[palo]}_${VALOR_ID[valor]}`;

  return (
    <svg
      viewBox={`0 0 ${CARD_W} ${CARD_H}`}
      width={w}
      height={h}
      className={`${className} shadow-carta select-none ${nueva ? "animate-card-in" : ""}`}
    >
      <use href={`/svg-cards.svg#${id}`} />
    </svg>
  );
}

export function DorsoCarta({ size = "md" }: { size?: keyof typeof TAMANOS }) {
  const { w, className } = TAMANOS[size];
  const h = Math.round((w * CARD_H) / CARD_W);
  const patId = `dorso-${size}`;
  return (
    <svg viewBox="0 0 100 140" width={w} height={h} className={`${className} shadow-carta select-none`}>
      <defs>
        <pattern id={patId} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="10" height="10" fill="#241a12" />
          <rect width="5" height="10" fill="#2f2115" />
        </pattern>
      </defs>
      <rect x="1.5" y="1.5" width="97" height="137" rx="9" fill="#150f0a" stroke="#3a2a1c" strokeWidth="1.2" />
      <rect x="7" y="7" width="86" height="126" rx="6" fill={`url(#${patId})`} stroke="#e0b64d" strokeOpacity="0.55" strokeWidth="1.5" />
      <rect x="7" y="7" width="86" height="126" rx="6" fill="none" stroke="#e0b64d" strokeOpacity="0.22" strokeWidth="5" />
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
