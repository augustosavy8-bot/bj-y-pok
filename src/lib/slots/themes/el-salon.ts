import type { SlotTheme } from "./types";

// ============================================================
// Tema "El Salón" — estética de salón de casino clásico: latón (brass),
// rubí y marfil sobre paño oscuro. Sólo estética; la lógica vive en la RPC.
//
// Los `symbols` son SVG string, uno por cada `symbol` de slot_symbols. Usan
// fills sólidos (no gradientes con id) para poder repetirse muchas veces en el
// DOM sin colisiones. Todos escalan al contenedor (viewBox + 100%).
// ============================================================

const ink = "#161009";
const brass = "#d8b166";
const brassDeep = "#a97d34";
const cream = "#f3e7c9";
const ruby = "#c23744";

// Envuelve el contenido en un <svg> cuadrado que escala al contenedor.
const svg = (inner: string) =>
  `<svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;

const club = svg(`
  <g fill="${brass}" stroke="${brassDeep}" stroke-width="2">
    <circle cx="50" cy="34" r="15"/>
    <circle cx="33" cy="56" r="15"/>
    <circle cx="67" cy="56" r="15"/>
    <path d="M44 60 Q50 74 40 86 L60 86 Q50 74 56 60 Z"/>
  </g>`);

const diam = svg(`
  <path d="M50 12 L82 50 L50 88 L18 50 Z" fill="${ruby}" stroke="${brass}" stroke-width="3"/>
  <path d="M50 12 L82 50 L50 50 Z" fill="#d85662"/>`);

const heart = svg(`
  <path d="M50 84 C14 58 18 26 40 26 C49 26 50 36 50 40 C50 36 51 26 60 26 C82 26 86 58 50 84 Z"
        fill="${ruby}" stroke="${brass}" stroke-width="3"/>`);

const spade = svg(`
  <g stroke="${brass}" stroke-width="3">
    <path d="M50 14 C84 44 86 66 64 66 C56 66 51 60 50 56 C49 60 44 66 36 66 C14 66 16 44 50 14 Z" fill="${ink}"/>
    <path d="M44 62 Q50 78 40 88 L60 88 Q50 78 56 62 Z" fill="${ink}"/>
  </g>`);

const moon = svg(`
  <path d="M64 20 A34 34 0 1 0 64 80 A26 26 0 1 1 64 20 Z" fill="${cream}" stroke="${brass}" stroke-width="2"/>`);

const seven = svg(`
  <path d="M28 24 L74 24 L74 34 L50 88 L36 88 L60 36 L28 36 Z" fill="${brass}" stroke="${brassDeep}" stroke-width="2"/>`);

// Wild: gema facetada de latón con la letra W. Es el símbolo especial (sustituye
// a cualquiera y dispara giros gratis).
const wild = svg(`
  <path d="M50 8 L86 40 L50 92 L14 40 Z" fill="${brassDeep}"/>
  <path d="M50 8 L86 40 L50 50 L14 40 Z" fill="${brass}"/>
  <path d="M50 50 L86 40 L50 92 Z" fill="#c79a4a"/>
  <text x="50" y="58" text-anchor="middle" font-family="Georgia, serif" font-weight="700"
        font-size="30" fill="${ink}">W</text>`);

export const elSalon: SlotTheme = {
  slug: "el-salon",
  displayName: "El Salón",
  tagline: "5 rodillos · 9 líneas",
  colors: {
    "--brass": brass,
    "--brass-deep": brassDeep,
    "--ink": ink,
    "--cream": cream,
    "--ruby": ruby,
    "--felt": "#0e2a20",
    "--cabinet": "#1a130b",
  },
  symbols: { club, diam, heart, spade, moon, seven, wild },
};

export default elSalon;
