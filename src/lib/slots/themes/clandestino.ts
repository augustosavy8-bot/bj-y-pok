import type { SlotTheme } from "./types";

// ============================================================
// Tema "Casino Clandestino" — speakeasy / mafia de los años 20. Arte raster
// provisto por el usuario (pack etiquetado), en public/slots/clandestino/.
// Los símbolos son TILES de celda completa (traen su propio marco/fondo), así
// que el tema va con tile:true (celda a sangre, imagen a cover).
// Wild = medallón wild; Scatter = símbolo scatter (dispara giros gratis).
// ============================================================

const img = (name: string) =>
  `<img src="/slots/clandestino/${name}.webp" alt="" decoding="async" style="width:100%;height:100%;object-fit:cover;display:block">`;

export const clandestino: SlotTheme = {
  slug: "clandestino",
  displayName: "Casino Clandestino",
  tagline: "5 rodillos · 9 líneas",
  tile: true,
  colors: {
    "--brass": "#e7c25a",
    "--brass-deep": "#a67c1f",
    "--brass-dark": "#5a3f10",
    "--ink": "#0a0d16",
    "--cream": "#f1e6c6",
    "--ruby": "#c0392b",
    "--reel-1": "#171b26",
    "--reel-2": "#0a0c12",
    "--cabinet-1": "#171310",
    "--cabinet-2": "#0a0806",
    "--lcd": "#ffcf5a",
  },
  // Salón clandestino en penumbra: velo oscuro para que la UI resalte.
  scene:
    "linear-gradient(180deg, rgba(6,6,10,.45), rgba(6,6,10,.40) 40%, rgba(6,6,10,.80))," +
    "url('/slots/clandestino/fondo.webp') center 30%/cover no-repeat",
  logo: "/slots/clandestino/logo.webp",
  card: "/slots/cards/clandestino.webp",
  sound: { base: 261.63, scale: [0, 3, 5, 6, 7, 10], wave: "triangle" },
  symbols: {
    fichas: img("fichas"),
    dados: img("dados"),
    reloj: img("reloj"),
    whisky: img("whisky"),
    tommy: img("tommy"),
    maletin: img("maletin"),
    ruleta: img("ruleta"),
    maton: img("maton"),
    femme: img("femme"),
    padrino: img("padrino"),
    bonus: img("bonus"),
    wild: img("wild"),
    scatter: img("scatter"),
  },
};

export default clandestino;
