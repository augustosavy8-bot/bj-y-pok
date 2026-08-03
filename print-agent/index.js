"use strict";

// Agente local de impresión ESC/POS para la comanda.
//   POST /print   { encabezado, codigo, folio, pie, copias, corte, items[], total, mostrarTotal }
//   GET  /health  -> { ok, method }
//
// Escucha SOLO en 127.0.0.1 y sólo acepta el origen de la app (CORS). La app
// (HTTPS) puede hacer fetch a http://localhost porque loopback es "trustworthy".

const http = require("http");
const fs = require("fs");
const path = require("path");
const { construirTicket, construirRaster } = require("./ticket");
const { enviar, listarUSB } = require("./print");

// Carga simple de .env (sin dependencias): NOMBRE=valor por línea, # comenta.
(function cargarEnv() {
  try {
    const txt = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
    txt.split(/\r?\n/).forEach((linea) => {
      const l = linea.trim();
      if (!l || l[0] === "#") return;
      const i = l.indexOf("=");
      if (i < 0) return;
      const k = l.slice(0, i).trim();
      const v = l.slice(i + 1).trim();
      if (k && process.env[k] === undefined) process.env[k] = v;
    });
  } catch (_) { /* no hay .env, se usan defaults */ }
})();

const PORT = Number(process.env.PORT || 9977);

// Orígenes permitidos (coma-separado). Default: las URLs de producción de la app.
const ORIGENES = (process.env.ALLOWED_ORIGIN ||
  "https://bj-y-pok-augusavy.vercel.app,https://bj-y-pok.vercel.app")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const opts = {
  method: (process.env.METHOD || "usb").toLowerCase(),
  width: Number(process.env.WIDTH || 48),
  enc: process.env.CODEPAGE_ENC || "CP858",
  escT: process.env.CODEPAGE_CMD != null ? Number(process.env.CODEPAGE_CMD) : 19,
  feedMm: Number(process.env.FEED_MM || 6),
  vid: process.env.USB_VID ? parseInt(process.env.USB_VID, 16) : undefined,
  pid: process.env.USB_PID ? parseInt(process.env.USB_PID, 16) : undefined,
  printerName: process.env.PRINTER_NAME || undefined,
};

function origenPermitido(origin) {
  if (!origin) return true; // curl / sin Origin
  if (ORIGENES.indexOf(origin) >= 0) return true;
  try {
    const h = new URL(origin).hostname;
    return h === "localhost" || h === "127.0.0.1";
  } catch (_) {
    return false;
  }
}

function cors(res, origin) {
  res.setHeader("Access-Control-Allow-Origin", origin || ORIGENES[0]);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Private-Network", "true"); // Chrome PNA
  res.setHeader("Access-Control-Max-Age", "86400");
}

const server = http.createServer((req, res) => {
  const origin = req.headers.origin;
  const ok = origenPermitido(origin);
  cors(res, ok ? (origin || ORIGENES[0]) : ORIGENES[0]);

  if (req.method === "OPTIONS") {
    res.writeHead(ok ? 204 : 403);
    return res.end();
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ ok: true, method: opts.method, usb: opts.method === "usb" ? listarUSB() : undefined }));
  }

  const esRaster = req.url === "/print-raster";
  if (req.method !== "POST" || (req.url !== "/print" && !esRaster)) {
    res.writeHead(404);
    return res.end("not found");
  }

  if (!ok) {
    res.writeHead(403);
    return res.end("origen no permitido");
  }

  let body = "";
  req.on("data", (c) => {
    body += c;
    if (body.length > 12e6) req.destroy(); // el ráster es más pesado
  });
  req.on("end", async () => {
    let payload;
    try {
      payload = JSON.parse(body || "{}");
    } catch (e) {
      res.writeHead(400, { "content-type": "application/json" });
      return res.end(JSON.stringify({ ok: false, error: "JSON inválido" }));
    }
    try {
      const buf = esRaster ? construirRaster(payload, opts) : construirTicket(payload, opts);
      await enviar(buf, opts);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      console.error("[print] error:", e.message);
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("print-agent escuchando en http://localhost:" + PORT +
    "  (method=" + opts.method + ", origenes=" + ORIGENES.join(" ") + ")");
  if (opts.method === "usb") {
    const found = listarUSB();
    console.log("USB detectadas:", found.length ? JSON.stringify(found) : "(ninguna — revisá cable/driver, ver README)");
  }
});
