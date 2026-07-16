"use client";

import { useEffect, useRef, useState } from "react";
import { animate, motion, useReducedMotion } from "framer-motion";
import { Ficha } from "@/components/Ficha";

// Número que hace tween del valor viejo al nuevo (para el pozo, stacks, etc.).
export function ContadorNumero({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    if (reduce || prev.current === value) {
      setDisplay(value);
      prev.current = value;
      return;
    }
    const controls = animate(prev.current, value, {
      duration: 0.3,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, reduce]);

  return <span className="tabular-nums">{display.toLocaleString("es")}</span>;
}

// Pila de fichas: dibuja varias fichas apiladas con leve offset vertical. La
// ficha superior "cae" con un pequeño rebote cada vez que cambia el monto.
export function PilaFichas({ monto, size = 24 }: { monto: number; size?: number }) {
  const reduce = useReducedMotion();
  const capas = Math.min(5, Math.max(1, Math.round(monto / 100)));
  const paso = Math.max(2, Math.round(size * 0.12));
  const alto = size + (capas - 1) * paso;

  return (
    <span className="relative inline-block align-middle" style={{ width: size, height: alto }}>
      {Array.from({ length: capas }).map((_, i) => {
        const esTope = i === capas - 1;
        if (esTope && !reduce) {
          return (
            <motion.span
              key={`tope-${monto}`}
              className="absolute left-0"
              style={{ bottom: i * paso }}
              initial={{ y: -14, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 520, damping: 20 }}
            >
              <Ficha monto={monto} size={size} />
            </motion.span>
          );
        }
        return (
          <span key={i} className="absolute left-0" style={{ bottom: i * paso }}>
            <Ficha monto={monto} size={size} />
          </span>
        );
      })}
    </span>
  );
}
