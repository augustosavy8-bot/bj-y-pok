"use client";

import type { Palo, Valor } from "@/lib/types";
import { SIMBOLO_PALO, esPaloRojo } from "@/lib/poker/cards";

const TAMANOS = {
  sm: "w-11 h-16 text-base rounded-md",
  md: "w-16 h-24 text-2xl rounded-lg",
  lg: "w-24 h-36 text-4xl rounded-xl",
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
  const rojo = esPaloRojo(palo);
  const simbolo = SIMBOLO_PALO[palo];
  const color = rojo ? "text-red-600" : "text-neutral-900";

  return (
    <div
      className={`relative flex flex-col justify-between bg-carta shadow-carta select-none ${TAMANOS[size]} ${
        nueva ? "animate-card-in" : ""
      }`}
    >
      <div className={`absolute left-1 top-0.5 leading-none font-bold ${color}`}>
        <div>{valor}</div>
        <div className="text-[0.7em] -mt-0.5">{simbolo}</div>
      </div>
      <div className={`flex-1 flex items-center justify-center ${color}`}>
        <span className="text-[1.6em] leading-none">{simbolo}</span>
      </div>
      <div
        className={`absolute right-1 bottom-0.5 leading-none font-bold rotate-180 ${color}`}
      >
        <div>{valor}</div>
        <div className="text-[0.7em] -mt-0.5">{simbolo}</div>
      </div>
    </div>
  );
}

export function DorsoCarta({ size = "md" }: { size?: keyof typeof TAMANOS }) {
  return (
    <div
      className={`flex items-center justify-center bg-gradient-to-br from-red-800 to-red-950 border-2 border-white/70 shadow-carta ${TAMANOS[size]}`}
    >
      <div className="w-2/3 h-2/3 rounded border border-white/30 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.12)_0_4px,transparent_4px_8px)]" />
    </div>
  );
}

export function EspacioCarta({ size = "md" }: { size?: keyof typeof TAMANOS }) {
  return (
    <div
      className={`border-2 border-dashed border-white/15 ${TAMANOS[size]}`}
    />
  );
}
