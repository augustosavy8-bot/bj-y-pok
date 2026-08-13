// Config inicial del minijuego "Penales" (espejo de public.penales_config v1).
// Fuente única para el front; el server valida contra su propia tabla.
export const PENALES_CONFIG = {
  version: 1,
  probGol: 0.48, // RTP 96% por escalón (0.48 × 2)
  capEscalera: 10, // 10 goles = 1024x → cobro automático
  apuestaMin: 45, // mismo rango que los slots
  apuestaMax: 10000,
  timeoutSecs: 600, // 10 min → auto-cobro / reembolso
} as const;

export const ZONAS = 6; // grilla 3×2
export const ZONAS_LABEL = [
  "Arriba izquierda",
  "Arriba centro",
  "Arriba derecha",
  "Abajo izquierda",
  "Abajo centro",
  "Abajo derecha",
] as const;

// Multiplicador del pozo tras n goles: 2^n (escalón visible 2x…1024x).
export function multiplicador(gols: number): number {
  return Math.pow(2, gols);
}
