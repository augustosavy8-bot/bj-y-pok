"use client";

import { useMemo, useState } from "react";
import { useBlackjack } from "@/lib/useBlackjack";
import { ManoBJ, ManoDealer } from "@/components/blackjack/ManoBJ";
import { ConfigBlackjack } from "@/components/blackjack/ConfigBlackjack";
import { EscanerCarta } from "@/components/EscanerCarta";
import { FichasMonto } from "@/components/Ficha";
import { SuperficieFieltro } from "@/components/mesa/SuperficieFieltro";
import { CamaraCrupier } from "@/components/mesa/CamaraCrupier";
import { LeyendaFieltro } from "@/components/mesa/LeyendaFieltro";
import { VALORES, PALOS } from "@/lib/types";
import type { Valor, Palo } from "@/lib/types";

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
  const banca = jugadores.find((j) => j.id === ronda?.banca_jugador_id);
  const enEspera = mesa?.estado === "esperando";
  const rondaActiva = ronda && ronda.estado !== "terminada";

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

  // Pista: qué carta corresponde escanear ahora.
  const pista = useMemo(() => {
    if (!ronda) return "—";
    const base = manos.filter((m) => !m.es_split_de).sort((a, b) => a.orden_asiento - b.orden_asiento);
    const N = base.length;
    if (ronda.estado === "reparto_inicial") {
      const k = cartas.length;
      if (k < N) return `1ª carta — asiento ${base[k].orden_asiento + 1}`;
      if (k === N) return "upcard del dealer (visible)";
      if (k < 2 * N + 1) return `2ª carta — asiento ${base[k - (N + 1)].orden_asiento + 1}`;
      return "hole card del dealer (oculta)";
    }
    if (ronda.estado === "turnos_jugadores") {
      const m = manos.find((x) => x.id === ronda.turno_mano_id);
      const jug = jugadores.find((j) => j.id === m?.jugador_id);
      return m ? `carta para ${jug?.nombre} (asiento ${m.orden_asiento + 1})` : "—";
    }
    if (ronda.estado === "turno_dealer") return "carta del dealer";
    return "—";
  }, [ronda, manos, cartas, jugadores]);

  const puedeEscanear =
    ronda &&
    ["reparto_inicial", "turnos_jugadores", "turno_dealer"].includes(ronda.estado) &&
    !ronda.fase_seguro;

  const totalShoe = (shoe?.cantidad_mazos ?? 6) * 52;
  const avisoBarajar =
    shoe && config && shoe.manos_desde_barajado >= config.barajar_cada_manos;

  if (!mesa) return null;

  return (
    <main className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-[1fr_380px]">
      <div className="flex flex-col gap-4">
        <header className="panel flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <a href="/home" className="text-xs text-white/60 underline">← Home</a>
            <div className="text-xs text-white/50">Blackjack · Crupier</div>
            <div className="text-2xl font-bold tracking-widest text-oro">{codigo}</div>
          </div>
          <div className="text-right text-sm">
            <div className="text-white/60">Banca de la ronda:</div>
            <div className="font-semibold">
              {banca ? banca.nombre : "—"}
              {banca && (
                <span className="ml-2 text-white/60">
                  (<FichasMonto monto={banca.fichas} />)
                </span>
              )}
            </div>
          </div>
        </header>

        {/* Configuración + jugadores (antes de arrancar) */}
        {enEspera && (
          <>
            <ConfigBlackjack
              codigo={codigo}
              authUid={authUid}
              config={config}
              jugadores={players.map((j) => ({ id: j.id, nombre: j.nombre }))}
            />
            <section className="panel flex flex-col gap-2 p-4">
              <h3 className="font-semibold">Jugadores</h3>
              {mesa.es_practica ? (
                <div className="flex gap-2">
                  <input
                    value={nombreNuevo}
                    onChange={(e) => setNombreNuevo(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && agregarJugador()}
                    placeholder="Nombre (jugador de prueba)"
                    className="flex-1 rounded-xl bg-white/10 p-2.5"
                  />
                  <button className="btn btn-verde" onClick={agregarJugador}>Agregar</button>
                </div>
              ) : (
                <p className="text-xs text-white/50">
                  Compartí el código con los jugadores; entran y hacen su buy-in de{" "}
                  {mesa.creditos_minimos} créditos.
                </p>
              )}
              <div className="text-sm text-white/60">
                {players.map((j) => j.nombre).join(", ") || "todavía nadie"}
              </div>
              <p className="text-xs text-white/50">
                La banca rota entre estos jugadores según la configuración. El crupier
                (vos) no es la banca; solo escaneás las cartas.
              </p>
            </section>
          </>
        )}

        {/* Mesa: cámara propia (lo que ven los jugadores) + dealer + manos */}
        {ronda && (
          <SuperficieFieltro className="flex flex-col items-center gap-4 p-3 sm:p-4">
            <CamaraCrupier
              activa={players.length > 0}
              etiqueta="Tu cámara (vista de los jugadores)"
              className="sm:aspect-[21/9]"
            />
            <ManoDealer cartas={dealerCartas} holeRevelada={ronda.hole_revelada} verHole />
            <LeyendaFieltro
              pago={config?.blackjack_pago === "6_a_5" ? "6 A 5" : "3 A 2"}
              limiteMin={config?.apuesta_min}
              limiteMax={config?.apuesta_max}
            />
            <div className="flex w-full flex-wrap justify-center gap-3">
              {players.map((j) => {
                const susManos = manos
                  .filter((m) => m.jugador_id === j.id)
                  .sort((a, b) => a.orden_mano - b.orden_mano);
                const esBanca = j.id === ronda.banca_jugador_id;
                return (
                  <div
                    key={j.id}
                    className={`rounded-xl border border-white/10 bg-black/25 p-2 shadow-asiento ${
                      esBanca ? "opacity-60" : ""
                    }`}
                  >
                    <div className="text-center text-xs text-white/70">
                      {j.nombre}
                      {esBanca && " (banca)"}
                    </div>
                    {esBanca ? (
                      <div className="py-2 text-center text-xs text-white/40">es la banca</div>
                    ) : susManos.length === 0 ? (
                      <div className="py-2 text-center text-xs text-white/40">sin apuesta</div>
                    ) : (
                      <div className="flex gap-2">
                        {susManos.map((m) => {
                          const cs = cartas.filter((c) => c.mano_jugador_id === m.id);
                          const r = resultados.find((x) => x.mano_jugador_id === m.id);
                          return (
                            <div key={m.id} className="flex flex-col items-center">
                              <ManoBJ
                                cartas={cs}
                                mano={m}
                                size="sm"
                                destacada={ronda.turno_mano_id === m.id}
                              />
                              {r && (
                                <span
                                  className={`text-[11px] font-bold ${
                                    r.fichas_ganadas_o_perdidas >= 0 ? "text-green-400" : "text-red-400"
                                  }`}
                                >
                                  {r.fichas_ganadas_o_perdidas >= 0 ? "+" : ""}
                                  {r.fichas_ganadas_o_perdidas}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </SuperficieFieltro>
        )}

        {/* Controles de fase */}
        <section className="panel flex flex-wrap items-center gap-2 p-4">
          {(!rondaActiva) && (
            <button className="btn btn-oro" disabled={ocupado} onClick={() => post("iniciar-ronda")}>
              {ronda ? "Próxima ronda" : "Iniciar ronda"}
            </button>
          )}
          {ronda?.estado === "apuestas" && (
            <button className="btn btn-oro" disabled={ocupado} onClick={() => post("cerrar-apuestas")}>
              Cerrar apuestas y repartir
            </button>
          )}
          {ronda?.fase_seguro && (
            <button className="btn btn-oro" disabled={ocupado} onClick={() => post("cerrar-seguro")}>
              Cerrar seguro
            </button>
          )}
          {ronda && (
            <span className="ml-auto text-sm text-white/60">
              Estado: <b>{ronda.estado}</b>
            </span>
          )}
        </section>

        {/* Liquidación */}
        <Liquidacion codigo={codigo} />
      </div>

      {/* Columna lateral: escáner + shoe */}
      <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:h-fit">
        {/* Shoe */}
        <section className="panel flex flex-col gap-2 p-4">
          <h3 className="font-semibold">Shoe</h3>
          <div className="text-sm text-white/70">
            Cartas repartidas desde el barajado:{" "}
            <b>{shoe?.cartas_repartidas ?? 0}</b> / {totalShoe} ({shoe?.cantidad_mazos ?? 6} mazos)
          </div>
          <div className="text-sm text-white/70">
            Manos desde el barajado: {shoe?.manos_desde_barajado ?? 0} / {config?.barajar_cada_manos ?? 20}
          </div>
          {avisoBarajar && (
            <div className="rounded-lg bg-yellow-900/40 px-3 py-2 text-sm text-yellow-100">
              Conviene barajar antes de la próxima ronda.
            </div>
          )}
          <button className="btn btn-gris" disabled={ocupado} onClick={() => post("barajar")}>
            Acabo de barajar los {shoe?.cantidad_mazos ?? 6} mazos
          </button>
        </section>

        {puedeEscanear ? (
          <>
            <div className="panel px-3 py-2 text-center text-sm">
              Escaneando: <b className="text-oro">{pista}</b>
            </div>
            <EscanerCarta
              codigo={codigo}
              authUid={authUid}
              proximaPista={pista}
              endpoint={`/api/blackjack/${codigo}/carta`}
              onConfirmada={(m) => setAviso(m)}
            />
            <CorregirUltima codigo={codigo} authUid={authUid} onOk={() => setAviso("Corregida")} />
          </>
        ) : (
          <div className="panel p-4 text-center text-sm text-white/60">
            {ronda?.estado === "apuestas"
              ? "Esperando las apuestas de los jugadores…"
              : "No hay cartas para escanear en esta fase."}
          </div>
        )}

        {aviso && (
          <div className="rounded-lg bg-green-900/40 px-3 py-2 text-sm text-green-100">{aviso}</div>
        )}
        {error && (
          <div className="rounded-lg bg-red-900/50 px-3 py-2 text-sm text-red-100">{error}</div>
        )}
      </div>
    </main>
  );
}

// Corregir la última carta escaneada.
function CorregirUltima({
  codigo,
  authUid,
  onOk,
}: {
  codigo: string;
  authUid: string;
  onOk: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [valor, setValor] = useState<Valor>("A");
  const [palo, setPalo] = useState<Palo>("picas");
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setError(null);
    const res = await fetch(`/api/blackjack/${codigo}/corregir-carta`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ auth_uid: authUid, valor, palo }),
    });
    const data = await res.json();
    if (!res.ok) setError(data?.error ?? "Error");
    else {
      setAbierto(false);
      onOk();
    }
  }

  if (!abierto) {
    return (
      <button className="btn btn-gris text-sm" onClick={() => setAbierto(true)}>
        Corregir última carta
      </button>
    );
  }
  return (
    <div className="panel flex flex-col gap-2 p-3">
      <div className="text-sm font-semibold">Corregir última carta</div>
      <div className="grid grid-cols-2 gap-2">
        <select className="rounded-lg bg-white/10 p-2" value={valor}
          onChange={(e) => setValor(e.target.value as Valor)}>
          {VALORES.map((v) => <option key={v} value={v} className="text-black">{v}</option>)}
        </select>
        <select className="rounded-lg bg-white/10 p-2" value={palo}
          onChange={(e) => setPalo(e.target.value as Palo)}>
          {PALOS.map((p) => <option key={p} value={p} className="text-black">{p}</option>)}
        </select>
      </div>
      {error && <div className="text-xs text-red-300">{error}</div>}
      <div className="grid grid-cols-2 gap-2">
        <button className="btn btn-gris" onClick={() => setAbierto(false)}>Cancelar</button>
        <button className="btn btn-oro" onClick={guardar}>Guardar</button>
      </div>
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
    <section className="panel flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Liquidación</h3>
        <button className="btn btn-gris !py-1.5 text-sm" onClick={calcular}>Calcular</button>
      </div>
      {data && (
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex flex-wrap gap-2">
            {data.netos.map((n) => (
              <span
                key={n.jugador_id}
                className={`rounded px-2 py-1 ${n.neto >= 0 ? "bg-green-900/40" : "bg-red-900/40"}`}
              >
                {n.nombre}: {n.neto >= 0 ? "+" : ""}
                {n.neto}
              </span>
            ))}
          </div>
          <div className="text-white/70">
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
