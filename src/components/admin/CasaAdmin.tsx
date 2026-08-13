"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { estaOculto } from "@/lib/juegos-visibles";

// Par divergente azul↔rojo, validado contra la superficie del panel (#232532):
// separación CVD ΔE 19.2 (protan) y contraste ≥ 3:1 en ambos polos. Verde↔rojo
// falla para daltonismo (ΔE 4.1), por eso no se usa. Además del color, el signo
// lo lleva la posición de la barra respecto del cero y el rótulo con + / −.
const C_GANA = "#3987e5"; // la casa gana
const C_PIERDE = "#e66767"; // la casa pierde
const INK_MUTED = "#898781";

type Resumen = {
  manos: number;
  volumen: number;
  neto_casa: number;
  margen_pct: number;
  jugadores: number;
  manos_ganadas_jugador: number;
  manos_perdidas_jugador: number;
  empates: number;
};
type Dia = { dia: string; manos: number; volumen: number; neto_casa: number };
type PorJugador = {
  nombre: string;
  manos: number;
  volumen: number;
  neto_casa: number;
  neto_jugador: number;
};
type Libro = {
  circulacion: number;
  cargado: number;
  retirado: number;
  cargos_reingreso: number;
};
type Slots = {
  giros: number;
  apostado: number;
  pagado: number;
  neto_casa: number;
  margen_pct: number;
  jugadores: number;
  jackpots: number;
  premio_mayor: number;
};
type SlotsJugador = {
  nombre: string;
  giros: number;
  apostado: number;
  neto_casa: number;
};
type Datos = {
  dias: number;
  resumen: Resumen;
  por_dia: Dia[];
  por_jugador: PorJugador[];
  slots: Slots;
  slots_por_jugador: SlotsJugador[];
  libro: Libro;
};

/** Lo que la máquina debería dejar a la larga (ver src/lib/slots/maquina.ts). */
const MARGEN_TEORICO_SLOTS = 5.55;

const RANGOS = [
  { label: "7 días", dias: 7 },
  { label: "30 días", dias: 30 },
  { label: "90 días", dias: 90 },
  { label: "Todo", dias: 3650 },
];

const fmt = (n: number) => n.toLocaleString("es");
const fmtFirmado = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmt(Math.abs(n))}`;

export function CasaAdmin() {
  const [dias, setDias] = useState(30);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabla, setTabla] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/casa?dias=${dias}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error ?? "No se pudo cargar");
      setDatos(d as Datos);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCargando(false);
    }
  }, [dias]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const r = datos?.resumen;
  const gana = (r?.neto_casa ?? 0) >= 0;

  return (
    <section className="ncard flex flex-col gap-4 border border-white/[0.06] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium">La casa</h2>
          <p className="m-0 text-[12px] text-ink-dim">
            Cuánto deja el blackjack, quién te gana y quién te pierde.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {RANGOS.map((x) => (
            <button
              key={x.dias}
              onClick={() => setDias(x.dias)}
              className={`rounded-md border px-2.5 py-1 text-[13px] transition ${
                dias === x.dias
                  ? "border-accent text-ink"
                  : "border-white/12 text-ink-muted hover:bg-white/5"
              }`}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>

      {cargando && !datos && <p className="text-sm text-ink-dim">Cargando…</p>}
      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      {datos && r && (
        <>
          {/* Hero: el número con el que se lee el tablero */}
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.12em] text-ink-dim">
                Resultado de la casa
              </div>
              <div
                className="mt-1 text-[48px] font-medium leading-none"
                style={{ color: gana ? C_GANA : C_PIERDE }}
              >
                {fmtFirmado(r.neto_casa)}
              </div>
              <div className="mt-1.5 text-[12px] text-ink-muted">
                {gana ? "a favor de la casa" : "a favor de los jugadores"} · margen{" "}
                <b className="tabular-nums text-ink-muted">{r.margen_pct}%</b> sobre lo apostado
              </div>
            </div>

            <div className="flex flex-wrap gap-x-7 gap-y-3">
              <Tile label="Apostado" valor={fmt(r.volumen)} />
              <Tile label="Manos" valor={fmt(r.manos)} />
              <Tile label="Jugadores" valor={fmt(r.jugadores)} />
              <Tile
                label="Manos que gana el jugador"
                valor={`${
                  r.manos > 0
                    ? Math.round((r.manos_ganadas_jugador / r.manos) * 100)
                    : 0
                }%`}
              />
            </div>
          </div>

          <div className="hr" />

          {/* Diverging bar: resultado por día, sobre/bajo el cero */}
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="m-0 text-[14px] font-medium">Resultado por día</h3>
              <div className="flex items-center gap-3 text-[11px] text-ink-muted">
                <Leyenda color={C_GANA} texto="Gana la casa" />
                <Leyenda color={C_PIERDE} texto="Pierde la casa" />
                <button
                  onClick={() => setTabla((v) => !v)}
                  className="underline decoration-dotted underline-offset-2 hover:text-ink"
                >
                  {tabla ? "Ver gráfico" : "Ver tabla"}
                </button>
              </div>
            </div>
            {tabla ? (
              <TablaDias dias={datos.por_dia} />
            ) : (
              <GraficoDias dias={datos.por_dia} />
            )}
          </div>

          <div className="hr" />

          {/* Por jugador */}
          <div>
            <h3 className="m-0 mb-2 text-[14px] font-medium">Por jugador</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-[0.08em] text-ink-dim">
                  <tr>
                    <th className="py-1.5 pr-3 font-normal">Jugador</th>
                    <th className="py-1.5 pr-3 text-right font-normal">Manos</th>
                    <th className="py-1.5 pr-3 text-right font-normal">Apostado</th>
                    <th className="py-1.5 text-right font-normal">Deja a la casa</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.por_jugador.map((j) => (
                    <tr key={j.nombre} className="border-t border-white/[0.06]">
                      <td className="py-1.5 pr-3">{j.nombre}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-ink-muted">
                        {fmt(j.manos)}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-ink-muted">
                        {fmt(j.volumen)}
                      </td>
                      <td
                        className="py-1.5 text-right font-medium tabular-nums"
                        style={{ color: j.neto_casa >= 0 ? C_GANA : C_PIERDE }}
                      >
                        {fmtFirmado(j.neto_casa)}
                      </td>
                    </tr>
                  ))}
                  {datos.por_jugador.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-ink-dim">
                        Sin manos jugadas en este período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="hr" />

          {/* Tragamonedas */}
          <div>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <h3 className="m-0 text-[14px] font-medium">Tragamonedas</h3>
                {estaOculto("slots") && (
                  <span className="rounded bg-amber-400/15 px-2 py-0.5 text-[11px] text-amber-300">
                    oculta para los jugadores
                  </span>
                )}
              </div>
              <span className="text-[11px] text-ink-dim">
                margen teórico {MARGEN_TEORICO_SLOTS}%
              </span>
            </div>

            {datos.slots && datos.slots.giros > 0 ? (
              <>
                <div className="flex flex-wrap items-end gap-x-7 gap-y-3">
                  <div>
                    <span className="text-[10px] uppercase tracking-[0.1em] text-ink-dim">
                      Deja a la casa
                    </span>
                    <div
                      className="mt-0.5 text-[28px] font-medium leading-none tabular-nums"
                      style={{ color: datos.slots.neto_casa >= 0 ? C_GANA : C_PIERDE }}
                    >
                      {fmtFirmado(datos.slots.neto_casa)}
                    </div>
                    <span className="text-[11px] text-ink-dim">
                      margen real{" "}
                      <b className="tabular-nums text-ink-muted">{datos.slots.margen_pct}%</b>
                    </span>
                  </div>
                  <Tile label="Giros" valor={fmt(datos.slots.giros)} />
                  <Tile label="Apostado" valor={fmt(datos.slots.apostado)} />
                  <Tile label="Pagado" valor={fmt(datos.slots.pagado)} />
                  <Tile label="Jugadores" valor={fmt(datos.slots.jugadores)} />
                  <Tile
                    label="Jackpots"
                    valor={fmt(datos.slots.jackpots)}
                    nota={
                      datos.slots.premio_mayor > 0
                        ? `mayor premio ${fmt(datos.slots.premio_mayor)}`
                        : undefined
                    }
                  />
                </div>

                {datos.slots.giros < 5000 && (
                  <p className="m-0 mt-2 text-[11px] leading-relaxed text-ink-dim">
                    Con {fmt(datos.slots.giros)} giros el margen todavía es ruido: hacen falta
                    varios miles para que se acerque al {MARGEN_TEORICO_SLOTS}% teórico. Un solo
                    jackpot mueve el número decenas de puntos.
                  </p>
                )}

                {datos.slots_por_jugador?.length > 0 && (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-[11px] uppercase tracking-[0.08em] text-ink-dim">
                        <tr>
                          <th className="py-1.5 pr-3 font-normal">Jugador</th>
                          <th className="py-1.5 pr-3 text-right font-normal">Giros</th>
                          <th className="py-1.5 pr-3 text-right font-normal">Apostado</th>
                          <th className="py-1.5 text-right font-normal">Deja a la casa</th>
                        </tr>
                      </thead>
                      <tbody>
                        {datos.slots_por_jugador.map((j) => (
                          <tr key={j.nombre} className="border-t border-white/[0.06]">
                            <td className="py-1.5 pr-3">{j.nombre}</td>
                            <td className="py-1.5 pr-3 text-right tabular-nums text-ink-muted">
                              {fmt(j.giros)}
                            </td>
                            <td className="py-1.5 pr-3 text-right tabular-nums text-ink-muted">
                              {fmt(j.apostado)}
                            </td>
                            <td
                              className="py-1.5 text-right font-medium tabular-nums"
                              style={{ color: j.neto_casa >= 0 ? C_GANA : C_PIERDE }}
                            >
                              {fmtFirmado(j.neto_casa)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <p className="m-0 text-[13px] text-ink-dim">
                Nadie giró todavía en este período.
              </p>
            )}
          </div>

          <div className="hr" />

          {/* Libro: la posición real del negocio (siempre histórico completo) */}
          <div>
            <h3 className="m-0 mb-2 text-[14px] font-medium">Caja</h3>
            <div className="flex flex-wrap gap-x-7 gap-y-3">
              <Tile label="Créditos cargados" valor={fmt(datos.libro.cargado)} />
              <Tile label="Retirados" valor={fmt(datos.libro.retirado)} />
              <Tile
                label="En manos de jugadores"
                valor={fmt(datos.libro.circulacion)}
                nota="lo que la casa debe"
              />
              <Tile
                label="Cargos de reingreso"
                valor={fmt(datos.libro.cargos_reingreso)}
              />
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function Tile({ label, valor, nota }: { label: string; valor: string; nota?: string }) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[10px] uppercase tracking-[0.1em] text-ink-dim">{label}</span>
      <span className="mt-0.5 text-[20px] font-medium tabular-nums">{valor}</span>
      {nota && <span className="text-[10px] text-ink-dim">{nota}</span>}
    </div>
  );
}

function Leyenda({ color, texto }: { color: string; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      {texto}
    </span>
  );
}

// Barras divergentes ancladas al cero. El signo lo lleva la posición (arriba /
// abajo de la línea base) además del color, así que se lee sin depender del tono.
function GraficoDias({ dias }: { dias: Dia[] }) {
  const [activo, setActivo] = useState<number | null>(null);

  const max = useMemo(
    () => Math.max(1, ...dias.map((d) => Math.abs(d.neto_casa))),
    [dias]
  );

  if (dias.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-ink-dim">
        Todavía no hay manos en este período.
      </p>
    );
  }

  const H = 150; // alto del área de barras (mitad arriba, mitad abajo)
  const medio = H / 2;
  // Sin hover (mobile) se muestra el último día, así la línea de detalle
  // siempre dice algo en vez de quedar vacía.
  const foco = activo ?? dias.length - 1;
  const d = dias[foco];

  return (
    <div className="relative">
      <div
        className="flex items-stretch gap-[2px] overflow-x-auto pb-1"
        style={{ height: H }}
        onMouseLeave={() => setActivo(null)}
      >
        {dias.map((d, i) => {
          const alto = Math.max(3, (Math.abs(d.neto_casa) / max) * (medio - 10));
          const positivo = d.neto_casa >= 0;
          const color = positivo ? C_GANA : C_PIERDE;
          return (
            <div
              key={d.dia}
              className="relative flex min-w-[26px] flex-1 cursor-pointer flex-col"
              onMouseEnter={() => setActivo(i)}
              onFocus={() => setActivo(i)}
              onClick={() => setActivo(i)}
              tabIndex={0}
              aria-label={`${d.dia}: la casa ${positivo ? "gana" : "pierde"} ${fmt(
                Math.abs(d.neto_casa)
              )} en ${d.manos} manos`}
            >
              {/* mitad superior */}
              <div className="flex flex-1 items-end justify-center">
                {positivo && (
                  <div
                    style={{
                      height: alto,
                      background: color,
                      // Extremo del dato redondeado, anclado a la línea base.
                      borderRadius: "4px 4px 0 0",
                      width: "100%",
                      maxWidth: 34,
                      opacity: activo === null || activo === i ? 1 : 0.45,
                      transition: "opacity .12s",
                    }}
                  />
                )}
              </div>
              {/* mitad inferior */}
              <div className="flex flex-1 items-start justify-center">
                {!positivo && (
                  <div
                    style={{
                      height: alto,
                      background: color,
                      borderRadius: "0 0 4px 4px",
                      width: "100%",
                      maxWidth: 34,
                      opacity: activo === null || activo === i ? 1 : 0.45,
                      transition: "opacity .12s",
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Línea base del cero */}
      <div
        className="pointer-events-none absolute inset-x-0"
        style={{ top: medio, height: 1, background: "#383835" }}
      />

      {/* Etiquetas de fecha: solo primera y última, para no saturar */}
      <div className="mt-1 flex justify-between text-[10px]" style={{ color: INK_MUTED }}>
        <span>{dias[0]?.dia.slice(5)}</span>
        <span>{dias[dias.length - 1]?.dia.slice(5)}</span>
      </div>

      {/* Detalle del día enfocado: fuera del área de datos, así nunca tapa las
          barras, y en mobile (sin hover) igual muestra el último día. */}
      {d && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 border-t border-white/[0.06] pt-2 text-[12px]">
          <span className="font-medium tabular-nums">{d.dia}</span>
          <span
            className="font-medium tabular-nums"
            style={{ color: d.neto_casa >= 0 ? C_GANA : C_PIERDE }}
          >
            {fmtFirmado(d.neto_casa)}
          </span>
          <span className="text-ink-muted">
            {fmt(d.manos)} manos · {fmt(d.volumen)} apostado
          </span>
          {activo === null && (
            <span className="text-[10px] text-ink-dim">(tocá una barra para ver otro día)</span>
          )}
        </div>
      )}
    </div>
  );
}

function TablaDias({ dias }: { dias: Dia[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] uppercase tracking-[0.08em] text-ink-dim">
          <tr>
            <th className="py-1.5 pr-3 font-normal">Día</th>
            <th className="py-1.5 pr-3 text-right font-normal">Manos</th>
            <th className="py-1.5 pr-3 text-right font-normal">Apostado</th>
            <th className="py-1.5 text-right font-normal">Resultado casa</th>
          </tr>
        </thead>
        <tbody>
          {dias.map((d) => (
            <tr key={d.dia} className="border-t border-white/[0.06]">
              <td className="py-1.5 pr-3 tabular-nums">{d.dia}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-ink-muted">{fmt(d.manos)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-ink-muted">
                {fmt(d.volumen)}
              </td>
              <td
                className="py-1.5 text-right font-medium tabular-nums"
                style={{ color: d.neto_casa >= 0 ? C_GANA : C_PIERDE }}
              >
                {fmtFirmado(d.neto_casa)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
