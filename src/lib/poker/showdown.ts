import { Hand } from "pokersolver";
import type { Carta, Jugador, ResultadoShowdown, BotePremio } from "@/lib/types";
import { cartaAPokersolver } from "@/lib/poker/cards";
import { jugadoresEnJuego, jugadoresDeLaMano } from "@/lib/poker/engine";

interface Contribucion {
  id: string;
  posicion: number;
  restante: number;
  elegible: boolean; // sigue en juego (no foldeó)
}

/**
 * Construye los botes (principal + side pots) a partir de lo que cada
 * jugador aportó en la mano. Los jugadores que foldearon igual aportan
 * a los botes, pero no son elegibles para ganarlos.
 */
export function construirBotes(jugadores: Jugador[]): {
  monto: number;
  elegibles: string[];
}[] {
  const contribs: Contribucion[] = jugadoresDeLaMano(jugadores)
    .filter((j) => j.total_apostado_mano > 0)
    .map((j) => ({
      id: j.id,
      posicion: j.posicion,
      restante: j.total_apostado_mano,
      elegible: j.estado === "activo" || j.estado === "all_in",
    }));

  const botes: { monto: number; elegibles: string[] }[] = [];

  while (true) {
    const conRestante = contribs.filter((c) => c.restante > 0);
    if (conRestante.length === 0) break;

    const nivel = Math.min(...conRestante.map((c) => c.restante));
    let monto = 0;
    for (const c of conRestante) {
      c.restante -= nivel;
      monto += nivel;
    }
    const elegibles = conRestante.filter((c) => c.elegible).map((c) => c.id);
    if (monto > 0 && elegibles.length > 0) {
      botes.push({ monto, elegibles });
    } else if (monto > 0) {
      // Nadie elegible (caso raro): se acumula al último bote o se descarta.
      if (botes.length > 0) botes[botes.length - 1].monto += monto;
    }
  }

  // Fusionar botes consecutivos con el mismo conjunto de elegibles.
  const fusionados: { monto: number; elegibles: string[] }[] = [];
  for (const b of botes) {
    const prev = fusionados[fusionados.length - 1];
    if (prev && sameSet(prev.elegibles, b.elegibles)) {
      prev.monto += b.monto;
    } else {
      fusionados.push({ ...b });
    }
  }
  return fusionados;
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  return b.every((x) => sa.has(x));
}

/**
 * Evalúa el showdown completo: construye botes, evalúa las manos con
 * pokersolver, reparte cada bote entre sus ganadores (manejando empates
 * y el resto de fichas no divisible) y devuelve las ganancias por jugador.
 */
export function evaluarShowdown(params: {
  jugadores: Jugador[];
  comunitarias: Carta[];
  holePorJugador: Record<string, Carta[]>;
}): ResultadoShowdown {
  const { jugadores, comunitarias, holePorJugador } = params;
  const enJuego = jugadoresEnJuego(jugadores);
  const ganancias: Record<string, number> = {};
  const premios: BotePremio[] = [];

  // Caso trivial: un solo jugador en juego, se lleva todo.
  if (enJuego.length === 1) {
    const total = jugadoresDeLaMano(jugadores).reduce(
      (s, j) => s + j.total_apostado_mano,
      0
    );
    ganancias[enJuego[0].id] = total;
    premios.push({
      monto: total,
      ganadores: [enJuego[0].id],
      descripcion: "Único jugador en juego",
    });
    return { botes: premios, ganancias };
  }

  const comunitariasPS = comunitarias.map(cartaAPokersolver);

  // Precalcular la mano de 7 cartas de cada jugador elegible.
  const manoDe: Record<string, Hand> = {};
  const descrDe: Record<string, string> = {};
  for (const j of enJuego) {
    const hole = holePorJugador[j.id] ?? [];
    const cartas = [...hole.map(cartaAPokersolver), ...comunitariasPS];
    const h = Hand.solve(cartas);
    manoDe[j.id] = h;
    descrDe[j.id] = h.descr;
  }

  const botes = construirBotes(jugadores);
  const posicionDe: Record<string, number> = {};
  for (const j of jugadores) posicionDe[j.id] = j.posicion;

  for (const bote of botes) {
    const manos = bote.elegibles
      .filter((id) => manoDe[id])
      .map((id) => manoDe[id]);
    if (manos.length === 0) continue;

    const ganadoras = Hand.winners(manos);
    const ganadoresIds = bote.elegibles.filter((id) =>
      ganadoras.includes(manoDe[id])
    );

    // Reparto con resto: los primeros por posición reciben la ficha extra.
    const base = Math.floor(bote.monto / ganadoresIds.length);
    let resto = bote.monto - base * ganadoresIds.length;
    const ordenados = [...ganadoresIds].sort(
      (a, b) => posicionDe[a] - posicionDe[b]
    );
    for (const id of ordenados) {
      let premio = base;
      if (resto > 0) {
        premio += 1;
        resto -= 1;
      }
      ganancias[id] = (ganancias[id] ?? 0) + premio;
    }

    premios.push({
      monto: bote.monto,
      ganadores: ganadoresIds,
      descripcion: descrDe[ganadoresIds[0]] ?? "Ganador",
    });
  }

  return { botes: premios, ganancias };
}
