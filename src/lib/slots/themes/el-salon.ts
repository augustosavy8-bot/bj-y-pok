import type { SlotTheme } from "./types";

// ============================================================
// Tema "El Salón" — arte raster premium (pack provisto por el usuario, recortado
// a public/slots/el-salon/): letras doradas y objetos de casino como símbolos,
// salón nocturno de fondo y logo "El Salón" en la marquesina.
//
// IMPORTANTE: las CLAVES de símbolo (club/diam/heart/spade/moon/seven/wild) NO
// cambian — son las de slot_symbols en la DB y de las que dependen los pagos/RTP
// y el trigger de giros gratis (wild). Sólo cambia lo visual: cada clave se
// mapea al arte nuevo, así se renueva la estética sin tocar la matemática.
// ============================================================

const img = (name: string) =>
  `<img src="/slots/el-salon/${name}.webp" alt="" loading="lazy" style="width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 2px 5px rgba(0,0,0,.6))">`;

export const elSalon: SlotTheme = {
  slug: "el-salon",
  displayName: "El Salón",
  tagline: "5 rodillos · 9 líneas",
  colors: {
    "--brass": "#e7c477",
    "--brass-deep": "#a9781f",
    "--brass-dark": "#5c3f10",
    "--ink": "#120d06",
    "--cream": "#f6ecd2",
    "--ruby": "#c8313f",
    "--reel-1": "#20222c",
    "--reel-2": "#0d0e14",
    "--cabinet-1": "#241a0d",
    "--cabinet-2": "#0f0b06",
    "--lcd": "#ffcf5a",
  },
  // Salón de casino nocturno (imagen) con un velo oscuro para que la UI y los
  // rodillos resalten por encima.
  scene:
    "linear-gradient(180deg, rgba(8,6,3,.52), rgba(8,6,3,.30) 42%, rgba(8,6,3,.78))," +
    "url('/slots/el-salon/fondo.webp') center 30%/cover no-repeat",
  logo: "/slots/el-salon/logo.webp",
  card: "/slots/cards/el-salon.webp",
  sound: { base: 329.63, scale: [0, 2, 4, 7, 9], wave: "triangle" },
  // Mapa clave→arte (por valor, de menor a mayor). El key es el de la DB.
  symbols: {
    club: img("10"), //      valor 3  — 10
    diam: img("j"), //       valor 4  — J
    heart: img("q"), //      valor 6  — Q
    spade: img("k"), //      valor 8  — K
    moon: img("whiskey"), // valor 13 — vaso de whisky
    seven: img("roulette"), //valor 18 — ruleta
    wild: img("wild"), //    valor 18 — crest wild (WILD)
  },
};

export default elSalon;
