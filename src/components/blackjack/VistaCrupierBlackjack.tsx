"use client";

import { useMemo, useState } from "react";
import { useBlackjack } from "@/lib/useBlackjack";
import { ManoBJ, ManoDealer } from "@/components/blackjack/ManoBJ";
import { ConfigBlackjack } from "@/components/blackjack/ConfigBlackjack";
import { LeyendaFieltro } from "@/components/mesa/LeyendaFieltro";

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

  const feltStyle: React.CSSProperties = {
    background: "radial-gradient(ellipse 72% 60% at 50% 28%, #176b41 0%, #0f3d2e 52%, #0a2a20 100%)",
    borderRadius: "38% 38% 42% 42% / 16% 16% 64% 64%",
    border: "10px solid #241a12",
    boxShadow: "inset 0 0 90px rgba(0,0,0,0.6), 0 12px 36px rgba(0,0,0,0.5)",
  };

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
            <div className="text-white/60">La casa</div>
            <div className="font-semibold text-oro">Vos (crupier + banca)</div>
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
                Vos sos la casa: repartís y jugás la mano del dealer. Los jugadores
                juegan contra la casa (ilimitada), no entre ellos.
              </p>
            </section>
          </>
        )}

        {/* Mesa de fieltro en media luna: dealer arriba + jugadores en arco */}
        {ronda && (
          <div className="relative w-full overflow-hidden" style={feltStyle}>
            <div className="flex flex-col items-center gap-4 px-3 py-5 sm:px-5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-crema/50">
                Dealer
              </span>
              <ManoDealer cartas={dealerCartas} holeRevelada={ronda.hole_revelada} verHole />
              <LeyendaFieltro
                pago={config?.blackjack_pago === "6_a_5" ? "6 A 5" : "3 A 2"}
                limiteMin={config?.apuesta_min}
                limiteMax={config?.apuesta_max}
              />
              <div className="flex w-full flex-wrap items-start justify-center gap-3">
                {players.map((j) => {
                  const susManos = manos
                    .filter((m) => m.jugador_id === j.id)
                    .sort((a, b) => a.orden_mano - b.orden_mano);
                  const esBanca = j.id === ronda.banca_jugador_id;
                  return (
                    <div
                      key={j.id}
                      className={`flex flex-col items-center gap-1 rounded-xl bg-black/25 px-2 py-1.5 ${
                        esBanca ? "opacity-60" : ""
                      }`}
                    >
                      <div className="text-center text-[11px] font-medium text-crema/80">
                        {j.nombre}
                        {esBanca && " (banca)"}
                      </div>
                      {esBanca ? (
                        <div className="py-2 text-center text-[11px] text-crema/40">es la banca</div>
                      ) : susManos.length === 0 ? (
                        <div className="py-2 text-center text-[11px] text-crema/40">sin apuesta</div>
                      ) : (
                        <div className="flex gap-2">
                          {susManos.map((m) => {
                            const cs = cartas.filter((c) => c.mano_jugador_id === m.id);
                            const r = resultados.find((x) => x.mano_jugador_id === m.id);
                            return (
                              <div key={m.id} className="flex flex-col items-center gap-0.5">
                                <ManoBJ
                                  cartas={cs}
                                  mano={m}
                                  size="sm"
                                  destacada={ronda.turno_mano_id === m.id}
                                />
                                {r && (
                                  <span
                                    className={`text-[11px] font-bold ${
                                      r.fichas_ganadas_o_perdidas >= 0 ? "text-green-300" : "text-red-300"
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
            </div>
          </div>
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
          <button
            className={`rounded-xl bg-red-900/50 px-3 py-2 text-sm text-red-100 hover:bg-red-900/80 disabled:opacity-40 ${ronda ? "" : "ml-auto"}`}
            disabled={ocupado}
            onClick={cerrarMesa}
          >
            Cerrar mesa
          </button>
        </section>

        {/* Liquidación */}
        <Liquidacion codigo={codigo} />
      </div>

      {/* Columna lateral: shoe digital */}
      <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:h-fit">
        <section className="panel flex flex-col gap-2 p-4">
          <h3 className="font-semibold">Shoe digital (RNG)</h3>
          <div className="text-sm text-white/70">
            Cartas repartidas: <b>{shoe?.cartas_repartidas ?? 0}</b> / {totalShoe}{" "}
            ({shoe?.cantidad_mazos ?? 6} mazos)
          </div>
          <p className="text-xs text-white/50">
            El reparto es 100% automático y aleatorio (RNG criptográfico). Rebaraja
            solo al llegar al 75%. No hace falta escanear ni barajar a mano.
          </p>
          <button className="btn btn-gris" disabled={ocupado} onClick={() => post("barajar")}>
            Rebarajar ahora
          </button>
        </section>

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
