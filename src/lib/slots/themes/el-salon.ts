import type { SlotTheme } from "./types";

// ============================================================
// Tema "El Salón" — estética de slot de casino real: gemas glossy con
// gradientes, brillo especular y contorno, sobre rodillos oscuros para que los
// símbolos "salten". Sólo estética; la lógica vive en la RPC.
//
// Cada símbolo es un SVG autocontenido. Los IDs de gradiente son ÚNICOS por
// símbolo (no por copia), así se pueden repetir muchas veces en el DOM sin que
// las referencias url(#id) colisionen.
// ============================================================

// Gradiente vertical claro→oscuro.
const g = (id: string, from: string, to: string) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>`;

// Brillo especular (elipse blanca translúcida arriba de la figura).
const gloss = `<ellipse cx="42" cy="36" rx="15" ry="8" fill="#ffffff" opacity="0.34"/>`;

const wrap = (id: string, defs: string, body: string) =>
  `<svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg"><defs>${defs}</defs>${body}</svg>`;

// ── Palos como gemas de colores ──
const HEART = "M50 85 C16 59 20 27 42 27 C51 27 50 38 50 42 C50 38 49 27 58 27 C80 27 84 59 50 85 Z";
const heart = wrap(
  "heart",
  g("sv-heart", "#ff8791", "#b3121f"),
  `<path d="${HEART}" fill="url(#sv-heart)" stroke="#6f0a12" stroke-width="2.5"/>
   <path d="${HEART}" fill="none" stroke="#ffd98a" stroke-width="1" opacity=".55"/>${gloss}`
);

const DIAM = "M50 12 L85 50 L50 88 L15 50 Z";
const diam = wrap(
  "diam",
  g("sv-diam", "#8fd4ff", "#155fb8"),
  `<path d="${DIAM}" fill="url(#sv-diam)" stroke="#0c3d78" stroke-width="2.5"/>
   <path d="M50 12 L85 50 L50 50 Z" fill="#ffffff" opacity=".22"/>
   <path d="${DIAM}" fill="none" stroke="#d8ecff" stroke-width="1" opacity=".5"/>`
);

const club = wrap(
  "club",
  g("sv-club", "#7ff0b6", "#0e7a48"),
  `<g fill="url(#sv-club)" stroke="#0a5231" stroke-width="2.5">
     <circle cx="50" cy="33" r="16"/><circle cx="31" cy="57" r="16"/><circle cx="69" cy="57" r="16"/>
     <path d="M44 60 Q50 76 39 88 L61 88 Q50 76 56 60 Z"/>
   </g>${gloss}`
);

const SPADE = "M50 14 C85 45 87 67 63 67 C56 67 52 62 50 58 C48 62 44 67 37 67 C13 67 15 45 50 14 Z";
const spade = wrap(
  "spade",
  g("sv-spade", "#d7dcec", "#3a4258"),
  `<path d="${SPADE}" fill="url(#sv-spade)" stroke="#242a3b" stroke-width="2.5"/>
   <path d="M44 63 Q50 79 39 89 L61 89 Q50 79 56 63 Z" fill="url(#sv-spade)" stroke="#242a3b" stroke-width="2.5"/>
   ${gloss}`
);

// ── Luna dorada con brillo ──
const moon = wrap(
  "moon",
  g("sv-moon", "#ffe7a3", "#d38f1e"),
  `<path d="M67 16 A35 35 0 1 0 67 84 A28 28 0 1 1 67 16 Z" fill="url(#sv-moon)" stroke="#9c6a12" stroke-width="2.5"/>
   <circle cx="40" cy="34" r="6" fill="#fff" opacity=".5"/>`
);

// ── 7 rojo de la suerte con contorno dorado ──
const SEVEN = "M28 24 L74 24 L74 35 L51 88 L37 88 L60 37 L28 37 Z";
const seven = wrap(
  "seven",
  g("sv-seven", "#ff6d5e", "#b3141a"),
  `<path d="${SEVEN}" fill="url(#sv-seven)" stroke="#ffcf6a" stroke-width="3" stroke-linejoin="round"/>
   <path d="${SEVEN}" fill="none" stroke="#7a0d12" stroke-width="1"/>
   <rect x="31" y="27" width="40" height="5" rx="2" fill="#fff" opacity=".35"/>`
);

// ── WILD: gema dorada facetada con destello ──
const wild = wrap(
  "wild",
  `${g("sv-wild", "#ffe9a0", "#cf9a22")}${g("sv-wild2", "#fff6d6", "#e6b53e")}`,
  `<path d="M50 8 L86 40 L50 94 L14 40 Z" fill="url(#sv-wild)" stroke="#8a5f11" stroke-width="2.5"/>
   <path d="M50 8 L86 40 L50 48 L14 40 Z" fill="url(#sv-wild2)"/>
   <path d="M50 48 L86 40 L50 94 Z" fill="#b9862c" opacity=".55"/>
   <text x="50" y="70" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="20" fill="#5a3b06">W</text>
   <g fill="#ffffff"><path d="M74 20 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z" opacity=".9"/></g>`
);

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
  // Salón nocturno: resplandor dorado arriba, terciopelo rubí abajo.
  scene:
    "radial-gradient(1100px 720px at 50% -10%, rgba(231,196,119,.20), transparent 60%)," +
    "radial-gradient(900px 620px at 50% 118%, rgba(150,26,34,.28), transparent 55%)," +
    "linear-gradient(180deg, #17110a, #0b0806)",
  card: "/slots/cards/el-salon.webp",
  sound: { base: 329.63, scale: [0, 2, 4, 7, 9], wave: "triangle" },
  symbols: { club, diam, heart, spade, moon, seven, wild },
};

export default elSalon;
