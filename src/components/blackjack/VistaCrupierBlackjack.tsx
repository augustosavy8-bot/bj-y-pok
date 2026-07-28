"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useBlackjack } from "@/lib/useBlackjack";
import {
  MesaBlackjack,
  chipsDeMonto,
  type AsientoMesa,
} from "@/components/blackjack/MesaBlackjack";
import { ConfigBlackjack } from "@/components/blackjack/ConfigBlackjack";

// Modo automático: tiempos (ms) de espera antes de cada paso del loop.
const AUTO_ESPERA_APUESTAS = 10_000; // ventana para que la gente apueste (10s)
const AUTO_ESPERA_PROXIMA = 6_000; // deja ver el resultado antes de repartir de nuevo
const AUTO_ESPERA_SEGURO = 8_000; // ventana para decidir el seguro

export function VistaCrupierBlackjack({
  codigo,
  authUid,
}: {
  codigo: string;
  authUid: string;
}) {
  const { mesa, jugadores, config, shoe, ronda, manos, cartas, resultados } = useBlackjack(codigo);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState("");

  const players = useMemo(
    () => jugadores.filter((j) => !j.es_crupier).sort((a, b) => a.posicion - b.posicion),
    [jugadores]
  );
  const dealerCartas = useMemo(() => cartas.filter((c) => c.es_carta_dealer), [cartas]);
  const enEspera = mesa?.estado === "esperando";
  const rondaActiva = ronda && ronda.estado !== "terminada";
  // Mesa 24/7: el ciclo lo maneja el servidor (cron), no este navegador.
  const esPermanente = !!mesa?.es_permanente;

  // ── Modo automático: la mesa gira sola sin que el crupier apriete nada ──
  const claveAuto = `bj-auto-${codigo}`;
  const [auto, setAuto] = useState(false);
  const [cuenta, setCuenta] = useState<number | null>(null);
  const autoEnCurso = useRef(false);

  useEffect(() => {
    setAuto(localStorage.getItem(claveAuto) === "1");
  }, [claveAuto]);

  function toggleAuto() {
    setAuto((a) => {
      const n = !a;
      localStorage.setItem(claveAuto, n ? "1" : "0");
      return n;
    });
  }

  // Dispara un paso del loop sin pisar otra llamada en vuelo.
  async function autoPost(endpoint: string) {
    if (autoEnCurso.current) return;
    autoEnCurso.current = true;
    try {
      await fetch(`/api/blackjack/${codigo}/${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ auth_uid: authUid }),
      });
    } catch {
      /* reintenta en el próximo ciclo del efecto */
    } finally {
      autoEnCurso.current = false;
    }
  }

  const hayApuesta = useMemo(() => manos.some((m) => m.apuesta_fichas > 0), [manos]);
  const cantJugadores = players.length;
  const sinRondaActiva = !ronda || ronda.estado === "terminada";

  // Decide y agenda el próximo paso automático según el estado de la ronda.
  useEffect(() => {
    // En mesas permanentes el ciclo lo corre el servidor: el navegador no
    // dispara nada (evita pisarse con el cron).
    if (!auto || esPermanente || !mesa || mesa.estado === "terminada") {
      setCuenta(null);
      return;
    }

    let endpoint: string | null = null;
    let delay = 0;
    if (ronda?.fase_seguro) {
      endpoint = "cerrar-seguro";
      delay = AUTO_ESPERA_SEGURO;
    } else if (ronda?.estado === "apuestas") {
      // Solo repartimos si alguien apostó; si no, seguimos esperando.
      endpoint = hayApuesta ? "cerrar-apuestas" : null;
      // Alinear el cierre con created_at+10s para que la cuenta regresiva que
      // ven los jugadores coincida con el cierre real.
      const abierto = ronda.created_at ? Date.now() - new Date(ronda.created_at).getTime() : 0;
      delay = Math.max(1_000, AUTO_ESPERA_APUESTAS - abierto);
    } else if (sinRondaActiva && cantJugadores >= 1) {
      endpoint = "iniciar-ronda";
      delay = ronda ? AUTO_ESPERA_PROXIMA : 3_000;
    }

    if (!endpoint) {
      setCuenta(null);
      return;
    }

    let restante = Math.ceil(delay / 1000);
    setCuenta(restante);
    const iv = setInterval(() => {
      restante -= 1;
      setCuenta(Math.max(0, restante));
    }, 1000);
    const to = setTimeout(() => autoPost(endpoint!), delay);
    return () => {
      clearInterval(iv);
      clearTimeout(to);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, esPermanente, mesa?.estado, ronda?.id, ronda?.estado, ronda?.fase_seguro, hayApuesta, cantJugadores]);

  async function post(endpoint: string, body: Record<string, unknown> = {}) {
    setOcupado(true);
    setError(null);
    try {
      const res = await fetch(`/api/blackjack/${codigo}/${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ auth_uid: authUid, ...body }),
      });
      const data = await res.json();
      if (!res.ok) setError(data?.error ?? "Error");
      else setAviso(null);
    } catch {
      setError("Error de red");
    } finally {
      setOcupado(false);
    }
  }

  async function cerrarMesa() {
    if (!confirm("¿Cerrar la mesa? Los jugadores reciben sus fichas de vuelta y la mesa deja de estar activa.")) return;
    setOcupado(true);
    setError(null);
    try {
      const res = await fetch(`/api/mesa/${codigo}/cerrar`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) setError(data?.error ?? "No se pudo cerrar la mesa.");
      else window.location.href = "/home";
    } catch {
      setError("Error de red");
    } finally {
      setOcupado(false);
    }
  }

  async function agregarJugador() {
    if (!nombreNuevo.trim() && players.length >= 8) return;
    await fetch(`/api/mesa/${codigo}/agregar-jugador`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        auth_uid: authUid,
        nombre: nombreNuevo.trim() || `Jugador ${players.length + 1}`,
      }),
    });
    setNombreNuevo("");
  }

  const totalShoe = (shoe?.cantidad_mazos ?? 6) * 52;

  // Asientos para la mesa unificada. El crupier no es un asiento: todos los
  // jugadores van sobre el arco (sin "yo"). El crupier ve la hole card.
  const asientos: AsientoMesa[] = players.map((j) => {
    const susManos = manos
      .filter((m) => m.jugador_id === j.id)
      .sort((a, b) => a.orden_mano - b.orden_mano);
    const suApuesta = susManos.reduce((s, m) => s + (m.apuesta_fichas || 0), 0);
    return {
      id: j.id,
      nombre: j.nombre,
      esYo: false,
      fichas: j.fichas,
      chips: chipsDeMonto(j.id, suApuesta),
      manos: susManos.map((m) => ({
        mano: m,
        cartas: cartas.filter((c) => c.mano_jugador_id === m.id),
        enTurno: ronda?.turno_mano_id === m.id,
        resultado: resultados.find((r) => r.mano_jugador_id === m.id),
      })),
    } satisfies AsientoMesa;
  });
  const pagoLabel = `Blackjack paga ${config?.blackjack_pago === "6_a_5" ? "6 : 5" : "3 : 2"}`;

  if (!mesa) return null;

  return (
    <div className="min-h-screen bg-noche text-tinta">
      <header className="fade-b">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:px-7">
          <a href="/home" className="inline-flex items-center gap-1.5 text-[13px] text-tinta/65 hover:text-acento">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 5.5L8 12l6.5 6.5" /></svg>
            Home
          </a>
          <div className="h-5 w-px bg-white/15" />
          <div className="mr-auto flex items-baseline gap-2.5">
            <span className="text-[15px]">Blackjack · Crupier</span>
            <span className="font-mono text-xs tracking-[0.2em] text-acento-300">{codigo}</span>
          </div>
          <div className="text-right text-sm leading-tight">
            <div className="text-[10px] uppercase tracking-[0.1em] text-tinta/50">La casa</div>
            <div className="font-medium text-acento-300">Vos (crupier + banca)</div>
          </div>
        </nav>
      </header>

      <main className="mx-auto grid max-w-6xl gap-4 px-4 py-5 sm:px-7 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          {/* Configuración + jugadores (antes de arrancar) */}
          {enEspera && (
            <>
              <ConfigBlackjack codigo={codigo} authUid={authUid} config={config} />
              <section className="ncard flex flex-col gap-2 border border-white/[0.06] p-4">
                <h3 className="font-medium">Jugadores</h3>
                {mesa.es_practica ? (
                  <div className="flex gap-2">
                    <input
                      value={nombreNuevo}
                      onChange={(e) => setNombreNuevo(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && agregarJugador()}
                      placeholder="Nombre (jugador de prueba)"
                      className="ninput flex-1"
                    />
                    <button className="nbtn nbtn-primary" onClick={agregarJugador}>Agregar</button>
                  </div>
                ) : (
                  <p className="text-xs text-tinta/50">
                    Compartí el código con los jugadores; entran y hacen su buy-in de{" "}
                    {mesa.creditos_minimos} créditos.
                  </p>
                )}
                <div className="text-sm text-tinta/60">
                  {players.map((j) => j.nombre).join(", ") || "todavía nadie"}
                </div>
                <p className="text-xs text-tinta/45">
                  Vos sos la casa: repartís y jugás la mano del dealer. Los jugadores
                  juegan contra la casa (ilimitada), no entre ellos.
                </p>
              </section>
            </>
          )}

          {/* Mesa unificada (misma que ve el jugador). El crupier ve la hole. */}
          {ronda && (
            <div>
              <MesaBlackjack
                dealerCartas={dealerCartas}
                holeRevelada={ronda.hole_revelada}
                verHole
                asientos={asientos}
                hayCartasEnMesa={dealerCartas.length > 0 || cartas.length > 0}
                pagoLabel={pagoLabel}
                mostrarLeyenda={dealerCartas.length === 0}
                turnoExpiraAt={ronda.estado === "turnos_jugadores" ? ronda.turno_expira_at : null}
              />

              {/* Resultados por mano (+/-) al terminar la ronda */}
              {resultados.length > 0 && (
                <div className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] font-bold">
                  {resultados.map((r) => {
                    const mano = manos.find((m) => m.id === r.mano_jugador_id);
                    const jug = players.find((p) => p.id === mano?.jugador_id);
                    return (
                      <span
                        key={r.id}
                        className={r.fichas_ganadas_o_perdidas >= 0 ? "text-emerald-300" : "text-red-300"}
                      >
                        {jug?.nombre ?? "—"}: {r.fichas_ganadas_o_perdidas >= 0 ? "+" : ""}
                        {r.fichas_ganadas_o_perdidas}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Mesa permanente: la maneja el servidor, no este navegador */}
          {esPermanente ? (
            <section className="ncard flex flex-wrap items-center gap-3 border border-emerald-500/25 bg-emerald-500/[0.04] p-4">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </span>
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-medium text-emerald-200">Mesa 24/7 · siempre activa</span>
                <span className="text-[11px] text-tinta/50">
                  El servidor la mantiene girando sola, aunque cierres esta pantalla. Podés
                  intervenir con los botones de abajo cuando quieras.
                </span>
              </div>
            </section>
          ) : (
            <section className="ncard flex flex-wrap items-center gap-3 border border-white/[0.06] p-4">
              <button
                type="button"
                role="switch"
                aria-checked={auto}
                onClick={toggleAuto}
                className={`relative h-6 w-11 shrink-0 rounded-full transition ${auto ? "bg-acento" : "bg-white/15"}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${auto ? "left-[22px]" : "left-0.5"}`} />
              </button>
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-medium">Modo automático</span>
                <span className="text-[11px] text-tinta/50">
                  La mesa gira sola mientras tengas esta pantalla abierta. Los jugadores solo
                  apuestan y juegan su turno.
                </span>
              </div>
              {auto && cuenta !== null && (
                <span className="ml-auto rounded-md border border-acento/40 bg-acento/10 px-2.5 py-1 text-sm tabular-nums text-acento-300">
                  Próximo paso en {cuenta}s
                </span>
              )}
              {auto && cuenta === null && ronda?.estado === "apuestas" && !hayApuesta && (
                <span className="ml-auto text-[11px] text-tinta/50">Esperando la primera apuesta…</span>
              )}
            </section>
          )}

          {/* Controles de fase */}
          <section className="ncard flex flex-wrap items-center gap-2 border border-white/[0.06] p-4">
            {!rondaActiva && (
              <button className="nbtn nbtn-primary" disabled={ocupado} onClick={() => post("iniciar-ronda")}>
                {ronda ? "Próxima ronda" : "Iniciar ronda"}
              </button>
            )}
            {ronda?.estado === "apuestas" && (
              <button className="nbtn nbtn-primary" disabled={ocupado} onClick={() => post("cerrar-apuestas")}>
                Cerrar apuestas y repartir
              </button>
            )}
            {ronda?.fase_seguro && (
              <button className="nbtn nbtn-primary" disabled={ocupado} onClick={() => post("cerrar-seguro")}>
                Cerrar seguro
              </button>
            )}
            {ronda && (
              <span className="ml-auto text-sm text-tinta/55">
                Estado: <b className="text-tinta/80">{ronda.estado}</b>
              </span>
            )}
            <button className={`nbtn nbtn-danger ${ronda ? "" : "ml-auto"}`} disabled={ocupado} onClick={cerrarMesa}>
              Cerrar mesa
            </button>
          </section>

          <Liquidacion codigo={codigo} />
        </div>

        {/* Columna lateral: shoe digital */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:h-fit">
          <section className="ncard flex flex-col gap-2 border border-white/[0.06] p-4">
            <h3 className="font-medium">Shoe digital (RNG)</h3>
            <div className="text-sm text-tinta/70">
              Cartas repartidas: <b>{shoe?.cartas_repartidas ?? 0}</b> / {totalShoe}{" "}
              ({shoe?.cantidad_mazos ?? 6} mazos)
            </div>
            <p className="text-xs text-tinta/50">
              Reparto 100% automático y aleatorio (RNG criptográfico). Rebaraja
              solo al llegar al 75%.
            </p>
            <button className="nbtn nbtn-secondary" disabled={ocupado} onClick={() => post("barajar")}>
              Rebarajar ahora
            </button>
          </section>

          {aviso && (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{aviso}</div>
          )}
          {error && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>
          )}
        </div>
      </main>
    </div>
  );
}

// Liquidación de la sesión.
function Liquidacion({ codigo }: { codigo: string }) {
  const [data, setData] = useState<
    | { netos: { jugador_id: string; nombre: string; neto: number }[]; transacciones: { de_nombre: string; a_nombre: string; monto: number }[] }
    | null
  >(null);

  async function calcular() {
    const res = await fetch(`/api/mesa/${codigo}/liquidacion`);
    if (res.ok) setData(await res.json());
  }

  return (
    <section className="ncard flex flex-col gap-2 border border-white/[0.06] p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Liquidación</h3>
        <button className="nbtn nbtn-secondary !py-1.5 text-sm" onClick={calcular}>Calcular</button>
      </div>
      {data && (
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex flex-wrap gap-2">
            {data.netos.map((n) => (
              <span
                key={n.jugador_id}
                className={`rounded px-2 py-1 ${n.neto >= 0 ? "bg-emerald-500/15 text-emerald-200" : "bg-red-500/15 text-red-200"}`}
              >
                {n.nombre}: {n.neto >= 0 ? "+" : ""}
                {n.neto}
              </span>
            ))}
          </div>
          <div className="text-tinta/70">
            {data.transacciones.length === 0 ? (
              <span>Todos a mano.</span>
            ) : (
              <ul className="list-disc pl-5">
                {data.transacciones.map((t, i) => (
                  <li key={i}>
                    <b>{t.de_nombre}</b> le paga {t.monto} a <b>{t.a_nombre}</b>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
