import type { SlotTheme } from "./types";

// ============================================================
// Tema "Faraones" — SVGs egipcios (escarabajo, ankh, ojo de Horus, máscara de
// faraón, pirámide/sol) sobre rodillos de lapislázuli. Los IDs de gradiente van
// namespaced por símbolo para que no colisionen al repetirse en el DOM.
// Sólo estética; la lógica vive en la RPC. La máscara es el comodín (wild).
// ============================================================

const open =
  '<svg viewBox="0 0 512 512" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">';

const escarabajo = `${open}
<defs>
  <linearGradient id="esc-g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#FFF0A6"/><stop offset=".35" stop-color="#E8B83F"/>
    <stop offset=".7" stop-color="#A86C12"/><stop offset="1" stop-color="#FFD66B"/>
  </linearGradient>
  <linearGradient id="esc-b" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#36D8E6"/><stop offset=".45" stop-color="#087AA9"/><stop offset="1" stop-color="#07325D"/>
  </linearGradient>
</defs>
<g stroke="#3B2108" stroke-width="14" stroke-linejoin="round" stroke-linecap="round">
  <path d="M256 72c-39 0-69 29-69 66 0 24 13 45 34 56-42 12-69 51-69 101 0 73 45 129 104 145 59-16 104-72 104-145 0-50-27-89-69-101 21-11 34-32 34-56 0-37-30-66-69-66z" fill="url(#esc-b)"/>
  <path d="M152 222C93 202 54 171 31 124c71 5 129 30 169 74M360 222c59-20 98-51 121-98-71 5-129 30-169 74" fill="url(#esc-g)"/>
  <path d="M154 276c-59 1-96 23-119 66 51 10 94 8 128-7M358 276c59 1 96 23 119 66-51 10-94 8-128-7" fill="url(#esc-g)"/>
  <path d="M205 173h102M185 295h142M204 370h104" fill="none"/>
  <path d="M256 72V32M256 32l-32 26M256 32l32 26" fill="none"/>
</g>
</svg>`;

const ankh = `${open}
<defs>
  <linearGradient id="ankh-g" x1=".15" y1="0" x2=".85" y2="1">
    <stop offset="0" stop-color="#FFF2A1"/><stop offset=".28" stop-color="#EBC24D"/>
    <stop offset=".62" stop-color="#A96E16"/><stop offset=".82" stop-color="#F2C64E"/><stop offset="1" stop-color="#80500C"/>
  </linearGradient>
</defs>
<g stroke="#3A2209" stroke-width="16" stroke-linejoin="round">
  <path d="M256 48c-74 0-123 56-123 128 0 68 42 112 91 147v43H118v66h106v54h64v-54h106v-66H288v-43c49-35 91-79 91-147 0-72-49-128-123-128zm0 62c37 0 60 29 60 68 0 45-31 76-60 98-29-22-60-53-60-98 0-39 23-68 60-68z" fill="url(#ankh-g)"/>
  <path d="M148 388h216" fill="none" stroke="#FFF0A6" stroke-width="9" opacity=".55"/>
</g>
</svg>`;

const ojo = `${open}
<defs>
 <linearGradient id="ojo-g" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#FFE98A"/><stop offset=".4" stop-color="#D59B22"/><stop offset="1" stop-color="#7C4808"/>
 </linearGradient>
 <radialGradient id="ojo-i">
  <stop offset="0" stop-color="#50ECF0"/><stop offset=".55" stop-color="#1593B7"/><stop offset="1" stop-color="#063C6B"/>
 </radialGradient>
</defs>
<g stroke="#332006" stroke-width="15" stroke-linecap="round" stroke-linejoin="round">
  <path d="M42 234c67-76 137-111 214-111 77 0 147 35 214 111-69 64-140 96-214 96S111 298 42 234z" fill="url(#ojo-g)"/>
  <ellipse cx="256" cy="229" rx="74" ry="83" fill="url(#ojo-i)"/>
  <circle cx="256" cy="229" r="31" fill="#12100D"/>
  <circle cx="236" cy="205" r="10" fill="#FFF9D8" stroke="none"/>
  <path d="M256 330c-4 45-18 85-43 121M256 330c26 45 63 73 112 84M213 451l-39-12" fill="none"/>
  <path d="M92 191c45-45 95-72 149-80M420 191c-45-45-95-72-149-80" fill="none" stroke="#F3D66C" stroke-width="10"/>
</g>
</svg>`;

const piramide = `${open}
<defs>
 <linearGradient id="pir-s" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#FFE58A"/><stop offset=".45" stop-color="#DDA42F"/><stop offset="1" stop-color="#8B5410"/>
 </linearGradient>
 <radialGradient id="pir-u">
  <stop offset="0" stop-color="#FFF7B0"/><stop offset=".55" stop-color="#F6C744"/><stop offset="1" stop-color="#D98913"/>
 </radialGradient>
</defs>
<g stroke="#392208" stroke-width="13" stroke-linejoin="round" stroke-linecap="round">
 <circle cx="369" cy="128" r="72" fill="url(#pir-u)"/>
 <path d="M369 31v-21M369 246v-21M272 128h-22M488 128h-22M300 59l-16-16M454 213l-16-16M438 59l16-16M284 213l16-16" fill="none" stroke="#D89A23"/>
 <path d="M45 426L224 125l179 301z" fill="url(#pir-s)"/>
 <path d="M224 125l47 301H45z" fill="#F2C852" opacity=".65"/>
 <path d="M92 348h263M123 296h201M153 245h140M184 193h79" fill="none" stroke="#84500F" stroke-width="8" opacity=".8"/>
 <path d="M297 426l96-184 86 184z" fill="#B87516"/>
 <path d="M24 426h464" fill="none" stroke-width="18"/>
</g>
</svg>`;

// Máscara de faraón = WILD
const mascara = `${open}
<defs>
 <linearGradient id="mas-g" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#FFF0A0"/><stop offset=".35" stop-color="#E7B93E"/><stop offset=".7" stop-color="#9D6410"/><stop offset="1" stop-color="#F6D15B"/>
 </linearGradient>
</defs>
<g stroke="#352007" stroke-width="12" stroke-linejoin="round">
 <path d="M256 35c-98 0-174 83-174 190 0 90 31 185 78 249h192c47-64 78-159 78-249 0-107-76-190-174-190z" fill="#0A4D88"/>
 <path d="M127 116c31-51 76-79 129-79s98 28 129 79l-40 270-89 88-89-88z" fill="url(#mas-g)"/>
 <path d="M159 92l40 62M213 54l18 84M353 92l-40 62M299 54l-18 84" fill="none" stroke="#0A4D88" stroke-width="24"/>
 <path d="M168 222c25-23 56-26 83-8-28 21-57 24-83 8zM344 222c-25-23-56-26-83-8 28 21 57 24 83 8z" fill="#0A4D88"/>
 <path d="M256 213l-24 111h48zM204 356c34 21 70 21 104 0" fill="none"/>
 <path d="M239 61c0-30 17-46 17-46s17 16 17 46" fill="#C7312F"/>
 <path d="M204 399h104l-52 47z" fill="#C7312F"/>
</g>
</svg>`;

export const faraones: SlotTheme = {
  slug: "faraones",
  displayName: "Faraones",
  tagline: "5 rodillos · 9 líneas",
  colors: {
    "--brass": "#e7c477",
    "--brass-deep": "#a9781f",
    "--brass-dark": "#5c3f10",
    "--ink": "#0e0b06",
    "--cream": "#f6ecd2",
    "--ruby": "#c7312f",
    "--reel-1": "#16273f",
    "--reel-2": "#0a1422",
    "--cabinet-1": "#241a0d",
    "--cabinet-2": "#0f0b06",
    "--lcd": "#ffcf5a",
  },
  // Templo egipcio de noche: cielo de lapislázuli arriba, resplandor de arena abajo.
  scene:
    "radial-gradient(1100px 720px at 50% -8%, rgba(60,110,175,.30), transparent 60%)," +
    "radial-gradient(1000px 700px at 50% 120%, rgba(221,164,47,.22), transparent 55%)," +
    "linear-gradient(180deg, #0a1220, #06090f)",
  symbols: { escarabajo, ankh, piramide, ojo, mascara },
};

export default faraones;
