"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Carta, DorsoCarta } from "@/components/Carta";
import { evaluarMano } from "@/lib/blackjack/hand";
import { reproducir } from "@/lib/sonidos";
import type { BJCarta, BJManoJugador, BJResultado } from "@/lib/blackjack/types";

// Mesa semicircular con posiciones absolutas en % (escala sin media queries) y
// reparto animado: cada carta nace en el zapato y vuela a su asiento; cada ficha
// vuela desde abajo y queda apilada como la apuesta. Basado en el sistema de
// diseño Nocturne (mockups "Mesa Blackjack" / "…Mobile").

export type FichaApuesta = { id: string; valor: number };

export type ManoEnMesa = {
  mano: BJManoJugador;
  cartas: BJCarta[];
  enTurno: boolean;
  resultado?: BJResultado;
};

export type AsientoMesa = {
  id: string;
  nombre: string;
  esYo: boolean;
  fichas?: number;
  manos: ManoEnMesa[];
  // Fichas apostadas (stack que vuela y queda en el spot).
  chips?: FichaApuesta[];
};

type Punto = { x: number; y: number };

// Colores de ficha por denominación (estilo casino, coherente con la paleta).
const CHIP_STYLES: Record<number, { face: string; edge: string; text: string }> = {
  500: { face: "#5b2a86", edge: "#d9cef2", text: "#f4f0fb" },
  1000: { face: "#242231", edge: "#9184d9", text: "#eceaf7" },
  2500: { face: "#1f6b3a", edge: "#cdeede", text: "#effaf3" },
  5000: { face: "#1d4f8f", edge: "#cfe0f5", text: "#eef4fc" },
  10000: { face: "#171512", edge: "#e0b64d", text: "#f5ecd4" },
};
function chipStyle(v: number) {
  if (v >= 10000) return CHIP_STYLES[10000];
  if (v >= 5000) return CHIP_STYLES[5000];
  if (v >= 2500) return CHIP_STYLES[2500];
  if (v >= 1000) return CHIP_STYLES[1000];
  return CHIP_STYLES[500];
}
function etiquetaChip(v: number): string {
  if (v >= 1000) {
    const k = v / 1000;
    return (Number.isInteger(k) ? String(k) : k.toFixed(1).replace(/\.0$/, "")) + "k";
  }
  return String(v);
}

// Descompone un monto en fichas (denominaciones de la mesa) para el stack visual.
export function descomponerFichas(monto: number): number[] {
  const denoms = [10000, 5000, 2500, 1000, 500];
  const out: number[] = [];
  let r = monto;
  for (const d of denoms) {
    while (r >= d && out.length < 24) {
      out.push(d);
      r -= d;
    }
  }
  if (r > 0 && out.length < 24) out.push(r);
  return out;
}

// Fichas apostadas de un asiento (stack), derivadas de un monto. Ids estables.
export function chipsDeMonto(seatId: string, monto: number): FichaApuesta[] {
  return descomponerFichas(monto).map((valor, i) => ({ id: `chip-${seatId}-${i}-${valor}`, valor }));
}

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (h % 1000) + 1000; // siempre positivo
}
// Rotación estable de carta (−3.5°..3.5°), sin Math.random en render.
function rotDe(id: string): number {
  return ((hashId(id) % 71) / 10) - 3.5;
}
// Jitter estable para el "tiro" de fichas.
function jitterDe(id: string): { jx: number; jr: number; spin: number } {
  const h = hashId(id);
  return {
    jx: ((h % 11) - 5),
    jr: (((h >> 3) % 26) - 13),
    spin: (((h >> 5) % 280) - 140),
  };
}

function useEsCompacto(): boolean {
  const [compacto, setCompacto] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const on = () => setCompacto(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return compacto;
}

// Coordenadas de los asientos sobre el arco. "Vos" queda en el centro y el resto
// se reparte simétrico hacia los costados (más arriba).
function posicionesAsientos(n: number, compacto: boolean): Punto[] {
  const xL = compacto ? 12 : 16;
  const xR = compacto ? 88 : 84;
  const yCentro = compacto ? 62 : 60;
  const caida = compacto ? 12 : 11;
  const half = (xR - xL) / 2;
  return Array.from({ length: n }, (_, k) => {
    const frac = n === 1 ? 0.5 : k / (n - 1);
    const x = xL + frac * (xR - xL);
    const d = (x - 50) / half;
    const y = yCentro - caida * d * d;
    return { x, y };
  });
}

// Hook genérico para animar la "llegada" de elementos (cartas o fichas): un id
// nuevo arranca en `false` (en vuelo) y pasa a `true` (aterrizó) con stagger.
function useAterrizaje(ids: string[], step: number, onLand?: () => void) {
  const [landed, setLanded] = useState<Set<string>>(new Set());
  const ref = useRef(landed);
  ref.current = landed;
  const clave = ids.join(",");
  useEffect(() => {
    const presentes = new Set(ids);
    const base = new Set(ref.current);
    let cambió = false;
    for (const id of Array.from(base)) {
      if (!presentes.has(id)) {
        base.delete(id);
        cambió = true;
      }
    }
    const nuevos = ids.filter((id) => !base.has(id));
    if (cambió && !nuevos.length) setLanded(base);
    const timers = nuevos.map((id, i) =>
      setTimeout(() => {
        ref.current = new Set(ref.current).add(id);
        setLanded(ref.current);
        onLand?.();
      }, 40 + i * step)
    );
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  return landed;
}

// Ventana de apuestas (ms) — usada para la cuenta regresiva compartida.
export const MS_VENTANA_APUESTAS = 10_000;

export function MesaBlackjack({
  dealerCartas,
  holeRevelada,
  verHole,
  asientos,
  hayCartasEnMesa,
  pagoLabel,
  mostrarLeyenda,
  turnoExpiraAt,
}: {
  dealerCartas: BJCarta[];
  holeRevelada: boolean;
  verHole: boolean;
  asientos: AsientoMesa[];
  hayCartasEnMesa: boolean;
  pagoLabel: string;
  mostrarLeyenda: boolean;
  // Cuándo vence el turno actual (ISO) → cuenta regresiva viva en el asiento activo.
  turnoExpiraAt?: string | null;
}) {
  const compacto = useEsCompacto();

  // Cuenta regresiva del turno (segundos), compartida por todos los clientes.
  const [segsTurno, setSegsTurno] = useState<number | null>(null);
  useEffect(() => {
    if (!turnoExpiraAt) {
      setSegsTurno(null);
      return;
    }
    const fin = new Date(turnoExpiraAt).getTime();
    const tick = () => setSegsTurno(Math.max(0, Math.ceil((fin - Date.now()) / 1000)));
    tick();
    const iv = setInterval(tick, 500);
    return () => clearInterval(iv);
  }, [turnoExpiraAt]);
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const SHOE: Punto = compacto ? { x: 86, y: 6 } : { x: 92, y: 12 };
  const DEALER: Punto = { x: 50, y: compacto ? 16 : 21 };
  const CHIP_SRC: Punto = { x: 50, y: 112 }; // las fichas "se tiran" desde abajo
  const cardW = compacto ? 44 : 58;
  const cardH = Math.round((cardW * 140) / 100);
  const dxCard = compacto ? 3.6 : 2.7;
  const dyCard = compacto ? -2.6 : -2.0;
  const gapMano = compacto ? 15 : 12;
  const chipPx = compacto ? 26 : 30;

  const ordenados = useMemo(() => {
    const yo = asientos.find((a) => a.esYo);
    const otros = asientos.filter((a) => !a.esYo);
    const total = asientos.length;
    const pts = posicionesAsientos(total, compacto);
    const centro = Math.floor((total - 1) / 2);
    const salida: { asiento: AsientoMesa; pos: Punto }[] = [];
    let oi = 0;
    for (let i = 0; i < total; i++) {
      if (i === centro && yo) salida.push({ asiento: yo, pos: pts[i] });
      else if (otros[oi]) salida.push({ asiento: otros[oi++], pos: pts[i] });
    }
    return salida;
  }, [asientos, compacto]);

  // Cartas: id → aterrizó.
  const todasLasCartas = useMemo(() => {
    const ds = [...dealerCartas].sort((a, b) => a.orden_recibida - b.orden_recibida);
    const ps = ordenados.flatMap((s) =>
      s.asiento.manos.flatMap((m) =>
        [...m.cartas].sort((a, b) => a.orden_recibida - b.orden_recibida)
      )
    );
    return [...ds, ...ps];
  }, [dealerCartas, ordenados]);
  const landedCartas = useAterrizaje(
    reduce ? [] : todasLasCartas.map((c) => c.id),
    190,
    () => reproducir("carta")
  );
  const cartaAterrizo = (id: string) => reduce || landedCartas.has(id);

  // Fichas: id → aterrizó.
  const todasLasFichas = useMemo(
    () => ordenados.flatMap((s) => s.asiento.chips ?? []),
    [ordenados]
  );
  const landedFichas = useAterrizaje(reduce ? [] : todasLasFichas.map((c) => c.id), 90);
  const fichaAterrizo = (id: string) => reduce || landedFichas.has(id);

  // ---- Posiciones de cartas ----
  type CartaRender = { carta: BJCarta; destino: Punto; rot: number; oculta: boolean; z: number };
  const render: CartaRender[] = [];
  const pills: { key: string; pos: Punto; texto: string; bust: boolean }[] = [];

  // Dealer
  {
    const orden = [...dealerCartas].sort((a, b) => a.orden_recibida - b.orden_recibida);
    const mostrarTodo = holeRevelada || verHole;
    const n = orden.length;
    orden.forEach((c, i) => {
      const oculta = !mostrarTodo && (c.es_hole_card || (!c.revelada && i === 1));
      render.push({
        carta: c,
        destino: { x: DEALER.x + (i - (n - 1) / 2) * (compacto ? 4.2 : 3.2), y: DEALER.y },
        rot: rotDe(c.id),
        oculta,
        z: 30 + i,
      });
    });
    const visibles = mostrarTodo
      ? orden
      : orden.filter((c, i) => !(c.es_hole_card || (!c.revelada && i === 1)));
    const settled = orden.every((c) => cartaAterrizo(c.id));
    if (visibles.length && settled) {
      const e = evaluarMano(visibles);
      pills.push({
        key: "pill-dealer",
        pos: { x: DEALER.x, y: DEALER.y + (compacto ? 15 : 13) },
        texto: mostrarTodo ? `${e.valor}` : `${e.valor} +`,
        bust: e.es_bust,
      });
    }
  }

  // Asientos (cartas + pills)
  ordenados.forEach(({ asiento, pos }) => {
    const nm = asiento.manos.length;
    asiento.manos.forEach((m, mi) => {
      const baseX = pos.x + (mi - (nm - 1) / 2) * gapMano;
      const orden = [...m.cartas].sort((a, b) => a.orden_recibida - b.orden_recibida);
      const n = orden.length;
      orden.forEach((c, i) => {
        render.push({
          carta: c,
          destino: { x: baseX + (i - (n - 1) / 2) * dxCard, y: pos.y + i * dyCard },
          rot: rotDe(c.id),
          oculta: false,
          z: 40 + i,
        });
      });
      const settled = orden.length > 0 && orden.every((c) => cartaAterrizo(c.id));
      if (settled) {
        const e = evaluarMano(orden);
        pills.push({
          key: `pill-${m.mano.id}`,
          pos: { x: baseX, y: pos.y - (compacto ? 11 : 9) },
          texto: e.es_blackjack ? "BJ" : `${e.valor}`,
          bust: e.es_bust,
        });
      }
    });
  });

  // ---- Posiciones de fichas apostadas ----
  type FichaRender = {
    ficha: FichaApuesta;
    spot: Punto;
    colDx: number;
    lift: number;
    row: number;
  };
  const fichasRender: FichaRender[] = [];
  ordenados.forEach(({ asiento, pos }) => {
    const chips = asiento.chips ?? [];
    if (!chips.length) return;
    const spot: Punto = { x: pos.x, y: pos.y + 10 };
    const valores = Array.from(new Set(chips.map((c) => c.valor))).sort((a, b) => a - b);
    const filas: Record<number, number> = {};
    chips.forEach((ficha) => {
      const col = valores.indexOf(ficha.valor);
      const row = (filas[ficha.valor] = (filas[ficha.valor] || 0) + 1) - 1;
      const colDx = (col - (valores.length - 1) / 2) * (chipPx + 6);
      fichasRender.push({ ficha, spot, colDx, lift: row * 6, row });
    });
  });

  return (
    <div className="relative mx-auto w-full" style={{ maxWidth: 980 }}>
      <div
        className="relative w-full"
        style={{ aspectRatio: compacto ? "39 / 44" : "98 / 56" }}
      >
        {/* Fieltro navy en medio óvalo */}
        <div
          className="absolute inset-0"
          style={{
            borderRadius: "18px 18px 50% 50% / 18px 18px 88% 88%",
            backgroundColor: "#161826",
            backgroundImage:
              "radial-gradient(72% 92% at 50% 4%, color-mix(in srgb, #262a60 62%, transparent), transparent 72%), radial-gradient(120% 120% at 50% 120%, color-mix(in srgb, #2b2741 78%, transparent), transparent 70%)",
            boxShadow: "0 0 0 1px #595d6c, 0 10px 30px rgba(0,0,0,0.55)",
          }}
        />
        <div
          className="pointer-events-none absolute"
          style={{
            inset: 12,
            border: "1px solid color-mix(in srgb, #e9e9ed 12%, transparent)",
            borderRadius: "10px 10px 50% 50% / 10px 10px 86% 86%",
          }}
        />

        {/* Leyenda impresa (se oculta cuando hay cartas en la mesa) */}
        {mostrarLeyenda && !hayCartasEnMesa && (
          <div
            className="pointer-events-none absolute text-center"
            style={{ left: "50%", top: "42%", transform: "translate(-50%,-50%)", width: "84%" }}
          >
            <div
              className="font-medium uppercase"
              style={{
                fontSize: "clamp(11px, 1.7vw, 18px)",
                letterSpacing: "0.24em",
                color: "color-mix(in srgb, #e9e9ed 32%, transparent)",
              }}
            >
              {pagoLabel}
            </div>
            <div
              className="mt-1 uppercase"
              style={{
                fontSize: "clamp(8px, 1.1vw, 11px)",
                letterSpacing: "0.2em",
                color: "color-mix(in srgb, #e9e9ed 20%, transparent)",
              }}
            >
              El crupier se planta en 17 · seguro 2 : 1
            </div>
          </div>
        )}

        {/* Zapato */}
        <div
          className="absolute grid place-items-center rounded border border-white/20"
          style={{
            left: `${SHOE.x}%`,
            top: `${SHOE.y}%`,
            transform: "translate(-50%,-50%)",
            width: compacto ? 44 : 58,
            height: compacto ? 26 : 32,
            background: "linear-gradient(#3f424d,#292b31)",
          }}
        >
          <span className="text-[8px] uppercase tracking-[0.14em] text-tinta/45">Zapato</span>
        </div>

        {/* Etiqueta del crupier */}
        <div
          className="pointer-events-none absolute"
          style={{
            left: `${DEALER.x}%`,
            top: `${DEALER.y - (compacto ? 9 : 8)}%`,
            transform: "translate(-50%,-50%)",
          }}
        >
          <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-tinta/45">Crupier</span>
        </div>

        {/* Halo del asiento: glow fijo en el TUYO (para encontrarte) y aro
            pulsante en el asiento al que se le está esperando el turno. */}
        {ordenados.map(({ asiento, pos }) => {
          const enTurno = asiento.manos.some((m) => m.enTurno);
          if (!asiento.esYo && !enTurno) return null;
          const size = compacto ? 104 : 136;
          return (
            <div
              key={`halo-${asiento.id}`}
              className={`pointer-events-none absolute rounded-full ${enTurno ? "animate-pulse" : ""}`}
              style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                transform: "translate(-50%,-50%)",
                width: size,
                height: size,
                zIndex: 2,
                background: enTurno
                  ? "radial-gradient(closest-side, color-mix(in srgb, #9184d9 30%, transparent), transparent 72%)"
                  : "radial-gradient(closest-side, color-mix(in srgb, #9184d9 15%, transparent), transparent 70%)",
                boxShadow: enTurno ? "0 0 0 1px color-mix(in srgb, #9184d9 55%, transparent)" : undefined,
              }}
            />
          );
        })}

        {/* Fichas apostadas (vuelan desde abajo y quedan apiladas) */}
        {fichasRender.map(({ ficha, spot, colDx, lift, row }) => {
          const enVuelo = !fichaAterrizo(ficha.id);
          const j = jitterDe(ficha.id);
          const x = spot.x;
          const y = enVuelo ? CHIP_SRC.y : spot.y;
          const dx = enVuelo ? j.jx : colDx;
          const subir = enVuelo ? 0 : lift;
          const st = chipStyle(ficha.valor);
          return (
            <div
              key={ficha.id}
              className="absolute grid place-items-center"
              style={{
                left: `calc(${x}% + ${dx.toFixed(1)}px)`,
                top: `calc(${enVuelo ? CHIP_SRC.y : y}% - ${subir}px)`,
                width: chipPx,
                height: chipPx,
                borderRadius: "50%",
                border: `3px dashed ${st.edge}`,
                backgroundColor: st.face,
                backgroundImage:
                  "radial-gradient(70% 70% at 30% 25%, color-mix(in srgb, #ffffff 16%, transparent), transparent 72%)",
                boxShadow: "0 4px 10px rgba(0,0,0,.5)",
                fontSize: compacto ? 10 : 11,
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                color: st.text,
                opacity: enVuelo ? 0.6 : 1,
                zIndex: 12 + row,
                boxSizing: "border-box",
                transform: `translate(-50%,-50%) rotate(${(enVuelo ? j.spin : j.jr).toFixed(1)}deg) scale(${enVuelo ? 0.84 : 1})`,
                transition: reduce
                  ? "none"
                  : "left 460ms cubic-bezier(.2,.9,.3,1), top 460ms cubic-bezier(.2,.9,.3,1), transform 460ms cubic-bezier(.2,.9,.3,1), opacity 300ms linear",
              }}
            >
              {etiquetaChip(ficha.valor)}
            </div>
          );
        })}

        {/* Bloque del asiento: apuesta + nombre + fichas, debajo de la mano */}
        {ordenados.map(({ asiento, pos }) => {
          const enTurno = asiento.manos.some((m) => m.enTurno);
          const apuesta = (asiento.chips ?? []).reduce((s, c) => s + c.valor, 0);
          return (
            <div
              key={`spot-${asiento.id}`}
              className="pointer-events-none absolute flex flex-col items-center gap-0.5"
              style={{
                left: `${pos.x}%`,
                top: `${pos.y + (compacto ? 18 : 16)}%`,
                transform: "translate(-50%, 0)",
                width: compacto ? 86 : 108,
              }}
            >
              {apuesta > 0 && (
                <div className="text-[11px] font-semibold tabular-nums text-acento-300">
                  {apuesta.toLocaleString("es")}
                </div>
              )}
              <div className="flex max-w-full items-center gap-1">
                {asiento.esYo ? (
                  <span className="rounded bg-acento px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-[0_0_10px_rgba(145,132,217,0.6)]">
                    Vos
                  </span>
                ) : (
                  <span
                    className={`truncate text-[11px] font-medium ${
                      enTurno ? "font-semibold text-acento-300" : "text-tinta"
                    }`}
                  >
                    {asiento.nombre}
                  </span>
                )}
              </div>
              {enTurno && (
                <span className="animate-pulse rounded-full border border-acento/50 bg-acento/15 px-2 py-0.5 text-[10px] font-bold tabular-nums text-acento-300">
                  {segsTurno != null ? `${segsTurno}s` : "turno"}
                </span>
              )}
              {typeof asiento.fichas === "number" && (
                <div className="text-[10px] tabular-nums text-tinta/50">
                  {asiento.fichas.toLocaleString("es")}
                </div>
              )}
            </div>
          );
        })}

        {/* Capa de cartas */}
        {render.map(({ carta, destino, rot, oculta, z }) => {
          const enVuelo = !cartaAterrizo(carta.id);
          const x = enVuelo ? SHOE.x : destino.x;
          const y = enVuelo ? SHOE.y : destino.y;
          const ang = enVuelo ? -16 : rot;
          const flightMs = reduce ? 0 : 460;
          const mostrarCara = !oculta && !enVuelo;
          return (
            <div
              key={carta.id}
              className="absolute"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                width: cardW,
                height: cardH,
                transform: `translate(-50%,-50%) rotate(${ang}deg)`,
                transition: reduce
                  ? "none"
                  : `left ${flightMs}ms cubic-bezier(.22,.72,.2,1), top ${flightMs}ms cubic-bezier(.22,.72,.2,1), transform ${flightMs}ms cubic-bezier(.22,.72,.2,1)`,
                perspective: 700,
                zIndex: z,
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  height: "100%",
                  transformStyle: "preserve-3d",
                  transition: reduce ? "none" : "transform 340ms cubic-bezier(.3,.7,.2,1)",
                  transform: mostrarCara ? "rotateY(0deg)" : "rotateY(180deg)",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    zIndex: mostrarCara ? 2 : 1,
                    opacity: mostrarCara ? 1 : 0,
                    transition: reduce ? "none" : "opacity 200ms linear 120ms",
                  }}
                >
                  <CartaEscalada valor={carta.valor} palo={carta.palo} w={cardW} h={cardH} cara />
                </div>
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    zIndex: mostrarCara ? 1 : 2,
                    opacity: mostrarCara ? 0 : 1,
                    transform: "rotateY(180deg)",
                    transition: reduce ? "none" : "opacity 200ms linear",
                  }}
                >
                  <CartaEscalada valor={carta.valor} palo={carta.palo} w={cardW} h={cardH} cara={false} />
                </div>
              </div>
            </div>
          );
        })}

        {/* Pills de total por mano */}
        {pills.map((p) => (
          <div
            key={p.key}
            className="absolute tabular-nums"
            style={{
              left: `${p.pos.x}%`,
              top: `${p.pos.y}%`,
              transform: "translate(-50%,-50%)",
              zIndex: 60,
              fontSize: 12,
              padding: "3px 9px",
              borderRadius: 6,
              background: "color-mix(in srgb, #161826 82%, transparent)",
              border: "1px solid rgba(255,255,255,0.14)",
              color: p.bust ? "#9aa0ad" : "#e9e9ed",
            }}
          >
            {p.texto}
          </div>
        ))}
      </div>
    </div>
  );
}

// Carta a tamaño arbitrario (px): reusa el SVG Nocturne escalando el contenedor.
function CartaEscalada({
  valor,
  palo,
  w,
  h,
  cara,
}: {
  valor: BJCarta["valor"];
  palo: BJCarta["palo"];
  w: number;
  h: number;
  cara: boolean;
}) {
  const escala = w / 44; // Carta/DorsoCarta rinden a 44px (sm)
  return (
    <div style={{ width: w, height: h, position: "relative" }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          transform: `scale(${escala})`,
          transformOrigin: "top left",
        }}
      >
        {cara ? <Carta valor={valor} palo={palo} size="sm" /> : <DorsoCarta size="sm" />}
      </div>
    </div>
  );
}
