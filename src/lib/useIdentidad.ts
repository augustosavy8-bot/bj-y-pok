"use client";

import { useCallback, useEffect, useState } from "react";
import { usuarioActualId } from "@/lib/supabase/client";

// Resuelve la identidad del usuario logueado en una mesa.
// Como el cliente ya NO puede leer jugadores.auth_uid, el asiento propio y el
// rol de crupier se obtienen del endpoint /mi-jugador (identidad por sesión).
export function useIdentidad(codigo: string) {
  const [userId, setUserId] = useState<string | null>(null);
  const [jugadorId, setJugadorId] = useState<string | null>(null);
  const [esCrupier, setEsCrupier] = useState(false);
  const [cargando, setCargando] = useState(true);

  const refrescar = useCallback(async () => {
    const uid = await usuarioActualId();
    setUserId(uid);
    try {
      const res = await fetch(`/api/mesa/${codigo}/mi-jugador`);
      if (res.ok) {
        const d = await res.json();
        setJugadorId(d.jugador?.id ?? null);
        setEsCrupier(Boolean(d.es_crupier));
      }
    } finally {
      setCargando(false);
    }
  }, [codigo]);

  useEffect(() => {
    refrescar();
  }, [refrescar]);

  return { userId, jugadorId, esCrupier, cargando, refrescar };
}
