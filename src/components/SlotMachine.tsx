"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SlotEngine, type Grid } from "@/lib/slots/engine";
import type { SlotTheme } from "@/lib/slots/themes/types";
import { SlotSound, unlockAudio, setMuted, isMuted } from "@/lib/slots/sound";

// ── Config que llega del server (tablas slots / slot_symbols) ──
export interface SlotConfig {
  slug: string;
  name: string;
  tagline: string | null;
  reels: number;
  rows: number;
  paylines: number[][];
  bet_options: number[];
  factor: Record<string, number>;
  mult_config: Record<string, number>;
  freespins: { trigger: string; min: number; grant: number };
  active: boolean;
}
export interface SlotSymbolRow {
  slot_slug: string;
  symbol: string;
  value: number;
  weight: number;
  is_wild: boolean;
  sort: number | null;
}

interface WinLine {
  line: number;
  symbol: string;
  count: number;
  pay: number;
  cells: [number, number][];
}
interface SpinResult {
  spin_id: string;
  grid: Grid;
  wins: WinLine[];
  total_win: number;
  mult: number;
  was_free: boolean;
  free_awarded: number;
  free_remaining: number;
  free_bet?: number;
  new_balance: number;
  server_seed_hash: string;
  nonce: number;
}
interface HistItem {
  spinId: string;
  bet: number;
  total: number;
  mult: number;
  wasFree: boolean;
}

const fmt = (n: number) => n.toLocaleString("es");

function obtenerClientSeed(): string {
  const KEY = "slot_client_seed";
  try {
    const prev = localStorage.getItem(KEY);
    if (prev) return prev;
  } catch {}
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const seed = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  try {
    localStorage.setItem(KEY, seed);
  } catch {}
  return seed;
}

export function SlotMachine({
  config,
  symbols,
  theme,
  saldoInicial,
  freeInicial,
}: {
  config: SlotConfig;
  symbols: SlotSymbolRow[];
  theme: SlotTheme;
  saldoInicial: number;
  freeInicial: number;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const windowRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<SlotEngine | null>(null);
  const clientSeedRef = useRef<string>("");
  const soundRef = useRef<SlotSound | null>(null);
  const fxRef = useRef<HTMLDivElement | null>(null);
  const countRef = useRef<number>(0);
  const winTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fsTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [saldo, setSaldo] = useState(saldoInicial);
  const [free, setFree] = useState(freeInicial);
  const [bet, setBet] = useState(config.bet_options[0]);
  const [girando, setGirando] = useState(false);
  const [auto, setAuto] = useState(false);
  const [win, setWin] = useState(0);
  const [winShown, setWinShown] = useState(0);
  const [winFx, setWinFx] = useState<{ amount: number; big: boolean } | null>(null);
  const [fsFx, setFsFx] = useState<number | null>(null);
  const [mute, setMute] = useState(false);
  const [comprando, setComprando] = useState(false);
  const [msg, setMsg] = useState<{ txt: string; tono: "ok" | "err" | "info" } | null>(null);
  const [ultimo, setUltimo] = useState<SpinResult | null>(null);
  const [hist, setHist] = useState<HistItem[]>([]);
  const [prueba, setPrueba] = useState<Record<string, unknown> | null>(null);

  const symbolOrder = symbols
    .slice()
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.symbol.localeCompare(b.symbol))
    .map((s) => s.symbol);

  // Montar el motor. El tamaño de celda se calcula según el ancho disponible
  // para que los `reels` rodillos SIEMPRE entren (responsive: móvil incluido).
  useEffect(() => {
    clientSeedRef.current = obtenerClientSeed();
    soundRef.current = new SlotSound(theme.sound);
    setMute(isMuted());
    const mount = mountRef.current;
    const win = windowRef.current;
    if (!mount || !win) return;

    const gridDecorativa = (cell: number): Grid =>
      Array.from({ length: config.reels }, (_, r) =>
        Array.from({ length: config.rows }, (_, c) => symbolOrder[(r * 2 + c) % symbolOrder.length])
      );

    let curCell = 0;
    const build = () => {
      if (engineRef.current?.isSpinning) return; // no reconstruir en pleno giro
      const PAD = 20; // padding L+R de .reel-window
      const GAP = 8;
      const avail = win.clientWidth - PAD;
      const cell = Math.max(40, Math.min(76, Math.floor((avail - (config.reels - 1) * GAP) / config.reels)));
      if (cell === curCell) return;
      curCell = cell;
      const engine = new SlotEngine(mount, {
        reels: config.reels,
        rows: config.rows,
        symbols: theme.symbols,
        symbolOrder,
        cell,
        cellPad: theme.tile ? 0 : 6,
      });
      engine.render(gridDecorativa(cell));
      engineRef.current = engine;
    };

    build();
    const ro = new ResizeObserver(build);
    ro.observe(win);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Conteo animado de la ganancia (ease-out).
  const contarHasta = useCallback((to: number) => {
    cancelAnimationFrame(countRef.current);
    if (to <= 0) { setWinShown(0); return; }
    const start = performance.now();
    const dur = 700;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      setWinShown(Math.round(to * (1 - Math.pow(1 - k, 2))));
      if (k < 1) countRef.current = requestAnimationFrame(tick);
    };
    countRef.current = requestAnimationFrame(tick);
  }, []);

  // Lluvia de monedas sobre la ventana de rodillos (DOM imperativo, sin re-render).
  const lluviaMonedas = useCallback((n: number) => {
    const layer = fxRef.current;
    if (!layer) return;
    for (let i = 0; i < n; i++) {
      const c = document.createElement("span");
      c.className = "coin";
      c.style.left = 10 + Math.random() * 80 + "%";
      c.style.setProperty("--dx", (Math.random() * 180 - 90).toFixed(0) + "px");
      c.style.setProperty("--dur", (0.75 + Math.random() * 0.7).toFixed(2) + "s");
      c.style.animationDelay = (Math.random() * 0.2).toFixed(2) + "s";
      layer.appendChild(c);
      c.addEventListener("animationend", () => c.remove());
    }
  }, []);

  const girar = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine || girando) return;
    if (free === 0 && saldo < bet) {
      setMsg({ txt: `Te faltan fichas: la apuesta es ${fmt(bet)} y tenés ${fmt(saldo)}.`, tono: "err" });
      setAuto(false);
      return;
    }
    setGirando(true);
    setMsg(null);
    setWin(0);
    setWinShown(0);
    setWinFx(null);
    setUltimo(null);
    unlockAudio();
    soundRef.current?.spin();
    try {
      const r = await fetch("/api/slots/spin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slot: config.slug, bet, clientSeed: clientSeedRef.current }),
      });
      const data = await r.json();
      if (!r.ok) {
        setMsg({ txt: data?.error ?? "No se pudo girar.", tono: "err" });
        setAuto(false);
        return;
      }
      const res = data as SpinResult;

      await engine.spin(res.grid, (r) => soundRef.current?.reelStop(r));
      engine.highlight(res.wins.flatMap((w) => w.cells));
      engine.showWinLines(res.wins.map((w) => ({ cells: w.cells })));

      setSaldo(res.new_balance);
      setFree(res.free_remaining);
      // Durante los giros gratis la apuesta queda bloqueada a la del lote.
      if (res.free_remaining > 0 && res.free_bet) setBet(res.free_bet);
      setWin(res.total_win);
      contarHasta(res.total_win);
      setUltimo(res);
      setHist((h) =>
        [{ spinId: res.spin_id, bet, total: res.total_win, mult: res.mult, wasFree: res.was_free }, ...h].slice(0, 12)
      );

      if (res.total_win > 0) {
        const ratio = res.total_win / bet;
        const level = ratio >= 15 ? 3 : ratio >= 5 ? 2 : 1;
        soundRef.current?.win(level);
        lluviaMonedas(level >= 3 ? 28 : level >= 2 ? 18 : 12);
        setWinFx({ amount: res.total_win, big: level >= 2 });
        clearTimeout(winTimer.current);
        winTimer.current = setTimeout(() => setWinFx(null), level >= 2 ? 2400 : 1700);
        const extra = res.mult > 1 ? ` ×${res.mult}` : "";
        const fs = res.free_awarded > 0 ? ` · +${res.free_awarded} gratis` : "";
        setMsg({ txt: `¡Ganaste ${fmt(res.total_win)}${extra}!${fs}`, tono: "ok" });
      } else if (res.free_awarded > 0) {
        setMsg({ txt: `+${res.free_awarded} giros gratis`, tono: "ok" });
      } else {
        setMsg({ txt: res.was_free ? "Giro gratis sin premio." : "Sin premio.", tono: "info" });
      }

      if (res.free_awarded > 0) {
        soundRef.current?.freeSpins();
        setFsFx(res.free_awarded);
        clearTimeout(fsTimer.current);
        fsTimer.current = setTimeout(() => setFsFx(null), 2400);
      }
    } catch (e) {
      setMsg({ txt: e instanceof Error ? e.message : "Error de red.", tono: "err" });
      setAuto(false);
    } finally {
      setGirando(false);
    }
  }, [bet, free, saldo, girando, config.slug]);

  // Auto-spin: mientras `auto` esté activo y no se esté girando, dispara el
  // siguiente giro tras una pausa. Se detiene solo si falta saldo.
  const girarRef = useRef(girar);
  useEffect(() => {
    girarRef.current = girar;
  });
  useEffect(() => {
    if (!auto || girando) return;
    if (free <= 0 && saldo < bet) {
      setAuto(false);
      return;
    }
    const t = setTimeout(() => girarRef.current(), 750);
    return () => clearTimeout(t);
  }, [auto, girando, free, saldo, bet]);

  const verificar = useCallback(async (spinId: string) => {
    setPrueba(null);
    const r = await fetch("/api/slots/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spinId }),
    });
    const data = await r.json();
    if (!r.ok) {
      setMsg({ txt: data?.error ?? "No se pudo verificar.", tono: "err" });
      return;
    }
    setPrueba(data);
  }, []);

  const stepBet = (dir: 1 | -1) => {
    const i = config.bet_options.indexOf(bet);
    const j = Math.max(0, Math.min(config.bet_options.length - 1, i + dir));
    setBet(config.bet_options[j]);
  };

  const toggleMute = () => {
    const m = !mute;
    setMute(m);
    setMuted(m);
    if (!m) unlockAudio();
  };

  // Comprar giros gratis / bonus buy. Precio = qty × apuesta (mismo RTP).
  const comprar = useCallback(
    async (qty: number) => {
      if (comprando || girando) return;
      unlockAudio();
      setComprando(true);
      setMsg(null);
      try {
        const r = await fetch("/api/slots/comprar", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ slot: config.slug, bet, qty }),
        });
        const data = await r.json();
        if (!r.ok) {
          setMsg({ txt: data?.error ?? "No se pudo comprar.", tono: "err" });
          return;
        }
        setSaldo(data.new_balance);
        setFree(data.free_remaining);
        if (data.free_bet) setBet(data.free_bet);
        soundRef.current?.freeSpins();
        setFsFx(data.bought);
        clearTimeout(fsTimer.current);
        fsTimer.current = setTimeout(() => setFsFx(null), 2000);
        setMsg({ txt: `Compraste ${data.bought} giros gratis por ${fmt(data.price)}. ¡Dale a GIRAR!`, tono: "ok" });
      } catch (e) {
        setMsg({ txt: e instanceof Error ? e.message : "Error de red.", tono: "err" });
      } finally {
        setComprando(false);
      }
    },
    [comprando, girando, config.slug, bet]
  );

  const sinFichas = free <= 0 && saldo < bet;

  const sceneStyle = {
    ...(theme.colors as Record<string, string>),
    ...(theme.scene ? { "--scene": theme.scene } : {}),
  } as React.CSSProperties;

  return (
    <div className="slot-scene" style={sceneStyle}>
      <style>{estilos}</style>

      {/* Barra propia del slot (inmersiva) */}
      <div className="slot-topbar">
        <a href="/slots" className="slot-nav">← Slots</a>
        <a href="/home" className="slot-nav">Inicio</a>
        <button className="slot-nav slot-mute" onClick={toggleMute} aria-label={mute ? "Activar sonido" : "Silenciar"}>
          {mute ? "🔇" : "🔊"}
        </button>
      </div>

      {/* Anuncio de giros gratis */}
      {fsFx !== null && (
        <div className="fs-overlay" aria-hidden>
          <div className="fs-card">
            <div className="fs-spark">✦</div>
            <div className="fs-num">{fsFx}</div>
            <div className="fs-txt">GIROS GRATIS</div>
          </div>
        </div>
      )}

      <div className="slot-body mx-auto max-w-[520px] px-3 pb-12">
        <div className="slot-machine">
          {/* Marquesina */}
          <div className="slot-marquee">
            {theme.logo ? (
              <img src={theme.logo} alt={config.name} className="slot-logo" />
            ) : (
              <div className="slot-title">{config.name}</div>
            )}
            <div className="slot-sub">{config.tagline}</div>
            {free > 0 && <div className="slot-free">🎟 {free} GRATIS</div>}
          </div>

          {/* Ventana de rodillos con vidrio + viñeta + línea de pago */}
          <div className="reel-window" ref={windowRef}>
            <div ref={mountRef} className="reels" />
            <div className="reel-vignette" aria-hidden />
            <div className="reel-glass" aria-hidden />
            <div className="payline" aria-hidden />
            <div className="fx-layer" ref={fxRef} aria-hidden />
            {winFx && (
              <div className={`win-banner ${winFx.big ? "big" : ""}`} aria-hidden>
                <div className="win-banner-txt">¡GANASTE!</div>
                <div className="win-banner-amt">{fmt(winFx.amount)}</div>
              </div>
            )}
          </div>

          {/* Mensaje */}
          <div className="slot-msg" aria-live="polite">
            {msg && <span className={`tono-${msg.tono}`}>{msg.txt}</span>}
          </div>

          {/* Displays LED */}
          <div className="lcd-row">
            <div className="lcd">
              <span className="lcd-label">Crédito</span>
              <span className="lcd-val">{fmt(saldo)}</span>
            </div>
            <div className="lcd">
              <span className="lcd-label">Apuesta</span>
              <span className="lcd-val">{fmt(bet)}</span>
            </div>
            <div className={`lcd ${win > 0 ? "lcd-win" : ""}`}>
              <span className="lcd-label">Ganancia</span>
              <span className="lcd-val">{fmt(winShown)}</span>
            </div>
          </div>

          {/* Controles */}
          <div className="controls">
            <div className="bet-ctrl">
              <button className="bet-btn" onClick={() => stepBet(-1)} disabled={girando || free > 0 || bet === config.bet_options[0]} aria-label="Bajar apuesta">−</button>
              <div className="bet-val" title={free > 0 ? "Apuesta bloqueada durante los giros gratis" : undefined}>
                {fmt(bet)}{free > 0 ? " 🔒" : ""}
              </div>
              <button className="bet-btn" onClick={() => stepBet(1)} disabled={girando || free > 0 || bet === config.bet_options[config.bet_options.length - 1]} aria-label="Subir apuesta">+</button>
            </div>

            <button className="spin-btn" onClick={girar} disabled={girando || sinFichas} aria-label="Girar">
              <span className="spin-inner">{girando ? "···" : free > 0 ? "GRATIS" : "GIRAR"}</span>
            </button>

            <button
              className={`auto-btn ${auto ? "on" : ""}`}
              onClick={() => setAuto((a) => !a)}
              disabled={sinFichas && !auto}
              aria-pressed={auto}
            >
              <span className="auto-dot" />
              {auto ? "AUTO ON" : "AUTO"}
            </button>
          </div>
        </div>

        {/* Comprar giros gratis / bonus buy */}
        <div className="panel mt-4">
          <div className="panel-title">Comprar giros gratis</div>
          <p className="mt-1 mb-2 text-xs text-white/55">
            Precio: 1× tu apuesta por giro (mismo retorno que jugar normal). Apuesta actual: {fmt(bet)}.
          </p>
          <div className="flex flex-wrap gap-2">
            {[10, 25, 50].map((q) => (
              <button
                key={q}
                onClick={() => comprar(q)}
                disabled={comprando || girando || saldo < q * bet}
                className="rounded-md border px-3 py-1.5 text-[13px] transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ borderColor: "color-mix(in srgb, var(--brass) 45%, transparent)", color: "var(--cream)" }}
              >
                {q} giros · {fmt(q * bet)}
              </button>
            ))}
            <button
              onClick={() => comprar(100)}
              disabled={comprando || girando || saldo < 100 * bet}
              className="rounded-md px-3 py-1.5 text-[13px] font-semibold transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: "var(--brass)", color: "#241a04" }}
            >
              🎁 BONUS BUY · 100 giros · {fmt(100 * bet)}
            </button>
          </div>
          {comprando && <div className="mt-2 text-xs text-white/50">Procesando…</div>}
        </div>

        {/* Desglose del último giro */}
        {ultimo && ultimo.wins.length > 0 && (
          <div className="panel mt-4">
            <div className="panel-title">Líneas ganadoras</div>
            <ul className="text-sm">
              {ultimo.wins.map((w, i) => (
                <li key={i} className="flex justify-between py-0.5">
                  <span>Línea {w.line + 1}: {w.count}× {w.symbol}</span>
                  <span>{fmt(w.pay)}</span>
                </li>
              ))}
              {ultimo.mult > 1 && (
                <li className="flex justify-between border-t border-white/10 py-0.5">
                  <span>Multiplicador</span><span>×{ultimo.mult}</span>
                </li>
              )}
              <li className="flex justify-between border-t border-white/10 py-0.5 font-semibold" style={{ color: "var(--brass)" }}>
                <span>Total</span><span>{fmt(ultimo.total_win)}</span>
              </li>
            </ul>
          </div>
        )}

        {/* Paytable */}
        <details className="panel mt-4">
          <summary className="panel-title cursor-pointer">Tabla de pagos</summary>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {symbols.map((s) => (
              <div key={s.symbol} className="paytable-item">
                <div className="paytable-sym" dangerouslySetInnerHTML={{ __html: theme.symbols[s.symbol] ?? "" }} />
                <div className="leading-tight">
                  <div className="font-medium">{s.symbol}{s.is_wild ? " ★" : ""}</div>
                  <div className="text-white/50">valor {s.value}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-white/50">
            Cada línea paga <code>apuesta / {config.paylines.length} × valor × factor</code>. El comodín (wild)
            sustituye cualquier símbolo y, con {config.freespins.min}+ en la grilla, da {config.freespins.grant} giros gratis.
          </p>
        </details>

        {/* Historial + verificación */}
        {hist.length > 0 && (
          <div className="panel mt-4">
            <div className="panel-title">Últimos giros</div>
            <ul className="text-sm">
              {hist.map((h) => (
                <li key={h.spinId} className="flex items-center justify-between gap-2 py-0.5">
                  <span className="text-white/75">
                    {h.wasFree ? "🎟 " : ""}apuesta {fmt(h.bet)} · {h.total > 0 ? `ganó ${fmt(h.total)}${h.mult > 1 ? ` ×${h.mult}` : ""}` : "sin premio"}
                  </span>
                  <button className="verify-btn" onClick={() => verificar(h.spinId)}>verificar</button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {prueba && (
          <div className="panel mt-4 text-xs">
            <div className="flex items-center justify-between">
              <span className="panel-title">Prueba provably-fair</span>
              <button onClick={() => setPrueba(null)} className="text-white/50">cerrar ✕</button>
            </div>
            <p className="mt-1">
              match: <b style={{ color: prueba.match ? "var(--brass)" : "#ff9a9a" }}>{String(prueba.match)}</b>{" "}
              · hash_ok: <b>{String(prueba.hash_ok)}</b>
            </p>
            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-white/60">
{JSON.stringify({ nonce: prueba.nonce, client_seed: prueba.client_seed, server_seed: prueba.server_seed, server_seed_hash: prueba.server_seed_hash }, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

const estilos = `
.slot-scene{min-height:100vh;color:var(--cream);position:relative;overflow-x:hidden;
  background:var(--scene, radial-gradient(1000px 700px at 50% -8%, color-mix(in srgb,var(--brass) 18%,transparent), transparent 60%), linear-gradient(180deg,var(--cabinet-1),var(--cabinet-2)));}
.slot-scene::after{content:"";position:fixed;inset:0;pointer-events:none;z-index:0;
  background:radial-gradient(130% 100% at 50% 42%, transparent 52%, rgba(0,0,0,.55));}
.slot-topbar{position:relative;z-index:2;display:flex;gap:12px;align-items:center;max-width:640px;margin:0 auto;padding:12px 16px 4px}
.slot-nav{font-size:13px;font-weight:600;color:var(--brass);text-decoration:none;opacity:.85;padding:6px 11px;border-radius:9px;
  box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--brass-deep) 55%,transparent);transition:opacity .15s,background .15s}
.slot-nav:hover{opacity:1;background:color-mix(in srgb,var(--brass) 12%,transparent)}
.slot-body{position:relative;z-index:1;padding-top:8px}

.slot-machine{
  position:relative;border-radius:22px;padding:16px;
  background:linear-gradient(180deg,var(--cabinet-1),var(--cabinet-2));
  box-shadow:0 0 0 2px var(--brass-deep), 0 0 0 6px var(--brass-dark), 0 24px 60px rgba(0,0,0,.6),
    inset 0 2px 0 rgba(255,255,255,.08);
}
.slot-machine::before{content:"";position:absolute;inset:6px;border-radius:16px;pointer-events:none;
  box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--brass) 40%,transparent);}
.slot-marquee{text-align:center;padding:6px 0 12px}
.slot-logo{display:block;margin:0 auto 2px;max-width:100%;height:auto;max-height:130px;filter:drop-shadow(0 4px 10px rgba(0,0,0,.5))}
.slot-title{font-family:Georgia,serif;font-weight:700;font-size:26px;letter-spacing:.06em;
  background:linear-gradient(180deg,#fff2c9,var(--brass) 45%,var(--brass-deep));
  -webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 1px 0 rgba(0,0,0,.5)) drop-shadow(0 0 10px rgba(231,196,119,.35));}
.slot-sub{font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:var(--brass);opacity:.8}
.slot-free{display:inline-block;margin-top:6px;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:700;
  background:var(--ruby);color:#fff;box-shadow:0 0 12px rgba(200,49,63,.6)}

.reel-window{position:relative;border-radius:14px;overflow:hidden;padding:10px;
  background:linear-gradient(180deg,#05060a,#0b0d13);
  box-shadow:inset 0 0 0 3px var(--brass-deep), inset 0 0 22px rgba(0,0,0,.9);}
.reels{position:relative;z-index:1;justify-content:center}
.reel-viewport{background:linear-gradient(180deg,var(--reel-1),var(--reel-2));
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.05), inset 0 10px 16px rgba(0,0,0,.6), inset 0 -10px 16px rgba(0,0,0,.6);}
.reel-cell{border-top:1px solid rgba(255,255,255,.04)}
.reel-cell:first-child{border-top:0}
.reel-sym{filter:drop-shadow(0 2px 3px rgba(0,0,0,.6))}
.reel-win .reel-sym{animation:reelWin .6s ease-in-out infinite alternate}
@keyframes reelWin{from{transform:scale(1)}to{transform:scale(1.16);filter:drop-shadow(0 0 9px var(--brass))}}
.reel-vignette{position:absolute;inset:10px;border-radius:8px;z-index:2;pointer-events:none;
  background:linear-gradient(180deg,rgba(0,0,0,.72),rgba(0,0,0,0) 26%,rgba(0,0,0,0) 74%,rgba(0,0,0,.72));}
.reel-glass{position:absolute;inset:10px;border-radius:8px;z-index:3;pointer-events:none;
  background:
    linear-gradient(180deg,rgba(255,255,255,.16),rgba(255,255,255,0) 34%),
    linear-gradient(105deg,rgba(255,255,255,0) 62%,rgba(255,255,255,.10) 68%,rgba(255,255,255,0) 72%);}
.payline{position:absolute;left:10px;right:10px;top:50%;height:2px;z-index:2;pointer-events:none;transform:translateY(-1px);
  background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--brass) 75%,transparent),transparent);opacity:.5}

.slot-mute{margin-left:auto;cursor:pointer;line-height:1}

/* Lluvia de monedas */
.fx-layer{position:absolute;inset:0;z-index:4;pointer-events:none;overflow:hidden}
.coin{position:absolute;top:62%;width:16px;height:16px;border-radius:50%;
  background:radial-gradient(circle at 35% 30%,#fff3b0,var(--brass) 55%,var(--brass-deep));
  box-shadow:0 0 7px var(--brass),inset 0 0 0 1px var(--brass-deep);opacity:0;
  animation:coinFly var(--dur,1s) cubic-bezier(.2,.7,.3,1) forwards}
@keyframes coinFly{0%{transform:translate(0,20px) scale(.5);opacity:0}
  15%{opacity:1}100%{transform:translate(var(--dx,0),-200px) scale(1) rotate(240deg);opacity:0}}

/* Cartel de premio */
.win-banner{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:5;pointer-events:none;
  text-align:center;animation:winPop .45s cubic-bezier(.2,1.4,.4,1)}
.win-banner-txt{font-family:Georgia,serif;font-weight:700;font-size:clamp(15px,4.5vw,24px);letter-spacing:.04em;
  color:var(--brass);text-shadow:0 2px 0 rgba(0,0,0,.6),0 0 14px var(--brass)}
.win-banner-amt{font-family:ui-monospace,monospace;font-weight:800;font-size:clamp(26px,9vw,50px);
  color:var(--cream);text-shadow:0 2px 0 rgba(0,0,0,.7),0 0 20px var(--brass)}
.win-banner.big .win-banner-amt{animation:winPulse .5s ease-in-out infinite alternate}
@keyframes winPop{0%{transform:translate(-50%,-50%) scale(.3);opacity:0}
  60%{transform:translate(-50%,-50%) scale(1.12);opacity:1}100%{transform:translate(-50%,-50%) scale(1)}}
@keyframes winPulse{to{transform:scale(1.08);filter:drop-shadow(0 0 12px var(--brass))}}
.lcd-win .lcd-val{animation:lcdWin .5s ease-in-out infinite alternate}
@keyframes lcdWin{to{color:#fff;text-shadow:0 0 15px var(--brass)}}

/* Anuncio de giros gratis */
.fs-overlay{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;pointer-events:none;
  background:radial-gradient(circle,color-mix(in srgb,var(--ink) 55%,transparent),color-mix(in srgb,var(--ink) 90%,transparent));
  animation:fadeIn .25s ease}
.fs-card{text-align:center;animation:fsPop .5s cubic-bezier(.2,1.5,.4,1)}
.fs-spark{font-size:42px;color:var(--brass);filter:drop-shadow(0 0 14px var(--brass));animation:spin360 3s linear infinite}
.fs-num{font-family:Georgia,serif;font-weight:800;font-size:clamp(64px,20vw,130px);line-height:1;color:var(--brass);
  text-shadow:0 3px 0 rgba(0,0,0,.6),0 0 30px var(--brass)}
.fs-txt{font-weight:800;letter-spacing:.22em;font-size:clamp(16px,4.4vw,28px);color:var(--cream);text-shadow:0 0 12px var(--brass)}
@keyframes fsPop{0%{transform:scale(.4);opacity:0}60%{transform:scale(1.12);opacity:1}100%{transform:scale(1)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes spin360{to{transform:rotate(360deg)}}

.slot-msg{min-height:1.6rem;text-align:center;font-size:14px;margin-top:10px;font-weight:600}
.tono-ok{color:var(--brass);text-shadow:0 0 10px rgba(231,196,119,.5)}
.tono-err{color:#ff9a9a}.tono-info{color:var(--cream);opacity:.8}

.lcd-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:6px}
.lcd{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 4px;border-radius:10px;min-width:0;
  background:#070a06;box-shadow:inset 0 0 0 1px #2a2410, inset 0 3px 8px rgba(0,0,0,.9)}
.lcd-label{font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#8a7a3a}
.lcd-val{font-family:ui-monospace,"Courier New",monospace;font-weight:700;font-size:clamp(15px,4.6vw,21px);color:var(--lcd);
  text-shadow:0 0 8px rgba(255,207,90,.6)}

.controls{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:12px;margin-top:14px}
.bet-ctrl{display:flex;align-items:center;gap:6px}
.bet-btn{width:38px;height:38px;border-radius:50%;font-size:20px;font-weight:700;color:var(--ink);
  background:radial-gradient(circle at 50% 35%,#ffe9a8,var(--brass) 60%,var(--brass-deep));
  box-shadow:0 2px 0 var(--brass-dark),0 4px 8px rgba(0,0,0,.5);border:0;cursor:pointer}
.bet-btn:disabled{opacity:.4;cursor:default}
.bet-val{min-width:64px;text-align:center;font-family:ui-monospace,monospace;font-weight:700;color:var(--cream)}

.spin-btn{position:relative;width:110px;height:110px;border-radius:50%;border:0;cursor:pointer;flex:none;
  background:radial-gradient(circle at 50% 32%,#fff4cf,var(--brass) 46%,var(--brass-deep) 82%,var(--brass-dark));
  box-shadow:0 4px 0 var(--brass-dark),0 10px 22px rgba(0,0,0,.6),inset 0 2px 4px rgba(255,255,255,.7),inset 0 -6px 10px rgba(0,0,0,.35);
  transition:transform .06s,box-shadow .06s}
.spin-btn:active:not(:disabled){transform:translateY(3px);box-shadow:0 1px 0 var(--brass-dark),0 5px 12px rgba(0,0,0,.6),inset 0 2px 4px rgba(255,255,255,.6)}
.spin-btn:disabled{opacity:.5;cursor:default}
.spin-inner{position:absolute;inset:14px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  font-family:Georgia,serif;font-weight:700;font-size:19px;letter-spacing:.04em;color:var(--brass-dark);
  box-shadow:inset 0 0 0 2px rgba(90,63,16,.5)}

.auto-btn{display:inline-flex;align-items:center;gap:6px;padding:10px 14px;border-radius:12px;font-size:13px;font-weight:700;
  color:var(--cream);background:#1c150b;box-shadow:inset 0 0 0 1px var(--brass-deep);border:0;cursor:pointer}
.auto-btn .auto-dot{width:9px;height:9px;border-radius:50%;background:#555}
.auto-btn.on{color:var(--ink);background:radial-gradient(circle at 50% 35%,#ffe9a8,var(--brass) 65%,var(--brass-deep));box-shadow:0 0 14px rgba(231,196,119,.6)}
.auto-btn.on .auto-dot{background:#2ecc71;box-shadow:0 0 8px #2ecc71;animation:blink 1s steps(2) infinite}
.auto-btn:disabled{opacity:.4;cursor:default}
@keyframes blink{50%{opacity:.3}}

.panel{border-radius:12px;padding:12px;background:#161009;box-shadow:inset 0 0 0 1px var(--brass-deep);color:var(--cream)}
.panel-title{font-weight:700;color:var(--brass);margin-bottom:4px}
.paytable-item{display:flex;align-items:center;gap:8px;padding:8px;border-radius:8px;background:#0b0d13}
.paytable-sym{width:34px;height:34px;flex:none}
.verify-btn{border-radius:6px;padding:2px 8px;font-size:12px;color:var(--cream);background:transparent;box-shadow:inset 0 0 0 1px var(--brass-deep);cursor:pointer}
`;
