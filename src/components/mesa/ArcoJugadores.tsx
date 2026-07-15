"use client";

import { Children, isValidElement } from "react";

// Distribuye los asientos de "otros jugadores" en un arco suave: el/los
// asientos centrales quedan levemente más arriba que los de los extremos.
export function ArcoJugadores({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const items = Children.toArray(children).filter(isValidElement);
  const n = items.length;
  const mid = (n - 1) / 2;
  const amplitud = n <= 1 ? 0 : Math.min(14, 6 + n * 2);

  return (
    <div className={`flex flex-wrap items-start justify-center gap-x-3 gap-y-2 sm:gap-x-6 ${className}`}>
      {items.map((child, i) => {
        const dist = mid === 0 ? 0 : Math.abs(i - mid) / mid;
        const offsetY = -Math.round(amplitud * (1 - dist * dist));
        return (
          <div key={i} style={{ transform: `translateY(${offsetY}px)` }}>
            {child}
          </div>
        );
      })}
    </div>
  );
}
