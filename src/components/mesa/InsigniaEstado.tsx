"use client";

import type { EstadoJugador } from "@/lib/types";

// Insignia de estado del jugador: fold, all-in, eliminado. Activo no muestra nada.
export function InsigniaEstado({ estado }: { estado: EstadoJugador }) {
  if (estado === "fold") {
    return (
      <span className="rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white/50">
        FOLD
      </span>
    );
  }
  if (estado === "all_in") {
    return (
      <span className="rounded-full bg-oro/20 px-2 py-0.5 text-[10px] font-bold tracking-wide text-oro ring-1 ring-oro/50">
        ALL-IN
      </span>
    );
  }
  if (estado === "eliminado") {
    return (
      <span className="rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white/40">
        FUERA
      </span>
    );
  }
  return null;
}
