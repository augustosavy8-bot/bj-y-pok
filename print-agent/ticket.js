"use strict";

// Construye el ticket como un Buffer de comandos ESC/POS puro. No depende del
// transporte (USB o RAW): index.js decide cómo mandarlo. Replica lo esencial de
// la vista de impresión: encabezado centrado, código grande y en negrita, tabla
// de ítems, total destacado y pie chico; al final, avance de corte + corte
// parcial.

const iconv = require("iconv-lite");

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

function b(...bytes) {
  return Buffer.from(bytes);
}

class Ticket {
  constructor(opts) {
    this.width = opts.width || 48; // columnas Font A (XP-80 80mm ≈ 48)
    this.enc = opts.enc || "CP858"; // Spanish + €
    this.parts = [];
    this.raw(b(ESC, 0x40)); // ESC @  init
    this.raw(b(ESC, 0x74, opts.escT != null ? opts.escT : 19)); // ESC t  code page
  }
  raw(buf) { this.parts.push(buf); return this; }
  text(s) { this.parts.push(iconv.encode(String(s == null ? "" : s), this.enc)); return this; }
  ln(s) { return this.text(s == null ? "" : s).raw(b(LF)); }
  align(a) { return this.raw(b(ESC, 0x61, a === "center" ? 1 : a === "right" ? 2 : 0)); }
  bold(on) { return this.raw(b(ESC, 0x45, on ? 1 : 0)); }
  // magnificación 0..7 (0 = 1x). size(1,1) = doble ancho y alto.
  size(w, h) { return this.raw(b(GS, 0x21, ((w & 7) << 4) | (h & 7))); }
  fontB(on) { return this.raw(b(ESC, 0x4d, on ? 1 : 0)); }
  line(ch) { return this.ln((ch || "-").repeat(this.width)); }
  feed(n) { return this.raw(b(ESC, 0x64, Math.max(0, Math.min(255, n | 0)))); }
  // GS V 66 n — corte PARCIAL (function B), alimentando n puntos antes de cortar.
  cut() { return this.raw(b(GS, 0x56, 66, 0)); }

  // Dos columnas: izquierda al margen, derecha pegada al borde. Si no entra en
  // una línea, la derecha baja debajo, alineada a la derecha. `w` permite pasar
  // el ancho de columnas de Font B (más chica) cuando corresponde.
  leftRight(l, r, w) {
    w = w || this.width;
    l = String(l == null ? "" : l);
    r = String(r == null ? "" : r);
    if (l.length + r.length + 1 > w) {
      this.ln(l);
      return this.ln(" ".repeat(Math.max(0, w - r.length)) + r);
    }
    const space = Math.max(1, w - l.length - r.length);
    return this.ln(l + " ".repeat(space) + r);
  }

  build() { return Buffer.concat(this.parts); }
}

function construirTicket(payload, opts) {
  payload = payload || {};
  const t = new Ticket(opts);
  const WB = Math.round(t.width * 4 / 3); // Font B entra ~64 col en 80mm
  const copias = Math.max(1, Math.min(10, parseInt(payload.copias, 10) || 1));
  const corteMm = payload.corte != null ? Number(payload.corte) : (opts.feedMm || 6);
  const feedLineas = Math.max(1, Math.ceil((corteMm || 0) / 3)); // ~3mm por línea

  for (let c = 0; c < copias; c++) {
    // Encabezado (mesero/fecha) centrado, peso normal — como en la comanda.
    t.align("center").bold(false).size(0, 0);
    if (payload.encabezado) t.ln(payload.encabezado);
    // Código: el ancla visual del ticket, grande y en negrita.
    if (payload.codigo) t.bold(true).size(1, 1).ln(payload.codigo).size(0, 0).bold(false);
    t.align("left").line();

    // Ítems: nombre grande/negrita, y debajo P.Unitario / Total en chico
    // (Font B), para replicar la jerarquía de tamaños de la pantalla.
    const items = Array.isArray(payload.items) ? payload.items : [];
    items.forEach((it) => {
      const cant = it && it.cant != null ? String(it.cant) : "";
      const nombre = (it && it.nombre != null ? String(it.nombre) : "").toUpperCase();
      t.bold(true).ln((cant ? cant + "  " : "") + nombre).bold(false);
      t.fontB(true)
        .leftRight("P.Unitario " + (it && it.precio != null ? it.precio : ""), "Total: " + (it && it.total != null ? it.total : ""), WB)
        .fontB(false);
      t.ln("");
    });

    // Total destacado (doble alto).
    if (payload.mostrarTotal) {
      t.bold(true).size(0, 1).leftRight("TOTAL", payload.total != null ? payload.total : "").size(0, 0).bold(false);
    }

    t.line();

    // Pie chico (folio / leyenda) en Font B.
    if (payload.folio || payload.pie) {
      t.fontB(true).leftRight(payload.folio || "", payload.pie || "", WB).fontB(false);
    }

    // Avance de corte + corte parcial.
    t.feed(feedLineas).cut();
  }

  return t.build();
}

// Imprime una IMAGEN (el ticket renderizado tal cual en la comanda) como ráster
// ESC/POS. payload: { width (px), height (px), data (base64 de bits empaquetados
// 1bpp, MSB primero, ceil(width/8) bytes por fila), copias, corte }.
function construirRaster(payload, opts) {
  payload = payload || {};
  const width = payload.width | 0;
  const height = payload.height | 0;
  const bpr = Math.ceil(width / 8); // bytes por fila
  const data = Buffer.from(payload.data || "", "base64");
  const copias = Math.max(1, Math.min(10, parseInt(payload.copias, 10) || 1));
  const corteMm = payload.corte != null ? Number(payload.corte) : (opts.feedMm || 6);
  const feedLineas = Math.max(1, Math.ceil((corteMm || 0) / 3));

  if (!width || !height || data.length < bpr * height) {
    throw new Error("Ráster inválido (width/height/data no coinciden)");
  }

  const parts = [];
  parts.push(b(ESC, 0x40)); // init
  parts.push(b(ESC, 0x61, 0)); // align left
  for (let c = 0; c < copias; c++) {
    // GS v 0 en bandas de hasta 255 filas (algunos firmwares limitan el alto).
    let y = 0;
    while (y < height) {
      const rows = Math.min(255, height - y);
      parts.push(b(GS, 0x76, 0x30, 0x00, bpr & 0xff, (bpr >> 8) & 0xff, rows & 0xff, (rows >> 8) & 0xff));
      parts.push(data.slice(y * bpr, (y + rows) * bpr));
      y += rows;
    }
    parts.push(b(ESC, 0x64, Math.max(0, Math.min(255, feedLineas)))); // avance
    parts.push(b(GS, 0x56, 66, 0)); // corte parcial
  }
  return Buffer.concat(parts);
}

module.exports = { construirTicket, construirRaster };
