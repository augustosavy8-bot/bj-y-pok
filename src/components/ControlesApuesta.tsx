"use client";

import { useState } from "react";
import type { Jugador, Mesa, Mano, TipoAccion } from "@/lib/types";
import { montoParaIgualar, minimoParaSubir } from "@/lib/poker/engine";
import { clamp } from "@/lib/utils";

export function ControlesApuesta({
  jugador,
  mesa,
  mano,
  onAccion,
  enviando,
}: {
  jugador: Jugador;
  mesa: Mesa;
  mano: Mano;
  onAccion: (tipo: TipoAccion, monto?: number) => void;
  enviando: boolean;
}) {
  const esMiTurno = mano.turno_jugador_id === jugador.id && jugador.estado === "activo";
  const porIgualar = montoParaIgualar(jugador, mano.apuesta_actual);
  const puedeCheck = porIgualar === 0;
  const maxTotal = jugador.apuesta_ronda + jugador.fichas; // apuesta_ronda máxima alcanzable
  const minSubida = clamp(
    minimoParaSubir(mano.apuesta_actual, mano.ultima_subida, mesa.ciega_grande),
    mano.apuesta_actual + 1,
    maxTotal
  );
  const puedeSubir = maxTotal > mano.apuesta_actual && jugador.fichas > porIgualar;

  const [subirA, setSubirA] = useState(minSubida);

  if (!esMiTurno) {
    return (
      <div className="panel px-4 py-3 text-center text-white/60">
        {jugador.estado === "activo"
          ? "Esperando tu turno…"
          : jugador.estado === "fold"
          ? "Te retiraste de esta mano"
          : jugador.estado === "all_in"
          ? "Estás all-in"
          : "Fuera de juego"}
      </div>
    );
  }

  const valorSlider = clamp(subirA, minSubida, maxTotal);

  return (
    <div className="panel flex flex-col gap-3 p-3">
      <div className="grid grid-cols-2 gap-2">
        <button
          className="btn btn-rojo"
          disabled={enviando}
          onClick={() => onAccion("fold")}
        >
          Retirarse
        </button>
        {puedeCheck ? (
          <button
            className="btn btn-gris"
            disabled={enviando}
            onClick={() => onAccion("check")}
          >
            Pasar
          </button>
        ) : (
          <button
            className="btn btn-verde"
            disabled={enviando || jugador.fichas === 0}
            onClick={() => onAccion("call")}
          >
            Igualar {Math.min(porIgualar, jugador.fichas).toLocaleString("es")}
          </button>
        )}
      </div>

      {puedeSubir && (
        <div className="flex flex-col gap-2 rounded-xl bg-black/20 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/70">
              {mano.apuesta_actual > 0 ? "Subir a" : "Apostar"}
            </span>
            <span className="font-bold tabular-nums text-oro">
              {valorSlider.toLocaleString("es")}
            </span>
          </div>
          <input
            type="range"
            min={minSubida}
            max={maxTotal}
            step={mesa.ciega_chica}
            value={valorSlider}
            onChange={(e) => setSubirA(Number(e.target.value))}
            className="w-full accent-oro"
          />
          <div className="grid grid-cols-4 gap-1.5">
            <button
              className="btn btn-gris !py-1.5 text-xs"
              onClick={() => setSubirA(clamp(minSubida, minSubida, maxTotal))}
            >
              Mín
            </button>
            <button
              className="btn btn-gris !py-1.5 text-xs"
              onClick={() =>
                setSubirA(clamp(mano.pozo + porIgualar, minSubida, maxTotal))
              }
            >
              Pozo
            </button>
            <button
              className="btn btn-gris !py-1.5 text-xs"
              onClick={() =>
                setSubirA(clamp(Math.floor(maxTotal / 2), minSubida, maxTotal))
              }
            >
              ½
            </button>
            <button
              className="btn btn-gris !py-1.5 text-xs"
              onClick={() => setSubirA(maxTotal)}
            >
              Máx
            </button>
          </div>
          <button
            className="btn btn-oro"
            disabled={enviando}
            onClick={() => onAccion("raise", valorSlider)}
          >
            {valorSlider >= maxTotal
              ? "All-in"
              : `${mano.apuesta_actual > 0 ? "Subir a" : "Apostar"} ${valorSlider.toLocaleString("es")}`}
          </button>
        </div>
      )}

      <button
        className="btn btn-gris text-sm"
        disabled={enviando}
        onClick={() => onAccion("all_in")}
      >
        All-in ({jugador.fichas.toLocaleString("es")})
      </button>
    </div>
  );
}
