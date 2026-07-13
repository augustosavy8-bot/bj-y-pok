import type { Valor, Palo } from "@/lib/types";

export type EstadoRondaBJ =
  | "apuestas"
  | "reparto_inicial"
  | "turnos_jugadores"
  | "turno_dealer"
  | "pagos"
  | "terminada";

export type EstadoManoBJ =
  | "apostando"
  | "jugando"
  | "plantado"
  | "pasado"
  | "blackjack"
  | "rendido";

export type ResultadoBJ = "gana" | "pierde" | "empate" | "blackjack" | "rendido";
export type Soft17Regla = "dealer_para" | "dealer_pide";
export type BlackjackPago = "3_a_2" | "6_a_5";
export type RotacionBanca =
  | "por_mano"
  | "cada_5"
  | "cada_10"
  | "hasta_fundirse"
  | "fija";
export type AccionBJ = "hit" | "stand" | "double" | "split" | "surrender";

export interface BJConfig {
  id: string;
  mesa_id: string;
  cantidad_mazos: number;
  barajar_cada_manos: number;
  soft_17_regla: Soft17Regla;
  blackjack_pago: BlackjackPago;
  permite_double_after_split: boolean;
  permite_surrender: boolean;
  permite_insurance: boolean;
  rotacion_banca: RotacionBanca;
  banca_fija_jugador_id: string | null;
  max_split_hands: number;
  apuesta_min: number;
  apuesta_max: number;
  segundos_por_turno: number;
  orden_banca: string[];
  created_at: string;
}

export interface BJShoe {
  mesa_id: string;
  cantidad_mazos: number;
  cartas_repartidas: number;
  manos_desde_barajado: number;
  ultimo_barajado_at: string;
}

export interface BJRonda {
  id: string;
  mesa_id: string;
  numero_ronda: number;
  banca_jugador_id: string | null;
  estado: EstadoRondaBJ;
  turno_mano_id: string | null;
  turno_expira_at: string | null;
  hole_revelada: boolean;
  fase_seguro: boolean;
  created_at: string;
}

export interface BJManoJugador {
  id: string;
  ronda_id: string;
  jugador_id: string;
  orden_asiento: number;
  apuesta_fichas: number;
  seguro_fichas: number | null;
  doblada: boolean;
  estado_mano: EstadoManoBJ;
  es_split_de: string | null;
  orden_mano: number;
  created_at: string;
}

export interface BJCarta {
  id: string;
  ronda_id: string;
  mano_jugador_id: string | null;
  es_carta_dealer: boolean;
  es_hole_card: boolean;
  revelada: boolean;
  valor: Valor;
  palo: Palo;
  orden_recibida: number;
  created_at: string;
}

export interface BJResultado {
  id: string;
  mano_jugador_id: string;
  resultado: ResultadoBJ;
  fichas_ganadas_o_perdidas: number;
  valor_final_mano: number;
  created_at: string;
}

export interface BJBancaBalance {
  id: string;
  ronda_id: string;
  banca_jugador_id: string | null;
  fichas_al_inicio: number;
  fichas_al_final: number;
  delta: number;
  created_at: string;
}

export interface EvaluacionMano {
  valor_duro: number; // todos los ases como 1
  valor: number; // mejor valor jugable (<=21 si se puede)
  es_soft: boolean;
  es_blackjack: boolean; // 21 natural con 2 cartas
  es_bust: boolean; // > 21
  cantidad_cartas: number;
}
