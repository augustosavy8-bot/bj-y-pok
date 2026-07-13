"use client";

// Pila de fichas con etiqueta de monto. Colores clásicos de casino.
function colorFicha(monto: number): string {
  if (monto >= 1000) return "from-neutral-800 to-black"; // negra
  if (monto >= 500) return "from-purple-600 to-purple-900"; // púrpura
  if (monto >= 100) return "from-neutral-100 to-neutral-300 text-black"; // blanca
  if (monto >= 25) return "from-green-600 to-green-800"; // verde
  if (monto >= 10) return "from-blue-600 to-blue-900"; // azul
  return "from-red-600 to-red-800"; // roja
}

export function Ficha({ monto, size = 28 }: { monto: number; size?: number }) {
  return (
    <div
      className={`inline-flex items-center justify-center rounded-full bg-gradient-to-br ${colorFicha(
        monto
      )} border-2 border-dashed border-white/60 shadow`}
      style={{ width: size, height: size }}
    />
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
