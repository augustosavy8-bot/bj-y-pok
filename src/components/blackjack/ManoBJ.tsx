"use client";

import type { BJCarta, BJManoJugador } from "@/lib/blackjack/types";
import { Carta as CartaVisual, DorsoCarta } from "@/components/Carta";
import { evaluarMano } from "@/lib/blackjack/hand";

const TAMANO = { sm: "sm", md: "md", lg: "lg" } as const;

function etiquetaValor(cartas: { valor: BJCarta["valor"] }[], estado?: string): string {
  if (cartas.length === 0) return "";
  const e = evaluarMano(cartas);
  if (estado === "rendido") return "Se rindió";
  if (e.es_bust) return `${e.valor_duro} — se pasó`;
  if (e.es_blackjack) return "Blackjack!";
  if (e.es_soft && e.valor !== e.valor_duro) return `${e.valor_duro}/${e.valor}`;
  return `${e.valor}`;
}

export function ManoBJ({
  cartas,
  mano,
  size = "md",
  destacada = false,
  etiqueta,
}: {
  cartas: BJCarta[];
  mano?: BJManoJugador;
  size?: keyof typeof TAMANO;
  destacada?: boolean;
  etiqueta?: string;
}) {
  const orden = [...cartas].sort((a, b) => a.orden_recibida - b.orden_recibida);
  const val = etiquetaValor(orden, mano?.estado_mano);

  return (
    <div
      className={`flex flex-col items-center gap-1 rounded-xl p-2 ${
        destacada ? "ring-2 ring-oro animate-turn-pulse" : ""
      }`}
    >
      {etiqueta && <div className="text-xs text-white/70">{etiqueta}</div>}
      <div className="flex gap-1.5">
        {orden.length > 0 ? (
          orden.map((c) => (
            <CartaVisual key={c.id} valor={c.valor} palo={c.palo} size={size} nueva />
          ))
        ) : (
          <DorsoCarta size={size} />
        )}
      </div>
      <div className="flex items-center gap-2 text-sm">
        {val && <span className="font-bold text-oro">{val}</span>}
        {mano && mano.apuesta_fichas > 0 && (
          <span className="text-white/60">
            ${mano.apuesta_fichas.toLocaleString("es")}
            {mano.doblada ? " (x2)" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

// Mano del dealer: muestra la upcard y, si la hole sigue oculta, un dorso.
export function ManoDealer({
  cartas,
  holeRevelada,
  verHole = false,
  destacada = false,
}: {
  cartas: BJCarta[];
  holeRevelada: boolean;
  // Crupier y banca ven siempre la hole card (aunque no esté revelada al resto).
  verHole?: boolean;
  destacada?: boolean;
}) {
  const orden = [...cartas].sort((a, b) => a.orden_recibida - b.orden_recibida);
  const mostrarTodo = holeRevelada || verHole;
  // Las cartas que llegan por RLS: si la hole está oculta y no soy crupier/banca,
  // no la recibo → la simulo con un dorso.
  const visibles = mostrarTodo ? orden : orden.filter((c) => c.revelada);
  const ocultas = orden.length - visibles.length;
  const faltaHole = !mostrarTodo && ocultas === 0 && visibles.length === 1;

  const val = mostrarTodo
    ? etiquetaValor(orden)
    : visibles.length
    ? `${evaluarMano(visibles).valor}+`
    : "";

  return (
    <div
      className={`flex flex-col items-center gap-1 rounded-xl p-2 ${
        destacada ? "ring-2 ring-oro" : ""
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-white/60">Dealer (banca)</div>
      <div className="flex gap-1.5">
        {visibles.map((c) => (
          <CartaVisual key={c.id} valor={c.valor} palo={c.palo} size="md" />
        ))}
        {(ocultas > 0 || faltaHole) && <DorsoCarta size="md" />}
      </div>
      {val && <span className="text-sm font-bold text-oro">{val}</span>}
    </div>
  );
}
