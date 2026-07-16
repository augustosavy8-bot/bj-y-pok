"use client";

// Leyenda impresa en el fieltro, como en una mesa real de blackjack.
export function LeyendaFieltro({
  pago = "3 A 2",
  limiteMin,
  limiteMax,
}: {
  pago?: string;
  limiteMin?: number;
  limiteMax?: number;
}) {
  return (
    <div className="pointer-events-none flex select-none flex-col items-center gap-0.5 py-1 text-center">
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-crema/25">
        Blackjack paga {pago}
      </div>
      <div className="text-[9px] uppercase tracking-[0.15em] text-crema/20">
        La banca planta en 17 · Seguro paga 2 a 1
      </div>
      {(limiteMin != null || limiteMax != null) && (
        <div className="mt-0.5 rounded-full border border-crema/15 px-2 py-0.5 text-[9px] font-semibold tracking-wide text-crema/40">
          Límites {limiteMin ?? "—"} – {limiteMax ?? "—"}
        </div>
      )}
    </div>
  );
}
