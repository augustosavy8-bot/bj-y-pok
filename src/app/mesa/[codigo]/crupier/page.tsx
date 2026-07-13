"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMesa } from "@/lib/useMesa";
import { useIdentidad } from "@/lib/useIdentidad";
import { MesaComunitaria } from "@/components/MesaComunitaria";
import { ListaJugadores } from "@/components/ListaJugadores";
import { EscanerCarta } from "@/components/EscanerCarta";
import { HistorialAcciones } from "@/components/HistorialAcciones";
import { CartaEditable, ModalCorregirCarta } from "@/components/EdicionCarta";
import { Carta as CartaVisual } from "@/components/Carta";
import { ControlesApuesta } from "@/components/ControlesApuesta";
import { VistaCrupierBlackjack } from "@/components/blackjack/VistaCrupierBlackjack";
import { jugadoresActivos } from "@/lib/poker/engine";
import type { Carta, Jugador, TipoAccion } from "@/lib/types";

export default function VistaCrupier() {
  const codigo = (useParams().codigo as string).toUpperCase();
  const { userId: authUid, esCrupier, cargando: cargandoIdent } = useIdentidad(codigo);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [cartaEditando, setCartaEditando] = useState<Carta | null>(null);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [agregando, setAgregando] = useState(false);
  const [actuando, setActuando] = useState(false);

  const { mesa, jugadores, mano, cartas, cargando } = useMesa(codigo);
  const crupier = jugadores.find((j) => j.es_crupier);

  const comunitarias = useMemo(
    () => cartas.filter((c) => c.tipo === "comunitaria"),
    [cartas]
  );

  // Pista de a quién/qué le corresponde la próxima carta escaneada.
  const proximaPista = useMemo(() => {
    if (!mano || !mesa) return "—";
    if (mano.fase === "preflop") {
      const orden = ordenRepartoCliente(jugadores, mesa.dealer_position);
      const holeCount = cartas.filter((c) => c.tipo === "hole").length;
      const p = orden.length;
      if (p === 0) return "sin jugadores";
      if (holeCount >= p * 2) return "hole completas — avanzá al flop";
      const destino = orden[holeCount % p];
      const vuelta = holeCount < p ? "1ª" : "2ª";
      return `${destino.nombre} (${vuelta} carta)`;
    }
    const com = comunitarias.length;
    if (mano.fase === "flop") return com < 3 ? `flop ${com + 1}/3` : "flop completo";
    if (mano.fase === "turn") return com < 4 ? "turn" : "turn completo";
    if (mano.fase === "river") return com < 5 ? "river" : "river completo";
    return mano.fase;
  }, [mano, mesa, jugadores, cartas, comunitarias]);

  const rondaCerrada = mano ? mano.turno_jugador_id === null : false;
  const puedeAvanzar =
    !!mano &&
    rondaCerrada &&
    ["preflop", "flop", "turn", "river"].includes(mano.fase);

  // Se puede corregir mientras la mano no terminó ni se resolvió el showdown.
  const puedeCorregir =
    !!mano &&
    mano.fase !== "terminada" &&
    !(mano.fase === "showdown" && mano.ganador_id);

  // Jugador con el turno (para apostar por él desde la vista crupier).
  const turnoJugador =
    mano && mano.turno_jugador_id
      ? jugadores.find((j) => j.id === mano.turno_jugador_id && !j.es_crupier)
      : null;

  async function llamar(endpoint: string) {
    if (!authUid) return;
    setOcupado(true);
    setError(null);
    try {
      const res = await fetch(`/api/mesa/${codigo}/${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ auth_uid: authUid }),
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

  // Agregar un jugador de prueba (para jugar desde un solo dispositivo).
  async function agregarJugador() {
    if (!authUid || agregando) return;
    setAgregando(true);
    setError(null);
    try {
      const res = await fetch(`/api/mesa/${codigo}/agregar-jugador`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          auth_uid: authUid,
          nombre: nombreNuevo.trim() || `Jugador ${jugadores.filter((j) => !j.es_crupier).length + 1}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data?.error ?? "Error");
      else setNombreNuevo("");
    } catch {
      setError("Error de red");
    } finally {
      setAgregando(false);
    }
  }

  // Apostar por el jugador que tenga el turno (modo un-solo-dispositivo).
  async function actuarPor(jugadorId: string, tipo: TipoAccion, monto?: number) {
    if (!authUid || actuando) return;
    setActuando(true);
    setError(null);
    try {
      const res = await fetch(`/api/mesa/${codigo}/accion`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          auth_uid: authUid,
          jugador_id: jugadorId,
          tipo,
          monto: monto ?? 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data?.error ?? "Acción rechazada");
    } catch {
      setError("Error de red");
    } finally {
      setActuando(false);
    }
  }

  if ((cargando && !mesa) || cargandoIdent) return <Centrado>Cargando…</Centrado>;
  if (!mesa) return <Centrado>No existe la mesa {codigo}.</Centrado>;
  if (!esCrupier) {
    return (
      <Centrado>
        Esta vista es sólo para el crupier de la mesa. Entrá como jugador desde el
        enlace de la sala.
      </Centrado>
    );
  }

  // Blackjack: vista de crupier propia.
  if (mesa.tipo_juego === "blackjack") {
    if (!authUid) return <Centrado>Cargando…</Centrado>;
    return <VistaCrupierBlackjack codigo={codigo} authUid={authUid} />;
  }

  const holePorJugador: Record<string, Carta[]> = {};
  for (const c of cartas) {
    if (c.tipo === "hole" && c.jugador_id) (holePorJugador[c.jugador_id] ??= []).push(c);
  }

  const urlJugador =
    typeof window !== "undefined" ? `${window.location.origin}/mesa/${codigo}` : "";

  return (
    <main className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-[1fr_380px]">
      {/* Columna principal */}
      <div className="flex flex-col gap-4">
        <header className="panel flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <div className="text-xs text-white/50">Mesa · Crupier</div>
            <div className="text-2xl font-bold tracking-widest text-oro">{codigo}</div>
          </div>
          <div className="text-right text-sm">
            <div className="text-white/60">Compartí con los jugadores:</div>
            <button
              className="font-mono text-oro underline"
              onClick={() => navigator.clipboard?.writeText(urlJugador)}
            >
              {urlJugador || `/mesa/${codigo}`}
            </button>
          </div>
        </header>

        {/* Agregar jugadores de prueba (para jugar desde 1 solo dispositivo) */}
        {mesa.estado === "esperando" && (
          <section className="panel flex flex-col gap-2 p-4">
            <h3 className="font-semibold">Jugadores de prueba</h3>
            <p className="text-sm text-white/60">
              Agregá jugadores acá para jugar una mano completa vos solo desde esta
              pantalla. Después de iniciar la mano vas a poder apostar por el que
              tenga el turno.
            </p>
            <div className="flex gap-2">
              <input
                value={nombreNuevo}
                onChange={(e) => setNombreNuevo(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && agregarJugador()}
                placeholder="Nombre (opcional)"
                className="flex-1 rounded-xl bg-white/10 p-2.5"
              />
              <button
                className="btn btn-verde"
                disabled={agregando}
                onClick={agregarJugador}
              >
                {agregando ? "Agregando…" : "Agregar"}
              </button>
            </div>
            <div className="text-sm text-white/60">
              En la mesa:{" "}
              {jugadores.filter((j) => !j.es_crupier).map((j) => j.nombre).join(", ") ||
                "todavía nadie"}
            </div>
          </section>
        )}

        <section className="panel p-5">
          <MesaComunitaria
            mano={mano}
            comunitarias={comunitarias}
            onEditarCarta={puedeCorregir ? setCartaEditando : undefined}
          />
        </section>

        {/* Panel de control de la mano */}
        <section className="panel flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn btn-oro"
              disabled={ocupado}
              onClick={() => llamar("iniciar-mano")}
            >
              {mano && mano.fase !== "terminada" ? "Reiniciar mano" : "Iniciar mano nueva"}
            </button>
            <button
              className="btn btn-verde"
              disabled={ocupado || !puedeAvanzar}
              onClick={() => llamar("avanzar-fase")}
            >
              Avanzar fase
            </button>
            {mano && (
              <span className="ml-auto text-sm text-white/60">
                Mano #{mano.numero_mano} · {rondaCerrada ? "ronda cerrada" : "en juego"}
              </span>
            )}
          </div>
          {puedeAvanzar && (
            <div className="rounded-lg bg-fieltro-light/40 px-3 py-2 text-sm">
              Ronda de apuestas completa. Cuando termines de escanear las cartas de
              esta calle, tocá <b>Avanzar fase</b>.
            </div>
          )}
        </section>

        {/* Apostar por el jugador en turno (modo un-solo-dispositivo) */}
        {turnoJugador && mano && mano.fase !== "terminada" && (
          <section className="panel flex flex-col gap-2 p-4">
            <div className="text-sm">
              Turno de <b className="text-oro">{turnoJugador.nombre}</b>
              {turnoJugador.auth_uid
                ? " — está jugando desde su dispositivo."
                : " — jugá por él/ella:"}
            </div>
            {!turnoJugador.auth_uid && (
              <ControlesApuesta
                jugador={turnoJugador}
                mesa={mesa}
                mano={mano}
                onAccion={(tipo, monto) => actuarPor(turnoJugador.id, tipo, monto)}
                enviando={actuando}
              />
            )}
          </section>
        )}

        {/* Manos de cada jugador (vista privada del crupier) */}
        <section className="panel p-4">
          <h3 className="mb-3 font-semibold">Cartas de los jugadores</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {jugadores
              .filter((j) => !j.es_crupier)
              .sort((a, b) => a.posicion - b.posicion)
              .map((j) => (
                <div
                  key={j.id}
                  className={`rounded-xl border border-white/10 bg-black/20 p-3 ${
                    mano?.turno_jugador_id === j.id ? "ring-2 ring-oro" : ""
                  }`}
                >
                  <div className="mb-2 truncate text-sm font-medium">
                    {j.nombre}
                    {j.estado !== "activo" && (
                      <span className="ml-1 text-xs text-white/50">({j.estado})</span>
                    )}
                  </div>
                  <div className="flex gap-2.5">
                    {(holePorJugador[j.id] ?? [])
                      .sort((a, b) => a.orden_escaneo - b.orden_escaneo)
                      .map((c) =>
                        puedeCorregir ? (
                          <CartaEditable
                            key={c.id}
                            carta={c}
                            size="sm"
                            onEditar={setCartaEditando}
                          />
                        ) : (
                          <CartaVisual
                            key={c.id}
                            valor={c.valor}
                            palo={c.palo}
                            size="sm"
                          />
                        )
                      )}
                    {(holePorJugador[j.id] ?? []).length === 0 && (
                      <span className="text-xs text-white/40">sin cartas</span>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </section>

        <section>
          <ListaJugadores
            jugadores={jugadores}
            mesa={mesa}
            mano={mano}
            miId={crupier?.id}
          />
        </section>
      </div>

      {/* Columna lateral: escáner */}
      <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:h-fit">
        {authUid && (mano?.fase === "preflop" || mano?.fase === "flop" || mano?.fase === "turn" || mano?.fase === "river") ? (
          <EscanerCarta
            codigo={codigo}
            authUid={authUid}
            proximaPista={proximaPista}
            onConfirmada={(m) => setAviso(m)}
          />
        ) : (
          <div className="panel p-4 text-center text-sm text-white/60">
            {mano?.fase === "terminada" || !mano
              ? "Iniciá una mano para empezar a escanear cartas."
              : "Fase de showdown."}
          </div>
        )}
        {aviso && (
          <div className="rounded-lg bg-green-900/40 px-3 py-2 text-sm text-green-100">
            {aviso}
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-red-900/50 px-3 py-2 text-sm text-red-100">
            {error}
          </div>
        )}

        {/* Historial de acciones — panel fijo, siempre visible. */}
        <HistorialAcciones
          manoId={mano?.id ?? null}
          jugadores={jugadores}
          comunitarias={comunitarias}
          fase={mano?.fase ?? null}
          resultado={mano?.resultado ?? null}
          className="max-h-[420px]"
        />
      </div>

      {cartaEditando && authUid && (
        <ModalCorregirCarta
          carta={cartaEditando}
          codigo={codigo}
          authUid={authUid}
          onClose={() => setCartaEditando(null)}
          onGuardado={(m) => setAviso(m)}
        />
      )}
    </main>
  );
}

// Réplica cliente del orden de reparto (empieza a la izquierda del dealer).
function ordenRepartoCliente(jugadores: Jugador[], dealerPos: number): Jugador[] {
  const activos = jugadoresActivos(jugadores).sort((a, b) => a.posicion - b.posicion);
  const arranque = activos.findIndex((j) => j.posicion > dealerPos);
  if (arranque === -1) return activos;
  return [...activos.slice(arranque), ...activos.slice(0, arranque)];
}

function Centrado({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-center text-white/70">
      {children}
    </div>
  );
}
