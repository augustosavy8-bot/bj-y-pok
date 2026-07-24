"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useBlackjack } from "@/lib/useBlackjack";
import { ManoBJ, ManoDealer } from "@/components/blackjack/ManoBJ";
import { Ficha } from "@/components/Ficha";
import { accionesDisponibles } from "@/lib/blackjack/acciones";
import { TimerCircular } from "@/components/mesa/TimerCircular";
import { OverlayResultado, type TipoResultado } from "@/components/mesa/OverlayResultado";
import { BotonSonido } from "@/components/mesa/BotonSonido";
import { FichasVolando } from "@/components/mesa/FichasVolando";
import { reproducir } from "@/lib/sonidos";
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
  const [mostrarResultado, setMostrarResultado] = useState(false);
  const [ultimaApuesta, setUltimaApuesta] = useState(0);
  const [disparoFicha, setDisparoFicha] = useState(0);
  const claveUltima = `bj-ultima-apuesta-${codigo}-${yoId}`;

  useEffect(() => {
    const v = Number(localStorage.getItem(claveUltima) ?? 0);
    if (v > 0) setUltimaApuesta(v);
  }, [claveUltima]);

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
    reproducir("ficha");
    if (apuesta > 0) setDisparoFicha((d) => d + 1);
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
      else if (apuesta > 0) {
        setUltimaApuesta(apuesta);
        localStorage.setItem(claveUltima, String(apuesta));
      }
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

  async function salirDeMesa() {
    if (!confirm("¿Salir de la mesa? Tus fichas vuelven a tus créditos.")) return;
    const res = await fetch(`/api/mesa/${codigo}/salir`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setError(data?.error ?? "No se pudo salir.");
      return;
    }
    window.location.href = "/home";
  }

  // Resultado agregado de mis manos, para el overlay transitorio.
  const misResultados = misManos
    .map((m) => resultados.find((r) => r.mano_jugador_id === m.id))
    .filter(Boolean) as ReturnType<typeof useBlackjack>["resultados"];
  const netoResultado = misResultados.reduce((s, r) => s + r.fichas_ganadas_o_perdidas, 0);
  const tuveBlackjack = misResultados.some((r) => r.resultado === "blackjack");
  const tipoResultadoBJ: TipoResultado = tuveBlackjack
    ? "blackjack"
    : netoResultado > 0
    ? "gana"
    : netoResultado < 0
    ? "pierde"
    : "empate";

  useEffect(() => {
    if (ronda?.estado === "terminada" && misResultados.length > 0 && !soyBanca) {
      setMostrarResultado(true);
      if (netoResultado > 0) reproducir("win");
      const t = setTimeout(() => setMostrarResultado(false), 4000);
      return () => clearTimeout(t);
    }
    setMostrarResultado(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ronda?.estado, ronda?.id]);

  // Sonido de "tu turno" al pasar a ser mi mano.
  const turnoPrevio = useRef(false);
  useEffect(() => {
    const manoEnTurno = manos.find((m) => m.id === ronda?.turno_mano_id);
    const miTurno = ronda?.estado === "turnos_jugadores" && manoEnTurno?.jugador_id === yoId;
    if (miTurno && !turnoPrevio.current) reproducir("turno");
    turnoPrevio.current = !!miTurno;
  }, [ronda?.turno_mano_id, ronda?.estado, manos, yoId]);

  if (!mesa || !yo) return null;
  const otros = jugadores.filter(
    (j) => !j.es_crupier && j.id !== yoId && j.id !== ronda?.banca_jugador_id
  );

  const resultadoDe = (manoId: string) => resultados.find((r) => r.mano_jugador_id === manoId);
  const miManoTurno = manos.find((m) => m.id === ronda?.turno_mano_id && m.jugador_id === yoId);
  const esMiTurno = ronda?.estado === "turnos_jugadores" && !!miManoTurno;

  const mesaStyle: React.CSSProperties = {
    borderRadius: "14px 14px 50% 50% / 14px 14px 86% 86%",
    backgroundColor: "#292b31",
    backgroundImage:
      "radial-gradient(72% 92% at 50% 4%, color-mix(in srgb, #262a60 62%, transparent), transparent 72%), radial-gradient(120% 120% at 50% 120%, color-mix(in srgb, #2b2741 78%, transparent), transparent 70%)",
    boxShadow: "0 0 0 1px #595d6c, 0 6px 18px rgba(0,0,0,0.55)",
  };

  return (
    <div className="flex min-h-screen flex-col bg-noche text-tinta">
      {/* Header de mesa */}
      <header className="fade-b">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:px-7">
          <button onClick={salirDeMesa} className="inline-flex items-center gap-1.5 text-[13px] text-tinta/65 hover:text-acento">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 5.5L8 12l6.5 6.5" /></svg>
            Salir de la mesa
          </button>
          <div className="h-5 w-px bg-white/15" />
          <div className="mr-auto flex items-baseline gap-2.5">
            <span className="text-[15px]">Blackjack</span>
            <span className="text-xs tabular-nums text-tinta/50">
              {codigo}{config ? ` · ${config.apuesta_min}–${config.apuesta_max}` : ""}
              {ronda ? ` · ronda ${ronda.numero_ronda}` : ""}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end leading-tight">
              <span className="text-[10px] uppercase tracking-[0.1em] text-tinta/50">Saldo</span>
              <span className="text-sm tabular-nums">{yo.fichas.toLocaleString("es")}</span>
            </div>
            {manoBase && manoBase.apuesta_fichas > 0 && (
              <div className="flex flex-col items-end leading-tight">
                <span className="text-[10px] uppercase tracking-[0.1em] text-tinta/50">Apuesta</span>
                <span className="text-sm tabular-nums text-acento-300">{manoBase.apuesta_fichas}</span>
              </div>
            )}
            <BotonSonido />
          </div>
        </nav>
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-6 px-4 py-5 sm:px-7 lg:grid-cols-[minmax(0,1fr)_272px]">
        {/* Columna de la mesa */}
        <div>
          <div className="relative mx-auto w-full max-w-[900px]">
            <div className="relative w-full" style={mesaStyle}>
              {/* Borde interior */}
              <div className="pointer-events-none absolute inset-[10px]" style={{ border: "1px solid rgba(233,233,237,0.12)", borderRadius: "8px 8px 50% 50% / 8px 8px 84% 84%" }} />
              {/* Zapato */}
              <div className="absolute right-[4%] top-[7%] grid h-9 w-14 place-items-center rounded border border-white/20 bg-gradient-to-b from-[#3f424d] to-[#292b31] shadow-n-sm">
                <span className="text-[9px] uppercase tracking-[0.14em] text-tinta/45">Zapato</span>
              </div>

              <div className="relative flex flex-col items-center gap-2 px-4 pb-6 pt-5">
                {/* Dealer */}
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-tinta/45">Crupier</span>
                <ManoDealer cartas={dealerCartas} holeRevelada={ronda?.hole_revelada ?? false} verHole={soyBanca} />

                {/* Leyenda impresa */}
                {(!ronda || dealerCartas.length === 0) && (
                  <div className="py-3 text-center">
                    <div className="text-[13px] font-medium uppercase tracking-[0.24em] text-tinta/30">Blackjack paga 3 : 2</div>
                    <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-tinta/20">El crupier se planta en 17 · seguro 2 : 1</div>
                  </div>
                )}

                {/* Otros jugadores en arco */}
                {otros.length > 0 && (
                  <div className="flex w-full flex-wrap items-start justify-around gap-x-2 gap-y-3">
                    {otros.map((o) => {
                      const suMano = manos.find((m) => m.jugador_id === o.id && !m.es_split_de);
                      const suCartas = suMano ? cartas.filter((c) => c.mano_jugador_id === suMano.id) : [];
                      return (
                        <div key={o.id} className="flex flex-col items-center gap-0.5">
                          <ManoBJ cartas={suCartas} mano={suMano} size="sm" destacada={!!suMano && ronda?.turno_mano_id === suMano.id} />
                          <div className="text-[11px] font-medium text-tinta/75">{o.nombre}</div>
                          {suMano && suMano.apuesta_fichas > 0 && (
                            <span className="inline-flex items-center gap-1 rounded bg-black/40 px-1.5 text-[10px] font-semibold tabular-nums text-tinta/80">
                              <Ficha monto={suMano.apuesta_fichas} size={14} /> {suMano.apuesta_fichas}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Mi silla */}
                <div className="mt-1 flex flex-col items-center gap-1.5">
                  <div className="flex flex-wrap items-end justify-center gap-3">
                    {misManos.length > 0 ? (
                      misManos.map((m) => {
                        const cs = cartas.filter((c) => c.mano_jugador_id === m.id);
                        const r = resultadoDe(m.id);
                        return (
                          <div key={m.id} className="flex flex-col items-center gap-0.5">
                            <ManoBJ cartas={cs} mano={m} destacada={ronda?.turno_mano_id === m.id} />
                            {r && (
                              <span className={`text-[11px] font-bold ${r.fichas_ganadas_o_perdidas >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                                {r.fichas_ganadas_o_perdidas >= 0 ? "+" : ""}{r.fichas_ganadas_o_perdidas}
                              </span>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <span className="py-6 text-sm text-tinta/45">Sin mano esta ronda</span>
                    )}
                  </div>

                  {/* Spot: aro de acento en turno */}
                  <div
                    className={`relative flex h-12 w-28 items-center justify-center rounded-[50%] ${
                      esMiTurno
                        ? "border border-acento bg-acento/10 shadow-[0_0_0_6px_color-mix(in_srgb,var(--color-accent)_10%,transparent)]"
                        : "border border-dashed border-white/20 bg-black/15"
                    }`}
                  >
                    {manoBase && manoBase.apuesta_fichas > 0 ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Ficha monto={manoBase.apuesta_fichas} size={26} />
                        <span className="text-sm font-semibold tabular-nums text-acento-300">{manoBase.apuesta_fichas}</span>
                      </span>
                    ) : (
                      <span className="text-[10px] uppercase tracking-[0.1em] text-acento/70">Tu silla</span>
                    )}
                  </div>
                  <div className="text-center leading-tight">
                    <div className="text-sm font-medium text-tinta">Vos</div>
                    <div className="text-xs tabular-nums text-tinta/55">{yo.fichas.toLocaleString("es")}</div>
                  </div>
                </div>
              </div>

              {/* Overlay de resultado */}
              {mostrarResultado && (
                <div className="absolute inset-0 z-20 flex items-center justify-center">
                  <OverlayResultado tipo={tipoResultadoBJ} monto={netoResultado} />
                </div>
              )}
            </div>
          </div>

          {/* Controles bajo la mesa */}
          <div className="mx-auto mt-4 flex max-w-[560px] flex-col gap-3">
            {ronda?.estado === "apuestas" && (
              <>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {FICHAS_RAPIDAS.map((v) => (
                    <button
                      key={v}
                      onClick={() => setApuesta((a) => Math.min(a + v, config?.apuesta_max ?? 500, yo.fichas))}
                      className="grid h-12 w-12 place-items-center rounded-full border border-white/15 bg-[#292b31] text-[13px] font-medium tabular-nums text-tinta transition hover:border-acento hover:text-acento-300"
                    >
                      {v}
                    </button>
                  ))}
                  <div className="mx-1 h-8 w-px bg-white/12" />
                  <button className="nbtn nbtn-secondary" onClick={() => setApuesta(0)}>Limpiar</button>
                </div>
                {ultimaApuesta > 0 && (
                  <div className="flex justify-center gap-2">
                    <button className="nbtn nbtn-secondary" onClick={() => setApuesta(Math.min(ultimaApuesta, config?.apuesta_max ?? 500, yo.fichas))}>
                      Rebet {ultimaApuesta.toLocaleString("es")}
                    </button>
                    <button className="nbtn nbtn-secondary" onClick={() => setApuesta(Math.min(ultimaApuesta * 2, config?.apuesta_max ?? 500, yo.fichas))}>
                      Rebet x2
                    </button>
                  </div>
                )}
                <button
                  className="nbtn nbtn-primary py-2.5"
                  disabled={enviando || apuesta < (config?.apuesta_min ?? 1)}
                  onClick={apostar}
                >
                  Apostar {apuesta.toLocaleString("es")}
                </button>
              </>
            )}

            {ronda?.fase_seguro && manoBase && (
              <div className="ncard flex flex-col gap-2 border border-white/[0.06] p-3">
                <div className="text-sm">El crupier muestra un As. ¿Seguro? (cuesta {Math.floor(manoBase.apuesta_fichas / 2)})</div>
                <div className="grid grid-cols-2 gap-2">
                  <button className="nbtn nbtn-secondary" disabled={enviando} onClick={() => seguro(false)}>No</button>
                  <button className="nbtn nbtn-primary" disabled={enviando} onClick={() => seguro(true)}>Sí, asegurar</button>
                </div>
              </div>
            )}

            {ronda?.estado === "turnos_jugadores" && (
              <ControlesBJ
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
              <div className="ncard border border-white/[0.06] p-3 text-center text-sm text-tinta/60">
                Ronda terminada. Esperá a que el crupier inicie la próxima.
              </div>
            )}

            {error && (
              <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-center text-sm text-red-200">{error}</div>
            )}
          </div>
        </div>

        {/* Aside: reglas de la mesa */}
        <aside className="flex flex-col gap-3">
          <div className="ncard p-4 shadow-n-sm">
            <span className="text-[10px] uppercase tracking-[0.1em] text-acento">Reglas de la mesa</span>
            <div className="mt-2 flex flex-col gap-2">
              {[
                { l: "Blackjack paga", v: config?.blackjack_pago === "6_a_5" ? "6 : 5" : "3 : 2" },
                { l: "El crupier se planta en", v: "17" },
                { l: "Mazos en el zapato", v: String(config?.cantidad_mazos ?? 6) },
                { l: "Límites", v: config ? `${config.apuesta_min} – ${config.apuesta_max}` : "—" },
              ].map((r) => (
                <div key={r.l} className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="text-tinta/65">{r.l}</span>
                  <span className="font-medium tabular-nums">{r.v}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-tinta/40">
            Zapato de {config?.cantidad_mazos ?? 6} mazos, barajado con RNG del lado del servidor
            (se rebaraja al 75%). Jugás contra la casa. +18 · juego responsable.
          </p>
        </aside>
      </div>

      <FichasVolando disparo={disparoFicha} monto={apuesta || ultimaApuesta || 25} />
    </div>
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
      <div className="ncard border border-white/[0.06] px-4 py-3 text-center text-sm text-tinta/55">
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
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-center gap-2 text-sm">
        <TimerCircular restante={restante} total={config.segundos_por_turno} size={34}>
          <span className={`text-[11px] font-bold tabular-nums ${restante !== null && restante <= 5 ? "text-red-300" : "text-tinta/70"}`}>
            {restante ?? "—"}
          </span>
        </TimerCircular>
        <span className="font-medium text-acento-300">Tu turno</span>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button className="nbtn nbtn-primary px-5" disabled={enviando || !disp.hit} onClick={() => onAccion(manoEnTurno.id, "hit")}>Pedir</button>
        <button className="nbtn nbtn-secondary px-5" disabled={enviando || !disp.stand} onClick={() => onAccion(manoEnTurno.id, "stand")}>Plantarse</button>
        <button className="nbtn nbtn-secondary px-5" disabled={enviando || !disp.double} onClick={() => onAccion(manoEnTurno.id, "double")}>Doblar</button>
        <button className="nbtn nbtn-secondary px-5" disabled={enviando || !disp.split} onClick={() => onAccion(manoEnTurno.id, "split")}>Split</button>
        {disp.surrender && (
          <button className="nbtn nbtn-danger px-5" disabled={enviando} onClick={() => onAccion(manoEnTurno.id, "surrender")}>Rendirse</button>
        )}
      </div>
    </div>
  );
}
