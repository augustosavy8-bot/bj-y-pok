"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Carta, DorsoCarta } from "@/components/Carta";
import type { Palo, Valor } from "@/lib/types";

const CARD_W = 169.075;
const CARD_H = 244.64;
const TAM_W = { sm: 44, md: 66, lg: 97 } as const;

// Carta con animación: entra desde la zona del crupier (deal) y/o hace flip
// del dorso a la cara con timing "cartón" (nada elástico). Con reduced-motion
// se renderiza estática (cara final, sin movimiento).
export function CartaFlip({
  valor,
  palo,
  size = "md",
  flip = true,
  deal = false,
  delay = 0,
  origen,
}: {
  valor: Valor;
  palo: Palo;
  size?: keyof typeof TAM_W;
  // Si hace flip del dorso a la cara al aparecer.
  flip?: boolean;
  // Si "viaja" desde la zona del crupier al aterrizar.
  deal?: boolean;
  delay?: number;
  // Offset de origen del reparto (x/y en px, rotación en grados).
  origen?: { x?: number; y?: number; rotate?: number };
}) {
  const reduce = useReducedMotion();
  const w = TAM_W[size];
  const h = Math.round((w * CARD_H) / CARD_W);

  if (reduce) return <Carta valor={valor} palo={palo} size={size} />;

  const initEntrada = deal
    ? { x: origen?.x ?? 0, y: origen?.y ?? -110, rotate: origen?.rotate ?? -6, opacity: 0 }
    : { opacity: 0 };

  return (
    <motion.div
      style={{ width: w, height: h, perspective: 800 }}
      initial={initEntrada}
      animate={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
      transition={{ delay, duration: 0.45, ease: [0.2, 0.7, 0.3, 1] }}
    >
      <motion.div
        style={{ position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d" }}
        initial={{ rotateY: flip ? 180 : 0 }}
        animate={{ rotateY: 0 }}
        transition={{
          delay: delay + (deal ? 0.26 : 0),
          duration: flip ? 0.42 : 0,
          ease: [0.3, 0.8, 0.4, 1],
        }}
      >
        <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden" }}>
          <Carta valor={valor} palo={palo} size={size} />
        </div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <DorsoCarta size={size} />
        </div>
      </motion.div>
    </motion.div>
  );
}
