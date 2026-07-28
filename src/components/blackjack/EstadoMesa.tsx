"use client";

import type { BJRonda } from "@/lib/blackjack/types";

export type TonoEstado = "espera" | "accion" | "vos" | "problema";

export interface LecturaEstado {
  texto: string;
  detalle?: string;
  tono: TonoEstado;
  /** Late (punto pulsante) cuando la mesa está trabajando. */
  activo: boolean;
}

/**
 * Traduce el estado crudo de la ronda a una frase que explique QUÉ está
 * pasando. El problema que resuelve: había momentos (mesa sin jugadores,
 * reparto, turno del crupier, conexión caída) en los que la pantalla quedaba
 * quieta sin ninguna explicación.
 */
export function leerEstadoMesa(params: {
  conectado: boolean;
  cargando: boolean;
  hayJugadores: boolean;
  ronda: BJRonda | null;
  hayApuestas: boolean;
  yaAposte: boolean;
  segsApuestas: number | null;
  esMiTurno: boolean;
  nombreEnTurno: string | null;
  segsTurno: number | null;
}): LecturaEstado {
  const {
    conectado,
    cargando,
    hayJugadores,
    ronda,
    hayApuestas,
    yaAposte,
    segsApuestas,
    esMiTurno,
    nombreEnTurno,
    segsTurno,
  } = params;

  if (cargando) {
    return { texto: "Conectando con la mesa…", tono: "espera", activo: true };
  }
  if (!conectado) {
    return {
      texto: "Se cortó la conexión en vivo",
      detalle: "Seguimos actualizando cada pocos segundos. Se reconecta solo.",
      tono: "problema",
      activo: true,
    };
  }

  if (!ronda || ronda.estado === "terminada") {
    if (!hayJugadores) {
      return {
        texto: "Mesa libre",
        detalle: "Apenas se siente alguien arranca la ronda.",
        tono: "espera",
        activo: false,
      };
    }
    return {
      texto: ronda ? "Preparando la próxima ronda…" : "Abriendo la mesa…",
      tono: "espera",
      activo: true,
    };
  }

  switch (ronda.estado) {
    case "apuestas":
      if (!hayApuestas && !yaAposte) {
        return {
          texto: "Apuestas abiertas",
          detalle: "La ronda arranca cuando alguien apueste.",
          tono: "accion",
          activo: false,
        };
      }
      if (yaAposte) {
        return {
          texto:
            segsApuestas != null && segsApuestas > 0
              ? `Apuesta lista · reparte en ${segsApuestas}s`
              : "Repartiendo…",
          detalle: segsApuestas != null && segsApuestas > 0 ? "Esperando a los demás." : undefined,
          tono: "espera",
          activo: true,
        };
      }
      return {
        texto:
          segsApuestas != null && segsApuestas > 0
            ? `Poné tu apuesta · cierra en ${segsApuestas}s`
            : "Poné tu apuesta",
        tono: "accion",
        activo: true,
      };

    case "reparto_inicial":
      return {
        texto: ronda.fase_seguro ? "¿Seguro? El crupier muestra un As" : "Repartiendo cartas…",
        tono: ronda.fase_seguro ? "accion" : "espera",
        activo: true,
      };

    case "turnos_jugadores":
      if (esMiTurno) {
        return {
          texto: segsTurno != null ? `Es tu turno · ${segsTurno}s` : "Es tu turno",
          detalle: "Si se acaba el tiempo te plantás automáticamente.",
          tono: "vos",
          activo: true,
        };
      }
      return {
        texto: `Juega ${nombreEnTurno ?? "otro jugador"}${segsTurno != null ? ` · ${segsTurno}s` : ""}`,
        tono: "espera",
        activo: true,
      };

    case "turno_dealer":
      return { texto: "Juega el crupier…", tono: "espera", activo: true };

    case "pagos":
      return { texto: "Pagando las manos…", tono: "espera", activo: true };

    default:
      return { texto: "En juego…", tono: "espera", activo: true };
  }
}

const COLOR: Record<TonoEstado, { punto: string; texto: string; borde: string }> = {
  espera: { punto: "bg-tinta/45", texto: "text-tinta/75", borde: "border-white/10" },
  accion: { punto: "bg-acento", texto: "text-acento-300", borde: "border-acento/35" },
  vos: { punto: "bg-emerald-400", texto: "text-emerald-200", borde: "border-emerald-400/40" },
  problema: { punto: "bg-amber-400", texto: "text-amber-200", borde: "border-amber-400/40" },
};

/** Franja siempre visible que dice qué está pasando en la mesa. */
export function BannerEstadoMesa({ lectura }: { lectura: LecturaEstado }) {
  const c = COLOR[lectura.tono];
  return (
    <div
      className={`flex items-center gap-2.5 rounded-md border ${c.borde} bg-black/25 px-3 py-2`}
      role="status"
      aria-live="polite"
    >
      <span className="relative flex h-2 w-2 shrink-0">
        {lectura.activo && (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${c.punto} opacity-75`} />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${c.punto}`} />
      </span>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <span className={`text-[13px] font-medium ${c.texto}`}>{lectura.texto}</span>
        {lectura.detalle && (
          <span className="text-[11px] text-tinta/45">{lectura.detalle}</span>
        )}
      </div>
    </div>
  );
}
