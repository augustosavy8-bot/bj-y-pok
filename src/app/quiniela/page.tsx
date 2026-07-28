"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { NocturneShell } from "@/components/nocturne/NocturneShell";

type Signo = "1" | "X" | "2";

type Partido = {
  id: string;
  orden: number;
  local: string;
  visitante: string;
  goles_local: number | null;
  goles_visitante: number | null;
};
type Fecha = {
  id: string;
  nombre: string;
  estado: "borrador" | "abierta" | "cerrada" | "resuelta";
  entrada: number;
  comision_pct: number;
  cierra_at: string | null;
};
type Pron = {
  partido_id: string;
  signo: Signo;
  goles_local: number | null;
  goles_visitante: number | null;
};
type FilaTabla = {
  user_id: string;
  nombre: string;
  puntos: number;
  exactos: number;
  aciertos: number;
};
type Datos = {
  fecha: Fecha | null;
  partidos: Partido[];
  mi_participacion: { pagado: number; puntos: number | null; premio: number | null } | null;
  mis_pronosticos: Pron[];
  tabla: FilaTabla[];
  pozo: number;
  mi_saldo: number;
};

const fmt = (n: number) => n.toLocaleString("es");

function signoReal(p: Partido): Signo | null {
  if (p.goles_local === null || p.goles_visitante === null) return null;
  if (p.goles_local > p.goles_visitante) return "1";
  if (p.goles_local < p.goles_visitante) return "2";
  return "X";
}

export default function QuinielaPage() {
  const [d, setD] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [elecciones, setElecciones] = useState<Record<string, Pron>>({});

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/quiniela");
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "No se pudo cargar");
      setD(j as Datos);
      const base: Record<string, Pron> = {};
      for (const p of (j as Datos).mis_pronosticos ?? []) base[p.partido_id] = p;
      setElecciones(base);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const abierta = d?.fecha?.estado === "abierta";
  const yaJuego = !!d?.mi_participacion;
  const completos = useMemo(
    () => (d?.partidos ?? []).filter((p) => elecciones[p.id]?.signo).length,
    [d, elecciones]
  );

  function elegir(partidoId: string, signo: Signo) {
    setElecciones((e) => ({
      ...e,
      [partidoId]: { ...(e[partidoId] ?? { partido_id: partidoId, goles_local: null, goles_visitante: null }), partido_id: partidoId, signo },
    }));
  }
  function marcador(partidoId: string, campo: "goles_local" | "goles_visitante", valor: string) {
    const n = valor === "" ? null : Math.max(0, Math.floor(Number(valor) || 0));
    setElecciones((e) => ({
      ...e,
      [partidoId]: {
        ...(e[partidoId] ?? { partido_id: partidoId, signo: "X" as Signo, goles_local: null, goles_visitante: null }),
        partido_id: partidoId,
        [campo]: n,
      } as Pron,
    }));
  }

  async function guardar() {
    if (!d?.fecha) return;
    setGuardando(true);
    setError(null);
    setAviso(null);
    try {
      const r = await fetch("/api/quiniela", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pronosticos: Object.values(elecciones) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "No se pudo guardar");
      setAviso(yaJuego ? "Pronósticos actualizados." : "¡Estás adentro! Pronósticos guardados.");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <NocturneShell>
      <section className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
        <div className="mb-5">
          <h1 className="text-[28px] font-medium">Quiniela</h1>
          <p className="m-0 text-[13px] text-tinta/55">
            Liga Cañadense. Acertá los resultados de la fecha y llevate el pozo.
          </p>
        </div>

        {cargando && <p className="text-sm text-tinta/50">Cargando…</p>}

        {!cargando && !d?.fecha && (
          <div className="ncard border border-white/[0.06] p-8 text-center text-sm text-tinta/55">
            Todavía no hay ninguna fecha cargada. Cuando el admin arme la próxima, aparece acá.
          </div>
        )}

        {d?.fecha && (
          <>
            <div className="ncard mb-4 flex flex-wrap items-center justify-between gap-3 border border-white/[0.06] p-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.12em] text-acento">
                  {d.fecha.estado === "abierta"
                    ? "Abierta · podés jugar"
                    : d.fecha.estado === "cerrada"
                    ? "Cerrada · esperando resultados"
                    : "Resuelta"}
                </div>
                <div className="text-[20px] font-medium">{d.fecha.nombre}</div>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-right">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-tinta/50">Pozo</div>
                  <div className="text-[18px] font-medium tabular-nums text-acento-300">
                    {fmt(d.pozo)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-tinta/50">Entrada</div>
                  <div className="text-[18px] font-medium tabular-nums">{fmt(d.fecha.entrada)}</div>
                </div>
              </div>
            </div>

            {d.mi_participacion && (
              <div className="mb-4 rounded-md border border-emerald-400/30 bg-emerald-400/[0.06] px-3 py-2 text-[13px] text-emerald-200">
                Ya estás jugando esta fecha
                {d.mi_participacion.puntos !== null && ` · ${d.mi_participacion.puntos} puntos`}
                {d.mi_participacion.premio ? ` · ganaste ${fmt(d.mi_participacion.premio)}` : ""}
                {abierta && " — podés corregir tus pronósticos hasta que cierre."}
              </div>
            )}

            <div className="flex flex-col gap-2">
              {d.partidos.map((p) => {
                const mio = elecciones[p.id];
                const real = signoReal(p);
                return (
                  <div key={p.id} className="ncard border border-white/[0.06] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0 text-[14px]">
                        <span className="font-medium">{p.local}</span>
                        <span className="mx-2 text-tinta/40">vs</span>
                        <span className="font-medium">{p.visitante}</span>
                      </div>
                      {real && (
                        <span className="rounded bg-white/[0.06] px-2 py-0.5 text-[12px] tabular-nums">
                          {p.goles_local} – {p.goles_visitante}
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {(["1", "X", "2"] as Signo[]).map((s) => {
                        const elegido = mio?.signo === s;
                        const acerto = real && real === s;
                        return (
                          <button
                            key={s}
                            disabled={!abierta}
                            onClick={() => elegir(p.id, s)}
                            className={`h-9 w-11 rounded-md border text-[14px] font-medium transition disabled:opacity-70 ${
                              elegido
                                ? "border-acento bg-acento/15 text-acento-300"
                                : "border-white/12 text-tinta/70 hover:bg-white/5"
                            } ${real && elegido ? (acerto ? "!border-emerald-400 !text-emerald-300" : "!border-red-400/60 !text-red-300") : ""}`}
                          >
                            {s}
                          </button>
                        );
                      })}
                      {abierta && (
                        <span className="ml-1 inline-flex items-center gap-1.5 text-[11px] text-tinta/45">
                          marcador exacto (+3):
                          <input
                            type="number"
                            min={0}
                            value={mio?.goles_local ?? ""}
                            onChange={(e) => marcador(p.id, "goles_local", e.target.value)}
                            className="ninput !h-8 w-12 !px-2 text-center"
                          />
                          <span>–</span>
                          <input
                            type="number"
                            min={0}
                            value={mio?.goles_visitante ?? ""}
                            onChange={(e) => marcador(p.id, "goles_visitante", e.target.value)}
                            className="ninput !h-8 w-12 !px-2 text-center"
                          />
                        </span>
                      )}
                      {!abierta && mio && (
                        <span className="text-[11px] text-tinta/45">
                          tu pronóstico: {mio.signo}
                          {mio.goles_local !== null && mio.goles_visitante !== null
                            ? ` (${mio.goles_local}–${mio.goles_visitante})`
                            : ""}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {abierta && d.partidos.length > 0 && (
              <div className="mt-4 flex flex-col gap-2">
                <button
                  className="nbtn nbtn-primary py-2.5"
                  disabled={guardando || completos === 0}
                  onClick={guardar}
                >
                  {guardando
                    ? "Guardando…"
                    : yaJuego
                    ? `Actualizar pronósticos (${completos}/${d.partidos.length})`
                    : `Entrar por ${fmt(d.fecha.entrada)} créditos (${completos}/${d.partidos.length})`}
                </button>
                {!yaJuego && d.fecha.entrada > 0 && (
                  <p className="m-0 text-center text-[11px] text-tinta/45">
                    La entrada se descuenta una sola vez. Tenés {fmt(d.mi_saldo)} créditos.
                  </p>
                )}
              </div>
            )}

            {d.tabla.length > 0 && (
              <div className="ncard mt-6 border border-white/[0.06] p-4">
                <h2 className="mb-2 text-[15px] font-medium">Tabla</h2>
                <table className="w-full text-sm">
                  <thead className="text-left text-[11px] uppercase tracking-[0.08em] text-tinta/50">
                    <tr>
                      <th className="py-1.5 pr-3 font-normal">Jugador</th>
                      <th className="py-1.5 pr-3 text-right font-normal">Exactos</th>
                      <th className="py-1.5 pr-3 text-right font-normal">Aciertos</th>
                      <th className="py-1.5 text-right font-normal">Puntos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.tabla.map((f, i) => (
                      <tr key={f.user_id} className="border-t border-white/[0.06]">
                        <td className="py-1.5 pr-3">
                          {i === 0 && d.fecha?.estado === "resuelta" && "🏆 "}
                          {f.nombre}
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-tinta/70">
                          {f.exactos}
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-tinta/70">
                          {f.aciertos}
                        </td>
                        <td className="py-1.5 text-right font-medium tabular-nums">{f.puntos}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="m-0 mt-2 text-[11px] text-tinta/40">
                  3 puntos por marcador exacto, 1 por acertar sólo el resultado. En caso de empate,
                  el pozo se divide.
                </p>
              </div>
            )}
          </>
        )}

        {error && (
          <div className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-center text-sm text-red-200">
            {error}
          </div>
        )}
        {aviso && (
          <div className="mt-4 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-center text-sm text-emerald-200">
            {aviso}
          </div>
        )}
      </section>
    </NocturneShell>
  );
}
