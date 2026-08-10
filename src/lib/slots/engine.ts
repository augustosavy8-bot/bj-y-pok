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
  /** Padding interno de cada celda en px (0 para símbolos "tile" a sangre). */
  cellPad?: number;
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
  private winLinesEl: SVGSVGElement | null = null;

  constructor(mount: HTMLElement, opts: EngineOptions) {
    this.mount = mount;
    this.o = {
      cell: 76,
      cellPad: 6,
      baseMs: 800,
      ...opts,
    };
  }

  /** Construye el DOM de los rodillos mostrando `grid` como estado inicial. */
  render(grid: Grid): void {
    const { reels, rows, cell } = this.o;
    this.mount.textContent = "";
    this.mount.style.display = "grid";
    this.mount.style.position = "relative"; // ancla del overlay de líneas ganadoras
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
    const { cell, cellPad, symbols } = this.o;
    const el = document.createElement("div");
    el.className = "reel-cell";
    el.dataset.reel = String(reel);
    el.dataset.row = String(row);
    el.style.cssText =
      `height:${cell}px;width:${cell}px;display:flex;align-items:center;justify-content:center;` +
      `box-sizing:border-box;padding:${cellPad}px`;
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
  async spin(target: Grid, onReelStop?: (reel: number) => void): Promise<void> {
    if (this.spinning) return;
    this.spinning = true;
    this.clearHighlight();
    this.clearWinLines();
    try {
      const proms = this.reelEls.map((_, r) =>
        this.spinReel(r, target[r] ?? []).then(() => onReelStop?.(r))
      );
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

  /**
   * Dibuja una polilínea animada por cada línea ganadora, uniendo el centro de
   * las celdas que pagaron (de izquierda a derecha). Cada línea tiene su color
   * y se "traza" con un pequeño delay escalonado. Las posiciones se toman del
   * DOM real (getBoundingClientRect), así funcionan con cualquier tamaño/gap.
   */
  showWinLines(lines: { cells: [number, number][] }[]): void {
    this.clearWinLines();
    if (!lines || lines.length === 0) return;
    const NS = "http://www.w3.org/2000/svg";
    // Contenedor = la ventana de rodillos (padre): así el overlay queda por
    // encima del vidrio/viñeta del gabinete, que son hermanos del `.reels`.
    const container = (this.mount.parentElement as HTMLElement) ?? this.mount;
    const mRect = container.getBoundingClientRect();
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "win-lines");
    svg.style.cssText =
      `position:absolute;left:0;top:0;width:${container.clientWidth}px;height:${container.clientHeight}px;` +
      `pointer-events:none;overflow:visible;z-index:20`;

    const COLORS = ["#ffd76b", "#7fdcff", "#ff9ecf", "#a6ff98", "#c9a3ff", "#ffb27a"];

    lines.forEach((line, i) => {
      const pts: number[][] = [];
      for (const [reel, row] of line.cells) {
        const el = this.reelEls[reel]?.finalCells[row];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        pts.push([r.left - mRect.left + r.width / 2, r.top - mRect.top + r.height / 2]);
      }
      if (pts.length < 2) return;
      const color = COLORS[i % COLORS.length];

      // Halo por debajo (línea más gruesa y translúcida).
      const halo = document.createElementNS(NS, "polyline");
      halo.setAttribute("points", pts.map((p) => p.join(",")).join(" "));
      halo.setAttribute("fill", "none");
      halo.setAttribute("stroke", color);
      halo.setAttribute("stroke-width", "10");
      halo.setAttribute("stroke-linecap", "round");
      halo.setAttribute("stroke-linejoin", "round");
      halo.setAttribute("opacity", "0.22");

      const poly = document.createElementNS(NS, "polyline");
      poly.setAttribute("points", pts.map((p) => p.join(",")).join(" "));
      poly.setAttribute("fill", "none");
      poly.setAttribute("stroke", color);
      poly.setAttribute("stroke-width", "3.5");
      poly.setAttribute("stroke-linecap", "round");
      poly.setAttribute("stroke-linejoin", "round");
      poly.style.filter = `drop-shadow(0 0 5px ${color})`;

      // Largo total para el efecto "trazado".
      let len = 0;
      for (let k = 1; k < pts.length; k++) {
        len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
      }
      for (const p of [halo, poly]) {
        p.style.strokeDasharray = String(len);
        p.style.strokeDashoffset = String(len);
        p.animate(
          [{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
          { duration: 420, delay: i * 150, easing: "ease-out", fill: "forwards" }
        );
      }

      // Nodo pulsante en cada celda ganadora.
      for (const [x, y] of pts) {
        const dot = document.createElementNS(NS, "circle");
        dot.setAttribute("cx", String(x));
        dot.setAttribute("cy", String(y));
        dot.setAttribute("r", "5");
        dot.setAttribute("fill", color);
        dot.style.filter = `drop-shadow(0 0 4px ${color})`;
        dot.animate(
          [{ opacity: 0.4, transform: "scale(0.7)" }, { opacity: 1, transform: "scale(1.25)" }, { opacity: 0.4, transform: "scale(0.7)" }],
          { duration: 1000, iterations: Infinity, easing: "ease-in-out", delay: i * 150 }
        );
        dot.style.transformOrigin = `${x}px ${y}px`;
        svg.appendChild(dot);
      }
      svg.insertBefore(poly, svg.firstChild);
      svg.insertBefore(halo, svg.firstChild);
    });

    container.appendChild(svg);
    this.winLinesEl = svg;
  }

  clearWinLines(): void {
    this.winLinesEl?.remove();
    this.winLinesEl = null;
  }

  get isSpinning(): boolean {
    return this.spinning;
  }
}
