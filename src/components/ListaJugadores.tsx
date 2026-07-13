"use client";

import type { Jugador, Mesa, Mano } from "@/lib/types";
import { FichasMonto } from "@/components/Ficha";

const ETIQUETA_ESTADO: Record<string, string> = {
  fold: "Se retiró",
  all_in: "ALL-IN",
  eliminado: "Eliminado",
  activo: "",
};

export function ListaJugadores({
  jugadores,
  mesa,
  mano,
  miId,
}: {
  jugadores: Jugador[];
  mesa: Mesa;
  mano: Mano | null;
  miId?: string;
}) {
  const players = jugadores
    .filter((j) => !j.es_crupier)
    .sort((a, b) => a.posicion - b.posicion);

  return (
    <div className="grid gap-2">
      {players.map((j) => {
        const esTurno = mano?.turno_jugador_id === j.id;
        const esDealer = mesa.dealer_position === j.posicion;
        const soy = j.id === miId;
        return (
          <div
            key={j.id}
            className={`panel flex items-center justify-between px-3 py-2 ${
              esTurno ? "ring-2 ring-oro animate-turn-pulse" : ""
            } ${j.estado === "fold" ? "opacity-50" : ""}`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {esDealer && (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-bold text-black">
                  D
                </span>
              )}
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {j.nombre}
                  {soy && <span className="text-oro"> (vos)</span>}
                </div>
                {j.apuesta_ronda > 0 && (
                  <div className="text-xs text-white/60">
                    apuesta: {j.apuesta_ronda.toLocaleString("es")}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end shrink-0">
              <FichasMonto monto={j.fichas} />
              {ETIQUETA_ESTADO[j.estado] && (
                <span
                  className={`text-[11px] font-bold ${
                    j.estado === "all_in" ? "text-oro" : "text-white/50"
                  }`}
                >
                  {ETIQUETA_ESTADO[j.estado]}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
