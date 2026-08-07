import type { SlotTheme } from "./types";

// ============================================================
// Tema "Faraones" — arte raster premium (pack egipcio provisto por el usuario,
// recortado a public/slots/faraones/): personajes/especiales con alfa como
// símbolos, templo dorado de fondo y logo "Pharaoh's Fortune" en la marquesina.
//
// IMPORTANTE: las CLAVES de símbolo (escarabajo/ankh/piramide/ojo/mascara) NO
// cambian — son las que define slot_symbols en la DB y de las que dependen los
// pagos/RTP y el trigger de giros gratis (mascara = wild). Sólo cambia lo
// visual: cada clave se mapea al arte nuevo. Así se renueva la estética sin
// tocar la matemática del juego.
// ============================================================

const img = (name: string) =>
  `<img src="/slots/faraones/${name}.webp" alt="" loading="lazy" style="width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 2px 5px rgba(0,0,0,.6))">`;

export const faraones: SlotTheme = {
  slug: "faraones",
  displayName: "Faraones",
  tagline: "5 rodillos · 9 líneas",
  colors: {
    "--brass": "#f0cd77",
    "--brass-deep": "#b9871f",
    "--brass-dark": "#5c3f10",
    "--ink": "#0b0d16",
    "--cream": "#f7edd0",
    "--ruby": "#d0402f",
    "--reel-1": "#132741",
    "--reel-2": "#081524",
    "--cabinet-1": "#1c150c",
    "--cabinet-2": "#0c0a06",
    "--lcd": "#ffcf5a",
  },
  // Interior de templo egipcio dorado, con un velo oscuro para que la UI y los
  // rodillos resalten por encima del fondo.
  scene:
    "linear-gradient(180deg, rgba(6,10,20,.52), rgba(6,10,20,.30) 42%, rgba(6,10,20,.76))," +
    "url('/slots/faraones/fondo.webp') center 28%/cover no-repeat",
  logo: "/slots/faraones/logo.webp",
  card: "/slots/cards/faraones.webp",
  sound: { base: 293.66, scale: [0, 2, 3, 7, 8], wave: "sine" },
  // Mapa clave→arte (por valor, de menor a mayor). El key es el de la DB; el
  // archivo es el arte que se muestra.
  symbols: {
    escarabajo: img("escarabajo"), // valor 3  — escarabajo alado
    ankh: img("sarcofago"), //         valor 4  — sarcófago
    piramide: img("piramide"), //      valor 6  — pirámide dorada
    ojo: img("cleopatra"), //          valor 10 — Cleopatra
    mascara: img("faraon"), //         valor 16 — máscara de faraón (WILD)
  },
};

export default faraones;
