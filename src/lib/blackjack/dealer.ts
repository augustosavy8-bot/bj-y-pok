import type { Valor } from "@/lib/types";
import type { Soft17Regla } from "@/lib/blackjack/types";
import { evaluarMano } from "@/lib/blackjack/hand";

/**
 * Regla del dealer: ¿debe pedir carta?
 * - < 17: siempre pide.
 * - > 17: siempre se planta.
 * - = 17 duro: se planta.
 * - = 17 blando (soft 17): depende de la config.
 */
export function dealerDebePedir(
  cartas: { valor: Valor }[],
  soft17: Soft17Regla
): boolean {
  const e = evaluarMano(cartas);
  if (e.es_bust) return false;
  if (e.valor < 17) return true;
  if (e.valor > 17) return false;
  // valor === 17
  if (e.es_soft) return soft17 === "dealer_pide";
  return false;
}
