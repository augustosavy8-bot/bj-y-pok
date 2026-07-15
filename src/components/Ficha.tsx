"use client";

// Ficha de casino: disco con borde segmentado (como las fichas reales) y
// color por denominación. Colores clásicos de casino — no decorativos.
function paletaFicha(monto: number): { base: string; borde: string; oscuro: boolean } {
  if (monto >= 1000) return { base: "#171512", borde: "#e0b64d", oscuro: false }; // negra
  if (monto >= 500) return { base: "#5b2a86", borde: "#f1ead9", oscuro: false }; // púrpura
  if (monto >= 100) return { base: "#f1ead9", borde: "#1c1a17", oscuro: true }; // crema/blanca
  if (monto >= 25) return { base: "#1f6b3a", borde: "#f1ead9", oscuro: false }; // verde
  if (monto >= 10) return { base: "#1d4f8f", borde: "#f1ead9", oscuro: false }; // azul
  return { base: "#a32a2a", borde: "#f1ead9", oscuro: false }; // roja
}

export function Ficha({ monto, size = 28 }: { monto: number; size?: number }) {
  const { base, borde, oscuro } = paletaFicha(monto);
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className="shrink-0 drop-shadow select-none">
      <circle cx="20" cy="20" r="18.5" fill={base} stroke={borde} strokeWidth="3.4" strokeDasharray="4.2 3.6" />
      <circle cx="20" cy="20" r="18.5" fill="none" stroke={oscuro ? "#1c1a17" : "#000"} strokeOpacity="0.18" strokeWidth="1" />
      <circle cx="20" cy="20" r="13" fill="none" stroke={oscuro ? "#1c1a17" : "#fff"} strokeOpacity={oscuro ? 0.25 : 0.55} strokeWidth="1.4" />
      <circle cx="20" cy="20" r="9.5" fill={base} stroke={oscuro ? "#1c1a17" : "#fff"} strokeOpacity={oscuro ? 0.2 : 0.35} strokeWidth="1" />
    </svg>
  );
}

export function FichasMonto({ monto }: { monto: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Ficha monto={monto} />
      <span className="tabular-nums font-semibold">{monto.toLocaleString("es")}</span>
    </span>
  );
}
