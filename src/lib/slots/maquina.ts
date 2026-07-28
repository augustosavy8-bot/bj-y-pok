/**
 * Nocturna Slots — máquina de 3 rodillos, una línea de pago.
 *
 * Todo lo que define el juego vive acá: los símbolos, cuánto pesa cada uno en
 * el rodillo y cuánto paga. El RTP se calcula a partir de estos números (no es
 * una constante escrita a mano), así que si tocás un peso o un pago, el número
 * publicado en la pantalla se actualiza solo y sigue siendo verdad.
 *
 * Este archivo es PURO: no tira números. El sorteo vive en `girar.ts`, que sólo
 * corre en el servidor.
 */

export type Simbolo = "cereza" | "limon" | "naranja" | "campana" | "trebol" | "diamante" | "siete";

export interface DefSimbolo {
  id: Simbolo;
  emoji: string;
  nombre: string;
  /** Plural escrito a mano: "limones" y "tréboles" no salen agregando una s. */
  plural: string;
  /** Peso en el rodillo: cuántas veces aparece en la tira de 82 posiciones. */
  peso: number;
  /** Multiplicador sobre la apuesta cuando salen los 3 iguales. */
  paga3: number;
}

/**
 * La tira del rodillo. Los tres rodillos usan la misma tira y son
 * independientes entre sí.
 */
export const SIMBOLOS: DefSimbolo[] = [
  { id: "cereza", emoji: "🍒", nombre: "Cereza", plural: "cerezas", peso: 22, paga3: 10 },
  { id: "limon", emoji: "🍋", nombre: "Limón", plural: "limones", peso: 18, paga3: 12 },
  { id: "naranja", emoji: "🍊", nombre: "Naranja", plural: "naranjas", peso: 15, paga3: 18 },
  { id: "campana", emoji: "🔔", nombre: "Campana", plural: "campanas", peso: 12, paga3: 30 },
  { id: "trebol", emoji: "🍀", nombre: "Trébol", plural: "tréboles", peso: 8, paga3: 60 },
  { id: "diamante", emoji: "💎", nombre: "Diamante", plural: "diamantes", peso: 5, paga3: 150 },
  { id: "siete", emoji: "7️⃣", nombre: "Siete", plural: "sietes", peso: 2, paga3: 1000 },
];

export const PESO_TOTAL = SIMBOLOS.reduce((s, x) => s + x.peso, 0);

/** Premio consuelo: exactamente dos cerezas en cualquier posición. */
export const PAGA_2_CEREZAS = 2;

export const POR_ID: Record<Simbolo, DefSimbolo> = Object.fromEntries(
  SIMBOLOS.map((s) => [s.id, s])
) as Record<Simbolo, DefSimbolo>;

/** Fichas por giro que se pueden elegir. */
export const APUESTAS = [50, 100, 250, 500] as const;

export const APUESTA_MIN = APUESTAS[0];
export const APUESTA_MAX = APUESTAS[APUESTAS.length - 1];

/** La tira expandida: 82 posiciones. Se usa para sortear y para animar. */
export const TIRA: Simbolo[] = SIMBOLOS.flatMap((s) =>
  Array.from({ length: s.peso }, () => s.id)
);

export interface Resultado {
  /** Los 3 símbolos de la línea, de izquierda a derecha. */
  simbolos: [Simbolo, Simbolo, Simbolo];
  /** Multiplicador aplicado (0 si no ganó). */
  multiplicador: number;
  /** Fichas ganadas = apuesta * multiplicador. */
  premio: number;
  /** Texto corto para mostrar y para el libro contable. */
  detalle: string;
  /** true si salieron los tres sietes. */
  jackpot: boolean;
}

/**
 * Evalúa una línea ya sorteada. Separado del sorteo para poder testearlo
 * caso por caso y para calcular el RTP exacto sin simular.
 */
export function evaluar(linea: [Simbolo, Simbolo, Simbolo], apuesta: number): Resultado {
  const [a, b, c] = linea;

  if (a === b && b === c) {
    const def = POR_ID[a];
    return {
      simbolos: linea,
      multiplicador: def.paga3,
      premio: apuesta * def.paga3,
      detalle: `Tres ${def.plural}`,
      jackpot: a === "siete",
    };
  }

  const cerezas = linea.filter((s) => s === "cereza").length;
  if (cerezas === 2) {
    return {
      simbolos: linea,
      multiplicador: PAGA_2_CEREZAS,
      premio: apuesta * PAGA_2_CEREZAS,
      detalle: "Dos cerezas",
      jackpot: false,
    };
  }

  return { simbolos: linea, multiplicador: 0, premio: 0, detalle: "Sin premio", jackpot: false };
}

/**
 * RTP exacto, calculado enumerando el espacio de resultados (7³ = 343 combos
 * de símbolos, cada uno con su probabilidad según los pesos). No es una
 * simulación: es el número real.
 */
export function calcularRTP(): { rtp: number; frecuencia: number; probJackpot: number } {
  let retorno = 0;
  let conPremio = 0;
  let probJackpot = 0;

  for (const x of SIMBOLOS) {
    for (const y of SIMBOLOS) {
      for (const z of SIMBOLOS) {
        const p = (x.peso / PESO_TOTAL) * (y.peso / PESO_TOTAL) * (z.peso / PESO_TOTAL);
        const r = evaluar([x.id, y.id, z.id], 1);
        retorno += p * r.multiplicador;
        if (r.multiplicador > 0) conPremio += p;
        if (r.jackpot) probJackpot += p;
      }
    }
  }
  return { rtp: retorno, frecuencia: conPremio, probJackpot };
}

/** Ventaja de la casa en porcentaje (lo que se publica en pantalla). */
export function ventajaCasaPct(): number {
  return (1 - calcularRTP().rtp) * 100;
}
