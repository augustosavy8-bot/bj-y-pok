"use client";

import { useEffect, useRef } from "react";

// ── Tipos ──
export interface CrashConfig {
  growth: number; // K: m = e^(K·t), t en segundos. DEBE coincidir con el server.
  maxWin: number;
  minBet: number;
  maxBet: number;
  betOptions: number[];
}
export interface ActiveRound {
  roundId: string;
  bet: number;
  startedAt: number; // epoch segundos (server)
}

interface Props {
  config: CrashConfig;
  saldoInicial: number;
  activa: ActiveRound | null;
}

const BASE = "/juegos/dino-crash";
const IMG_KEYS = [
  "night_sky", "mountains", "ground", "meteor", "impact_explosion",
  "gold_burst", "dust_trail", "dead_dino", "dino_badge",
  "run_1", "run_2", "run_3", "run_4", "run_5", "run_6",
];

type Phase = "idle" | "running" | "ended";
type EndKind = "cashed" | "crashed" | null;

interface Dust { x: number; y: number; life: number; sc: number; vx: number; vy: number }
interface GameState {
  phase: Phase; roundId: string | null; K: number; maxWin: number;
  mult: number; cashAt: number | null; crashPoint: number | null;
  endKind: EndKind; endT: number; startPerf: number; scroll: number; shake: number;
  bet: number; dust: Dust[]; hashCorto: string; lastRound: string | null;
  balance: number; busy: boolean;
}

export function DinoCrash({ config, saldoInicial, activa }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current!;
    const cv = canvasRef.current!;
    const ctx = cv.getContext("2d")!;
    const reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;
    const $ = (sel: string) => root.querySelector(sel) as HTMLElement;
    const q = {
      status: $(".dc-status"), mult: $(".dc-mult"), pay: $(".dc-pay"), bal: $(".dc-bal"),
      action: $(".dc-action") as HTMLButtonElement, hist: $(".dc-hist"),
      fair: $(".dc-fair"), bet: $(".dc-bet") as HTMLInputElement, auto: $(".dc-auto") as HTMLInputElement,
    };
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
    const fmt = (n: number) => Math.round(n).toLocaleString("es-AR");

    let W = 0, H = 0, DPR = 1;
    const resize = () => {
      DPR = Math.min(2, window.devicePixelRatio || 1);
      const r = cv.getBoundingClientRect(); W = r.width; H = r.height;
      cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    const ro = new ResizeObserver(resize); ro.observe(cv); resize();

    const DINO_X = 0.30, GROUND_Y = 0.82;
    const dinoX = () => W * DINO_X, groundY = () => H * GROUND_Y;

    const IMG: Record<string, HTMLImageElement> = {};
    const preload = () => new Promise<void>((res) => {
      let n = 0; IMG_KEYS.forEach((k) => {
        const im = new Image();
        im.onload = im.onerror = () => { IMG[k] = im; if (++n === IMG_KEYS.length) res(); };
        im.src = `${BASE}/${k}.webp`;
      });
    });

    const S: GameState = {
      phase: "idle", roundId: null, K: config.growth, maxWin: config.maxWin,
      mult: 1, cashAt: null, crashPoint: null, endKind: null, endT: 0, startPerf: 0,
      scroll: 0, shake: 0, bet: config.betOptions[1] ?? config.minBet, dust: [],
      hashCorto: "", lastRound: null, balance: saldoInicial, busy: false,
    };
    q.bal.textContent = fmt(S.balance);

    // ── audio ──
    let AC: AudioContext | null = null;
    const blip = (f: number, d: number, t: OscillatorType = "sine", dl = 0) => {
      try {
        AC = AC || new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const t0 = AC.currentTime + dl, o = AC.createOscillator(), g = AC.createGain();
        o.type = t; o.frequency.value = f; o.connect(g); g.connect(AC.destination);
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.2, t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + d); o.start(t0); o.stop(t0 + d + 0.02);
      } catch { /* noop */ }
    };

    // ── helpers red ──
    const clientSeed = () => {
      const b = new Uint8Array(16); crypto.getRandomValues(b);
      return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    };
    const post = async (path: string, body: unknown) => {
      const r = await fetch(`/api/juegos/dino-crash/${path}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      return { ok: r.ok, d } as { ok: boolean; d: Record<string, unknown> };
    };

    // ── controles ──
    const clampBet = () => {
      let b = parseInt(q.bet.value.replace(/\D/g, "")) || 0;
      b = clamp(b, config.minBet, Math.min(config.maxBet, Math.max(config.minBet, S.balance)));
      q.bet.value = String(b); return b;
    };
    q.bet.value = String(S.bet);
    $(".dc-bminus").addEventListener("click", () => { const v = parseInt(q.bet.value) || 0; q.bet.value = String(Math.max(config.minBet, v - Math.max(10, Math.round(v * 0.2)))); });
    $(".dc-bplus").addEventListener("click", () => { const v = parseInt(q.bet.value) || 0; q.bet.value = String(v + Math.max(10, Math.round(v * 0.2))); clampBet(); });
    root.querySelectorAll<HTMLElement>(".dc-quick [data-b]").forEach((b) => b.addEventListener("click", () => {
      q.bet.value = b.dataset.b === "max" ? String(Math.min(config.maxBet, S.balance)) : b.dataset.b!; clampBet();
    }));
    root.querySelectorAll<HTMLElement>(".dc-quick [data-a]").forEach((b) => b.addEventListener("click", () => {
      q.auto.value = b.dataset.a === "off" ? "" : Number(b.dataset.a).toFixed(2);
    }));
    const onAction = () => { if (S.phase === "idle") startRound(); else if (S.phase === "running" && S.cashAt === null) cashOut(); };
    q.action.addEventListener("click", onAction);

    const setBalance = (v: number) => { S.balance = Math.max(0, Math.round(v)); q.bal.textContent = fmt(S.balance); };
    const chipCls = (m: number) => (m < 2 ? "lo" : m < 10 ? "mid" : "hi");
    const pushHistory = (m: number, kind: EndKind) => {
      const c = document.createElement("div"); c.className = "dc-chip " + chipCls(m);
      c.textContent = (kind === "cashed" ? "✓ " : "") + m.toFixed(2) + "×";
      q.hist.prepend(c); while (q.hist.children.length > 7) q.hist.lastChild!.remove();
    };
    const setFairRunning = () => { q.fair.innerHTML = `provably fair<br>hash <b>${S.hashCorto}</b>`; };
    const setFairVerify = () => {
      q.fair.innerHTML = `provably fair · <span class="dc-verlink" style="cursor:pointer;color:#ffca44;pointer-events:auto">verificar ✓</span>`;
      (q.fair.querySelector(".dc-verlink") as HTMLElement)?.addEventListener("click", verificar);
    };
    async function verificar() {
      if (!S.lastRound) return;
      const { ok, d } = await post("verify", { roundId: S.lastRound });
      if (!ok) { q.fair.innerHTML = `verificar: ${String(d.error ?? "error")}`; return; }
      const okHash = d.hash_ok && d.match;
      q.fair.innerHTML = `${okHash ? "✓ verificado" : "⚠ no coincide"}<br>crash <b>${Number(d.crash_point).toFixed(2)}×</b> = recomputado <b>${Number(d.crash_recomputed).toFixed(2)}×</b>`;
    }

    // ── flujo de ronda ──
    async function startRound() {
      if (S.busy || S.phase !== "idle") return;
      const bet = clampBet();
      if (bet < config.minBet || bet > S.balance) { q.status.textContent = "Saldo insuficiente"; return; }
      S.busy = true; q.status.textContent = "Abriendo ronda…";
      const { ok, d } = await post("start", { bet, clientSeed: clientSeed() });
      S.busy = false;
      if (!ok) { q.status.textContent = String(d.error ?? "No se pudo abrir la ronda."); return; }
      S.roundId = String(d.round_id); S.K = Number(d.growth) || config.growth; S.maxWin = Number(d.max_win) || config.maxWin;
      S.bet = Number(d.bet) || bet; setBalance(Number(d.new_balance));
      S.hashCorto = String(d.server_seed_hash).slice(0, 10) + "…"; setFairRunning();
      S.phase = "running"; S.mult = 1; S.cashAt = null; S.endKind = null; S.crashPoint = null;
      S.startPerf = performance.now(); S.dust.length = 0;
      q.mult.className = "dc-mult"; q.pay.textContent = ""; q.status.textContent = "¡Corré, dino!";
      startPolling();
    }
    // Retomar una ronda ya abierta (recarga de página a mitad de tanda).
    function resume(a: ActiveRound) {
      S.roundId = a.roundId; S.bet = a.bet; S.phase = "running"; S.cashAt = null;
      const elapsed0 = Math.max(0, Date.now() / 1000 - a.startedAt);
      S.startPerf = performance.now() - elapsed0 * 1000;
      S.hashCorto = "…"; setFairRunning();
      q.mult.className = "dc-mult"; q.status.textContent = "Ronda en curso…";
      startPolling();
    }

    async function cashOut() {
      if (S.phase !== "running" || S.cashAt !== null || !S.roundId) return;
      const m = S.mult; S.cashAt = m; // lock inmediato para no doblar
      const { ok, d } = await post("cashout", { roundId: S.roundId, mult: m });
      if (!ok) { S.cashAt = null; q.status.textContent = String(d.error ?? "No se pudo retirar."); return; }
      if (d.result === "cashed") settleWin(Number(d.mult), Number(d.win), Number(d.new_balance));
      else settleBust(Number(d.crash_point), d.new_balance != null ? Number(d.new_balance) : S.balance);
    }

    function settleWin(mult: number, win: number, balance: number) {
      if (S.phase === "ended") return;
      stopPolling(); S.phase = "ended"; S.endKind = "cashed"; S.endT = performance.now();
      S.mult = mult; S.lastRound = S.roundId; setBalance(balance);
      q.mult.className = "dc-mult win"; q.mult.textContent = mult.toFixed(2) + "×";
      q.status.textContent = "¡Te retiraste a tiempo!";
      q.pay.textContent = "+" + fmt(win - S.bet) + " fichas  ·  cobraste " + fmt(win);
      blip(660, 0.12, "sine"); blip(880, 0.14, "sine", 0.07); blip(1180, 0.12, "sine", 0.14);
      scheduleReset(mult, "cashed");
    }
    function settleBust(crashPoint: number, balance: number) {
      if (S.phase === "ended") return;
      stopPolling(); S.phase = "ended"; S.endKind = "crashed"; S.endT = performance.now();
      S.crashPoint = crashPoint; S.mult = crashPoint; S.lastRound = S.roundId; S.shake = reduce ? 0 : 1;
      setBalance(balance);
      q.mult.className = "dc-mult bust"; q.mult.textContent = crashPoint.toFixed(2) + "×";
      q.status.textContent = "💥 ¡Meteorito! El dino no la contó";
      q.pay.textContent = "−" + fmt(S.bet) + " fichas";
      blip(150, 0.3, "sawtooth"); blip(80, 0.36, "sawtooth", 0.08);
      scheduleReset(crashPoint, "crashed");
    }
    let resetTimer: ReturnType<typeof setTimeout> | null = null;
    function scheduleReset(m: number, kind: EndKind) {
      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        pushHistory(m, kind); setFairVerify();
        S.phase = "idle"; S.roundId = null; S.shake = 0;
        q.status.textContent = "Poné tu apuesta y arrancá";
        q.mult.className = "dc-mult"; q.mult.textContent = "1.00×"; q.pay.textContent = "";
        clampBet();
      }, kind === "crashed" ? 2200 : 1700);
    }

    // ── poll del estado ──
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    function startPolling() {
      stopPolling();
      pollTimer = setInterval(async () => {
        if (S.phase !== "running" || !S.roundId) return;
        const { ok, d } = await post("state", { roundId: S.roundId });
        if (!ok) return;
        if (d.status === "busted") settleBust(Number(d.crash_point), S.balance);
        else if (d.status === "cashed") settleWin(Number(d.mult), Number(d.win), S.balance);
      }, 600);
    }
    function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

    // ── dibujo ──
    const cover = (im: HTMLImageElement) => { const s = Math.max(W / im.width, H / im.height), w = im.width * s, h = im.height * s; ctx.drawImage(im, (W - w) / 2, (H - h) * 0.35, w, h); };
    const bandDraw = (im: HTMLImageElement, scaleW: number, yBottom: number, off: number) => {
      const s = scaleW / im.width, w = im.width * s, h = im.height * s, y = yBottom - h;
      let x = -(((off % w) + w) % w); for (; x < W; x += w - 1) ctx.drawImage(im, x, y, w, h);
    };
    const spr = (key: string, cx: number, by: number, targetH: number, alpha?: number) => {
      const im = IMG[key]; if (!im) return; const s = targetH / im.height, w = im.width * s;
      ctx.save(); if (alpha != null) ctx.globalAlpha = alpha; ctx.drawImage(im, cx - w / 2, by - targetH, w, targetH); ctx.restore();
    };
    const sprC = (key: string, cx: number, cy: number, targetH: number, alpha?: number, rot?: number) => {
      const im = IMG[key]; if (!im) return; const s = targetH / im.height, w = im.width * s;
      ctx.save(); if (alpha != null) ctx.globalAlpha = alpha; ctx.translate(cx, cy); if (rot) ctx.rotate(rot);
      ctx.drawImage(im, -w / 2, -targetH / 2, w, targetH); ctx.restore();
    };
    const METEOR_FALL = 0.17;
    const runFrame = (now: number) => "run_" + (1 + Math.floor(now / 70) % 6);

    function drawScene(now: number) {
      if (IMG.night_sky) cover(IMG.night_sky);
      if (IMG.mountains) bandDraw(IMG.mountains, W * 1.25, groundY() + H * 0.06, S.scroll * 0.16);
      if (IMG.ground) bandDraw(IMG.ground, W * 1.06, H, S.scroll * 1.0);

      const bx = dinoX(), by = groundY();
      for (let i = S.dust.length - 1; i >= 0; i--) {
        const d = S.dust[i]; d.x += d.vx; d.y += d.vy; d.life -= 0.03; d.sc += 0.02;
        if (d.life <= 0) { S.dust.splice(i, 1); continue; }
        spr("dust_trail", d.x, d.y, H * 0.10 * d.sc, Math.max(0, d.life * 0.85));
      }
      const crashed = S.phase === "ended" && S.endKind === "crashed";
      const cashed = S.phase === "ended" && S.endKind === "cashed";
      const dinoH = H * 0.26;

      if (crashed) {
        const a = (now - S.endT) / 1000;
        if (a < METEOR_FALL) {
          spr(runFrame(now), bx, by, dinoH);
          const t = a / METEOR_FALL, mx = lerp(bx + W * 0.16, bx + 6, t), my = lerp(-H * 0.25, by - dinoH * 0.5, t * t);
          sprC("meteor", mx, my, H * 0.42, 1, 2.5);
        } else {
          const b = a - METEOR_FALL; spr("dead_dino", bx, by, dinoH * 0.92);
          const sc = clamp(b / 0.14, 0, 1), fade = clamp(1 - (b - 0.18) / 0.5, 0, 1);
          sprC("impact_explosion", bx, by - dinoH * 0.42, H * 0.5 * lerp(0.7, 1.12, sc), fade);
        }
      } else if (cashed) {
        spr(runFrame(now), bx, by, dinoH);
        const a = (now - S.endT) / 1000, sc = clamp(a / 0.16, 0, 1), fade = clamp(1 - (a - 0.2) / 0.9, 0, 1);
        sprC("gold_burst", bx, by - dinoH * 0.5, H * 0.6 * lerp(0.6, 1.1, sc), fade);
      } else if (S.phase === "running") {
        spr(runFrame(now), bx, by, dinoH);
      } else {
        spr("run_1", bx, by, dinoH);
      }
    }

    // ── update + loop ──
    let dustTick = 0;
    const update = (now: number) => {
      if (S.phase === "running") {
        const el = Math.max(0, (now - S.startPerf) / 1000); S.mult = Math.max(1, Math.exp(S.K * el)); S.scroll += 3.6;
        const a = parseFloat(q.auto.value);
        if (!isNaN(a) && a > 1 && S.cashAt === null && S.mult >= a) cashOut();
        if (!reduce && (dustTick = (dustTick + 1) % 5) === 0) {
          const bx = dinoX(), by = groundY();
          S.dust.push({ x: bx - H * 0.09, y: by - H * 0.03, vx: -1.5 - Math.random(), vy: -0.2 - Math.random() * 0.3, life: 1, sc: 0.6 });
        }
      } else if (S.phase === "ended") {
        if (S.endKind === "cashed") S.scroll += 2.0;
        if (S.shake > 0) S.shake = Math.max(0, S.shake - 0.05);
      }
      if (S.phase !== "idle") q.mult.textContent = S.mult.toFixed(2) + "×";
      if (S.phase === "running" && S.cashAt === null) {
        q.action.className = "dc-action cash"; q.action.innerHTML = "RETIRAR ✋<small>" + fmt(S.mult * S.bet) + " fichas</small>";
      } else if (S.phase === "running") { q.action.className = "dc-action wait"; q.action.textContent = "RETIRANDO…"; }
      else if (S.phase === "idle") { q.action.className = "dc-action bet"; q.action.textContent = "APOSTAR"; }
      else { q.action.className = "dc-action wait"; q.action.innerHTML = S.endKind === "cashed" ? "✓ COBRADO" : "💥 CRASH"; }
    };
    let raf = 0;
    const frame = (now: number) => {
      update(now); ctx.save();
      if (S.shake > 0) { const s = 8 * S.shake; ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s); }
      drawScene(now); ctx.restore(); raf = requestAnimationFrame(frame);
    };

    let alive = true;
    preload().then(() => {
      if (!alive) return;
      if (IMG.dino_badge) ($(".dc-logo") as HTMLImageElement).src = `${BASE}/dino_badge.webp`;
      if (activa) resume(activa);
      else { q.status.textContent = "Poné tu apuesta y arrancá"; q.action.className = "dc-action bet"; q.action.textContent = "APOSTAR"; }
      clampBet(); raf = requestAnimationFrame(frame);
    });

    return () => {
      alive = false; cancelAnimationFrame(raf); stopPolling(); if (resetTimer) clearTimeout(resetTimer);
      ro.disconnect(); q.action.removeEventListener("click", onAction);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={rootRef} className="dc-root mx-auto max-w-[940px] px-4 py-6 sm:px-6">
      <style>{CSS}</style>
      <header className="dc-top">
        <div className="dc-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <div className="dc-badge"><img className="dc-logo" alt="Dino Crash" /></div>
          <div><h1>DINO CRASH</h1><p>Retirá antes de que caiga el meteorito</p></div>
        </div>
        <div className="dc-balance"><div className="dc-lbl">Saldo</div><div className="dc-bal">0</div></div>
      </header>

      <div className="dc-stage">
        <canvas ref={canvasRef} className="dc-canvas" />
        <div className="dc-hud">
          <div className="dc-row">
            <div className="dc-hist" />
            <div className="dc-fair">provably fair</div>
          </div>
        </div>
        <div className="dc-center">
          <div className="dc-status">Cargando…</div>
          <div className="dc-mult">1.00×</div>
          <div className="dc-pay" />
        </div>
      </div>

      <div className="dc-controls">
        <div className="dc-field">
          <div className="dc-lbl">Apuesta</div>
          <div className="dc-stepper">
            <button className="dc-bminus" aria-label="menos">–</button>
            <input className="dc-bet dc-txt" inputMode="numeric" defaultValue="100" />
            <button className="dc-bplus" aria-label="más">+</button>
          </div>
          <div className="dc-quick">
            <button data-b="45">45</button><button data-b="100">100</button>
            <button data-b="500">500</button><button data-b="max">MAX</button>
          </div>
        </div>
        <div className="dc-field">
          <div className="dc-lbl">Auto-retiro ×</div>
          <input className="dc-auto dc-txt" inputMode="decimal" placeholder="—" defaultValue="2.00" />
          <div className="dc-quick">
            <button data-a="1.5">1.5×</button><button data-a="2">2×</button>
            <button data-a="5">5×</button><button data-a="off">off</button>
          </div>
        </div>
        <div className="dc-act-cell"><button className="dc-action wait">CARGANDO…</button></div>
      </div>

      <p className="dc-foot">
        <b>Cómo se juega:</b> apostás, el dino corre y el multiplicador sube. Tocá <span className="dc-tag">RETIRAR</span> antes
        de que caiga el meteorito para cobrar <em>apuesta × multiplicador</em>. El meteorito <b>cae de golpe, sin aviso</b> 💥.
        <br />
        <b>Provably fair · RTP 95%.</b> El punto de crash sale de un seed comprometido (hash) antes de la ronda y revelado
        después — verificable. Techo de premio: 200.000 fichas por ronda.
      </p>
    </div>
  );
}

const CSS = `
.dc-root{--dc-line:#432c5e;--dc-ink:#f6eede;--dc-muted:#b6a6cd;--dc-gold:#ffca44;--dc-fire:#ff6a1a;--dc-fire2:#ffd23f;--dc-danger:#ff4a3d;--dc-good:#5ad98a;color:var(--dc-ink);font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.dc-root *{box-sizing:border-box}
.dc-top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:14px}
.dc-brand{display:flex;align-items:center;gap:12px}
.dc-badge{width:52px;height:52px;display:grid;place-items:center}
.dc-badge img{width:74px;height:auto;filter:drop-shadow(0 4px 10px rgba(240,145,42,.55));margin:-6px}
.dc-brand h1{margin:0;font-size:23px;font-weight:800;letter-spacing:-.02em;line-height:1;background:linear-gradient(180deg,#ffe89a,#f5a11e);-webkit-background-clip:text;background-clip:text;color:transparent}
.dc-brand p{margin:3px 0 0;font-size:12px;color:var(--dc-muted)}
.dc-balance{text-align:right;background:linear-gradient(180deg,#301d46,#241634);border:1px solid var(--dc-line);border-radius:12px;padding:8px 14px}
.dc-lbl{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--dc-muted)}
.dc-balance .dc-bal{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;color:var(--dc-gold)}
.dc-balance .dc-bal::after{content:" fichas";font-size:11px;font-weight:600;color:var(--dc-muted)}
.dc-stage{position:relative;border:1px solid var(--dc-line);border-radius:18px;overflow:hidden;background:#160e24;box-shadow:0 22px 55px -22px rgba(0,0,0,.75);aspect-ratio:16/9}
@media(max-width:560px){.dc-stage{aspect-ratio:5/4}}
.dc-canvas{display:block;width:100%;height:100%}
.dc-hud{position:absolute;inset:0;pointer-events:none;padding:12px}
.dc-row{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
.dc-hist{display:flex;gap:6px;flex-wrap:wrap;max-width:64%}
.dc-chip{font-family:ui-monospace,Menlo,monospace;font-size:11px;font-weight:700;padding:3px 7px;border-radius:999px;background:rgba(10,6,20,.42);border:1px solid rgba(255,255,255,.08)}
.dc-chip.lo{color:#ffb0a8;border-color:rgba(255,74,61,.4)}
.dc-chip.mid{color:var(--dc-gold);border-color:rgba(255,202,68,.4)}
.dc-chip.hi{color:#ffd9a1;border-color:rgba(255,106,26,.55)}
.dc-fair{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;color:var(--dc-muted);text-align:right;background:rgba(10,6,20,.42);border:1px solid rgba(255,255,255,.07);border-radius:9px;padding:5px 8px;max-width:220px}
.dc-fair b{color:#e0d2f4;font-weight:700}
.dc-center{position:absolute;left:0;right:0;top:42%;transform:translateY(-50%);text-align:center;pointer-events:none}
.dc-status{font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--dc-muted);margin-bottom:2px;min-height:15px;text-shadow:0 2px 8px rgba(0,0,0,.7)}
.dc-mult{font-size:clamp(52px,11vw,104px);font-weight:800;line-height:.9;letter-spacing:-.03em;font-variant-numeric:tabular-nums;color:#fff;text-shadow:0 4px 26px rgba(0,0,0,.75)}
.dc-mult.win{color:var(--dc-good);text-shadow:0 0 36px rgba(90,217,138,.6)}
.dc-mult.bust{color:var(--dc-danger);text-shadow:0 0 36px rgba(255,74,61,.65)}
.dc-pay{font-size:15px;font-weight:700;color:var(--dc-gold);min-height:20px;margin-top:4px;font-variant-numeric:tabular-nums;text-shadow:0 2px 8px rgba(0,0,0,.6)}
.dc-controls{margin-top:14px;display:grid;grid-template-columns:1fr 1fr 1.3fr;gap:12px}
@media(max-width:560px){.dc-controls{grid-template-columns:1fr 1fr;gap:10px}.dc-act-cell{grid-column:1/-1}}
.dc-field{background:linear-gradient(180deg,#301d46,#241634);border:1px solid var(--dc-line);border-radius:14px;padding:10px 12px}
.dc-stepper{display:flex;align-items:center;gap:8px}
.dc-stepper button{width:30px;height:30px;border-radius:9px;border:1px solid var(--dc-line);background:#301d46;color:var(--dc-ink);font-size:17px;font-weight:800;cursor:pointer;line-height:1}
.dc-stepper button:hover{border-color:var(--dc-gold);color:var(--dc-gold)}
.dc-txt{flex:1;width:100%;background:#0e0818;border:1px solid var(--dc-line);border-radius:9px;color:var(--dc-ink);font-family:ui-monospace,Menlo,monospace;font-size:16px;font-weight:700;text-align:center;padding:6px 4px;min-width:0}
.dc-root input:focus-visible,.dc-root button:focus-visible{outline:2px solid var(--dc-gold);outline-offset:2px}
.dc-quick{display:flex;gap:5px;margin-top:8px}
.dc-quick button{flex:1;font-size:11px;font-weight:700;padding:5px 0;border-radius:8px;border:1px solid var(--dc-line);background:transparent;color:var(--dc-muted);cursor:pointer}
.dc-quick button:hover{color:var(--dc-gold);border-color:var(--dc-gold)}
.dc-act-cell{display:flex}
.dc-action{flex:1;border:none;border-radius:14px;font-size:19px;font-weight:800;cursor:pointer;color:#12100a;font-variant-numeric:tabular-nums;padding:14px;transition:transform .08s,filter .15s;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:74px}
.dc-action small{font-size:11px;font-weight:700;opacity:.78}
.dc-action:active{transform:translateY(1px)}
.dc-action.bet{background:linear-gradient(180deg,#6fd049,#4ea62f);color:#0c2109;box-shadow:0 8px 22px -8px rgba(78,166,47,.8)}
.dc-action.cash{background:linear-gradient(180deg,var(--dc-fire2),var(--dc-fire));color:#3a1400;box-shadow:0 8px 26px -6px rgba(255,106,26,.75);animation:dcpulse 1s ease-in-out infinite}
.dc-action.wait{background:#2c2042;color:var(--dc-muted);cursor:not-allowed;box-shadow:none}
@keyframes dcpulse{0%,100%{filter:brightness(1)}50%{filter:brightness(1.15)}}
.dc-foot{margin-top:16px;font-size:12px;color:var(--dc-muted);line-height:1.55;border-top:1px solid var(--dc-line);padding-top:12px}
.dc-foot b{color:#e0d2f4}
.dc-tag{display:inline-block;background:#241634;border:1px solid var(--dc-line);border-radius:6px;padding:1px 6px;font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--dc-gold)}
@media(prefers-reduced-motion:reduce){.dc-action.cash{animation:none}}
`;
