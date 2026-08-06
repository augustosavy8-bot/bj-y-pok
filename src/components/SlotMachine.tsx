"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NocturneShell } from "@/components/nocturne/NocturneShell";
import { SlotEngine, type Grid } from "@/lib/slots/engine";
import type { SlotTheme } from "@/lib/slots/themes/types";

// ── Tipos de la config que llega del server (tablas slots / slot_symbols) ──
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
  hash: string;
  nonce: number;
  wasFree: boolean;
}

const fmt = (n: number) => n.toLocaleString("es");

// clientSeed persistente (parte pública del provably-fair que aporta el jugador).
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
  const [msg, setMsg] = useState<{ txt: string; tono: "ok" | "err" | "info" } | null>(null);
  const [ultimo, setUltimo] = useState<SpinResult | null>(null);
  const [hist, setHist] = useState<HistItem[]>([]);
  const [prueba, setPrueba] = useState<Record<string, unknown> | null>(null);

  const symbolOrder = symbols
    .slice()
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.symbol.localeCompare(b.symbol))
    .map((s) => s.symbol);
  const valorDe = Object.fromEntries(symbols.map((s) => [s.symbol, s.value]));

  // Montar el motor y pintar una grilla inicial (sólo decorativa).
  useEffect(() => {
    clientSeedRef.current = obtenerClientSeed();
    if (!mountRef.current) return;
    const engine = new SlotEngine(mountRef.current, {
      reels: config.reels,
      rows: config.rows,
      symbols: theme.symbols,
      symbolOrder,
      cell: 64,
    });
    const inicial: Grid = Array.from({ length: config.reels }, (_, r) =>
      Array.from({ length: config.rows }, (_, c) => symbolOrder[(r + c) % symbolOrder.length])
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
      return;
    }
    setGirando(true);
    setMsg(null);
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
        return;
      }
      const res = data as SpinResult;

      // Animar hasta la grilla que decidió el server; recién ahí pintar el resultado.
      await engine.spin(res.grid);
      engine.highlight(res.wins.flatMap((w) => w.cells));

      setSaldo(res.new_balance);
      setFree(res.free_remaining);
      setUltimo(res);
      setHist((h) =>
        [
          {
            spinId: res.spin_id,
            bet,
            total: res.total_win,
            mult: res.mult,
            hash: res.server_seed_hash,
            nonce: res.nonce,
            wasFree: res.was_free,
          },
          ...h,
        ].slice(0, 12)
      );

      if (res.total_win > 0) {
        const extra = res.mult > 1 ? ` ×${res.mult}` : "";
        const fs = res.free_awarded > 0 ? ` · +${res.free_awarded} giros gratis` : "";
        setMsg({ txt: `¡Ganaste ${fmt(res.total_win)}${extra}!${fs}`, tono: "ok" });
      } else if (res.free_awarded > 0) {
        setMsg({ txt: `+${res.free_awarded} giros gratis`, tono: "ok" });
      } else {
        setMsg({ txt: res.was_free ? "Giro gratis sin premio." : "Sin premio. Probá de nuevo.", tono: "info" });
      }
    } catch (e) {
      setMsg({ txt: e instanceof Error ? e.message : "Error de red.", tono: "err" });
    } finally {
      setGirando(false);
    }
  }, [bet, free, saldo, girando, config.slug]);

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

  const puedeGirar = !girando && (free > 0 || saldo >= bet);

  return (
    <NocturneShell>
      <style>{estilos}</style>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8" style={theme.colors as React.CSSProperties}>
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: "var(--brass)" }}>
              {config.name}
            </h1>
            <p className="text-sm text-tinta/70">{config.tagline}</p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="rounded-lg px-3 py-1.5" style={{ background: "var(--cabinet)", color: "var(--cream)" }}>
              Saldo <b className="ml-1" style={{ color: "var(--brass)" }}>{fmt(saldo)}</b>
            </div>
            {free > 0 && (
              <div className="rounded-lg px-3 py-1.5" style={{ background: "var(--ruby)", color: "#fff" }}>
                {free} giros gratis
              </div>
            )}
          </div>
        </header>

        {/* Gabinete + rodillos */}
        <div
          className="slot-cabinet rounded-2xl p-4 sm:p-6"
          style={{ background: "var(--cabinet)", boxShadow: "inset 0 0 0 2px var(--brass-deep)" }}
        >
          <div ref={mountRef} className="mx-auto w-fit" />

          {/* Mensaje del resultado */}
          <div className="mt-4 min-h-[1.5rem] text-center text-sm" aria-live="polite">
            {msg && (
              <span
                style={{
                  color: msg.tono === "ok" ? "var(--brass)" : msg.tono === "err" ? "#ffb4b4" : "var(--cream)",
                }}
              >
                {msg.txt}
              </span>
            )}
          </div>

          {/* Controles */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
            <div className="flex items-center gap-1.5">
              {config.bet_options.map((b) => (
                <button
                  key={b}
                  onClick={() => setBet(b)}
                  disabled={girando}
                  className="rounded-md px-3 py-1.5 text-sm font-medium transition disabled:opacity-50"
                  style={{
                    background: b === bet ? "var(--brass)" : "transparent",
                    color: b === bet ? "var(--ink)" : "var(--cream)",
                    boxShadow: "inset 0 0 0 1px var(--brass-deep)",
                  }}
                >
                  {fmt(b)}
                </button>
              ))}
            </div>
            <button
              onClick={girar}
              disabled={!puedeGirar}
              className="rounded-lg px-6 py-2.5 text-base font-semibold transition disabled:opacity-40"
              style={{ background: "var(--brass)", color: "var(--ink)" }}
            >
              {girando ? "Girando…" : free > 0 ? "Girar GRATIS" : `Girar · ${fmt(bet)}`}
            </button>
          </div>

          {/* Desglose del último giro */}
          {ultimo && ultimo.wins.length > 0 && (
            <div className="mt-4 rounded-lg p-3 text-sm" style={{ background: "var(--felt)", color: "var(--cream)" }}>
              <div className="mb-1 font-medium" style={{ color: "var(--brass)" }}>
                Líneas ganadoras
              </div>
              <ul className="space-y-0.5">
                {ultimo.wins.map((w, i) => (
                  <li key={i} className="flex justify-between">
                    <span>
                      Línea {w.line + 1}: {w.count}× {w.symbol}
                    </span>
                    <span>{fmt(w.pay)}</span>
                  </li>
                ))}
                {ultimo.mult > 1 && (
                  <li className="flex justify-between border-t border-white/10 pt-0.5">
                    <span>Multiplicador</span>
                    <span>×{ultimo.mult}</span>
                  </li>
                )}
                <li className="flex justify-between border-t border-white/10 pt-0.5 font-semibold" style={{ color: "var(--brass)" }}>
                  <span>Total</span>
                  <span>{fmt(ultimo.total_win)}</span>
                </li>
              </ul>
            </div>
          )}
        </div>

        {/* Paytable */}
        <details className="mt-4 rounded-lg p-3 text-sm" style={{ background: "var(--cabinet)", color: "var(--cream)" }}>
          <summary className="cursor-pointer font-medium" style={{ color: "var(--brass)" }}>
            Tabla de pagos
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {symbols.map((s) => (
              <div key={s.symbol} className="flex items-center gap-2 rounded-md p-2" style={{ background: "var(--felt)" }}>
                <div className="h-8 w-8 shrink-0" dangerouslySetInnerHTML={{ __html: theme.symbols[s.symbol] ?? "" }} />
                <div className="leading-tight">
                  <div className="font-medium">{s.symbol}{s.is_wild ? " ★" : ""}</div>
                  <div className="text-tinta/60">valor {s.value}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-tinta/60">
            Un premio de línea paga <code>apuesta / {config.paylines.length} × valor × factor(cantidad)</code>. El
            comodín (wild) sustituye a cualquier símbolo y, con {config.freespins.min}+ en la grilla, otorga{" "}
            {config.freespins.grant} giros gratis.
          </p>
        </details>

        {/* Historial + verificación provably-fair */}
        {hist.length > 0 && (
          <div className="mt-4 rounded-lg p-3 text-sm" style={{ background: "var(--cabinet)", color: "var(--cream)" }}>
            <div className="mb-2 font-medium" style={{ color: "var(--brass)" }}>
              Últimos giros
            </div>
            <ul className="space-y-1">
              {hist.map((h) => (
                <li key={h.spinId} className="flex items-center justify-between gap-2">
                  <span className="text-tinta/80">
                    {h.wasFree ? "🎟 " : ""}apuesta {fmt(h.bet)} · {h.total > 0 ? `ganó ${fmt(h.total)}${h.mult > 1 ? ` ×${h.mult}` : ""}` : "sin premio"}
                  </span>
                  <button
                    onClick={() => verificar(h.spinId)}
                    className="rounded px-2 py-0.5 text-xs"
                    style={{ boxShadow: "inset 0 0 0 1px var(--brass-deep)", color: "var(--cream)" }}
                  >
                    verificar
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Prueba de verificación */}
        {prueba && (
          <div className="mt-4 rounded-lg p-3 text-xs" style={{ background: "var(--felt)", color: "var(--cream)" }}>
            <div className="mb-1 flex items-center justify-between">
              <span className="font-medium" style={{ color: "var(--brass)" }}>
                Prueba provably-fair
              </span>
              <button onClick={() => setPrueba(null)} className="text-tinta/60">
                cerrar ✕
              </button>
            </div>
            <p>
              match:{" "}
              <b style={{ color: prueba.match ? "var(--brass)" : "#ffb4b4" }}>
                {String(prueba.match)}
              </b>{" "}
              · hash_ok: <b>{String(prueba.hash_ok)}</b>
            </p>
            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-tinta/70">
{JSON.stringify(
  {
    nonce: prueba.nonce,
    client_seed: prueba.client_seed,
    server_seed: prueba.server_seed,
    server_seed_hash: prueba.server_seed_hash,
  },
  null,
  2
)}
            </pre>
            <p className="mt-1 text-tinta/60">
              Recomputá <code>hmac(client_seed:nonce:k, server_seed)</code> por celda y comprobá la grilla.
            </p>
          </div>
        )}
      </div>
    </NocturneShell>
  );
}

const estilos = `
.reel-viewport { background: color-mix(in srgb, var(--felt) 80%, black); box-shadow: inset 0 0 0 1px var(--brass-deep), inset 0 8px 14px rgba(0,0,0,.5); }
.reel-cell { color: var(--cream); }
.reel-win .reel-sym { animation: reelWin .7s ease-in-out infinite alternate; }
@keyframes reelWin {
  from { transform: scale(1); filter: drop-shadow(0 0 0 var(--brass)); }
  to   { transform: scale(1.14); filter: drop-shadow(0 0 7px var(--brass)); }
}
.slot-cabinet { background-image: radial-gradient(120% 80% at 50% 0%, color-mix(in srgb, var(--brass) 10%, transparent), transparent 60%); }
`;
