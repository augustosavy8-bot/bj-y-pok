import { createHmac } from "node:crypto";

export interface SimboloPeso {
  symbol: string;
  weight: number;
  sort: number | null;
}

/**
 * Recomputa la grilla a partir de (server_seed, client_seed, nonce, config).
 * Reproduce EXACTAMENTE el algoritmo de slot_build_grid en Postgres, para
 * verificación provably-fair independiente del lado JS/TS.
 *
 * Devuelve grid[reel][row].
 */
export function recomputarGrid(params: {
  reels: number;
  rows: number;
  clientSeed: string;
  nonce: number;
  serverSeed: string;
  symbols: SimboloPeso[];
}): string[][] {
  const { reels, rows, clientSeed, nonce, serverSeed } = params;

  // Orden estable (sort, symbol) — igual que el ORDER BY de la RPC.
  const ordered = [...params.symbols].sort(
    (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.symbol.localeCompare(b.symbol)
  );
  const total = ordered.reduce((s, x) => s + x.weight, 0);

  const grid: string[][] = [];
  for (let r = 0; r < reels; r++) {
    const col: string[] = [];
    for (let c = 0; c < rows; c++) {
      const k = r * rows + c;
      const h = createHmac("sha256", serverSeed).update(`${clientSeed}:${nonce}:${k}`).digest();
      const u = h.readUInt32BE(0);
      const tgt = u % total;
      let pick = ordered[ordered.length - 1].symbol;
      let acc = 0;
      for (const s of ordered) {
        acc += s.weight;
        if (tgt < acc) { pick = s.symbol; break; }
      }
      col.push(pick);
    }
    grid.push(col);
  }
  return grid;
}

/** true si la grilla recomputada coincide con la guardada. */
export function gridCoincide(a: string[][], b: string[][]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
