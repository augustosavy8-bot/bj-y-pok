import type { SlotTheme } from "./types";

// ============================================================
// Tema "Wild West 7" — slot de grilla grande (7×4, 30 líneas). Arte cowboy
// provisto por el usuario (PNG → WebP con alpha en public/slots/cowboy/).
// Símbolos con marco (contain flotante) sobre rodillos de madera oscura.
// Las CLAVES coinciden con slot_symbols (0023): s9/s10/sj/sq/sk/sa (bajos),
// horse/saloon/money/cowgirl/cowboy/outlaw (premium), wild y scatter (tren).
// ============================================================

const img = (name: string) =>
  `<img src="/slots/cowboy/${name}.webp" alt="" decoding="async" style="width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 2px 5px rgba(0,0,0,.6))">`;

export const cowboy: SlotTheme = {
  slug: "cowboy",
  displayName: "Wild West 7",
  tagline: "7 rodillos · 30 líneas",
  colors: {
    "--brass": "#e6bb55",
    "--brass-deep": "#a9761f",
    "--brass-dark": "#5c3f10",
    "--ink": "#140d07",
    "--cream": "#f4e6c8",
    "--ruby": "#b4432a",
    "--reel-1": "#2a1d12",
    "--reel-2": "#130c07",
    "--cabinet-1": "#2a1c10",
    "--cabinet-2": "#130b06",
    "--lcd": "#ffcf5a",
  },
  // Pueblo del oeste al atardecer, con velo oscuro para que resalten los rodillos.
  scene:
    "linear-gradient(180deg, rgba(10,7,4,.5), rgba(10,7,4,.28) 42%, rgba(10,7,4,.78))," +
    "url('/slots/cowboy/fondo.webp') center 32%/cover no-repeat",
  logo: "/slots/cowboy/logo.webp",
  card: "/slots/cards/cowboy.webp",
  sound: { base: 196.0, scale: [0, 3, 5, 7, 10], wave: "sawtooth" },
  symbols: {
    s9: img("s9"),
    s10: img("s10"),
    sj: img("sj"),
    sq: img("sq"),
    sk: img("sk"),
    sa: img("sa"),
    horse: img("horse"),
    saloon: img("saloon"),
    money: img("money"),
    cowgirl: img("cowgirl"),
    cowboy: img("cowboy"),
    outlaw: img("outlaw"),
    wild: img("wild"),
    scatter: img("scatter"),
  },
};

export default cowboy;
