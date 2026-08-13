import { createHmac } from "node:crypto";
import { ZONAS } from "./config";

// ============================================================
// Motor RNG del minijuego "Penales" — ESPEJO EXACTO de las funciones SQL
// (public.penales_u32 / penales_zona_arquero / penales_kick). Permite
// verificación provably-fair independiente del lado JS/TS, igual que
// src/lib/slots/verify.ts para los slots.
//
// RNG por evento: uint32 (big-endian) de
//   hmac(sha256, key = "{clientSeed}:{nonce}:{suffix}", secret = serverSeed)
// Por patada i: suffix "{i}:r" decide gol/atajada; "{i}:z" deriva (aparte,
// puramente cosmético) la zona del arquero. El sorteo de la zona NUNCA influye
// en el resultado.
// ============================================================

/** uint32 determinístico. Idéntico a public.penales_u32. */
export function penalesU32(clientSeed: string, nonce: number, suffix: string, serverSeed: string): number {
  const h = createHmac("sha256", serverSeed).update(`${clientSeed}:${nonce}:${suffix}`).digest();
  return h.readUInt32BE(0);
}

/** Zona del arquero (0..5). Atajada → la zona elegida; gol → una zona distinta. */
export function zonaArquero(gol: boolean, zonaElegida: number, u32z: number): number {
  if (!gol) return zonaElegida;
  const others: number[] = [];
  for (let z = 0; z < ZONAS; z++) if (z !== zonaElegida) others.push(z);
  return others[u32z % 5];
}

export interface PatadaEval {
  i: number;
  zonaElegida: number;
  u32r: number;
  valor: number; // u32r / 2^32 ∈ [0,1)
  umbral: number; // probGol
  gol: boolean;
  resultado: "gol" | "atajada";
  zonaArquero: number;
}

/** Evalúa una patada. El resultado depende SÓLO de "{i}:r"; la zona elegida y
 *  el sorteo de zona del arquero no lo afectan. */
export function evaluarPatada(p: {
  clientSeed: string;
  nonce: number;
  serverSeed: string;
  probGol: number;
  i: number;
  zonaElegida: number;
}): PatadaEval {
  const u32r = penalesU32(p.clientSeed, p.nonce, `${p.i}:r`, p.serverSeed);
  const valor = u32r / 4294967296; // 2^32
  const gol = valor < p.probGol;
  const u32z = penalesU32(p.clientSeed, p.nonce, `${p.i}:z`, p.serverSeed);
  return {
    i: p.i,
    zonaElegida: p.zonaElegida,
    u32r,
    valor,
    umbral: p.probGol,
    gol,
    resultado: gol ? "gol" : "atajada",
    zonaArquero: zonaArquero(gol, p.zonaElegida, u32z),
  };
}

/** Reproduce una tanda completa a partir de las zonas elegidas (en orden) y la
 *  config. Aplica la escalera (pozo ×2 por gol) y el cap. */
export function replayTanda(p: {
  clientSeed: string;
  nonce: number;
  serverSeed: string;
  probGol: number;
  cap: number;
  bet: number;
  zonasElegidas: number[];
}): { patadas: PatadaEval[]; pozo: number; gols: number; estadoFinal: string } {
  let pozo = p.bet;
  let gols = 0;
  const patadas: PatadaEval[] = [];
  let estadoFinal = "esperando_patada";
  for (let i = 0; i < p.zonasElegidas.length; i++) {
    const ev = evaluarPatada({ ...p, i, zonaElegida: p.zonasElegidas[i] });
    patadas.push(ev);
    if (ev.gol) {
      pozo *= 2;
      gols += 1;
      if (gols >= p.cap) { estadoFinal = "cobrada"; break; }
      estadoFinal = "esperando_decision";
    } else {
      pozo = 0;
      estadoFinal = "perdida";
      break;
    }
  }
  return { patadas, pozo, gols, estadoFinal };
}
