import { test } from "node:test";
import assert from "node:assert/strict";
import { penalesU32, zonaArquero, evaluarPatada, replayTanda } from "./engine";
import { multiplicador } from "./config";

// ── Paridad RNG con Postgres (public.penales_u32) ──
// Vectores tomados de la DB real:
//   penales_u32('cs',7,'0:r','deadbeef')      = 3107195582
//   penales_u32('cs',7,'0:z','deadbeef')      = 1412099967
//   penales_u32('clientX',3,'2:r','abc123')   = 513452311
test("RNG paridad con Postgres (mismos uint32)", () => {
  assert.equal(penalesU32("cs", 7, "0:r", "deadbeef"), 3107195582);
  assert.equal(penalesU32("cs", 7, "0:z", "deadbeef"), 1412099967);
  assert.equal(penalesU32("clientX", 3, "2:r", "abc123"), 513452311);
});

test("gol = (valor < umbral); el valor sale de ':r'", () => {
  const ev = evaluarPatada({ clientSeed: "cs", nonce: 7, serverSeed: "deadbeef", probGol: 0.48, i: 0, zonaElegida: 2 });
  assert.equal(ev.u32r, 3107195582);
  assert.equal(ev.valor, 3107195582 / 4294967296);
  assert.equal(ev.gol, ev.valor < 0.48);
});

test("la zona elegida NO afecta el resultado (sólo la presentación)", () => {
  const base = { clientSeed: "cs", nonce: 42, serverSeed: "abcdef0123", probGol: 0.48, i: 3 };
  const golPorZona = [0, 1, 2, 3, 4, 5].map((z) => evaluarPatada({ ...base, zonaElegida: z }).gol);
  // Todos idénticos: el resultado no depende de la zona.
  assert.ok(golPorZona.every((g) => g === golPorZona[0]));
});

test("zona del arquero: atajada → zona elegida; gol → zona distinta y válida", () => {
  for (let z = 0; z < 6; z++) {
    assert.equal(zonaArquero(false, z, 999), z); // atajada: se tira a donde pateó
    for (let u = 0; u < 25; u++) {
      const arq = zonaArquero(true, z, u);
      assert.ok(arq >= 0 && arq < 6, "zona en rango");
      assert.notEqual(arq, z, "en gol el arquero elige otra zona");
    }
  }
});

test("escalera: multiplicador = 2^gols (2x…1024x, cap 10)", () => {
  assert.equal(multiplicador(1), 2);
  assert.equal(multiplicador(3), 8);
  assert.equal(multiplicador(10), 1024);
});

test("replay: corta en atajada / respeta el cap", () => {
  // cap chico para probar el corte por cap
  const r = replayTanda({
    clientSeed: "cs", nonce: 1, serverSeed: "seedcap", probGol: 1, cap: 3, bet: 100,
    zonasElegidas: [0, 1, 2, 3, 4],
  });
  // probGol=1 ⇒ siempre gol ⇒ corta al 3er gol (cap), pozo = 100 * 2^3
  assert.equal(r.gols, 3);
  assert.equal(r.pozo, 800);
  assert.equal(r.estadoFinal, "cobrada");
  assert.equal(r.patadas.length, 3);

  const perd = replayTanda({
    clientSeed: "cs", nonce: 1, serverSeed: "seedloss", probGol: 0, cap: 10, bet: 100,
    zonasElegidas: [0, 0, 0],
  });
  assert.equal(perd.estadoFinal, "perdida");
  assert.equal(perd.pozo, 0);
  assert.equal(perd.patadas.length, 1); // corta en la primera atajada
});

test("RTP ≈ 96% por escalón (tasa de gol ≈ 0.48 en Monte Carlo)", () => {
  const N = 300_000;
  const prob = 0.48;
  let gols = 0;
  for (let n = 0; n < N; n++) {
    // Varía la semilla por índice (sin Math.random, determinístico).
    const ev = evaluarPatada({ clientSeed: "mc", nonce: n, serverSeed: `s${n}`, probGol: prob, i: 0, zonaElegida: n % 6 });
    if (ev.gol) gols++;
  }
  const tasa = gols / N;
  const rtp = tasa * 2;
  // tolerancia estadística
  assert.ok(Math.abs(tasa - prob) < 0.004, `tasa de gol ${tasa} lejos de ${prob}`);
  assert.ok(Math.abs(rtp - 0.96) < 0.008, `RTP/escalón ${rtp} lejos de 0.96`);
});
