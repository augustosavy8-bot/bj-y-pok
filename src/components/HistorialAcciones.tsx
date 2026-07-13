"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type {
  Accion,
  Jugador,
  Carta,
  FaseMano,
  ResultadoShowdown,
  Palo,
} from "@/lib/types";
import { SIMBOLO_PALO, esPaloRojo } from "@/lib/poker/cards";

const ORDEN_CALLES: ("preflop" | "flop" | "turn" | "river")[] = [
  "preflop",
  "flop",
  "turn",
  "river",
];

const NOMBRE_CALLE: Record<string, string> = {
  flop: "FLOP",
  turn: "TURN",
  river: "RIVER",
  showdown: "SHOWDOWN",
};

// Narración de una acción en lenguaje natural.
function describirAccion(a: Accion, nombre: string): string {
  const m = a.monto.toLocaleString("es");
  switch (a.tipo) {
    case "fold":
      return `${nombre} se retiró`;
    case "check":
      return `${nombre} pasó`;
    case "call":
      return `${nombre} pagó ${m}`;
    case "raise":
      return `${nombre} subió a ${m}`;
    case "all_in":
      return `${nombre} fue all-in por ${m}`;
    case "blind":
      return `${nombre} puso la ciega (${m})`;
    default:
      return nombre;
  }
}

type Evento =
  | { kind: "accion"; id: string; accion: Accion }
  | { kind: "separador"; id: string; calle: string; cartas: Carta[] }
  | { kind: "resultado"; id: string; texto: string };

export function HistorialAcciones({
  manoId,
  jugadores,
  comunitarias,
  fase,
  resultado,
  className = "",
}: {
  manoId: string | null;
  jugadores: Jugador[];
  comunitarias: Carta[];
  fase: FaseMano | null;
  resultado: ResultadoShowdown | null;
  className?: string;
}) {
  const supabase = getSupabaseBrowser();
  const [acciones, setAcciones] = useState<Accion[]>([]);

  const nombreDe = useMemo(() => {
    const map: Record<string, string> = {};
    for (const j of jugadores) map[j.id] = j.nombre;
    return map;
  }, [jugadores]);

  // Suscripción a la tabla `acciones` filtrada por mano_id.
  useEffect(() => {
    if (!manoId) {
      setAcciones([]);
      return;
    }
    let activo = true;

    (async () => {
      const { data } = await supabase
        .from("acciones")
        .select("*")
        .eq("mano_id", manoId)
        .order("created_at", { ascending: true });
      if (activo) setAcciones((data ?? []) as Accion[]);
    })();

    const canal = supabase
      .channel(`acciones-${manoId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "acciones",
          filter: `mano_id=eq.${manoId}`,
        },
        () => {
          if (!activo) return;
          supabase
            .from("acciones")
            .select("*")
            .eq("mano_id", manoId)
            .order("created_at", { ascending: true })
            .then(({ data }) => activo && setAcciones((data ?? []) as Accion[]));
        }
      )
      .subscribe();

    return () => {
      activo = false;
      supabase.removeChannel(canal);
    };
  }, [manoId, supabase]);

  const eventos = useMemo(
    () => construirEventos(acciones, comunitarias, fase, resultado, nombreDe),
    [acciones, comunitarias, fase, resultado, nombreDe]
  );

  if (!manoId) {
    return (
      <div className={`panel p-4 text-center text-sm text-white/50 ${className}`}>
        Todavía no hay una mano en juego.
      </div>
    );
  }

  return (
    <div className={`panel flex flex-col overflow-hidden ${className}`}>
      <div className="border-b border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white/60">
        Historial
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {eventos.length === 0 ? (
          <div className="py-6 text-center text-sm text-white/40">
            Sin acciones todavía.
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {eventos.map((ev) => (
              <li key={ev.id}>
                {ev.kind === "accion" && (
                  <div className="rounded-lg bg-white/5 px-3 py-1.5 text-sm">
                    {describirAccion(ev.accion, nombreDe[ev.accion.jugador_id] ?? "Jugador")}
                  </div>
                )}
                {ev.kind === "separador" && (
                  <Separador calle={ev.calle} cartas={ev.cartas} />
                )}
                {ev.kind === "resultado" && (
                  <div className="rounded-lg bg-oro/15 px-3 py-1.5 text-sm font-medium text-oro">
                    {ev.texto}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Separador({ calle, cartas }: { calle: string; cartas: Carta[] }) {
  return (
    <div className="my-1 flex items-center gap-2 py-1">
      <span className="h-px flex-1 bg-white/15" />
      <span className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-white/70">
        {NOMBRE_CALLE[calle] ?? calle.toUpperCase()}
        {cartas.length > 0 && (
          <span className="flex items-center gap-1">
            :
            {cartas.map((c) => (
              <CartaMini key={c.id} valor={c.valor} palo={c.palo} />
            ))}
          </span>
        )}
      </span>
      <span className="h-px flex-1 bg-white/15" />
    </div>
  );
}

function CartaMini({ valor, palo }: { valor: string; palo: Palo }) {
  return (
    <span
      className={`inline-flex items-center rounded bg-white px-1 text-[11px] font-bold leading-tight ${
        esPaloRojo(palo) ? "text-red-600" : "text-neutral-900"
      }`}
    >
      {valor}
      {SIMBOLO_PALO[palo]}
    </span>
  );
}

// Arma la lista cronológica (ascendente) y la devuelve invertida (más
// reciente primero) para renderizar arriba.
function construirEventos(
  acciones: Accion[],
  comunitarias: Carta[],
  fase: FaseMano | null,
  resultado: ResultadoShowdown | null,
  nombreDe: Record<string, string>
): Evento[] {
  const com = [...comunitarias].sort((a, b) => a.orden_escaneo - b.orden_escaneo);
  const cartasDeCalle = (calle: string): Carta[] => {
    if (calle === "flop") return com.slice(0, 3);
    if (calle === "turn") return com.slice(3, 4);
    if (calle === "river") return com.slice(4, 5);
    return [];
  };

  const asc = [...acciones].sort((a, b) =>
    a.created_at.localeCompare(b.created_at)
  );

  const eventos: Evento[] = [];
  const emitidas = new Set<string>();

  const avanzarHasta = (calle: "preflop" | "flop" | "turn" | "river") => {
    const idx = ORDEN_CALLES.indexOf(calle);
    for (let i = 1; i <= idx; i++) {
      const c = ORDEN_CALLES[i];
      if (!emitidas.has(c)) {
        emitidas.add(c);
        eventos.push({
          kind: "separador",
          id: `sep-${c}`,
          calle: c,
          cartas: cartasDeCalle(c),
        });
      }
    }
  };

  for (const a of asc) {
    avanzarHasta((a.fase ?? "preflop") as "preflop" | "flop" | "turn" | "river");
    eventos.push({ kind: "accion", id: a.id, accion: a });
  }

  // Calles alcanzadas por la fase actual aunque no tengan acciones
  // (p. ej. todos all-in: no hay apuestas pero las cartas se revelan).
  if (fase === "flop" || fase === "turn" || fase === "river") {
    avanzarHasta(fase);
  } else if (fase === "showdown" || fase === "terminada") {
    avanzarHasta("river");
    if (!emitidas.has("showdown")) {
      emitidas.add("showdown");
      eventos.push({
        kind: "separador",
        id: "sep-showdown",
        calle: "showdown",
        cartas: [],
      });
    }
  }

  // Resultado final.
  if (fase === "terminada" && resultado?.botes?.length) {
    const b = resultado.botes[0];
    const nombres = b.ganadores.map((id) => nombreDe[id] ?? "Jugador").join(", ");
    const texto =
      b.descripcion && b.descripcion !== "Ganador"
        ? `🏆 ${nombres} — ${b.descripcion} (${b.monto.toLocaleString("es")})`
        : `🏆 ${nombres} se lleva ${b.monto.toLocaleString("es")}`;
    eventos.push({ kind: "resultado", id: "resultado", texto });
  }

  return eventos.reverse();
}
