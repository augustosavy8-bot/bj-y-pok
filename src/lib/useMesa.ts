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

/**
 * Suscribe a la mesa por código y mantiene el estado sincronizado vía Realtime.
 * Ante cualquier cambio en las tablas relevantes, refresca el estado.
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
  const manoIdRef = useRef<string | null>(null);

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

    const [{ data: jugadores }, { data: manos }] = await Promise.all([
      supabase.from("jugadores").select("*").eq("mesa_id", mesaId).order("posicion"),
      supabase
        .from("manos")
        .select("*")
        .eq("mesa_id", mesaId)
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
        supabase
          .from("acciones")
          .select("*")
          .eq("mano_id", mano.id)
          .order("created_at"),
      ]);
      cartas = (c ?? []) as Carta[];
      acciones = (a ?? []) as Accion[];
    }

    setEstado({
      mesa: mesa as Mesa,
      jugadores: (jugadores ?? []) as Jugador[],
      mano,
      cartas,
      acciones,
      cargando: false,
    });
  }, [codigo, supabase]);

  useEffect(() => {
    let activo = true;
    cargar();

    const canal = supabase
      .channel(`mesa-${codigo}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "mesas" }, () => {
        if (activo) cargar();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "jugadores" }, () => {
        if (activo) cargar();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "manos" }, () => {
        if (activo) cargar();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "cartas" }, () => {
        if (activo) cargar();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "acciones" }, () => {
        if (activo) cargar();
      })
      .subscribe();

    return () => {
      activo = false;
      supabase.removeChannel(canal);
    };
  }, [codigo, cargar, supabase]);

  return { ...estado, refrescar: cargar };
}
