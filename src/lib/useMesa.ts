"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { Mesa, Jugador, Mano, Carta, Accion } from "@/lib/types";

export interface EstadoMesa {
  mesa: Mesa | null;
  jugadores: Jugador[];
  mano: Mano | null;
  cartas: Carta[]; // sólo las que el usuario puede leer (según RLS)
  acciones: Accion[];
  cargando: boolean;
}

// Ver la nota en useBlackjack: una jugada dispara varias escrituras seguidas y
// sin agrupar se recargaba el estado completo por cada una.
const MS_AGRUPAR = 140;

type Payload = { new?: Record<string, unknown>; old?: Record<string, unknown> };

/**
 * Suscribe a la mesa por código y mantiene el estado sincronizado vía Realtime,
 * agrupando ráfagas de eventos y filtrando lo que no es de esta mesa/mano.
 */
export function useMesa(codigo: string): EstadoMesa & { refrescar: () => void } {
  const supabase = getSupabaseBrowser();
  const [estado, setEstado] = useState<EstadoMesa>({
    mesa: null,
    jugadores: [],
    mano: null,
    cartas: [],
    acciones: [],
    cargando: true,
  });

  const [mesaId, setMesaId] = useState<string | null>(null);

  const vivo = useRef(true);
  const enVuelo = useRef(false);
  const pendiente = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mesaIdRef = useRef<string | null>(null);
  const manoIdRef = useRef<string | null>(null);

  const cargar = useCallback(async () => {
    if (enVuelo.current) {
      pendiente.current = true;
      return;
    }
    enVuelo.current = true;
    try {
      let mesa: Mesa | null = null;
      if (mesaIdRef.current) {
        const { data } = await supabase
          .from("mesas")
          .select("*")
          .eq("id", mesaIdRef.current)
          .maybeSingle();
        mesa = (data ?? null) as Mesa | null;
      } else {
        const { data } = await supabase
          .from("mesas")
          .select("*")
          .eq("codigo_sala", codigo.toUpperCase())
          .maybeSingle();
        mesa = (data ?? null) as Mesa | null;
        if (mesa) {
          mesaIdRef.current = mesa.id;
          setMesaId(mesa.id);
        }
      }

      if (!mesa) {
        if (vivo.current) setEstado((e) => ({ ...e, cargando: false }));
        return;
      }

      const [{ data: jugadores }, { data: manos }] = await Promise.all([
        supabase.from("jugadores").select("*").eq("mesa_id", mesa.id).order("posicion"),
        supabase
          .from("manos")
          .select("*")
          .eq("mesa_id", mesa.id)
          .order("numero_mano", { ascending: false })
          .limit(1),
      ]);

      const mano = (manos?.[0] ?? null) as Mano | null;
      manoIdRef.current = mano?.id ?? null;

      let cartas: Carta[] = [];
      let acciones: Accion[] = [];
      if (mano) {
        const [{ data: c }, { data: a }] = await Promise.all([
          supabase.from("cartas").select("*").eq("mano_id", mano.id).order("orden_escaneo"),
          supabase.from("acciones").select("*").eq("mano_id", mano.id).order("created_at"),
        ]);
        cartas = (c ?? []) as Carta[];
        acciones = (a ?? []) as Accion[];
      }

      if (!vivo.current) return;
      setEstado({
        mesa,
        jugadores: (jugadores ?? []) as Jugador[],
        mano,
        cartas,
        acciones,
        cargando: false,
      });
    } finally {
      enVuelo.current = false;
      if (pendiente.current && vivo.current) {
        pendiente.current = false;
        timer.current = setTimeout(() => void cargar(), 0);
      }
    }
  }, [codigo, supabase]);

  const programar = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void cargar(), MS_AGRUPAR);
  }, [cargar]);

  useEffect(() => {
    vivo.current = true;
    void cargar();
    return () => {
      vivo.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [cargar]);

  useEffect(() => {
    if (!mesaId) return;

    const canal = supabase.channel(`mesa-${mesaId}`);

    for (const tabla of ["jugadores", "manos"]) {
      canal.on(
        "postgres_changes",
        { event: "*", schema: "public", table: tabla, filter: `mesa_id=eq.${mesaId}` },
        programar
      );
    }
    canal.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "mesas", filter: `id=eq.${mesaId}` },
      programar
    );

    // cartas y acciones cuelgan de la mano: se filtran contra la mano actual.
    const porMano = (payload: Payload) => {
      const id = (payload.new?.mano_id ?? payload.old?.mano_id) as string | undefined;
      if (id && id !== manoIdRef.current) return;
      programar();
    };
    for (const tabla of ["cartas", "acciones"]) {
      canal.on("postgres_changes", { event: "*", schema: "public", table: tabla }, porMano);
    }

    canal.subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [mesaId, supabase, programar]);

  return { ...estado, refrescar: cargar };
}
