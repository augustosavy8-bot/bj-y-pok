"use client";

import { useReducedMotion } from "framer-motion";

// Arco circular que se consume con el tiempo restante del turno. Color pasa de
// verde a ámbar a rojo. Si no hay timer (total<=0) no se dibuja el arco.
export function TimerCircular({
  restante,
  total,
  size = 40,
  children,
}: {
  restante: number | null;
  total: number;
  size?: number;
  children?: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const hayTimer = restante !== null && total > 0;
  const frac = hayTimer ? Math.max(0, Math.min(1, restante! / total)) : 0;

  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * frac;

  // Verde → ámbar → rojo según fracción restante.
  const color = frac > 0.5 ? "#3dd68c" : frac > 0.25 ? "#e0b64d" : "#e5484d";

  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} />
        {hayTimer && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`}
            style={reduce ? undefined : { transition: "stroke-dasharray 0.5s linear, stroke 0.4s linear" }}
          />
        )}
      </svg>
      {children}
    </span>
  );
}
