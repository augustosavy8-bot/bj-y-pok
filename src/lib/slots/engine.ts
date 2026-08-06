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
}

const FILLER = 18; // fichas de relleno por giro (cuánto "gira" antes de parar)

export class SlotEngine {
  private mount: HTMLElement;
  private o: Required<EngineOptions>;
  private reelEls: ReelDOM[] = [];
  private spinning = false;

  constructor(mount: HTMLElement, opts: EngineOptions) {
    this.mount = mount;
    this.o = {
      cell: 76,
      baseMs: 720,
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

    // Tira larga: FILLER fichas al azar + las `rows` finales = el resultado.
    // La ventana visible al final muestra exactamente esas últimas `rows`.
    rd.strip.textContent = "";
    const finalCells: HTMLElement[] = [];
    const totalCells = FILLER + rows;
    for (let i = 0; i < totalCells; i++) {
      const isFinal = i >= FILLER;
      const sym = isFinal
        ? column[i - FILLER]
        : symbolOrder[(Math.random() * symbolOrder.length) | 0];
      const el = this.makeCell(sym, reel, isFinal ? i - FILLER : -1);
      rd.strip.appendChild(el);
      if (isFinal) finalCells.push(el);
    }
    rd.finalCells = finalCells;

    // Desplazamiento: empezar mostrando el tope y bajar hasta que la ventana
    // quede sobre las últimas `rows` fichas.
    const endTop = -((totalCells - rows) * cell);
    rd.strip.style.top = "0px";

    // Parada escalonada: rodillos más a la derecha tardan más.
    const factor = 1 + Math.pow(reel / 2, 2);
    const duration = baseMs * factor;

    const anim = rd.strip.animate(
      [
        { top: "0px", filter: "blur(0px)" },
        { top: `${endTop * 0.5}px`, filter: "blur(3px)", offset: 0.5 },
        { top: `${endTop}px`, filter: "blur(0px)" },
      ],
      { duration, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "forwards" }
    );

    return anim.finished.then(() => {
      // Recortar: dejar sólo las `rows` finales, tira arriba de nuevo.
      rd.strip.style.top = "0px";
      for (const el of Array.from(rd.strip.children)) {
        if (!finalCells.includes(el as HTMLElement)) el.remove();
      }
    });
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
