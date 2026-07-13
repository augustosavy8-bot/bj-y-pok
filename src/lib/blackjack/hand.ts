import type { Valor } from "@/lib/types";
import type { EvaluacionMano } from "@/lib/blackjack/types";

// Valor base de una carta para blackjack (As = 1, se ajusta a 11 aparte).
export function valorBaseCarta(valor: Valor): number {
  if (valor === "A") return 1;
  if (valor === "J" || valor === "Q" || valor === "K" || valor === "10") return 10;
  return parseInt(valor, 10);
}

/**
 * Evalúa una mano de blackjack.
 * - valor_duro: suma con todos los ases valiendo 1.
 * - valor: mejor total jugable (sube un As a 11 si no se pasa).
 * - es_soft: usa un As como 11.
 * - es_blackjack: 21 con exactamente 2 cartas.
 * - es_bust: valor_duro > 21.
 */
export function evaluarMano(cartas: { valor: Valor }[]): EvaluacionMano {
  let total = 0;
  let ases = 0;
  for (const c of cartas) {
    if (c.valor === "A") ases++;
    total += valorBaseCarta(c.valor);
  }

  const valorDuro = total;
  let valor = total;
  let soft = false;
  // Subir un solo As a 11 si no revienta (11 = 1 + 10).
  if (ases > 0 && total + 10 <= 21) {
    valor = total + 10;
    soft = true;
  }

  return {
    valor_duro: valorDuro,
    valor,
    es_soft: soft,
    es_blackjack: cartas.length === 2 && valor === 21,
    es_bust: valorDuro > 21,
    cantidad_cartas: cartas.length,
  };
}

/** ¿Las 2 primeras cartas son del mismo valor de blackjack? (para split) */
export function puedeHacerSplit(cartas: { valor: Valor }[]): boolean {
  if (cartas.length !== 2) return false;
  return valorBaseCarta(cartas[0].valor) === valorBaseCarta(cartas[1].valor);
}

/** ¿Son un par de Ases? (regla especial: 1 sola carta por mano tras split) */
export function esParDeAses(cartas: { valor: Valor }[]): boolean {
  return cartas.length === 2 && cartas[0].valor === "A" && cartas[1].valor === "A";
}
