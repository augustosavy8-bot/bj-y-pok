// ============================================================
// simulate-bonus.ts — Calibración del bonus (Total Multiplier persistente + tiers).
//
// Replica EXACTA de la matemática del server (pesos, paylines, factor,
// bonus_factor_scale, multiplicador persistente y retrigger) para calibrar, por
// slot, el `bonus_factor_scale` (Standard = 95% a price_x 100) y los precios de
// Super/Max para dejarlos también en 95%. También reporta el bonus natural y el
// RTP del juego base con la nueva matemática.
//
// Correr:  node --experimental-strip-types scripts/simulate-bonus.ts
//   (Node 20.6+/22). Sin dependencias externas. Math.random es suficiente: el
//   RTP lo determinan pesos/valores/factor, no la semilla.
// ============================================================

type Sym = [string, number, number]; // [key, value, weight]
interface SlotCfg {
  reels: number; rows: number; paylines: number[][];
  factor: Record<number, number>;
  syms: Sym[]; wild: string; trig: string; min: number; grant: number;
}

const P9 = [[1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],[0,1,2,1,0],[2,1,0,1,2],[0,0,1,2,2],[2,2,1,0,0],[1,0,1,2,1],[1,2,1,0,1]];
const PCOW = [[0,0,0,0,0,0,0],[1,1,1,1,1,1,1],[2,2,2,2,2,2,2],[3,3,3,3,3,3,3],[1,2,2,2,2,2,1],[2,2,2,1,1,0,0],[1,1,0,0,0,1,1],[0,0,0,1,1,2,2],[1,2,2,1,0,0,1],[2,2,1,0,0,2,2],[1,0,0,1,2,2,1],[0,0,1,2,1,1,0],[1,2,2,3,2,2,1],[3,2,2,1,0,0,0],[1,0,0,0,0,0,1],[0,0,0,1,2,2,3],[3,2,0,0,0,2,3],[0,0,2,3,2,0,0],[2,2,2,3,2,2,2],[3,2,2,2,1,1,1],[2,1,1,1,1,1,1],[1,1,1,1,2,2,3],[2,2,2,2,1,1,1],[3,2,1,1,1,2,3],[2,1,1,1,2,2,2],[1,1,2,3,2,1,1],[2,2,3,3,3,2,2],[3,3,2,2,1,0,0],[2,1,0,0,0,1,1],[0,0,1,1,2,3,3]];

const SLOTS: Record<string, SlotCfg> = {
  "el-salon": { reels:5, rows:3, paylines:P9, factor:{3:1.45,4:2.89,5:8.68}, wild:"wild", trig:"wild", min:3, grant:3,
    syms:[["club",3,6],["diam",4,5],["heart",6,4],["spade",8,3],["moon",13,2],["seven",18,1],["wild",18,1]] },
  "faraones": { reels:5, rows:3, paylines:P9, factor:{3:0.69,4:1.38,5:4.14}, wild:"mascara", trig:"mascara", min:3, grant:3,
    syms:[["escarabajo",3,8],["ankh",4,6],["piramide",6,3],["ojo",10,2],["mascara",16,1]] },
  "olympus": { reels:5, rows:3, paylines:P9, factor:{3:5.22,4:10.43,5:29.43}, wild:"wild", trig:"scatter", min:3, grant:5,
    syms:[["laurel",2,10],["anfora",3,9],["lira",4,8],["ares",6,6],["afrodita",8,5],["hades",10,4],["poseidon",13,3],["atenea",16,2],["zeus",22,1],["wild",22,1],["scatter",5,1]] },
  "clandestino": { reels:5, rows:3, paylines:P9, factor:{3:6.93,4:13.86,5:38.17}, wild:"wild", trig:"scatter", min:3, grant:5,
    syms:[["fichas",2,10],["dados",3,9],["reloj",4,8],["whisky",5,7],["tommy",6,5],["maletin",8,4],["ruleta",10,3],["maton",12,3],["femme",15,2],["bonus",18,1],["padrino",22,1],["wild",22,1],["scatter",5,1]] },
  "cowboy": { reels:7, rows:4, paylines:PCOW, factor:{3:7.84,4:17.64,5:43.11,6:117.57,7:352.72}, wild:"wild", trig:"scatter", min:3, grant:8,
    syms:[["s9",2,12],["s10",3,11],["sj",4,10],["sq",5,9],["sk",6,8],["sa",8,7],["horse",10,5],["saloon",12,4],["money",15,3],["cowgirl",20,2],["cowboy",26,2],["outlaw",34,1],["wild",34,1],["scatter",5,1]] },
};

const BET = 45;
const MULTMAX = 50;

// RTP objetivo (%). Se mantiene en 95 (juego base, natural y compra). La
// volatilidad se controla aparte con un TECHO DURO de premio (max_win, 200.000
// fichas) aplicado en la RPC play_spin: por giro y por bonus completo. Con
// apuesta 45 el techo casi nunca toca (200k ≈ 4444×), así que la calibración a
// 95% no cambia; el techo sólo recorta la cola extrema y las apuestas altas.
const RTP = 95;
const FSCALE = RTP / 95;
const MAXWIN = 200000; // referencia; el corte real vive en la RPC.
for (const c of Object.values(SLOTS)) {
  for (const k of Object.keys(c.factor)) {
    c.factor[+k] = Math.round(c.factor[+k] * FSCALE * 100) / 100;
  }
}

interface Prep { names:string[]; valArr:number[]; cum:number[]; total:number; wildI:number; trigI:number; topI:number; numlines:number; }
function prep(c: SlotCfg): Prep {
  const names = c.syms.map(s=>s[0]);
  const idx: Record<string,number> = {}; names.forEach((n,i)=>idx[n]=i);
  const valArr = c.syms.map(s=>s[1]);
  const wts = c.syms.map(s=>s[2]); const total = wts.reduce((a,b)=>a+b,0);
  const cum: number[] = []; let a=0; for (const w of wts){ a+=w; cum.push(a); }
  const top = c.syms.slice().sort((x,y)=> y[1]-x[1] || (x[0]<y[0]?-1:1))[0][0];
  return { names, valArr, cum, total, wildI:idx[c.wild], trigI:idx[c.trig], topI:idx[top], numlines:c.paylines.length };
}
function pickI(P: Prep): number { const t=Math.random()*P.total; const cu=P.cum; for(let i=0;i<cu.length;i++) if(t<cu[i]) return i; return cu.length-1; }

// Suma de líneas SIN el multiplicador ×2/×3 (ese queda fuera del bonus).
function lineSum(c: SlotCfg, P: Prep, g: Int16Array[]): number {
  let base = 0; const W = P.wildI;
  for (let l=0; l<P.numlines; l++) {
    const line = c.paylines[l]; let anchor = -1;
    for (let r=0;r<c.reels;r++){ const cell=g[r][line[r]]; if(cell!==W){ anchor=cell; break; } }
    if (anchor===-1) anchor=P.topI;
    let cnt=0; for(let r=0;r<c.reels;r++){ const cell=g[r][line[r]]; if(cell===W||cell===anchor) cnt++; else break; }
    if (cnt>=3) base += Math.round((BET/P.numlines)*P.valArr[anchor]*(c.factor[cnt]||0));
  }
  return base;
}
function makeGrid(c: SlotCfg, P: Prep): Int16Array[] {
  const g: Int16Array[] = [];
  for (let r=0;r<c.reels;r++){ const col=new Int16Array(c.rows); for(let k=0;k<c.rows;k++) col[k]=pickI(P); g.push(col); }
  return g;
}
function scatterCount(c: SlotCfg, P: Prep, g: Int16Array[]): number {
  let n=0; for(let r=0;r<c.reels;r++) for(let k=0;k<c.rows;k++) if(g[r][k]===P.trigI) n++; return n;
}

// Una tanda de bonus. Devuelve el total ganado (en fichas) con apuesta BET.
function bonusTanda(c: SlotCfg, P: Prep, scale: number, spins0: number, multStart: number, multInc: number): number {
  let mult = multStart, spinsTotal = spins0, played = 0, win = 0;
  while (played < spinsTotal) {
    played++;
    const g = makeGrid(c, P);
    const ls = lineSum(c, P, g);
    const pagoBase = ls * scale;
    win += Math.round(pagoBase * mult);
    if (win > MAXWIN) win = MAXWIN;               // techo del bonus completo
    if (pagoBase > 0) mult = Math.min(MULTMAX, mult + multInc);
    if (scatterCount(c,P,g) >= c.min) spinsTotal = Math.min(30, spinsTotal + Math.round(c.grant/2));
  }
  return win;
}
// EV de una tanda en múltiplos de apuesta.
function evTanda(c: SlotCfg, P: Prep, scale: number, spins: number, ms: number, mi: number, N: number): number {
  let sum=0; for(let i=0;i<N;i++) sum += bonusTanda(c,P,scale,spins,ms,mi); return sum/N/BET;
}

// Juego base SIN bonus natural: RTP de líneas (con ×2/×3) y tasa de trigger.
// El bonus natural se calibra aparte (natural_factor_scale) para que
// líneas + natural = 95%, manteniendo el juego base como estaba.
function baseSim(c: SlotCfg, P: Prep, spins: number): { linesRtp:number; trigRate:number } {
  let paidIn=0, win=0, trig=0;
  for (let sp=0; sp<spins; sp++){
    paidIn += BET;
    const g = makeGrid(c,P);
    const ls = lineSum(c,P,g);
    let mult=1; if(ls>0){ const u=Math.random(); if(u<0.03)mult=3; else if(u<0.15)mult=2; }
    win += Math.min(ls*mult, MAXWIN);             // techo por giro del juego base
    if (scatterCount(c,P,g) >= c.min) trig++;
  }
  return { linesRtp: win/paidIn*100, trigRate: trig/spins };
}

function round2(x:number){ return Math.round(x*100)/100; }
function niceCredits(x:number){ return Math.round(x); } // precio en múltiplos de apuesta, entero

const N_TIER = 300000;
const out: Record<string, any> = {};
for (const slug of Object.keys(SLOTS)) {
  const c = SLOTS[slug]; const P = prep(c);
  const NT = slug==="cowboy" ? 120000 : N_TIER;
  const NB = slug==="cowboy" ? 2000000 : 4000000;
  // 1) escala del BUY: Standard (mult 1/1, spins 10, precio 100) = RTP%
  const evStd1 = evTanda(c,P,1,10,1,1,NT);
  const buyScale = round2(RTP / evStd1);
  const evStd = evTanda(c,P,buyScale,10,1,1,NT);
  const evSuper = evTanda(c,P,buyScale,10,2,2,NT);
  const evMax = evTanda(c,P,buyScale,10,5,3,NT);
  const priceSuper = niceCredits(evSuper/(RTP/100));
  const priceMax = niceCredits(evMax/(RTP/100));
  // 2) escala del NATURAL: líneas base + bonus natural = RTP%.
  const { linesRtp, trigRate } = baseSim(c,P,NB);
  const evNat1 = evTanda(c,P,1,c.grant,1,1,NT);       // EV natural por tanda (scale=1)
  const natContribPerUnit = trigRate * evNat1 * 100;  // % de RTP por unidad de escala
  const natScale = round2(Math.max(0, (RTP - linesRtp) / natContribPerUnit));
  const baseFinal = round2(linesRtp + natContribPerUnit * natScale);
  out[slug] = { bonus_factor_scale: buyScale, natural_factor_scale: natScale,
    factor: c.factor, priceSuper, priceMax,
    rtpStd: round2(evStd/100*100), rtpSuper: round2(evSuper/priceSuper*100), rtpMax: round2(evMax/priceMax*100),
    linesRtp: round2(linesRtp), baseFinal };
  console.log(slug.padEnd(12)+
    " buyScale="+buyScale+" natScale="+natScale+
    "  prices{std:100,super:"+priceSuper+",max:"+priceMax+"}"+
    "  buyRTP{"+out[slug].rtpStd+","+out[slug].rtpSuper+","+out[slug].rtpMax+"}"+
    "  base{lines:"+out[slug].linesRtp+" ->final:"+baseFinal+"}");
}
console.log("\nCONFIG_JSON="+JSON.stringify(out));
