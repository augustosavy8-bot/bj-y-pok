"use client";

import { useEffect, useMemo, useState } from "react";
import { useBlackjack } from "@/lib/useBlackjack";
import { ManoBJ, ManoDealer } from "@/components/blackjack/ManoBJ";
import { FichasMonto } from "@/components/Ficha";
import { accionesDisponibles } from "@/lib/blackjack/acciones";
import type { AccionBJ, BJManoJugador } from "@/lib/blackjack/types";

const FICHAS_RAPIDAS = [5, 10, 25, 50, 100];

export function VistaJugadorBlackjack({
  codigo,
  authUid,
  yoId,
}: {
  codigo: string;
  authUid: string;
  yoId: string;
}) {
  const { mesa, jugadores, config, ronda, manos, cartas, resultados } = useBlackjack(codigo);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apuesta, setApuesta] = useState(0);
  const [restante, setRestante] = useState<number | null>(null);

  const yo = jugadores.find((j) => j.id === yoId);
  const soyBanca = ronda?.banca_jugador_id === yoId;
  const dealerCartas = useMemo(() => cartas.filter((c) => c.es_carta_dealer), [cartas]);
  const misManos = useMemo(
    () =>
      manos
        .filter((m) => m.jugador_id === yoId)
        .sort((a, b) => a.orden_mano - b.orden_mano),
    [manos, yoId]
  );
  const manoBase = misManos.find((m) => !m.es_split_de);

  // Timer de turno con auto-stand.
  useEffect(() => {
    if (ronda?.estado !== "turnos_jugadores" || !ronda.turno_expira_at) {
      setRestante(null);
      return;
    }
    const manoEnTurno = manos.find((m) => m.id === ronda.turno_mano_id);
    const esMia = manoEnTurno?.jugador_id === yoId;
    const t = setInterval(() => {
      const ms = new Date(ronda.turno_expira_at!).getTime() - Date.now();
      const seg = Math.max(0, Math.ceil(ms / 1000));
      setRestante(seg);
      if (seg <= 0 && esMia && manoEnTurno) {
        clearInterval(t);
        actuar(manoEnTurno.id, "stand");
      }
    }, 500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ronda?.turno_mano_id, ronda?.turno_expira_at, ronda?.estado]);

  async function apostar() {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/blackjack/${codigo}/apostar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ auth_uid: authUid, jugador_id: yoId, monto: apuesta }),
      });
      const data = await res.json();
      if (!res.ok) setError(data?.error ?? "Error");
    } finally {
      setEnviando(false);
    }
  }

  async function actuar(manoId: string, accion: AccionBJ) {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/blackjack/${codigo}/accion`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ auth_uid: authUid, jugador_id: yoId, mano_id: manoId, accion }),
      });
      const data = await res.json();
      if (!res.ok) setError(data?.error ?? "Acción rechazada");
    } finally {
      setEnviando(false);
    }
  }

  async function seguro(tomar: boolean) {
    setEnviando(true);
    try {
      await fetch(`/api/blackjack/${codigo}/seguro`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ auth_uid: authUid, jugador_id: yoId, tomar }),
      });
    } finally {
      setEnviando(false);
    }
  }

  if (!mesa || !yo) return null;
  const otros = jugadores.filter(
    (j) => !j.es_crupier && j.id !== yoId && j.id !== ronda?.banca_jugador_id
  );

  const resultadoDe = (manoId: string) => resultados.find((r) => r.mano_jugador_id === manoId);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-xs text-white/50">Blackjack · {codigo}</div>
          <div className="font-bold text-oro">
            {ronda ? `Ronda #${ronda.numero_ronda} · ${ronda.estado}` : "Esperando ronda"}
          </div>
        </div>
        <div className="text-right">
          <FichasMonto monto={yo.fichas} />
          {soyBanca && <div className="text-xs font-bold text-oro">SOS LA BANCA</div>}
        </div>
      </header>

      {/* Dealer */}
      <section className="panel flex justify-center p-3">
        <ManoDealer
          cartas={dealerCartas}
          holeRevelada={ronda?.hole_revelada ?? false}
          verHole={soyBanca}
        />
      </section>

      {/* Otros jugadores (compacto) */}
      {otros.length > 0 && (
        <section className="flex flex-wrap justify-center gap-2">
          {otros.map((o) => {
            const suMano = manos.find((m) => m.jugador_id === o.id && !m.es_split_de);
            const suCartas = suMano ? cartas.filter((c) => c.mano_jugador_id === suMano.id) : [];
            return (
              <div key={o.id} className="rounded-lg bg-black/20 px-2 py-1 text-center">
                <div className="text-xs text-white/70">{o.nombre}</div>
                <ManoBJ cartas={suCartas} mano={suMano} size="sm" />
              </div>
            );
          })}
        </section>
      )}

      {/* Mis manos */}
      {!soyBanca && (
        <section className="panel flex flex-col items-center gap-2 p-3">
          <div className="text-xs uppercase tracking-wide text-white/50">Tu mano</div>
          <div className="flex flex-wrap justify-center gap-3">
            {misManos.length > 0 ? (
              misManos.map((m) => {
                const cs = cartas.filter((c) => c.mano_jugador_id === m.id);
                const r = resultadoDe(m.id);
                return (
                  <div key={m.id} className="flex flex-col items-center">
                    <ManoBJ
                      cartas={cs}
                      mano={m}
                      destacada={ronda?.turno_mano_id === m.id}
                    />
                    {r && (
                      <span
                        className={`text-xs font-bold ${
                          r.fichas_ganadas_o_perdidas >= 0 ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        {r.resultado} ({r.fichas_ganadas_o_perdidas >= 0 ? "+" : ""}
                        {r.fichas_ganadas_o_perdidas})
                      </span>
                    )}
                  </div>
                );
              })
            ) : (
              <span className="text-sm text-white/50">Sin mano esta ronda</span>
            )}
          </div>
        </section>
      )}

      {/* Controles según fase */}
      {!soyBanca && ronda?.estado === "apuestas" && (
        <section className="panel flex flex-col gap-2 p-3">
          <div className="flex items-center justify-between text-sm">
            <span>Tu apuesta</span>
            <span className="font-bold text-oro">{apuesta.toLocaleString("es")}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {FICHAS_RAPIDAS.map((v) => (
              <button
                key={v}
                className="btn btn-gris !px-3 !py-1.5 text-sm"
                onClick={() => setApuesta((a) => Math.min(a + v, config?.apuesta_max ?? 500, yo.fichas))}
              >
                +{v}
              </button>
            ))}
            <button className="btn btn-gris !px-3 !py-1.5 text-sm" onClick={() => setApuesta(0)}>
              Limpiar
            </button>
          </div>
          <button
            className="btn btn-oro"
            disabled={enviando || apuesta < (config?.apuesta_min ?? 1)}
            onClick={apostar}
          >
            Apostar {apuesta.toLocaleString("es")}
          </button>
          <div className="text-xs text-white/50">
            Min {config?.apuesta_min} · Max {config?.apuesta_max}
            {manoBase && manoBase.apuesta_fichas > 0 && (
              <> · apuesta actual: {manoBase.apuesta_fichas}</>
            )}
          </div>
        </section>
      )}

      {!soyBanca && ronda?.fase_seguro && manoBase && (
        <section className="panel flex flex-col gap-2 p-3">
          <div className="text-sm">
            El dealer muestra un As. ¿Tomás seguro? (cuesta {Math.floor(manoBase.apuesta_fichas / 2)})
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn btn-gris" disabled={enviando} onClick={() => seguro(false)}>
              No
            </button>
            <button className="btn btn-oro" disabled={enviando} onClick={() => seguro(true)}>
              Sí, asegurar
            </button>
          </div>
        </section>
      )}

      {!soyBanca && ronda?.estado === "turnos_jugadores" && (
        <ControlesBJ
          codigo={codigo}
          manoEnTurno={manos.find((m) => m.id === ronda.turno_mano_id)}
          esMia={manos.find((m) => m.id === ronda.turno_mano_id)?.jugador_id === yoId}
          cartas={cartas}
          jugadorFichas={yo.fichas}
          manos={manos}
          jugadorId={yoId}
          config={config}
          restante={restante}
          enviando={enviando}
          onAccion={actuar}
        />
      )}

      {ronda?.estado === "terminada" && (
        <div className="panel p-3 text-center text-sm text-white/70">
          Ronda terminada. Esperá a que el crupier inicie la próxima.
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-900/50 px-3 py-2 text-sm text-red-100">{error}</div>
      )}
    </main>
  );
}

function ControlesBJ({
  manoEnTurno,
  esMia,
  cartas,
  jugadorFichas,
  manos,
  jugadorId,
  config,
  restante,
  enviando,
  onAccion,
}: {
  codigo: string;
  manoEnTurno?: BJManoJugador;
  esMia: boolean;
  cartas: ReturnType<typeof useBlackjack>["cartas"];
  jugadorFichas: number;
  manos: BJManoJugador[];
  jugadorId: string;
  config: ReturnType<typeof useBlackjack>["config"];
  restante: number | null;
  enviando: boolean;
  onAccion: (manoId: string, accion: AccionBJ) => void;
}) {
  if (!esMia || !manoEnTurno || !config) {
    return (
      <div className="panel px-4 py-3 text-center text-white/60">
        {esMia ? "Preparando…" : "Esperando a los demás jugadores…"}
      </div>
    );
  }
  const cs = cartas
    .filter((c) => c.mano_jugador_id === manoEnTurno.id)
    .sort((a, b) => a.orden_recibida - b.orden_recibida);
  const comprometido = manos
    .filter((m) => m.jugador_id === jugadorId)
    .reduce((s, m) => s + m.apuesta_fichas * (m.doblada ? 2 : 1) + (m.seguro_fichas ?? 0), 0);
  const manosDelAsiento = manos.filter((m) => m.orden_asiento === manoEnTurno.orden_asiento).length;
  const disp = accionesDisponibles({
    cartas: cs,
    apuesta: manoEnTurno.apuesta_fichas,
    fichas: jugadorFichas - comprometido,
    esSplit: !!manoEnTurno.es_split_de,
    manosDelAsiento,
    config,
  });

  return (
    <section className="panel flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-oro">Tu turno</span>
        {restante !== null && (
          <span className={restante <= 5 ? "text-red-400" : "text-white/60"}>{restante}s</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn btn-verde" disabled={enviando || !disp.hit}
          onClick={() => onAccion(manoEnTurno.id, "hit")}>Pedir (hit)</button>
        <button className="btn btn-gris" disabled={enviando || !disp.stand}
          onClick={() => onAccion(manoEnTurno.id, "stand")}>Plantarse</button>
        <button className="btn btn-oro" disabled={enviando || !disp.double}
          onClick={() => onAccion(manoEnTurno.id, "double")}>Doblar</button>
        <button className="btn btn-oro" disabled={enviando || !disp.split}
          onClick={() => onAccion(manoEnTurno.id, "split")}>Split</button>
        {disp.surrender && (
          <button className="btn btn-rojo col-span-2" disabled={enviando}
            onClick={() => onAccion(manoEnTurno.id, "surrender")}>Rendirse</button>
        )}
      </div>
    </section>
  );
}
