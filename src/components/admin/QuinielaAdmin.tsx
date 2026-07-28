"use client";

import { useCallback, useEffect, useState } from "react";
import { estaOculto } from "@/lib/juegos-visibles";

type Fecha = {
  id: string;
  nombre: string;
  estado: "borrador" | "abierta" | "cerrada" | "resuelta";
  entrada: number;
  comision_pct: number;
};
type Partido = {
  id: string;
  fecha_id: string;
  orden: number;
  local: string;
  visitante: string;
  goles_local: number | null;
  goles_visitante: number | null;
};

const ETIQUETA: Record<Fecha["estado"], string> = {
  borrador: "Borrador",
  abierta: "Abierta",
  cerrada: "Cerrada",
  resuelta: "Resuelta",
};

export function QuinielaAdmin() {
  const [fechas, setFechas] = useState<Fecha[]>([]);
  const [partidos, setPartidos] = useState<Partido[]>([]);
  const [equipos, setEquipos] = useState<string[]>([]);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const [nombre, setNombre] = useState("");
  const [entrada, setEntrada] = useState(1000);
  const [local, setLocal] = useState("");
  const [visitante, setVisitante] = useState("");

  const cargar = useCallback(async () => {
    const r = await fetch("/api/quiniela/admin");
    if (!r.ok) return;
    const d = await r.json();
    setFechas(d.fechas ?? []);
    setPartidos(d.partidos ?? []);
    setEquipos(d.equipos ?? []);
    if (!abierta && (d.fechas ?? []).length > 0) setAbierta(d.fechas[0].id);
  }, [abierta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function accion(cuerpo: Record<string, unknown>, mensaje?: string) {
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      const r = await fetch("/api/quiniela/admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error ?? "Error");
      if (mensaje) setAviso(mensaje);
      if (cuerpo.accion === "resolver") {
        setAviso(
          d.ganadores
            ? `Repartido: ${d.repartido} entre ${d.ganadores} ganador(es) con ${d.puntos_ganadores} puntos.`
            : "Fecha resuelta (no hubo pozo para repartir)."
        );
      }
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setOcupado(false);
    }
  }

  const fecha = fechas.find((f) => f.id === abierta) ?? null;
  const susPartidos = partidos.filter((p) => p.fecha_id === abierta);
  const faltanResultados = susPartidos.some((p) => p.goles_local === null);

  return (
    <section className="ncard flex flex-col gap-4 border border-white/[0.06] p-4">
      <div>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h2 className="font-medium">Prode — Liga Cañadense</h2>
          {estaOculto("quiniela") && (
            <span className="rounded bg-amber-400/15 px-2 py-0.5 text-[11px] text-amber-300">
              oculto para los jugadores
            </span>
          )}
        </div>
        <p className="m-0 text-[12px] text-tinta/50">
          No hay API que cubra la liga, así que los partidos y resultados se cargan acá.
        </p>
      </div>

      {/* Crear fecha */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-[11px] text-tinta/60">
          Nombre
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Fecha 5"
            className="ninput mt-1 w-32"
          />
        </label>
        <label className="flex flex-col text-[11px] text-tinta/60">
          Entrada
          <input
            type="number"
            min={0}
            value={entrada}
            onChange={(e) => setEntrada(Number(e.target.value))}
            className="ninput mt-1 w-24"
          />
        </label>
        <button
          className="nbtn nbtn-primary !py-1.5 text-xs"
          disabled={ocupado || !nombre.trim()}
          onClick={() => {
            accion({ accion: "crear", nombre, entrada }, "Fecha creada.");
            setNombre("");
          }}
        >
          Crear fecha
        </button>
      </div>

      {fechas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {fechas.map((f) => (
            <button
              key={f.id}
              onClick={() => setAbierta(f.id)}
              className={`rounded-md border px-2.5 py-1 text-[13px] ${
                abierta === f.id
                  ? "border-acento text-acento"
                  : "border-white/12 text-tinta/70 hover:bg-white/5"
              }`}
            >
              {f.nombre}
              <span className="ml-1.5 text-[10px] text-tinta/45">{ETIQUETA[f.estado]}</span>
            </button>
          ))}
        </div>
      )}

      {fecha && (
        <>
          <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
            <span className="text-[13px] text-tinta/60">
              Entrada {fecha.entrada} · {susPartidos.length} partidos
            </span>
            <div className="ml-auto flex flex-wrap gap-1.5">
              {fecha.estado === "borrador" && (
                <button
                  className="nbtn nbtn-primary !py-1.5 text-xs"
                  disabled={ocupado || susPartidos.length === 0}
                  onClick={() => accion({ accion: "estado", fecha_id: fecha.id, estado: "abierta" }, "Fecha abierta: ya pueden jugar.")}
                >
                  Abrir a los jugadores
                </button>
              )}
              {fecha.estado === "abierta" && (
                <button
                  className="nbtn nbtn-secondary !py-1.5 text-xs"
                  disabled={ocupado}
                  onClick={() => accion({ accion: "estado", fecha_id: fecha.id, estado: "cerrada" }, "Fecha cerrada.")}
                >
                  Cerrar pronósticos
                </button>
              )}
              {fecha.estado === "cerrada" && (
                <button
                  className="nbtn nbtn-primary !py-1.5 text-xs"
                  disabled={ocupado || faltanResultados}
                  title={faltanResultados ? "Faltan resultados por cargar" : ""}
                  onClick={() => {
                    if (confirm("¿Resolver la fecha y repartir el pozo? No se puede deshacer.")) {
                      accion({ accion: "resolver", fecha_id: fecha.id });
                    }
                  }}
                >
                  Resolver y repartir
                </button>
              )}
            </div>
          </div>

          {/* Agregar partido */}
          {(fecha.estado === "borrador" || fecha.estado === "abierta") && (
            <div className="flex flex-wrap items-end gap-2">
              <select value={local} onChange={(e) => setLocal(e.target.value)} className="ninput w-44">
                <option value="">Local…</option>
                {equipos.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <select value={visitante} onChange={(e) => setVisitante(e.target.value)} className="ninput w-44">
                <option value="">Visitante…</option>
                {equipos.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <button
                className="nbtn nbtn-secondary !py-1.5 text-xs"
                disabled={ocupado || !local || !visitante || local === visitante}
                onClick={() => {
                  accion({ accion: "agregar_partido", fecha_id: fecha.id, local, visitante });
                  setLocal("");
                  setVisitante("");
                }}
              >
                Agregar partido
              </button>
            </div>
          )}

          {/* Partidos + resultados */}
          <div className="flex flex-col gap-1.5">
            {susPartidos.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-md bg-white/[0.04] px-3 py-2">
                <span className="min-w-0 flex-1 text-[13px]">
                  {p.local} <span className="text-tinta/40">vs</span> {p.visitante}
                </span>
                <input
                  type="number"
                  min={0}
                  defaultValue={p.goles_local ?? ""}
                  onBlur={(e) =>
                    accion({
                      accion: "resultado",
                      partido_id: p.id,
                      goles_local: e.target.value,
                      goles_visitante: p.goles_visitante ?? "",
                    })
                  }
                  className="ninput !h-8 w-12 !px-2 text-center"
                />
                <span className="text-tinta/40">–</span>
                <input
                  type="number"
                  min={0}
                  defaultValue={p.goles_visitante ?? ""}
                  onBlur={(e) =>
                    accion({
                      accion: "resultado",
                      partido_id: p.id,
                      goles_local: p.goles_local ?? "",
                      goles_visitante: e.target.value,
                    })
                  }
                  className="ninput !h-8 w-12 !px-2 text-center"
                />
                {fecha.estado !== "resuelta" && (
                  <button
                    className="text-[11px] text-red-300/70 hover:text-red-300"
                    disabled={ocupado}
                    onClick={() => accion({ accion: "borrar_partido", partido_id: p.id })}
                  >
                    quitar
                  </button>
                )}
              </div>
            ))}
            {susPartidos.length === 0 && (
              <p className="text-[13px] text-tinta/45">Todavía no cargaste partidos en esta fecha.</p>
            )}
          </div>
        </>
      )}

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>
      )}
      {aviso && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{aviso}</div>
      )}
    </section>
  );
}
