"use client";

import { useEffect, useRef } from "react";

interface Props { saldoInicial: number }

const BASE = "/juegos/dino-crash";
const IMG_KEYS = [
  "night_sky", "mountains", "ground", "meteor", "impact_explosion",
  "gold_burst", "dust_trail", "dead_dino", "dino_badge",
  "run_1", "run_2", "run_3", "run_4", "run_5", "run_6",
];

type Phase = "betting" | "running" | "crashed";
interface MyBet { bet: number; status: "active" | "cashed" | "lost"; cashout_mult?: number | null; win?: number }
interface Dust { x: number; y: number; life: number; sc: number; vx: number; vy: number }

interface Cfg { K: number; maxWin: number; minBet: number; maxBet: number; betOptions: number[]; bettingSecs: number; crashHold: number }
interface GameState {
  ready: boolean; offset: number; // serverNow - clientNow (s)
  roundId: string | null; nonce: number; phase: Phase; hash: string;
  bettingEndsAt: number; runningStartedAt: number; crashPoint: number | null;
  myBet: MyBet | null; betPending: boolean; cashPending: boolean; auto: boolean;
  cfg: Cfg; balance: number; bet: number;
  serverMult: number; dispMult: number; // dispMult = lo que se muestra; nunca pasa al server (sin overshoot)
  scroll: number; shake: number; dust: Dust[];
  crashFxRound: string | null; crashFxT: number; cashFxT: number;
  lastVerifyRound: string | null; lastVerifyNonce: number;
}

export function DinoCrash({ saldoInicial }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current!;
    const cv = canvasRef.current!;
    const ctx = cv.getContext("2d")!;
    const reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;
    const $ = (s: string) => root.querySelector(s) as HTMLElement;
    const q = {
      status: $(".dc-status"), mult: $(".dc-mult"), pay: $(".dc-pay"), bal: $(".dc-bal"),
      action: $(".dc-action") as HTMLButtonElement, hist: $(".dc-hist"), fair: $(".dc-fair"),
      bet: $(".dc-bet") as HTMLInputElement, auto: $(".dc-auto") as HTMLInputElement, autobet: $(".dc-autobet"),
    };
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
    const fmt = (n: number) => Math.round(n).toLocaleString("es-AR");
    const nowP = () => performance.now();

    let W = 0, H = 0, DPR = 1;
    const resize = () => {
      DPR = Math.min(2, window.devicePixelRatio || 1);
      const r = cv.getBoundingClientRect(); W = r.width; H = r.height;
      cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    const ro = new ResizeObserver(resize); ro.observe(cv); resize();

    const DINO_X = 0.30, GROUND_Y = 0.82;
    const dinoX = () => W * DINO_X, groundY = () => H * GROUND_Y;

    const IMG: Record<string, HTMLImageElement> = {};
    const preload = () => new Promise<void>((res) => {
      let n = 0; IMG_KEYS.forEach((k) => { const im = new Image(); im.onload = im.onerror = () => { IMG[k] = im; if (++n === IMG_KEYS.length) res(); }; im.src = `${BASE}/${k}.webp`; });
    });

    const S: GameState = {
      ready: false, offset: 0, roundId: null, nonce: 0, phase: "betting", hash: "",
      bettingEndsAt: 0, runningStartedAt: 0, crashPoint: null,
      myBet: null, betPending: false, cashPending: false, auto: false,
      cfg: { K: 0.14, maxWin: 200000, minBet: 10, maxBet: 10000, betOptions: [45, 100, 500], bettingSecs: 5, crashHold: 3 },
      balance: saldoInicial, bet: 100, serverMult: 1, dispMult: 1, scroll: 0, shake: 0, dust: [],
      crashFxRound: null, crashFxT: 0, cashFxT: 0, lastVerifyRound: null, lastVerifyNonce: 0,
    };
    q.bal.textContent = fmt(S.balance);
    const estNow = () => Date.now() / 1000 + S.offset;

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

    const post = async (path: string, body?: unknown) => {
      const r = await fetch(`/api/juegos/dino-crash/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : "{}" });
      const d = await r.json().catch(() => ({}));
      return { ok: r.ok, d } as { ok: boolean; d: Record<string, unknown> };
    };

    // ── controles ──
    const affordable = () => S.bet >= S.cfg.minBet && S.bet <= S.balance;
    const clampBet = () => {
      let b = parseInt(q.bet.value.replace(/\D/g, "")) || 0;
      b = clamp(b, S.cfg.minBet, Math.min(S.cfg.maxBet, Math.max(S.cfg.minBet, S.balance || S.cfg.minBet)));
      q.bet.value = String(b); S.bet = b; return b;
    };
    q.bet.value = String(S.bet);
    q.bet.addEventListener("change", clampBet);
    $(".dc-bminus").addEventListener("click", () => { const v = parseInt(q.bet.value) || 0; q.bet.value = String(Math.max(S.cfg.minBet, v - Math.max(10, Math.round(v * 0.2)))); clampBet(); });
    $(".dc-bplus").addEventListener("click", () => { const v = parseInt(q.bet.value) || 0; q.bet.value = String(v + Math.max(10, Math.round(v * 0.2))); clampBet(); });
    root.querySelectorAll<HTMLElement>(".dc-quick [data-b]").forEach((b) => b.addEventListener("click", () => { q.bet.value = b.dataset.b === "max" ? String(Math.min(S.cfg.maxBet, S.balance)) : b.dataset.b!; clampBet(); }));
    root.querySelectorAll<HTMLElement>(".dc-quick [data-a]").forEach((b) => b.addEventListener("click", () => { q.auto.value = b.dataset.a === "off" ? "" : Number(b.dataset.a).toFixed(2); }));

    const onAction = () => {
      if (S.phase === "betting" && !S.myBet && !S.betPending) placeBet();
      else if (S.phase === "running" && S.myBet?.status === "active" && !S.cashPending) cashOut();
    };
    q.action.addEventListener("click", onAction);
    const onAutobet = () => { S.auto = !S.auto; q.autobet.classList.toggle("on", S.auto); };
    q.autobet.addEventListener("click", onAutobet);

    const setBalance = (v: number) => { S.balance = Math.max(0, Math.round(v)); q.bal.textContent = fmt(S.balance); };
    const chipCls = (m: number) => (m < 2 ? "lo" : m < 10 ? "mid" : "hi");
    const pushHistory = (m: number) => {
      const c = document.createElement("div"); c.className = "dc-chip " + chipCls(m); c.textContent = m.toFixed(2) + "×";
      q.hist.prepend(c); while (q.hist.children.length > 8) q.hist.lastChild!.remove();
    };
    const setFairRunning = () => { q.fair.innerHTML = `ronda #${S.nonce}<br>hash <b>${(S.hash || "").slice(0, 10)}…</b>`; };
    const setFairVerify = (roundId: string) => {
      q.fair.innerHTML = `ronda #${S.lastVerifyNonce} · <span class="dc-verlink">verificar ✓</span>`;
      (q.fair.querySelector(".dc-verlink") as HTMLElement)?.addEventListener("click", () => verificar(roundId));
    };
    async function verificar(roundId: string) {
      const { ok, d } = await post("verify", { roundId });
      if (!ok) { q.fair.innerHTML = `verificar: ${String(d.error ?? "error")}`; return; }
      const good = d.hash_ok && d.match;
      q.fair.innerHTML = `${good ? "✓ verificado" : "⚠ no coincide"}<br>crash <b>${Number(d.crash_point).toFixed(2)}×</b> = <b>${Number(d.crash_recomputed).toFixed(2)}×</b>`;
    }

    async function placeBet() {
      if (S.betPending || S.myBet || S.phase !== "betting") return;
      const bet = clampBet();
      if (!affordable()) { q.status.textContent = "No te alcanzan las fichas"; return; }
      S.betPending = true;
      const { ok, d } = await post("bet", { bet });
      S.betPending = false;
      if (!ok) { q.status.textContent = String(d.error ?? "No se pudo apostar."); return; }
      setBalance(Number(d.new_balance)); S.myBet = { bet: Number(d.bet), status: "active" };
    }
    async function cashOut() {
      if (S.phase !== "running" || S.myBet?.status !== "active" || S.cashPending) return;
      S.cashPending = true; const m = S.dispMult;
      const { ok, d } = await post("cashout", { mult: m });
      S.cashPending = false;
      if (!ok) { q.status.textContent = String(d.error ?? "No se pudo retirar."); return; }
      // "cuando retiro que no vuelva a arrancar": apaga el auto-apostar.
      S.auto = false; q.autobet.classList.remove("on");
      if (d.result === "cashed") {
        S.myBet = { bet: S.myBet!.bet, status: "cashed", cashout_mult: Number(d.mult), win: Number(d.win) };
        setBalance(Number(d.new_balance)); S.cashFxT = nowP();
        blip(660, 0.12, "sine"); blip(880, 0.14, "sine", 0.07); blip(1180, 0.12, "sine", 0.14);
      } else {
        S.myBet = { bet: S.myBet!.bet, status: d.result === "lost" ? "lost" : "active" };
      }
    }

    // ── poll de la ronda global ──
    function applyTick(d: Record<string, unknown>) {
      const cfg = S.cfg;
      cfg.K = Number(d.growth) || cfg.K; cfg.maxWin = Number(d.max_win) || cfg.maxWin;
      cfg.minBet = Number(d.min_bet) || cfg.minBet; cfg.maxBet = Number(d.max_bet) || cfg.maxBet;
      cfg.bettingSecs = Number(d.betting_secs) || cfg.bettingSecs; cfg.crashHold = Number(d.crash_hold) || cfg.crashHold;
      if (Array.isArray(d.bet_options)) cfg.betOptions = (d.bet_options as number[]).map(Number);
      S.offset = Number(d.server_now) - Date.now() / 1000;

      const newRound = String(d.round_id);
      const phase = String(d.phase) as Phase;
      const roundChanged = newRound !== S.roundId;

      S.roundId = newRound; S.nonce = Number(d.nonce); S.hash = String(d.hash);
      S.bettingEndsAt = Number(d.betting_ends_at); S.runningStartedAt = Number(d.running_started_at);
      S.crashPoint = d.crash_point != null ? Number(d.crash_point) : null;
      S.myBet = d.my_bet ? (d.my_bet as MyBet) : null;
      S.phase = phase;

      // Multiplicador AUTORITATIVO del server (sólo válido mientras corre). El
      // display se suaviza hacia acá y nunca lo pasa → no hay overshoot ni salto.
      if (phase === "running") S.serverMult = Math.max(1, Number(d.mult) || 1);

      if (roundChanged) {
        // nueva ronda: reinicio el multiplicador mostrado
        S.serverMult = phase === "running" ? Math.max(1, Number(d.mult) || 1) : 1;
        S.dispMult = 1;
        if (phase === "betting") {
          S.crashFxRound = null; S.cashFxT = 0;
          setFairRunning();
          // auto-apostar: entra solo si está activo y me alcanza
          if (S.auto && !S.myBet && affordable()) placeBet();
        }
      }
      // detectar crash (una vez por ronda) para disparar la animación del meteorito
      if (phase === "crashed" && S.crashFxRound !== newRound) {
        S.crashFxRound = newRound; S.crashFxT = nowP(); S.shake = reduce ? 0 : 1;
        S.lastVerifyRound = newRound; S.lastVerifyNonce = S.nonce;
        if (S.crashPoint != null) { S.dispMult = S.crashPoint; pushHistory(S.crashPoint); }
        blip(150, 0.3, "sawtooth"); blip(80, 0.36, "sawtooth", 0.08);
      }
    }
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let polling = false;
    async function poll() { const { ok, d } = await post("tick"); if (ok) { applyTick(d); S.ready = true; } }
    // Poll más rápido mientras la ronda corre (menos overshoot), más lento el resto.
    function scheduleNextPoll() {
      if (!polling) return;
      pollTimer = setTimeout(async () => { await poll(); scheduleNextPoll(); }, S.phase === "running" ? 150 : 500);
    }

    // ── dibujo ──
    const cover = (im: HTMLImageElement) => { const s = Math.max(W / im.width, H / im.height), w = im.width * s, h = im.height * s; ctx.drawImage(im, (W - w) / 2, (H - h) * 0.35, w, h); };
    const band = (im: HTMLImageElement, scaleW: number, yBottom: number, off: number) => { const s = scaleW / im.width, w = im.width * s, h = im.height * s, y = yBottom - h; let x = -(((off % w) + w) % w); for (; x < W; x += w - 1) ctx.drawImage(im, x, y, w, h); };
    const spr = (key: string, cx: number, by: number, tH: number, a?: number) => { const im = IMG[key]; if (!im) return; const s = tH / im.height, w = im.width * s; ctx.save(); if (a != null) ctx.globalAlpha = a; ctx.drawImage(im, cx - w / 2, by - tH, w, tH); ctx.restore(); };
    const sprC = (key: string, cx: number, cy: number, tH: number, a?: number, rot?: number) => { const im = IMG[key]; if (!im) return; const s = tH / im.height, w = im.width * s; ctx.save(); if (a != null) ctx.globalAlpha = a; ctx.translate(cx, cy); if (rot) ctx.rotate(rot); ctx.drawImage(im, -w / 2, -tH / 2, w, tH); ctx.restore(); };
    const METEOR_FALL = 0.17;
    const runFrame = (t: number) => "run_" + (1 + Math.floor(t / 70) % 6);

    function drawScene(t: number) {
      if (IMG.night_sky) cover(IMG.night_sky);
      if (IMG.mountains) band(IMG.mountains, W * 1.25, groundY() + H * 0.06, S.scroll * 0.16);
      if (IMG.ground) band(IMG.ground, W * 1.06, H, S.scroll * 1.0);
      const bx = dinoX(), by = groundY();
      for (let i = S.dust.length - 1; i >= 0; i--) { const d = S.dust[i]; d.x += d.vx; d.y += d.vy; d.life -= 0.03; d.sc += 0.02; if (d.life <= 0) { S.dust.splice(i, 1); continue; } spr("dust_trail", d.x, d.y, H * 0.10 * d.sc, Math.max(0, d.life * 0.85)); }
      const dinoH = H * 0.26;
      if (S.phase === "crashed") {
        const a = (t - S.crashFxT) / 1000;
        if (a < METEOR_FALL) {
          spr(runFrame(t), bx, by, dinoH);
          const tt = a / METEOR_FALL, mx = lerp(bx + W * 0.16, bx + 6, tt), my = lerp(-H * 0.25, by - dinoH * 0.5, tt * tt);
          sprC("meteor", mx, my, H * 0.42, 1, 2.5);
        } else {
          const b = a - METEOR_FALL; spr("dead_dino", bx, by, dinoH * 0.92);
          const sc = clamp(b / 0.14, 0, 1), fade = clamp(1 - (b - 0.18) / 0.5, 0, 1);
          sprC("impact_explosion", bx, by - dinoH * 0.42, H * 0.5 * lerp(0.7, 1.12, sc), fade);
        }
      } else {
        spr(runFrame(t), bx, by, dinoH);
        if (S.cashFxT && t - S.cashFxT < 900) { const a = (t - S.cashFxT) / 1000, s2 = clamp(a / 0.16, 0, 1), fade = clamp(1 - (a - 0.2) / 0.7, 0, 1); sprC("gold_burst", bx, by - dinoH * 0.5, H * 0.6 * lerp(0.6, 1.1, s2), fade); }
      }
    }

    // ── update + loop ──
    let dustTick = 0;
    const update = (t: number) => {
      const runningish = S.phase !== "crashed";
      if (runningish) { S.scroll += 3.6; if (!reduce && (dustTick = (dustTick + 1) % 5) === 0) { const bx = dinoX(), by = groundY(); S.dust.push({ x: bx - H * 0.09, y: by - H * 0.03, vx: -1.5 - Math.random(), vy: -0.2 - Math.random() * 0.3, life: 1, sc: 0.6 }); } }
      if (S.shake > 0) S.shake = Math.max(0, S.shake - 0.05);
      if (!S.ready) { q.status.textContent = "Cargando…"; return; }

      const mine = S.myBet;
      if (S.phase === "betting") {
        const rem = Math.max(0, S.bettingEndsAt - estNow());
        q.mult.className = "dc-mult count"; q.mult.textContent = Math.max(1, Math.ceil(rem)) + "";
        q.status.textContent = mine ? "Apostaste — arranca en " + Math.ceil(rem) + "s" : "Apuestas abiertas · " + Math.ceil(rem) + "s";
        q.pay.textContent = mine ? "Apostaste " + fmt(mine.bet) + " fichas" : "";
      } else if (S.phase === "running") {
        // el número mostrado se acerca suave al último confirmado por el server,
        // sin pasarlo nunca → no se pasa del crash ni salta para atrás.
        S.dispMult += (Math.max(1, S.serverMult) - S.dispMult) * 0.2;
        const m = S.dispMult;
        // auto-retiro
        const at = parseFloat(q.auto.value);
        if (mine?.status === "active" && !isNaN(at) && at > 1 && !S.cashPending && m >= at) cashOut();
        q.mult.className = "dc-mult" + (mine?.status === "cashed" ? " win" : "");
        q.mult.textContent = m.toFixed(2) + "×";
        if (mine?.status === "cashed") { q.status.textContent = "✓ Cobraste a " + Number(mine.cashout_mult).toFixed(2) + "×"; q.pay.textContent = "+" + fmt((mine.win ?? 0) - mine.bet) + " fichas"; }
        else if (mine?.status === "active") { q.status.textContent = "¡Retirate antes del meteorito!"; q.pay.textContent = fmt(m * mine.bet) + " fichas"; }
        else { q.status.textContent = "Ronda en curso · apostá en la próxima"; q.pay.textContent = ""; }
      } else { // crashed
        q.mult.className = "dc-mult bust"; q.mult.textContent = (S.crashPoint ?? 1).toFixed(2) + "×";
        if (mine?.status === "cashed") { q.status.textContent = "✓ Cobraste a " + Number(mine.cashout_mult).toFixed(2) + "×"; q.pay.textContent = "+" + fmt((mine.win ?? 0) - mine.bet) + " fichas"; }
        else if (mine) { q.status.textContent = "💥 ¡Crash! El dino no la contó"; q.pay.textContent = "−" + fmt(mine.bet) + " fichas"; }
        else { q.status.textContent = "💥 ¡Crash! El dino no la contó"; q.pay.textContent = ""; }
        if (S.lastVerifyRound && S.crashFxRound === S.lastVerifyRound) setFairVerify(S.lastVerifyRound);
      }

      // botón
      if (S.phase === "betting" && !mine && !S.betPending) { q.action.className = "dc-action bet"; q.action.textContent = "APOSTAR"; }
      else if (S.phase === "betting") { q.action.className = "dc-action armed"; q.action.innerHTML = "APOSTADO ✓<small>esperando…</small>"; }
      else if (S.phase === "running" && mine?.status === "active" && !S.cashPending) { q.action.className = "dc-action cash"; q.action.innerHTML = "RETIRAR ✋<small>" + fmt(S.dispMult * mine.bet) + " fichas</small>"; }
      else if (S.phase === "running" && mine?.status === "active") { q.action.className = "dc-action wait"; q.action.textContent = "RETIRANDO…"; }
      else if (S.phase === "running" && mine?.status === "cashed") { q.action.className = "dc-action wait"; q.action.textContent = "✓ COBRADO"; }
      else if (S.phase === "running") { q.action.className = "dc-action wait"; q.action.textContent = "MIRANDO"; }
      else { q.action.className = "dc-action wait"; q.action.innerHTML = mine?.status === "cashed" ? "✓ COBRADO" : "💥 CRASH"; }
    };
    let raf = 0;
    const frame = (t: number) => { update(t); ctx.save(); if (S.shake > 0) { const s = 8 * S.shake; ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s); } drawScene(t); ctx.restore(); raf = requestAnimationFrame(frame); };

    let alive = true;
    preload().then(async () => {
      if (!alive) return;
      if (IMG.dino_badge) ($(".dc-logo") as HTMLImageElement).src = `${BASE}/dino_badge.webp`;
      await poll();
      polling = true; scheduleNextPoll();
      raf = requestAnimationFrame(frame);
    });

    return () => {
      alive = false; polling = false; cancelAnimationFrame(raf); if (pollTimer) clearTimeout(pollTimer);
      ro.disconnect(); q.action.removeEventListener("click", onAction); q.autobet.removeEventListener("click", onAutobet);
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
          <div><h1>DINO CRASH</h1><p>Ronda compartida · retirá antes del meteorito</p></div>
        </div>
        <div className="dc-balance"><div className="dc-lbl">Saldo</div><div className="dc-bal">0</div></div>
      </header>

      <div className="dc-stage">
        <canvas ref={canvasRef} className="dc-canvas" />
        <div className="dc-hud">
          <div className="dc-row">
            <div className="dc-hist" />
            <div className="dc-fair">cargando…</div>
          </div>
        </div>
        <div className="dc-center">
          <div className="dc-status">Cargando…</div>
          <div className="dc-mult count">5</div>
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
        <div className="dc-act-cell">
          <button className="dc-autobet" title="Apostar solo en cada ronda">Auto-apostar</button>
          <button className="dc-action wait">CARGANDO…</button>
        </div>
      </div>

      <p className="dc-foot">
        <b>Ronda compartida:</b> todos juegan la misma ronda. Cada ronda tenés <b>5 segundos</b> para apostar; después
        arranca, el multiplicador sube igual para todos y tocás <span className="dc-tag">RETIRAR</span> antes de que caiga el
        meteorito 💥 (cae de golpe). Cuando te retirás, <b>no volvés a entrar solo</b> hasta que apuestes de nuevo (o usés Auto-apostar).
        <br />
        <b>Provably fair · RTP 95%.</b> El crash de cada ronda sale de un seed comprometido (hash) antes de arrancar y revelado
        después. Techo de premio: 200.000 fichas por ronda.
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
.dc-fair{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;color:var(--dc-muted);text-align:right;background:rgba(10,6,20,.42);border:1px solid rgba(255,255,255,.07);border-radius:9px;padding:5px 8px;max-width:220px;pointer-events:auto}
.dc-fair b{color:#e0d2f4;font-weight:700}
.dc-verlink{cursor:pointer;color:#ffca44}
.dc-center{position:absolute;left:0;right:0;top:42%;transform:translateY(-50%);text-align:center;pointer-events:none}
.dc-status{font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--dc-muted);margin-bottom:2px;min-height:15px;text-shadow:0 2px 8px rgba(0,0,0,.7)}
.dc-mult{font-size:clamp(52px,11vw,104px);font-weight:800;line-height:.9;letter-spacing:-.03em;font-variant-numeric:tabular-nums;color:#fff;text-shadow:0 4px 26px rgba(0,0,0,.75)}
.dc-mult.count{color:#ffe08a}
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
.dc-act-cell{display:flex;flex-direction:column;gap:8px}
.dc-autobet{border:1px solid var(--dc-line);background:#241634;color:var(--dc-muted);border-radius:10px;padding:7px;font-size:12px;font-weight:700;cursor:pointer;letter-spacing:.02em}
.dc-autobet.on{background:linear-gradient(180deg,#3a2a12,#2a1e0c);border-color:var(--dc-gold);color:var(--dc-gold)}
.dc-autobet::before{content:"○ "}
.dc-autobet.on::before{content:"● "}
.dc-action{flex:1;border:none;border-radius:14px;font-size:19px;font-weight:800;cursor:pointer;color:#12100a;font-variant-numeric:tabular-nums;padding:14px;transition:transform .08s,filter .15s;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:64px}
.dc-action small{font-size:11px;font-weight:700;opacity:.78}
.dc-action:active{transform:translateY(1px)}
.dc-action.bet{background:linear-gradient(180deg,#6fd049,#4ea62f);color:#0c2109;box-shadow:0 8px 22px -8px rgba(78,166,47,.8)}
.dc-action.armed{background:linear-gradient(180deg,#ffe08a,#e0a828);color:#3a2600;box-shadow:0 8px 22px -8px rgba(224,168,40,.7)}
.dc-action.cash{background:linear-gradient(180deg,var(--dc-fire2),var(--dc-fire));color:#3a1400;box-shadow:0 8px 26px -6px rgba(255,106,26,.75);animation:dcpulse 1s ease-in-out infinite}
.dc-action.wait{background:#2c2042;color:var(--dc-muted);cursor:not-allowed;box-shadow:none}
@keyframes dcpulse{0%,100%{filter:brightness(1)}50%{filter:brightness(1.15)}}
.dc-foot{margin-top:16px;font-size:12px;color:var(--dc-muted);line-height:1.55;border-top:1px solid var(--dc-line);padding-top:12px}
.dc-foot b{color:#e0d2f4}
.dc-tag{display:inline-block;background:#241634;border:1px solid var(--dc-line);border-radius:6px;padding:1px 6px;font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--dc-gold)}
@media(prefers-reduced-motion:reduce){.dc-action.cash{animation:none}}
`;
