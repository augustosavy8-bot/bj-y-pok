"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Ficha } from "@/components/Ficha";

// Cada vez que `disparo` incrementa, lanza una ficha desde la zona del jugador
// (abajo) hacia la mesa (arriba) con arco parabólico. Overlay fijo, no
// intercepta clicks. Sobrio: una sola ficha, sin partículas.
export function FichasVolando({ disparo, monto }: { disparo: number; monto: number }) {
  const reduce = useReducedMotion();
  const [chips, setChips] = useState<{ id: number; monto: number }[]>([]);

  useEffect(() => {
    if (disparo <= 0 || reduce) return;
    const id = disparo;
    setChips((c) => [...c, { id, monto }]);
    const t = setTimeout(() => setChips((c) => c.filter((x) => x.id !== id)), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disparo]);

  if (reduce) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center">
      <AnimatePresence>
        {chips.map((c) => (
          <motion.div
            key={c.id}
            className="absolute"
            initial={{ y: 230, x: 0, opacity: 0, scale: 0.75 }}
            animate={{ y: -110, x: [0, 14, 0], opacity: [0, 1, 1, 0], scale: 1 }}
            transition={{ duration: 0.6, ease: [0.3, 0.7, 0.4, 1] }}
          >
            <Ficha monto={c.monto} size={30} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
