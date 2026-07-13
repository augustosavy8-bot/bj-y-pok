import type { Jugador } from "@/lib/types";

// ============================================================
// Motor de turnos y apuestas (funciones puras).
// Los route handlers cargan el estado de la DB, llaman a estas
// funciones y persisten el resultado.
// ============================================================

/** Jugadores reales (excluye al crupier y a los eliminados), ordenados por posición. */
export function jugadoresDeLaMano(jugadores: Jugador[]): Jugador[] {
  return jugadores
    .filter((j) => !j.es_crupier && j.estado !== "eliminado")
    .sort((a, b) => a.posicion - b.posicion);
}

/** Jugadores que siguen en juego (pueden ganar el bote): activos o all-in. */
export function jugadoresEnJuego(jugadores: Jugador[]): Jugador[] {
  return jugadoresDeLaMano(jugadores).filter(
    (j) => j.estado === "activo" || j.estado === "all_in"
  );
}

/** Jugadores que todavía pueden apostar (activos, no all-in). */
export function jugadoresActivos(jugadores: Jugador[]): Jugador[] {
  return jugadoresDeLaMano(jugadores).filter((j) => j.estado === "activo");
}

/** ¿Este jugador todavía debe actuar en la ronda actual? */
export function necesitaActuar(j: Jugador, apuestaActual: number): boolean {
  if (j.estado !== "activo") return false;
  return !j.ha_actuado || j.apuesta_ronda < apuestaActual;
}

/**
 * Siguiente jugador al que le toca actuar, buscando en orden de mesa
 * a partir de la posición `desdePos` (exclusiva). Devuelve null si la
 * ronda de apuestas está completa.
 */
export function siguienteTurno(
  jugadores: Jugador[],
  desdePos: number,
  apuestaActual: number
): Jugador | null {
  const enOrden = jugadoresDeLaMano(jugadores);
  if (enOrden.length === 0) return null;

  // Ordenar circularmente empezando después de desdePos
  const ordenados = [...enOrden].sort((a, b) => a.posicion - b.posicion);
  const arranque = ordenados.findIndex((j) => j.posicion > desdePos);
  const rotados =
    arranque === -1
      ? ordenados
      : [...ordenados.slice(arranque), ...ordenados.slice(0, arranque)];

  for (const j of rotados) {
    if (necesitaActuar(j, apuestaActual)) return j;
  }
  return null; // ronda completa
}

/**
 * Primer jugador que debe actuar al abrir una ronda POSTFLOP:
 * el primer activo a la izquierda del botón (posición del dealer).
 */
export function primeroPostflop(
  jugadores: Jugador[],
  dealerPos: number
): Jugador | null {
  const activos = jugadoresActivos(jugadores);
  if (activos.length === 0) return null;
  const ordenados = [...activos].sort((a, b) => a.posicion - b.posicion);
  const despues = ordenados.find((j) => j.posicion > dealerPos);
  return despues ?? ordenados[0];
}

/** ¿La ronda de apuestas actual está cerrada? */
export function rondaCompleta(jugadores: Jugador[], apuestaActual: number): boolean {
  return !jugadoresDeLaMano(jugadores).some((j) => necesitaActuar(j, apuestaActual));
}

/** ¿Sólo queda un jugador en juego (todos los demás foldearon)? */
export function soloUnoEnJuego(jugadores: Jugador[]): boolean {
  return jugadoresEnJuego(jugadores).length <= 1;
}

/**
 * ¿Ya no hay más apuestas posibles? (0 o 1 jugadores pueden actuar).
 * Cuando esto pasa tras completar la ronda, se corre directo hasta el showdown.
 */
export function apuestasCongeladas(jugadores: Jugador[]): boolean {
  return jugadoresActivos(jugadores).length <= 1;
}

/** Cuánto necesita poner el jugador para igualar la apuesta actual. */
export function montoParaIgualar(j: Jugador, apuestaActual: number): number {
  return Math.max(0, apuestaActual - j.apuesta_ronda);
}

/**
 * Calcula el mínimo total (apuesta_ronda resultante) de una subida legal.
 * min raise = apuesta_actual + max(ultima_subida, ciega_grande).
 */
export function minimoParaSubir(
  apuestaActual: number,
  ultimaSubida: number,
  ciegaGrande: number
): number {
  return apuestaActual + Math.max(ultimaSubida, ciegaGrande);
}

/** Índice de posición del small blind y big blind relativo al dealer. */
export function posicionesCiegas(jugadoresOrdenados: Jugador[], dealerPos: number) {
  const n = jugadoresOrdenados.length;
  const idxDealer = jugadoresOrdenados.findIndex((j) => j.posicion === dealerPos);
  const base = idxDealer === -1 ? 0 : idxDealer;

  if (n === 2) {
    // Heads-up: el dealer es small blind.
    return {
      smallBlind: jugadoresOrdenados[base],
      bigBlind: jugadoresOrdenados[(base + 1) % n],
    };
  }
  return {
    smallBlind: jugadoresOrdenados[(base + 1) % n],
    bigBlind: jugadoresOrdenados[(base + 2) % n],
  };
}

/** Primer jugador que actúa PREFLOP: el siguiente al big blind. */
export function primeroPreflop(
  jugadoresOrdenados: Jugador[],
  bigBlind: Jugador
): Jugador {
  const n = jugadoresOrdenados.length;
  const idxBB = jugadoresOrdenados.findIndex((j) => j.id === bigBlind.id);
  return jugadoresOrdenados[(idxBB + 1) % n];
}
