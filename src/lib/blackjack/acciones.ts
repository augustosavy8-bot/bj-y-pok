import type { Valor } from "@/lib/types";
import type { BJConfig } from "@/lib/blackjack/types";
import { evaluarMano, puedeHacerSplit } from "@/lib/blackjack/hand";

export interface AccionesDisponibles {
  hit: boolean;
  stand: boolean;
  double: boolean;
  split: boolean;
  surrender: boolean;
}

/**
 * Acciones legales para una mano en curso. Se usa tanto en el cliente
 * (mostrar botones) como en el servidor (validar).
 */
export function accionesDisponibles(params: {
  cartas: { valor: Valor }[];
  apuesta: number;
  fichas: number; // fichas disponibles del jugador
  esSplit: boolean;
  manosDelAsiento: number; // cuántas manos tiene ya este asiento (para max split)
  config: BJConfig;
}): AccionesDisponibles {
  const { cartas, apuesta, fichas, esSplit, manosDelAsiento, config } = params;
  const e = evaluarMano(cartas);
  const enJuego = !e.es_bust && cartas.length >= 2;
  const primeraDecision = cartas.length === 2;

  const double =
    primeraDecision &&
    fichas >= apuesta &&
    (esSplit ? config.permite_double_after_split : true);

  const split =
    primeraDecision &&
    puedeHacerSplit(cartas) &&
    manosDelAsiento < config.max_split_hands &&
    fichas >= apuesta;

  const surrender =
    config.permite_surrender && primeraDecision && !esSplit;

  return {
    hit: enJuego,
    stand: enJuego,
    double,
    split,
    surrender,
  };
}
