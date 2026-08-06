"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NocturneShell } from "@/components/nocturne/NocturneShell";
import { SlotEngine, type Grid } from "@/lib/slots/engine";
import type { SlotTheme } from "@/lib/slots/themes/types";

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
  const engineRef = useRef<SlotEngine | null>(null);
  const clientSeedRef = useRef<string>("");

  const [saldo, setSaldo] = useState(saldoInicial);
  const [free, setFree] = useState(freeInicial);
  const [bet, setBet] = useState(config.bet_options[0]);
  const [girando, setGirando] = useState(false);
  const [auto, setAuto] = useState(false);
  const [win, setWin] = useState(0);
  const [msg, setMsg] = useState<{ txt: string; tono: "ok" | "err" | "info" } | null>(null);
  const [ultimo, setUltimo] = useState<SpinResult | null>(null);
  const [hist, setHist] = useState<HistItem[]>([]);
  const [prueba, setPrueba] = useState<Record<string, unknown> | null>(null);

  const symbolOrder = symbols
    .slice()
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.symbol.localeCompare(b.symbol))
    .map((s) => s.symbol);

  // Montar el motor con una grilla inicial decorativa.
  useEffect(() => {
    clientSeedRef.current = obtenerClientSeed();
    if (!mountRef.current) return;
    const engine = new SlotEngine(mountRef.current, {
      reels: config.reels,
      rows: config.rows,
      symbols: theme.symbols,
      symbolOrder,
      cell: 72,
    });
    const inicial: Grid = Array.from({ length: config.reels }, (_, r) =>
      Array.from({ length: config.rows }, (_, c) => symbolOrder[(r * 2 + c) % symbolOrder.length])
    );
    engine.render(inicial);
    engineRef.current = engine;
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setUltimo(null);
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

      await engine.spin(res.grid);
      engine.highlight(res.wins.flatMap((w) => w.cells));

      setSaldo(res.new_balance);
      setFree(res.free_remaining);
      setWin(res.total_win);
      setUltimo(res);
      setHist((h) =>
        [{ spinId: res.spin_id, bet, total: res.total_win, mult: res.mult, wasFree: res.was_free }, ...h].slice(0, 12)
      );

      if (res.total_win > 0) {
        const extra = res.mult > 1 ? ` ×${res.mult}` : "";
        const fs = res.free_awarded > 0 ? ` · +${res.free_awarded} gratis` : "";
        setMsg({ txt: `¡Ganaste ${fmt(res.total_win)}${extra}!${fs}`, tono: "ok" });
      } else if (res.free_awarded > 0) {
        setMsg({ txt: `+${res.free_awarded} giros gratis`, tono: "ok" });
      } else {
        setMsg({ txt: res.was_free ? "Giro gratis sin premio." : "Sin premio.", tono: "info" });
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

  const sinFichas = free <= 0 && saldo < bet;

  return (
    <NocturneShell>
      <style>{estilos}</style>
      <div className="mx-auto max-w-4xl px-3 py-6 sm:px-6" style={theme.colors as React.CSSProperties}>
        <div className="slot-machine">
          {/* Marquesina */}
          <div className="slot-marquee">
            <div className="slot-title">{config.name}</div>
            <div className="slot-sub">{config.tagline}</div>
            {free > 0 && <div className="slot-free">🎟 {free} GRATIS</div>}
          </div>

          {/* Ventana de rodillos con vidrio + viñeta + línea de pago */}
          <div className="reel-window">
            <div ref={mountRef} className="reels" />
            <div className="reel-vignette" aria-hidden />
            <div className="reel-glass" aria-hidden />
            <div className="payline" aria-hidden />
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
            <div className="lcd">
              <span className="lcd-label">Ganancia</span>
              <span className="lcd-val">{fmt(win)}</span>
            </div>
          </div>

          {/* Controles */}
          <div className="controls">
            <div className="bet-ctrl">
              <button className="bet-btn" onClick={() => stepBet(-1)} disabled={girando || bet === config.bet_options[0]} aria-label="Bajar apuesta">−</button>
              <div className="bet-val">{fmt(bet)}</div>
              <button className="bet-btn" onClick={() => stepBet(1)} disabled={girando || bet === config.bet_options[config.bet_options.length - 1]} aria-label="Subir apuesta">+</button>
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
    </NocturneShell>
  );
}

const estilos = `
.slot-machine{
  position:relative;border-radius:22px;padding:16px;
  background:linear-gradient(180deg,var(--cabinet-1),var(--cabinet-2));
  box-shadow:0 0 0 2px var(--brass-deep), 0 0 0 6px var(--brass-dark), 0 24px 60px rgba(0,0,0,.6),
    inset 0 2px 0 rgba(255,255,255,.08);
}
.slot-machine::before{content:"";position:absolute;inset:6px;border-radius:16px;pointer-events:none;
  box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--brass) 40%,transparent);}
.slot-marquee{text-align:center;padding:6px 0 12px}
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
.reels{position:relative;z-index:1}
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

.slot-msg{min-height:1.6rem;text-align:center;font-size:14px;margin-top:10px;font-weight:600}
.tono-ok{color:var(--brass);text-shadow:0 0 10px rgba(231,196,119,.5)}
.tono-err{color:#ff9a9a}.tono-info{color:var(--cream);opacity:.8}

.lcd-row{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:6px}
.lcd{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 6px;border-radius:10px;
  background:#070a06;box-shadow:inset 0 0 0 1px #2a2410, inset 0 3px 8px rgba(0,0,0,.9)}
.lcd-label{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#8a7a3a}
.lcd-val{font-family:ui-monospace,"Courier New",monospace;font-weight:700;font-size:20px;color:var(--lcd);
  text-shadow:0 0 8px rgba(255,207,90,.6)}

.controls{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px}
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
