"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ContadorNumero } from "@/components/mesa/FichasAnimadas";

export type TipoResultado = "gana" | "pierde" | "empate" | "blackjack";

const ESTILO: Record<TipoResultado, { texto: string; clase: string; glow: string }> = {
  gana: { texto: "Ganaste", clase: "text-green-300", glow: "shadow-[0_0_28px_rgba(61,214,140,0.35)]" },
  blackjack: { texto: "Blackjack", clase: "text-oro", glow: "shadow-[0_0_34px_rgba(224,182,77,0.45)]" },
  empate: { texto: "Empate", clase: "text-white/80", glow: "" },
  pierde: { texto: "Perdiste", clase: "text-white/45", glow: "" },
};

// Banner sobrio de resultado que aparece sobre el fieltro. Sin confetti: un
// pulso breve, glow según resultado y count-up del monto.
export function OverlayResultado({
  tipo,
  monto,
  detalle,
}: {
  tipo: TipoResultado;
  monto?: number;
  detalle?: string;
}) {
  const reduce = useReducedMotion();
  const e = ESTILO[tipo];
  const positivo = tipo === "gana" || tipo === "blackjack";

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.2, 0.7, 0.3, 1] }}
      className={`pointer-events-none flex flex-col items-center gap-1 rounded-2xl bg-black/55 px-5 py-3 backdrop-blur ${e.glow}`}
    >
      <div className={`text-lg font-bold tracking-wide ${e.clase}`}>{e.texto}</div>
      {typeof monto === "number" && monto !== 0 && (
        <div className={`text-2xl font-extrabold tabular-nums ${positivo ? "text-green-300" : "text-white/50"}`}>
          {positivo ? "+" : "−"}
          <ContadorNumero value={Math.abs(monto)} />
        </div>
      )}
      {detalle && <div className="text-xs text-white/60">{detalle}</div>}
    </motion.div>
  );
}
