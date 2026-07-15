"use client";

// Placeholder visual del video del crupier. La transmisión WebRTC real es
// trabajo aparte (no existe todavía en el proyecto); esto deja el marco y la
// estética listos para conectar un <video> real más adelante.
export function CamaraCrupier({
  activa = false,
  etiqueta = "Cámara del crupier",
  className = "",
}: {
  activa?: boolean;
  etiqueta?: string;
  className?: string;
}) {
  return (
    <div
      className={`relative aspect-video w-full overflow-hidden rounded-2xl border border-oro/30 bg-gradient-to-br from-neutral-800 via-neutral-900 to-black shadow-camara ${className}`}
    >
      {/* Viñeta + textura sutil simulando el encuadre de una cámara */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.55)_100%)]" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/35">
        <IconoCamara className="h-9 w-9" />
        <span className="text-xs font-medium tracking-wide">{etiqueta}</span>
      </div>
      {activa && (
        <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          <span className="text-[10px] font-bold tracking-wider text-white">AL AIRE</span>
        </div>
      )}
    </div>
  );
}

function IconoCamara({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.19a1.5 1.5 0 0 0 1.28-.72l.66-1.08A1.5 1.5 0 0 1 10.91 4.5h2.18a1.5 1.5 0 0 1 1.28.7l.66 1.08A1.5 1.5 0 0 0 16.31 7H18.5A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-9Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="12" cy="13" r="3.4" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
