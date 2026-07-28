"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useBlackjack } from "@/lib/useBlackjack";
import {
  MesaBlackjack,
  MS_VENTANA_APUESTAS,
  chipsDeMonto,
  descomponerFichas,
  type AsientoMesa,
} from "@/components/blackjack/MesaBlackjack";
import { BannerEstadoMesa, leerEstadoMesa } from "@/components/blackjack/EstadoMesa";
import { accionesDisponibles } from "@/lib/blackjack/acciones";
import { TimerCircular } from "@/components/mesa/TimerCircular";
import { OverlayResultado, type TipoResultado } from "@/components/mesa/OverlayResultado";
import { BotonSonido } from "@/components/mesa/BotonSonido";
import { reproducir } from "@/lib/sonidos";
import type { AccionBJ, BJManoJugador } from "@/lib/blackjack/types";

const FICHAS_RAPIDAS = [500, 1000, 2500, 5000, 10000];

export function VistaJugadorBlackjack({
  codigo,
  authUid,
  yoId,
}: {
  codigo: string;
  authUid: string;
  yoId: string;
}) {
  const { mesa, jugadores, config, ronda, manos, cartas, resultados, cargando, conectado } =
    useBlackjack(codigo);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // La apuesta se arma como una LISTA de fichas (para el stack que vuela y queda).
  const [chipsApuesta, setChipsApuesta] = useState<{ id: number; valor: number }[]>([]);
  const chipIdRef = useRef(0);
  const apuesta = chipsApuesta.reduce((s, c) => s + c.valor, 0);
  const [restante, setRestante] = useState<number | null>(null);
  const [mostrarResultado, setMostrarResultado] = useState(false);
  const [ultimaApuesta, setUltimaApuesta] = useState(0);
  const claveUltima = `bj-ultima-apuesta-${codigo}-${yoId}`;

  useEffect(() => {
    const v = Number(localStorage.getItem(claveUltima) ?? 0);
    if (v > 0) setUltimaApuesta(v);
  }, [claveUltima]);

  // Limpiar las fichas puestas al empezar una mano nueva.
  useEffect(() => {
    setChipsApuesta([]);
  }, [ronda?.id]);

  // Cuenta regresiva de la ventana de apuestas (10s desde que abre la ronda).
  const [segsApuestas, setSegsApuestas] = useState<number | null>(null);
  useEffect(() => {
    if (ronda?.estado !== "apuestas" || !ronda.created_at) {
      setSegsApuestas(null);
      return;
    }
    const fin = new Date(ronda.created_at).getTime() + MS_VENTANA_APUESTAS;
    const tick = () => setSegsApuestas(Math.max(0, Math.ceil((fin - Date.now()) / 1000)));
    tick();
    const iv = setInterval(tick, 500);
    return () => clearInterval(iv);
  }, [ronda?.estado, ronda?.created_at]);

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

  // Agregar / limpiar / setear la apuesta como fichas (con tope de mesa y saldo).
  function agregarChip(v: number) {
    const tope = Math.min(config?.apuesta_max ?? 10000, yo?.fichas ?? Infinity);
    if (apuesta + v > tope) return;
    reproducir("ficha");
    chipIdRef.current += 1;
    setChipsApuesta((cs) => [...cs, { id: chipIdRef.current, valor: v }]);
  }
  function setApuestaDesde(monto: number) {
    const tope = Math.min(config?.apuesta_max ?? 10000, yo?.fichas ?? Infinity);
    const m = Math.min(monto, tope);
    if (m > 0) reproducir("ficha");
    setChipsApuesta(
      descomponerFichas(m).map((valor) => ({ id: (chipIdRef.current += 1), valor }))
    );
  }

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
    (j) =>
      !j.es_crupier &&
      j.estado !== "eliminado" &&
      j.id !== yoId &&
      j.id !== ronda?.banca_jugador_id
  );

  const resultadoDe = (manoId: string) => resultados.find((r) => r.mano_jugador_id === manoId);

  // Asientos de la mesa: vos al centro, el resto sobre el arco.
  const asientos: AsientoMesa[] = [
    {
      id: yoId,
      nombre: "Vos",
      esYo: true,
      fichas: yo.fichas,
      // Mis fichas: las que armé recién (vuelan y quedan, estado local inmediato).
      // Si no hay (p. ej. recargué la página), las derivo de mi apuesta real.
      chips: chipsApuesta.length
        ? chipsApuesta.map((c) => ({ id: `chip-${c.id}`, valor: c.valor }))
        : chipsDeMonto(yoId, misManos.reduce((s, m) => s + (m.apuesta_fichas || 0), 0)),
      manos: misManos.map((m) => ({
        mano: m,
        cartas: cartas.filter((c) => c.mano_jugador_id === m.id),
        enTurno: ronda?.turno_mano_id === m.id,
        resultado: resultadoDe(m.id),
      })),
    },
    ...otros.map((o) => {
      const susManos = manos
        .filter((m) => m.jugador_id === o.id)
        .sort((a, b) => a.orden_mano - b.orden_mano);
      const suApuesta = susManos.reduce((s, m) => s + (m.apuesta_fichas || 0), 0);
      return {
        id: o.id,
        nombre: o.nombre,
        esYo: false,
        fichas: o.fichas,
        chips: chipsDeMonto(o.id, suApuesta),
        manos: susManos.map((m) => ({
          mano: m,
          cartas: cartas.filter((c) => c.mano_jugador_id === m.id),
          enTurno: ronda?.turno_mano_id === m.id,
        })),
      } satisfies AsientoMesa;
    }),
  ];

  const hayCartasEnMesa = dealerCartas.length > 0 || cartas.length > 0;
  const pagoLabel = `Blackjack paga ${config?.blackjack_pago === "6_a_5" ? "6 : 5" : "3 : 2"}`;

  // Qué está esperando la mesa, en una frase. Antes había estados enteros
  // (mesa libre, reparto, turno del crupier, conexión caída) sin ninguna señal.
  const manoEnTurnoBanner = manos.find((m) => m.id === ronda?.turno_mano_id);
  const lecturaEstado = leerEstadoMesa({
    conectado,
    cargando,
    hayJugadores: jugadores.some((j) => !j.es_crupier && j.estado !== "eliminado"),
    ronda,
    hayApuestas: manos.some((m) => m.apuesta_fichas > 0),
    yaAposte: misManos.some((m) => m.apuesta_fichas > 0),
    segsApuestas,
    esMiTurno:
      ronda?.estado === "turnos_jugadores" && manoEnTurnoBanner?.jugador_id === yoId,
    nombreEnTurno:
      jugadores.find((j) => j.id === manoEnTurnoBanner?.jugador_id)?.nombre ?? null,
    segsTurno: restante,
  });

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
          <div className="relative mx-auto w-full max-w-[980px]">
            <MesaBlackjack
              dealerCartas={dealerCartas}
              holeRevelada={ronda?.hole_revelada ?? false}
              verHole={soyBanca}
              asientos={asientos}
              hayCartasEnMesa={hayCartasEnMesa}
              pagoLabel={pagoLabel}
              mostrarLeyenda={!ronda || dealerCartas.length === 0}
              turnoExpiraAt={ronda?.estado === "turnos_jugadores" ? ronda.turno_expira_at : null}
            />

            {/* Resultados por mano (+/-) debajo de la mesa */}
            {misResultados.length > 0 && (
              <div className="mt-1 flex flex-wrap justify-center gap-2">
                {misManos.map((m) => {
                  const r = resultadoDe(m.id);
                  if (!r) return null;
                  return (
                    <span
                      key={m.id}
                      className={`text-[11px] font-bold ${r.fichas_ganadas_o_perdidas >= 0 ? "text-emerald-300" : "text-red-300"}`}
                    >
                      {r.fichas_ganadas_o_perdidas >= 0 ? "+" : ""}
                      {r.fichas_ganadas_o_perdidas}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Overlay de resultado: en la franja vacía entre el crupier y vos,
                para no taparte la mano. */}
            {mostrarResultado && (
              <div className="pointer-events-none absolute inset-x-0 top-[40%] z-30 flex -translate-y-1/2 justify-center">
                <OverlayResultado tipo={tipoResultadoBJ} monto={netoResultado} />
              </div>
            )}
          </div>

          {/* Controles bajo la mesa */}
          <div className="mx-auto mt-4 flex max-w-[560px] flex-col gap-3">
            {/* Siempre visible: qué está esperando la mesa ahora mismo. */}
            <BannerEstadoMesa lectura={lecturaEstado} />

            {ronda?.estado === "apuestas" && (
              <>
                <div className="flex items-center justify-center gap-2 text-sm">
                  <span className="text-tinta/70">Hacé tu apuesta</span>
                  {segsApuestas != null && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-bold tabular-nums ${
                        segsApuestas <= 3
                          ? "animate-pulse border-red-400/50 bg-red-500/15 text-red-200"
                          : "border-acento/40 bg-acento/10 text-acento-300"
                      }`}
                    >
                      cierra en {segsApuestas}s
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {FICHAS_RAPIDAS.map((v) => (
                    <button
                      key={v}
                      onClick={() => agregarChip(v)}
                      className="grid h-12 w-12 place-items-center rounded-full border border-white/15 bg-[#292b31] text-[12px] font-semibold tabular-nums text-tinta transition hover:-translate-y-0.5 hover:border-acento hover:text-acento-300 active:translate-y-0.5"
                    >
                      {v >= 1000 ? `${v / 1000}k` : v}
                    </button>
                  ))}
                  <div className="mx-1 h-8 w-px bg-white/12" />
                  <button className="nbtn nbtn-secondary" onClick={() => setChipsApuesta([])}>Limpiar</button>
                </div>
                {ultimaApuesta > 0 && (
                  <div className="flex justify-center gap-2">
                    <button className="nbtn nbtn-secondary" onClick={() => setApuestaDesde(ultimaApuesta)}>
                      Rebet {ultimaApuesta.toLocaleString("es")}
                    </button>
                    <button className="nbtn nbtn-secondary" onClick={() => setApuestaDesde(ultimaApuesta * 2)}>
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
                nombreEnTurno={
                  jugadores.find(
                    (j) => j.id === manos.find((m) => m.id === ronda.turno_mano_id)?.jugador_id
                  )?.nombre
                }
                cartas={cartas}
                jugadorFichas={yo.fichas}
                manos={manos}
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
    </div>
  );
}

function ControlesBJ({
  manoEnTurno,
  esMia,
  nombreEnTurno,
  cartas,
  jugadorFichas,
  manos,
  config,
  restante,
  enviando,
  onAccion,
}: {
  manoEnTurno?: BJManoJugador;
  esMia: boolean;
  nombreEnTurno?: string;
  cartas: ReturnType<typeof useBlackjack>["cartas"];
  jugadorFichas: number;
  manos: BJManoJugador[];
  config: ReturnType<typeof useBlackjack>["config"];
  restante: number | null;
  enviando: boolean;
  onAccion: (manoId: string, accion: AccionBJ) => void;
}) {
  if (!esMia || !manoEnTurno || !config) {
    return (
      <div className="ncard flex items-center justify-center gap-2 border border-white/[0.06] px-4 py-3 text-center text-sm text-tinta/60">
        {esMia ? (
          "Preparando…"
        ) : (
          <>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-acento/70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-acento" />
            </span>
            <span>
              Esperando a <b className="text-tinta/85">{nombreEnTurno ?? "otro jugador"}</b>
              {restante != null && (
                <span className="tabular-nums text-tinta/50"> · {restante}s</span>
              )}
            </span>
          </>
        )}
      </div>
    );
  }
  const cs = cartas
    .filter((c) => c.mano_jugador_id === manoEnTurno.id)
    .sort((a, b) => a.orden_recibida - b.orden_recibida);
  const manosDelAsiento = manos.filter((m) => m.orden_asiento === manoEnTurno.orden_asiento).length;
  const disp = accionesDisponibles({
    cartas: cs,
    apuesta: manoEnTurno.apuesta_fichas,
    // Las apuestas ya están retenidas → jugadorFichas es lo disponible real.
    fichas: jugadorFichas,
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
