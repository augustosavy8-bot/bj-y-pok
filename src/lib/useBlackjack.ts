"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { Mesa, Jugador } from "@/lib/types";
import type {
  BJConfig,
  BJShoe,
  BJRonda,
  BJManoJugador,
  BJCarta,
  BJResultado,
} from "@/lib/blackjack/types";

export interface EstadoBlackjack {
  mesa: Mesa | null;
  jugadores: Jugador[];
  config: BJConfig | null;
  shoe: BJShoe | null;
  ronda: BJRonda | null;
  manos: BJManoJugador[];
  cartas: BJCarta[]; // filtradas por RLS (hole card oculta según quién sos)
  resultados: BJResultado[];
  cargando: boolean;
}

const TABLAS = [
  "mesas",
  "jugadores",
  "bj_configuracion_sesion",
  "bj_shoe",
  "bj_rondas",
  "bj_manos_jugador",
  "bj_cartas_asignadas",
  "bj_resultados",
];

export function useBlackjack(codigo: string): EstadoBlackjack & { refrescar: () => void } {
  const supabase = getSupabaseBrowser();
  const [estado, setEstado] = useState<EstadoBlackjack>({
    mesa: null,
    jugadores: [],
    config: null,
    shoe: null,
    ronda: null,
    manos: [],
    cartas: [],
    resultados: [],
    cargando: true,
  });

  const cargar = useCallback(async () => {
    const { data: mesa } = await supabase
      .from("mesas")
      .select("*")
      .eq("codigo_sala", codigo.toUpperCase())
      .maybeSingle();
    if (!mesa) {
      setEstado((e) => ({ ...e, cargando: false }));
      return;
    }
    const mesaId = (mesa as Mesa).id;

    const [{ data: jugadores }, { data: config }, { data: shoe }, { data: rondas }] =
      await Promise.all([
        supabase.from("jugadores").select("*").eq("mesa_id", mesaId).order("posicion"),
        supabase.from("bj_configuracion_sesion").select("*").eq("mesa_id", mesaId).maybeSingle(),
        supabase.from("bj_shoe").select("*").eq("mesa_id", mesaId).maybeSingle(),
        supabase
          .from("bj_rondas")
          .select("*")
          .eq("mesa_id", mesaId)
          .order("numero_ronda", { ascending: false })
          .limit(1),
      ]);

    const ronda = (rondas?.[0] ?? null) as BJRonda | null;
    let manos: BJManoJugador[] = [];
    let cartas: BJCarta[] = [];
    let resultados: BJResultado[] = [];
    if (ronda) {
      const [{ data: m }, { data: c }] = await Promise.all([
        supabase.from("bj_manos_jugador").select("*").eq("ronda_id", ronda.id),
        supabase
          .from("bj_cartas_asignadas")
          .select("*")
          .eq("ronda_id", ronda.id)
          .order("orden_recibida"),
      ]);
      manos = (m ?? []) as BJManoJugador[];
      cartas = (c ?? []) as BJCarta[];
      const manoIds = manos.map((x) => x.id);
      if (manoIds.length) {
        const { data: r } = await supabase
          .from("bj_resultados")
          .select("*")
          .in("mano_jugador_id", manoIds);
        resultados = (r ?? []) as BJResultado[];
      }
    }

    setEstado({
      mesa: mesa as Mesa,
      jugadores: (jugadores ?? []) as Jugador[],
      config: (config ?? null) as BJConfig | null,
      shoe: (shoe ?? null) as BJShoe | null,
      ronda,
      manos,
      cartas,
      resultados,
      cargando: false,
    });
  }, [codigo, supabase]);

  useEffect(() => {
    let activo = true;
    cargar();
    const canal = supabase.channel(`bj-${codigo}`);
    for (const t of TABLAS) {
      canal.on("postgres_changes", { event: "*", schema: "public", table: t }, () => {
        if (activo) cargar();
      });
    }
    canal.subscribe();
    return () => {
      activo = false;
      supabase.removeChannel(canal);
    };
  }, [codigo, cargar, supabase]);

  return { ...estado, refrescar: cargar };
}
