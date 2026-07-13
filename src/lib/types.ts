// Tipos compartidos del dominio (espejo de las tablas de Supabase)

export type EstadoMesa = "esperando" | "jugando" | "terminada";
export type EstadoJugador = "activo" | "fold" | "all_in" | "eliminado";
export type FaseMano =
  | "pre_reparto"
  | "preflop"
  | "flop"
  | "turn"
  | "river"
  | "showdown"
  | "terminada";
export type TipoCarta = "hole" | "comunitaria";
export type Palo = "corazones" | "diamantes" | "treboles" | "picas";
export type Valor =
  | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10"
  | "J" | "Q" | "K" | "A";
export type TipoAccion = "fold" | "check" | "call" | "raise" | "all_in" | "blind";

export type TipoJuego = "poker_holdem" | "blackjack";

export interface Mesa {
  id: string;
  codigo_sala: string;
  estado: EstadoMesa;
  tipo_juego: TipoJuego;
  ciega_chica: number;
  ciega_grande: number;
  fichas_iniciales: number;
  dealer_position: number;
  es_practica: boolean;
  created_at: string;
}

export interface Jugador {
  id: string;
  mesa_id: string;
  auth_uid: string | null;
  nombre: string;
  fichas: number;
  posicion: number;
  estado: EstadoJugador;
  es_crupier: boolean;
  apuesta_ronda: number;
  total_apostado_mano: number;
  ha_actuado: boolean;
  total_comprado: number;
  created_at: string;
}

export interface Mano {
  id: string;
  mesa_id: string;
  numero_mano: number;
  fase: FaseMano;
  pozo: number;
  apuesta_actual: number;
  ultima_subida: number;
  turno_jugador_id: string | null;
  ultimo_agresor_id: string | null;
  ganador_id: string | null;
  resultado: ResultadoShowdown | null;
  created_at: string;
}

export interface Carta {
  id: string;
  mano_id: string;
  valor: Valor;
  palo: Palo;
  tipo: TipoCarta;
  jugador_id: string | null;
  orden_escaneo: number;
  created_at: string;
}

export interface Accion {
  id: string;
  mano_id: string;
  jugador_id: string;
  tipo: TipoAccion;
  monto: number;
  fase: "preflop" | "flop" | "turn" | "river" | null;
  created_at: string;
}

export interface CorreccionCarta {
  id: string;
  carta_id: string;
  valor_anterior: Valor;
  palo_anterior: Palo;
  valor_nuevo: Valor;
  palo_nuevo: Palo;
  corregida_por_auth_uid: string | null;
  created_at: string;
}

export interface LecturaCarta {
  valor: Valor;
  palo: Palo;
  confianza: number;
}

export interface BotePremio {
  monto: number;
  ganadores: string[]; // jugador_ids
  descripcion: string; // p.ej. "Full de Reyes"
}

export interface ResultadoShowdown {
  botes: BotePremio[];
  // reparto final por jugador (delta de fichas ganadas por la mano)
  ganancias: Record<string, number>;
}

export const VALORES: Valor[] = [
  "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A",
];
export const PALOS: Palo[] = ["corazones", "diamantes", "treboles", "picas"];
