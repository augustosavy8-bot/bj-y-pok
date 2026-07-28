"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  /** Hay conexión en vivo con la mesa. Si es false, se refresca por sondeo. */
  conectado: boolean;
}

// Ventana para agrupar ráfagas de eventos en UNA sola recarga. Repartir una
// mano dispara muchas escrituras seguidas (cada carta son varias); sin esto el
// cliente lanzaba una recarga completa por cada una y se trababa.
const MS_AGRUPAR = 140;

type Payload = { new?: Record<string, unknown>; old?: Record<string, unknown> };

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
    conectado: false,
  });

  const [mesaId, setMesaId] = useState<string | null>(null);
  // Se incrementa para forzar una resuscripción cuando el canal murió.
  const [generacion, setGeneracion] = useState(0);
  const conectadoRef = useRef(false);

  // Control: evita recargas superpuestas y permite descartar eventos ajenos a
  // esta mesa/ronda sin tener que volver a suscribirse.
  const vivo = useRef(true);
  const enVuelo = useRef(false);
  const pendiente = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mesaIdRef = useRef<string | null>(null);
  const rondaIdRef = useRef<string | null>(null);
  const manoIdsRef = useRef<Set<string>>(new Set());

  const cargar = useCallback(async () => {
    // Si ya hay una lectura en curso se marca "pendiente" y se reejecuta al
    // terminar: nunca hay dos recargas compitiendo por el mismo render.
    if (enVuelo.current) {
      pendiente.current = true;
      return;
    }
    enVuelo.current = true;
    try {
      // El código de sala se resuelve una sola vez; después se va por id.
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

      const [{ data: jugadores }, { data: config }, { data: shoe }, { data: rondas }] =
        await Promise.all([
          supabase.from("jugadores").select("*").eq("mesa_id", mesa.id).order("posicion"),
          supabase
            .from("bj_configuracion_sesion")
            .select("*")
            .eq("mesa_id", mesa.id)
            .maybeSingle(),
          supabase.from("bj_shoe").select("*").eq("mesa_id", mesa.id).maybeSingle(),
          supabase
            .from("bj_rondas")
            .select("*")
            .eq("mesa_id", mesa.id)
            .order("numero_ronda", { ascending: false })
            .limit(1),
        ]);

      const ronda = (rondas?.[0] ?? null) as BJRonda | null;
      rondaIdRef.current = ronda?.id ?? null;

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
        manoIdsRef.current = new Set(manos.map((x) => x.id));

        if (manos.length > 0) {
          const { data: r } = await supabase
            .from("bj_resultados")
            .select("*")
            .in("mano_jugador_id", [...manoIdsRef.current]);
          resultados = (r ?? []) as BJResultado[];
        }
      } else {
        manoIdsRef.current = new Set();
      }

      if (!vivo.current) return;
      setEstado({
        mesa,
        jugadores: (jugadores ?? []) as Jugador[],
        config: (config ?? null) as BJConfig | null,
        shoe: (shoe ?? null) as BJShoe | null,
        ronda,
        manos,
        cartas,
        resultados,
        cargando: false,
        conectado: conectadoRef.current,
      });
    } finally {
      enVuelo.current = false;
      // Llegaron eventos mientras cargábamos: una pasada más y listo.
      if (pendiente.current && vivo.current) {
        pendiente.current = false;
        timer.current = setTimeout(() => void cargar(), 0);
      }
    }
  }, [codigo, supabase]);

  // Agrupa la ráfaga: muchos eventos seguidos ⇒ una sola recarga.
  const programar = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void cargar(), MS_AGRUPAR);
  }, [cargar]);

  // Primera carga (resuelve el id de la mesa).
  useEffect(() => {
    vivo.current = true;
    void cargar();
    return () => {
      vivo.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [cargar]);

  // Suscripción en vivo, ya sabiendo a qué mesa pertenecemos.
  useEffect(() => {
    if (!mesaId) return;

    const canal = supabase.channel(`bj-${mesaId}`);

    // Tablas con mesa_id: filtro del lado del servidor. El cliente ni se entera
    // de lo que pasa en las demás mesas.
    for (const tabla of ["jugadores", "bj_configuracion_sesion", "bj_shoe", "bj_rondas"]) {
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

    // Tablas colgadas de la ronda: se descartan en el cliente si no son de la
    // ronda actual. Resuscribirse en cada ronda costaría más y podría perder
    // eventos durante el cambio de canal.
    const porRonda = (payload: Payload) => {
      const id = (payload.new?.ronda_id ?? payload.old?.ronda_id) as string | undefined;
      if (id && id !== rondaIdRef.current) return;
      programar();
    };
    for (const tabla of ["bj_manos_jugador", "bj_cartas_asignadas"]) {
      canal.on("postgres_changes", { event: "*", schema: "public", table: tabla }, porRonda);
    }
    canal.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "bj_resultados" },
      (payload: Payload) => {
        const id = (payload.new?.mano_jugador_id ?? payload.old?.mano_jugador_id) as
          | string
          | undefined;
        if (id && !manoIdsRef.current.has(id)) return;
        programar();
      }
    );

    canal.subscribe((status) => {
      const ok = status === "SUBSCRIBED";
      conectadoRef.current = ok;
      if (vivo.current) setEstado((e) => (e.conectado === ok ? e : { ...e, conectado: ok }));
      // Al (re)conectar puede haberse perdido algo mientras estuvo caído.
      if (ok) void cargar();
    });

    return () => {
      conectadoRef.current = false;
      supabase.removeChannel(canal);
    };
  }, [mesaId, supabase, programar, cargar, generacion]);

  // Red de seguridad: si el canal está caído, se sondea para que la pantalla
  // nunca quede congelada sin que el jugador se entere.
  useEffect(() => {
    if (estado.conectado || !mesaId) return;
    const iv = setInterval(() => void cargar(), 3000);
    return () => clearInterval(iv);
  }, [estado.conectado, mesaId, cargar]);

  // En el celular, bloquear la pantalla suspende el websocket: al volver hay
  // que refrescar y, si el canal murió, volver a suscribirse.
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState !== "visible") return;
      void cargar();
      if (!conectadoRef.current) setGeneracion((g) => g + 1);
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("online", alVolver);
    window.addEventListener("focus", alVolver);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("online", alVolver);
      window.removeEventListener("focus", alVolver);
    };
  }, [cargar]);

  return { ...estado, refrescar: cargar };
}
