import type { SlotTheme } from "./types";

// ============================================================
// Tema "Legends of Olympus" — dioses griegos. Usa arte raster provisto por el
// usuario, recortado a public/slots/olympus/ (símbolos, fondo de nubes, logo).
// Símbolos altos = cartas de dioses; bajos = objetos. Wild = medallón del rayo;
// Scatter = templo (dispara giros gratis). Marco de rodillos por CSS (5×3).
// ============================================================

const img = (name: string) =>
  `<img src="/slots/olympus/${name}.webp" alt="" decoding="async" style="width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,.55))">`;

export const olympus: SlotTheme = {
  slug: "olympus",
  displayName: "Legends of Olympus",
  tagline: "5 rodillos · 9 líneas",
  colors: {
    "--brass": "#e9c56a",
    "--brass-deep": "#b3862a",
    "--brass-dark": "#5f4310",
    "--ink": "#0b1226",
    "--cream": "#f4ecd6",
    "--ruby": "#3f6bd6",
    "--reel-1": "#1b2748",
    "--reel-2": "#0a1024",
    "--cabinet-1": "#141d3a",
    "--cabinet-2": "#080c1c",
    "--lcd": "#ffd873",
  },
  // Cielo del Olimpo (imagen) con un velo oscuro para que la UI resalte.
  scene:
    "linear-gradient(180deg, rgba(8,12,30,.35), rgba(8,12,30,.30) 40%, rgba(8,12,30,.72))," +
    "url('/slots/olympus/fondo.webp') center 20%/cover no-repeat",
  logo: "/slots/olympus/logo.webp",
  card: "/slots/cards/olympus.webp",
  sound: { base: 392.0, scale: [0, 2, 4, 5, 7, 9, 11], wave: "sawtooth" },
  symbols: {
    laurel: img("laurel"),
    anfora: img("anfora"),
    lira: img("lira"),
    ares: img("ares"),
    afrodita: img("afrodita"),
    hades: img("hades"),
    poseidon: img("poseidon"),
    atenea: img("atenea"),
    zeus: img("zeus"),
    wild: img("wild"),
    scatter: img("scatter"),
  },
};

export default olympus;
