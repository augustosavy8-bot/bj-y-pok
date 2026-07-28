import { randomInt } from "node:crypto";
import { TIRA, evaluar, type Resultado, type Simbolo } from "./maquina";

/**
 * Sorteo del lado del SERVIDOR. Usa el RNG criptográfico del sistema
 * (`node:crypto`), no Math.random, y nunca se ejecuta en el navegador: el
 * cliente sólo recibe el resultado ya decidido y lo anima.
 *
 * Cada rodillo se sortea de forma independiente sobre la misma tira.
 */
export function girar(apuesta: number): Resultado {
  const rodillo = (): Simbolo => TIRA[randomInt(TIRA.length)];
  return evaluar([rodillo(), rodillo(), rodillo()], apuesta);
}
