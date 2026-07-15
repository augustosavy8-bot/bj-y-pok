"use client";

// Aro dorado apagado que marca el turno activo. Estático por ahora (Block 1);
// la transición suave entre asientos llega en el bloque de animaciones.
export function AroTurno({
  activo,
  children,
  className = "",
}: {
  activo: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl transition-shadow duration-300 ${
        activo ? "ring-2 ring-oro/80 animate-turn-pulse" : "ring-1 ring-white/0"
      } ${className}`}
    >
      {children}
    </div>
  );
}
