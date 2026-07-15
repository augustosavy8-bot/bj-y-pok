"use client";

import type { Carta, Mano } from "@/lib/types";
import { Carta as CartaVisual, EspacioCarta } from "@/components/Carta";
import { CartaEditable } from "@/components/EdicionCarta";
import { FichasMonto } from "@/components/Ficha";

const NOMBRE_FASE: Record<string, string> = {
  pre_reparto: "Repartiendo",
  preflop: "Pre-flop",
  flop: "Flop",
  turn: "Turn",
  river: "River",
  showdown: "Showdown",
  terminada: "Mano terminada",
};

export function MesaComunitaria({
  mano,
  comunitarias,
  onEditarCarta,
}: {
  mano: Mano | null;
  comunitarias: Carta[];
  // Si se provee (vista crupier), las cartas muestran botón de corrección.
  onEditarCarta?: (c: Carta) => void;
}) {
  const slots = 5;
  const ordenadas = [...comunitarias].sort((a, b) => a.orden_escaneo - b.orden_escaneo);

  return (
    <div className="flex flex-col items-center gap-2.5">
      <span className="rounded-full bg-black/30 px-3 py-1 text-xs font-medium tracking-wide text-oro">
        {mano ? NOMBRE_FASE[mano.fase] : "Esperando"}
      </span>
      <div className="flex gap-2">
        {Array.from({ length: slots }).map((_, i) => {
          const c = ordenadas[i];
          if (!c) return <EspacioCarta key={i} size="md" />;
          return onEditarCarta ? (
            <CartaEditable key={c.id} carta={c} size="md" onEditar={onEditarCarta} />
          ) : (
            <CartaVisual key={c.id} valor={c.valor} palo={c.palo} size="md" nueva />
          );
        })}
      </div>
      {mano && (
        <div className="flex items-center gap-2 rounded-full bg-black/35 px-3 py-1.5 text-sm">
          <span className="text-white/60">Pozo</span>
          <span className="text-base">
            <FichasMonto monto={mano.pozo} />
          </span>
        </div>
      )}
    </div>
  );
}
