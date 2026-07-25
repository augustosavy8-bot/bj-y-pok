"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Carta, DorsoCarta } from "@/components/Carta";
import { Ficha } from "@/components/Ficha";
import { evaluarMano } from "@/lib/blackjack/hand";
import { reproducir } from "@/lib/sonidos";
import type { BJCarta, BJManoJugador, BJResultado } from "@/lib/blackjack/types";

// Mesa semicircular con posiciones absolutas en % (escala sin media queries) y
// reparto animado: cada carta nace en el zapato y vuela a su asiento. Basado en
// el sistema de diseño Nocturne (mockups "Mesa Blackjack" / "…Mobile").

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
};

type Punto = { x: number; y: number };

// Rotación estable por id de carta (−3.5°..3.5°), sin Math.random en render.
function rotDe(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((((h % 71) + 71) % 71) / 10) - 3.5;
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

// Coordenadas de los asientos sobre el arco. "Vos" queda en el centro (más
// abajo/cerca) y el resto se reparte simétrico hacia los costados (más arriba).
function posicionesAsientos(n: number, compacto: boolean): Punto[] {
  const xL = compacto ? 12 : 16;
  const xR = compacto ? 88 : 84;
  const yCentro = compacto ? 62 : 60;
  const caida = compacto ? 12 : 11; // cuánto suben los asientos de los extremos
  const half = (xR - xL) / 2;
  return Array.from({ length: n }, (_, k) => {
    const frac = n === 1 ? 0.5 : k / (n - 1);
    const x = xL + frac * (xR - xL);
    const d = (x - 50) / half; // -1..1 respecto del centro
    const y = yCentro - caida * d * d;
    return { x, y };
  });
}

export function MesaBlackjack({
  dealerCartas,
  holeRevelada,
  verHole,
  asientos,
  hayCartasEnMesa,
  pagoLabel,
  mostrarLeyenda,
}: {
  dealerCartas: BJCarta[];
  holeRevelada: boolean;
  verHole: boolean;
  asientos: AsientoMesa[];
  hayCartasEnMesa: boolean;
  pagoLabel: string;
  mostrarLeyenda: boolean;
}) {
  const compacto = useEsCompacto();
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const SHOE: Punto = compacto ? { x: 86, y: 6 } : { x: 92, y: 12 };
  const DEALER: Punto = { x: 50, y: compacto ? 16 : 21 };
  const cardW = compacto ? 44 : 58;
  const cardH = Math.round((cardW * 140) / 100);
  const dxCard = compacto ? 3.6 : 2.7; // separación horizontal entre cartas (%)
  const dyCard = compacto ? -2.6 : -2.0; // apilado vertical (%)
  const gapMano = compacto ? 15 : 12; // separación entre manos de un split (%)

  // Orden fijo de asientos: vos al centro, el resto hacia los costados.
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
    // Si no hay "yo" (no debería pasar en la vista del jugador), rellenar.
    return salida;
  }, [asientos, compacto]);

  // Cartas que ya "aterrizaron" (para disparar el vuelo desde el zapato).
  const [landed, setLanded] = useState<Set<string>>(new Set());
  const landedRef = useRef(landed);
  landedRef.current = landed;

  const todasLasCartas = useMemo(() => {
    const ds = [...dealerCartas].sort((a, b) => a.orden_recibida - b.orden_recibida);
    const ps = ordenados.flatMap((s) =>
      s.asiento.manos.flatMap((m) =>
        [...m.cartas].sort((a, b) => a.orden_recibida - b.orden_recibida)
      )
    );
    return [...ds, ...ps];
  }, [dealerCartas, ordenados]);

  const idsClave = todasLasCartas.map((c) => c.id).join(",");

  useEffect(() => {
    const ids = todasLasCartas.map((c) => c.id);
    const presentes = new Set(ids);
    // Podar ids que ya no están (nueva ronda).
    let cambió = false;
    const base = new Set(landedRef.current);
    for (const id of Array.from(base)) {
      if (!presentes.has(id)) {
        base.delete(id);
        cambió = true;
      }
    }

    const nuevos = ids.filter((id) => !base.has(id));
    if (reduce) {
      // Sin animación: aterrizan de una.
      nuevos.forEach((id) => base.add(id));
      if (nuevos.length || cambió) setLanded(base);
      return;
    }
    if (cambió && !nuevos.length) setLanded(base);

    const timers = nuevos.map((id, i) =>
      setTimeout(() => {
        landedRef.current = new Set(landedRef.current).add(id);
        setLanded(landedRef.current);
        reproducir("carta");
      }, 60 + i * 190)
    );
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsClave]);

  // ---- Cálculo de posiciones/estado por carta ----
  type CartaRender = {
    carta: BJCarta;
    destino: Punto;
    rot: number;
    oculta: boolean; // se muestra el dorso (hole no revelada)
    z: number;
  };

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
        destino: {
          x: DEALER.x + (i - (n - 1) / 2) * (compacto ? 4.2 : 3.2),
          y: DEALER.y,
        },
        rot: rotDe(c.id),
        oculta,
        z: 30 + i,
      });
    });
    const visibles = mostrarTodo ? orden : orden.filter((c, i) => !(c.es_hole_card || (!c.revelada && i === 1)));
    const settled = orden.every((c) => landed.has(c.id));
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

  // Asientos
  ordenados.forEach(({ asiento, pos }) => {
    const nm = asiento.manos.length;
    asiento.manos.forEach((m, mi) => {
      const baseX = pos.x + (mi - (nm - 1) / 2) * gapMano;
      const orden = [...m.cartas].sort((a, b) => a.orden_recibida - b.orden_recibida);
      const n = orden.length;
      orden.forEach((c, i) => {
        render.push({
          carta: c,
          destino: {
            x: baseX + (i - (n - 1) / 2) * dxCard,
            y: pos.y + i * dyCard,
          },
          rot: rotDe(c.id),
          oculta: false,
          z: 40 + i,
        });
      });
      const settled = orden.length > 0 && orden.every((c) => landed.has(c.id));
      if (settled) {
        const e = evaluarMano(orden);
        pills.push({
          key: `pill-${m.mano.id}`,
          // El total va ARRIBA de la mano (abajo queda el bloque nombre/fichas).
          pos: { x: baseX, y: pos.y - (compacto ? 14 : 12) },
          texto: e.es_blackjack ? "BJ" : `${e.valor}`,
          bust: e.es_bust,
        });
      }
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
            borderRadius:
              "18px 18px 50% 50% / 18px 18px 88% 88%",
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
            style={{ left: "50%", top: "44%", transform: "translate(-50%,-50%)", width: "84%" }}
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
          style={{ left: `${DEALER.x}%`, top: `${DEALER.y - (compacto ? 9 : 8)}%`, transform: "translate(-50%,-50%)" }}
        >
          <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-tinta/45">Crupier</span>
        </div>

        {/* Bloque del asiento: apuesta + nombre + fichas, anclado DEBAJO de la
            mano y creciendo hacia abajo (no se pisa con los controles). */}
        {ordenados.map(({ asiento, pos }) => {
          const enTurno = asiento.manos.some((m) => m.enTurno);
          const apuesta = asiento.manos.reduce((s, m) => s + (m.mano.apuesta_fichas || 0), 0);
          return (
            <div
              key={`spot-${asiento.id}`}
              className="pointer-events-none absolute flex flex-col items-center gap-0.5"
              style={{
                left: `${pos.x}%`,
                top: `${pos.y + (compacto ? 9 : 8)}%`,
                transform: "translate(-50%, 0)",
                width: compacto ? 82 : 104,
              }}
            >
              {apuesta > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5">
                  <Ficha monto={apuesta} size={compacto ? 15 : 18} />
                  <span className="text-[11px] font-semibold tabular-nums text-acento-300">
                    {apuesta.toLocaleString("es")}
                  </span>
                </span>
              )}
              <div
                className={`max-w-full truncate text-center text-[11px] font-medium ${
                  enTurno ? "text-acento-300" : "text-tinta"
                }`}
              >
                {enTurno && <span className="mr-1 text-acento">●</span>}
                {asiento.esYo ? "Vos" : asiento.nombre}
              </div>
              {typeof asiento.fichas === "number" && (
                <div className="text-[10px] tabular-nums text-tinta/50">
                  {asiento.fichas.toLocaleString("es")}
                </div>
              )}
            </div>
          );
        })}

        {/* Capa de cartas (posición viva → se calcula en JS) */}
        {render.map(({ carta, destino, rot, oculta, z }) => {
          const enVuelo = !landed.has(carta.id);
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
                {/* Cara */}
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
                {/* Dorso */}
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
  // Carta/DorsoCarta rinden a 44px (sm); escalamos al ancho pedido.
  const escala = w / 44;
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
