"use client";

import { useEffect, useState } from "react";
import { sonidoActivo, setSonidoActivo, reproducir } from "@/lib/sonidos";

// Toggle de sonido persistido. Muestra el estado real recién en cliente para
// evitar mismatch de hidratación.
export function BotonSonido({ className = "" }: { className?: string }) {
  const [montado, setMontado] = useState(false);
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(sonidoActivo());
    setMontado(true);
  }, []);

  function toggle() {
    const nuevo = !on;
    setOn(nuevo);
    setSonidoActivo(nuevo);
    if (nuevo) reproducir("turno");
  }

  return (
    <button
      onClick={toggle}
      aria-label={on ? "Silenciar" : "Activar sonido"}
      title={on ? "Sonido activado" : "Sonido silenciado"}
      className={`flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 ${className}`}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor" stroke="none" />
        {montado && on ? (
          <>
            <path d="M16 9a4 4 0 0 1 0 6" />
            <path d="M18.5 6.5a8 8 0 0 1 0 11" />
          </>
        ) : (
          <path d="M22 9l-6 6M16 9l6 6" />
        )}
      </svg>
    </button>
  );
}
