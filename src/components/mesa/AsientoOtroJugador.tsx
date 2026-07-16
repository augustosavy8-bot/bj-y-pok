"use client";

import type { Carta, EstadoJugador } from "@/lib/types";
import { DorsoCarta } from "@/components/Carta";
import { CartaFlip } from "@/components/mesa/CartaFlip";
import { Ficha, FichasMonto } from "@/components/Ficha";
import { AroTurno } from "@/components/mesa/AroTurno";
import { InsigniaEstado } from "@/components/mesa/InsigniaEstado";

// Un asiento del arco superior (los jugadores que no soy yo).
export function AsientoOtroJugador({
  nombre,
  fichas,
  apuesta = 0,
  estado,
  esTurno,
  esDealer = false,
  holeCards = 2,
  cartasReveladas,
}: {
  nombre: string;
  fichas: number;
  apuesta?: number;
  estado: EstadoJugador;
  esTurno: boolean;
  esDealer?: boolean;
  // Cuántas cartas hole tiene repartidas (para mostrar dorsos).
  holeCards?: number;
  // Si están reveladas (showdown), se muestran boca arriba.
  cartasReveladas?: Carta[];
}) {
  const apagado = estado === "fold" || estado === "eliminado";
  const inicial = nombre.trim().charAt(0).toUpperCase() || "?";

  return (
    <AroTurno activo={esTurno} className={`p-1.5 ${apagado ? "opacity-45" : ""}`}>
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center justify-center gap-1">
          <MiniCarta lado="izq" revelada={cartasReveladas?.[0]} visible={holeCards > 0} />
          <div
            className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 bg-gradient-to-b from-fieltro-light to-fieltro-dark text-base font-bold text-crema shadow-asiento ${
              esTurno ? "border-oro" : "border-white/15"
            }`}
          >
            {inicial}
            {esDealer && (
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-black/40 bg-white text-[9px] font-bold text-black">
                D
              </span>
            )}
          </div>
          <MiniCarta lado="der" revelada={cartasReveladas?.[1]} visible={holeCards > 1} />
        </div>

        <div className="max-w-[6.5rem] truncate text-center text-xs font-medium text-crema/90">
          {nombre}
        </div>
        <FichasMonto monto={fichas} />
        {apuesta > 0 && (
          <div className="flex items-center gap-1 text-[11px] text-oro/90">
            <Ficha monto={apuesta} size={14} />
            {apuesta.toLocaleString("es")}
          </div>
        )}
        <InsigniaEstado estado={estado} />
      </div>
    </AroTurno>
  );
}

function MiniCarta({
  lado,
  visible,
  revelada,
}: {
  lado: "izq" | "der";
  visible: boolean;
  revelada?: Carta;
}) {
  if (!visible) return <div className="w-5" />;
  const rot = lado === "izq" ? "-rotate-6" : "rotate-6";
  if (revelada) {
    // Showdown: la carta se da vuelta del dorso a la cara.
    return (
      <div className={rot}>
        <CartaFlip valor={revelada.valor} palo={revelada.palo} size="sm" flip delay={lado === "der" ? 0.2 : 0} />
      </div>
    );
  }
  return (
    <div className={`scale-[0.62] ${rot}`}>
      <DorsoCarta size="sm" />
    </div>
  );
}
