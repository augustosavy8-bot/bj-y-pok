/**
 * Verifica la máquina de slots: compara el RTP exacto (enumerando el espacio
 * de resultados) contra una simulación Monte Carlo con el RNG real del
 * servidor. Si no coinciden, hay un bug entre el sorteo y la evaluación.
 *
 *   npx tsx scripts/verificar-slots.ts
 */
import { calcularRTP, SIMBOLOS, PESO_TOTAL, evaluar, APUESTAS } from "../src/lib/slots/maquina";
import { girar } from "../src/lib/slots/girar";

const exacto = calcularRTP();
console.log("=== CÁLCULO EXACTO ===");
console.log(`RTP                : ${(exacto.rtp * 100).toFixed(3)} %`);
console.log(`Ventaja de la casa : ${((1 - exacto.rtp) * 100).toFixed(3)} %`);
console.log(`Giros con premio   : ${(exacto.frecuencia * 100).toFixed(2)} %  (1 cada ${(1 / exacto.frecuencia).toFixed(1)})`);
console.log(`Jackpot            : 1 cada ${Math.round(1 / exacto.probJackpot).toLocaleString("es")} giros`);

console.log("\n=== APORTE DE CADA PREMIO AL RTP ===");
for (const s of SIMBOLOS) {
  const p = Math.pow(s.peso / PESO_TOTAL, 3);
  console.log(
    `3 × ${s.emoji} ${s.nombre.padEnd(9)} paga ${String(s.paga3).padStart(4)}x   ` +
      `1 cada ${Math.round(1 / p).toLocaleString("es").padStart(7)} giros   ` +
      `aporta ${(p * s.paga3 * 100).toFixed(2)} pts`
  );
}
const pCereza = SIMBOLOS.find((s) => s.id === "cereza")!.peso / PESO_TOTAL;
const p2 = 3 * pCereza * pCereza * (1 - pCereza);
console.log(`2 × 🍒 Cereza      paga    2x   1 cada ${(1 / p2).toFixed(1).padStart(7)} giros   aporta ${(p2 * 2 * 100).toFixed(2)} pts`);

// --- Monte Carlo con el RNG real -------------------------------------------
const N = 3_000_000;
const APUESTA = 100;
let apostado = 0;
let pagado = 0;
let premios = 0;
let jackpots = 0;
const conteo = new Map<string, number>();

for (let i = 0; i < N; i++) {
  const r = girar(APUESTA);
  apostado += APUESTA;
  pagado += r.premio;
  if (r.premio > 0) premios++;
  if (r.jackpot) jackpots++;
  conteo.set(r.detalle, (conteo.get(r.detalle) ?? 0) + 1);
}

const rtpSim = pagado / apostado;
console.log(`\n=== SIMULACIÓN (${N.toLocaleString("es")} giros con el RNG real) ===`);
console.log(`RTP simulado       : ${(rtpSim * 100).toFixed(3)} %`);
console.log(`Giros con premio   : ${((premios / N) * 100).toFixed(2)} %`);
console.log(`Jackpots           : ${jackpots} (esperados ${(N * exacto.probJackpot).toFixed(1)})`);
console.log(`Neto de la casa    : ${(apostado - pagado).toLocaleString("es")} sobre ${apostado.toLocaleString("es")} apostados`);

const desvio = Math.abs(rtpSim - exacto.rtp) * 100;
console.log(`\nDesvío exacto↔simulado: ${desvio.toFixed(3)} puntos`);

// --- Chequeos de sanidad ----------------------------------------------------
const fallas: string[] = [];
if (desvio > 1.5) fallas.push(`El RTP simulado se aleja ${desvio.toFixed(2)} pts del exacto.`);
if (exacto.rtp <= 0 || exacto.rtp >= 1) fallas.push("El RTP quedó fuera de (0,1): la casa perdería siempre o nunca pagaría.");

// La evaluación no debe pagar de más ni de menos en los casos borde.
const casos: [Parameters<typeof evaluar>[0], number][] = [
  [["siete", "siete", "siete"], 1000],
  [["cereza", "cereza", "cereza"], 10],
  [["cereza", "cereza", "limon"], 2],
  [["cereza", "limon", "cereza"], 2],
  [["limon", "cereza", "cereza"], 2],
  [["cereza", "limon", "naranja"], 0],
  [["limon", "naranja", "campana"], 0],
];
for (const [linea, esperado] of casos) {
  const r = evaluar(linea, 1);
  if (r.multiplicador !== esperado) {
    fallas.push(`${linea.join("/")} pagó ${r.multiplicador}x y debía pagar ${esperado}x.`);
  }
}
// Tres cerezas paga como trío, no como par (no se suman).
if (evaluar(["cereza", "cereza", "cereza"], 100).premio !== 1000) {
  fallas.push("Tres cerezas no paga lo mismo que el trío.");
}
// El premio siempre es entero (no hay medias fichas).
for (const a of APUESTAS) {
  for (const s of SIMBOLOS) {
    const p = evaluar([s.id, s.id, s.id], a).premio;
    if (!Number.isInteger(p)) fallas.push(`Premio no entero: ${a} × ${s.paga3} = ${p}`);
  }
}

console.log("");
if (fallas.length === 0) {
  console.log("✅ Todos los chequeos pasaron.");
} else {
  console.log("❌ Fallas:");
  for (const f of fallas) console.log("   - " + f);
  process.exit(1);
}
