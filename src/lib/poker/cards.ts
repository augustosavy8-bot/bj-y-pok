import type { Carta, Palo, Valor } from "@/lib/types";

// Mapeo del dominio (español) al formato de pokersolver ("As", "Td", "9c"...)

const VALOR_A_PS: Record<Valor, string> = {
  "2": "2", "3": "3", "4": "4", "5": "5", "6": "6",
  "7": "7", "8": "8", "9": "9", "10": "T",
  J: "J", Q: "Q", K: "K", A: "A",
};

const PALO_A_PS: Record<Palo, string> = {
  corazones: "h",
  diamantes: "d",
  treboles: "c",
  picas: "s",
};

export function cartaAPokersolver(c: Pick<Carta, "valor" | "palo">): string {
  return VALOR_A_PS[c.valor] + PALO_A_PS[c.palo];
}

// Símbolo unicode del palo (para render)
export const SIMBOLO_PALO: Record<Palo, string> = {
  corazones: "♥",
  diamantes: "♦",
  treboles: "♣",
  picas: "♠",
};

export function esPaloRojo(palo: Palo): boolean {
  return palo === "corazones" || palo === "diamantes";
}
