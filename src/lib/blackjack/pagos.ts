import type { BlackjackPago, EstadoManoBJ, EvaluacionMano, ResultadoBJ } from "@/lib/blackjack/types";

export interface PagoMano {
  resultado: ResultadoBJ;
  delta: number; // fichas signed (incluye seguro), a aplicar en pagos
  valor_final: number;
}

const MULT_BLACKJACK: Record<BlackjackPago, number> = {
  "3_a_2": 1.5,
  "6_a_5": 1.2,
};

/**
 * Calcula el resultado y el delta de fichas de UNA mano de jugador contra
 * la mano final del dealer. No deduce apuestas por adelantado: el delta ya
 * es el ajuste neto que se aplica en la fase de pagos (incluye el seguro).
 */
export function calcularPagoMano(params: {
  jugador: EvaluacionMano;
  dealer: EvaluacionMano;
  estadoMano: EstadoManoBJ;
  apuesta: number; // apuesta base
  doblada: boolean;
  esSplit: boolean; // si viene de un split → un 21 no es blackjack natural
  seguro: number | null;
  blackjackPago: BlackjackPago;
}): PagoMano {
  const { jugador, dealer, estadoMano, apuesta, doblada, esSplit, seguro, blackjackPago } = params;

  const apuestaEfectiva = doblada ? apuesta * 2 : apuesta;
  const valorFinal = jugador.es_bust ? jugador.valor_duro : jugador.valor;

  // Seguro (se resuelve siempre, gane o pierda la mano principal).
  let seguroNet = 0;
  if (seguro && seguro > 0) {
    seguroNet = dealer.es_blackjack ? 2 * seguro : -seguro;
  }

  // Blackjack natural del jugador: sólo si NO es una mano de split.
  const jugadorBJ = estadoMano === "blackjack" && !esSplit;
  const dealerBJ = dealer.es_blackjack;

  let resultado: ResultadoBJ;
  let baseDelta: number;

  if (estadoMano === "rendido") {
    resultado = "rendido";
    baseDelta = -apuesta / 2;
  } else if (estadoMano === "pasado" || jugador.es_bust) {
    resultado = "pierde";
    baseDelta = -apuestaEfectiva;
  } else if (jugadorBJ && dealerBJ) {
    resultado = "empate";
    baseDelta = 0;
  } else if (jugadorBJ) {
    resultado = "blackjack";
    baseDelta = MULT_BLACKJACK[blackjackPago] * apuesta;
  } else if (dealerBJ) {
    resultado = "pierde";
    baseDelta = -apuestaEfectiva;
  } else if (dealer.es_bust) {
    resultado = "gana";
    baseDelta = apuestaEfectiva;
  } else if (jugador.valor > dealer.valor) {
    resultado = "gana";
    baseDelta = apuestaEfectiva;
  } else if (jugador.valor < dealer.valor) {
    resultado = "pierde";
    baseDelta = -apuestaEfectiva;
  } else {
    resultado = "empate";
    baseDelta = 0;
  }

  const delta = Math.round(baseDelta) + seguroNet;
  return { resultado, delta, valor_final: valorFinal };
}
