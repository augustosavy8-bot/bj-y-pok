"use client";

import { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Carta, DorsoCarta } from "@/components/Carta";
import { reproducir } from "@/lib/sonidos";
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

  // Sonido de carta al repartir (solo cartas que "viajan", no cada flip).
  useEffect(() => {
    if (deal) reproducir("carta");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (reduce) return <Carta valor={valor} palo={palo} size={size} />;

  const initEntrada = deal
    ? { x: origen?.x ?? 0, y: origen?.y ?? -110, rotate: origen?.rotate ?? -6, opacity: 0 }
    : { opacity: 0 };

  // Momento en que arranca el giro dorso→cara (después de aterrizar el vuelo).
  const inicioFlip = delay + (deal ? 0.26 : 0);

  return (
    <motion.div
      style={{ width: w, height: h, perspective: 700 }}
      initial={initEntrada}
      animate={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
      transition={{ delay, duration: 0.47, ease: [0.22, 0.72, 0.2, 1] }}
    >
      <motion.div
        style={{ position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d" }}
        initial={{ rotateY: flip ? 180 : 0 }}
        animate={{ rotateY: 0 }}
        transition={{
          delay: inicioFlip,
          duration: flip ? 0.34 : 0,
          ease: [0.3, 0.7, 0.2, 1],
        }}
      >
        {/* Cara: aparece por opacidad a mitad del giro (no dependemos de
            backface-visibility, poco confiable entre navegadores). */}
        <motion.div
          style={{ position: "absolute", inset: 0, zIndex: 2 }}
          initial={{ opacity: flip ? 0 : 1 }}
          animate={{ opacity: 1 }}
          transition={{ delay: inicioFlip + (flip ? 0.13 : 0), duration: 0.2, ease: "linear" }}
        >
          <Carta valor={valor} palo={palo} size={size} />
        </motion.div>
        {/* Dorso: se cruza en opacidad hacia afuera mientras la cara entra. */}
        <motion.div
          style={{ position: "absolute", inset: 0, zIndex: 1, transform: "rotateY(180deg)" }}
          initial={{ opacity: flip ? 1 : 0 }}
          animate={{ opacity: 0 }}
          transition={{ delay: inicioFlip, duration: 0.2, ease: "linear" }}
        >
          <DorsoCarta size={size} />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
