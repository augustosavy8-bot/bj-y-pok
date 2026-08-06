// ============================================================
// engine.ts — Motor de rodillos GENÉRICO y agnóstico al tema.
//
// NO calcula resultados: recibe una grilla objetivo (la que decidió el server)
// y anima los rodillos para caer en ella. Usa la Web Animations API:
//   - anima `top` de la tira con un blur(3px) al 50%,
//   - parada escalonada por rodillo con factor = 1 + (idx/2)^2,
//   - construye una tira larga cuyas últimas `rows` fichas son el resultado, y
//     la recorta al terminar (reconstruye en el próximo giro).
//
// Es DOM puro (sin React): el componente lo monta sobre un contenedor y le pasa
// los SVG de los símbolos del tema. Grid = string[][] indexado [reel][row].
// ============================================================

export type Grid = string[][];

export interface EngineOptions {
  reels: number;
  rows: number;
  /** SVG (string) por símbolo, del tema. */
  symbols: Record<string, string>;
  /** Símbolos disponibles para el relleno visual de la tira mientras gira. */
  symbolOrder: string[];
  /** Alto/ancho de cada celda en px. */
  cell?: number;
  /** Duración base del giro del primer rodillo (ms). */
  baseMs?: number;
}

interface ReelDOM {
  viewport: HTMLElement;
  strip: HTMLElement;
  /** Celdas finales visibles (top→bottom) tras la última parada. */
  finalCells: HTMLElement[];
  /** Animación en curso, para cancelarla antes del siguiente giro. */
  anim?: Animation;
}

// Relleno base por rodillo. La cantidad real escala con el factor del rodillo,
// para que TODOS giren a la misma velocidad y los de la derecha sólo giren MÁS
// (más vueltas), no más lento.
const BASE_FILLER = 14;

export class SlotEngine {
  private mount: HTMLElement;
  private o: Required<EngineOptions>;
  private reelEls: ReelDOM[] = [];
  private spinning = false;

  constructor(mount: HTMLElement, opts: EngineOptions) {
    this.mount = mount;
    this.o = {
      cell: 76,
      baseMs: 800,
      ...opts,
    };
  }

  /** Construye el DOM de los rodillos mostrando `grid` como estado inicial. */
  render(grid: Grid): void {
    const { reels, rows, cell } = this.o;
    this.mount.textContent = "";
    this.mount.style.display = "grid";
    this.mount.style.gridTemplateColumns = `repeat(${reels}, ${cell}px)`;
    this.mount.style.gap = "var(--reel-gap, 8px)";
    this.reelEls = [];

    for (let r = 0; r < reels; r++) {
      const viewport = document.createElement("div");
      viewport.className = "reel-viewport";
      viewport.style.cssText =
        `position:relative;overflow:hidden;height:${rows * cell}px;width:${cell}px;` +
        `border-radius:10px`;

      const strip = document.createElement("div");
      strip.className = "reel-strip";
      strip.style.cssText = "position:absolute;left:0;top:0;width:100%;will-change:transform,top";

      const finalCells: HTMLElement[] = [];
      for (let c = 0; c < rows; c++) {
        const cellEl = this.makeCell(grid[r]?.[c] ?? this.o.symbolOrder[0], r, c);
        strip.appendChild(cellEl);
        finalCells.push(cellEl);
      }
      viewport.appendChild(strip);
      this.mount.appendChild(viewport);
      this.reelEls.push({ viewport, strip, finalCells });
    }
  }

  private makeCell(symbol: string, reel: number, row: number): HTMLElement {
    const { cell, symbols } = this.o;
    const el = document.createElement("div");
    el.className = "reel-cell";
    el.dataset.reel = String(reel);
    el.dataset.row = String(row);
    el.style.cssText =
      `height:${cell}px;width:${cell}px;display:flex;align-items:center;justify-content:center;` +
      `box-sizing:border-box;padding:6px`;
    const inner = document.createElement("div");
    inner.className = "reel-sym";
    inner.style.cssText = "width:100%;height:100%;display:flex;align-items:center;justify-content:center";
    inner.innerHTML = symbols[symbol] ?? "";
    el.appendChild(inner);
    return el;
  }

  /**
   * Anima todos los rodillos hasta `target` (grid[reel][row]). Resuelve cuando
   * el ÚLTIMO rodillo terminó. NO decide nada: sólo cae donde le dicen.
   */
  async spin(target: Grid): Promise<void> {
    if (this.spinning) return;
    this.spinning = true;
    this.clearHighlight();
    try {
      const proms = this.reelEls.map((_, r) => this.spinReel(r, target[r] ?? []));
      await Promise.all(proms);
    } finally {
      this.spinning = false;
    }
  }

  private spinReel(reel: number, column: string[]): Promise<void> {
    const { rows, cell, baseMs, symbolOrder } = this.o;
    const rd = this.reelEls[reel];

    // Cancelar la animación del giro anterior (si quedó con fill:forwards) para
    // no acumular animaciones sobre la misma tira.
    rd.anim?.cancel();

    // Parada escalonada: los rodillos de la derecha giran MÁS (más vueltas),
    // no más lento. La distancia escala con el factor → velocidad constante.
    const factor = 1 + Math.pow(reel / 2, 2);
    const duration = baseMs * factor;
    const filler = Math.round(BASE_FILLER * factor);

    // Tira: arriba el RESULTADO (las `rows` finales), debajo el relleno que se
    // ve pasar. Se anima `top` desde -(filler) hasta 0, así en reposo (top:0) la
    // ventana muestra justo el resultado. Como el reposo coincide con top:0, el
    // fill:forwards no pelea con el recorte posterior (bug anterior).
    rd.strip.textContent = "";
    const finalCells: HTMLElement[] = [];
    for (let c = 0; c < rows; c++) {
      const el = this.makeCell(column[c] ?? symbolOrder[0], reel, c);
      rd.strip.appendChild(el);
      finalCells.push(el);
    }
    for (let i = 0; i < filler; i++) {
      const sym = symbolOrder[(Math.random() * symbolOrder.length) | 0];
      rd.strip.appendChild(this.makeCell(sym, reel, -1));
    }
    rd.finalCells = finalCells;

    const startTop = -(filler * cell);
    const anim = rd.strip.animate(
      [
        { top: `${startTop}px`, filter: "blur(0px)" },
        { top: `${startTop / 2}px`, filter: "blur(3px)", offset: 0.5 },
        { top: "0px", filter: "blur(0px)" },
      ],
      { duration, easing: "cubic-bezier(0.12, 0.7, 0.2, 1)", fill: "forwards" }
    );
    rd.anim = anim;

    return anim.finished
      .then(() => {
        // Recortar el relleno; quedan sólo las `rows` finales en top:0.
        for (const el of Array.from(rd.strip.children)) {
          if (!finalCells.includes(el as HTMLElement)) el.remove();
        }
      })
      .catch(() => undefined);
  }

  /** Ilumina las celdas ganadoras (coords [reel,row]). */
  highlight(cells: [number, number][]): void {
    for (const [reel, row] of cells) {
      const el = this.reelEls[reel]?.finalCells[row];
      if (el) el.classList.add("reel-win");
    }
  }

  clearHighlight(): void {
    for (const rd of this.reelEls) {
      for (const el of rd.finalCells) el.classList.remove("reel-win");
    }
  }

  get isSpinning(): boolean {
    return this.spinning;
  }
}
