"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NocturneShell } from "@/components/nocturne/NocturneShell";
import { SIMBOLOS, POR_ID, TIRA, PAGA_2_CEREZAS, type Simbolo } from "@/lib/slots/maquina";

const fmt = (n: number) => n.toLocaleString("es");

type Giro = {
  id: string;
  apuesta: number;
  simbolos: Simbolo[];
  multiplicador: number;
  premio: number;
  jackpot: boolean;
  created_at: string;
};
type Jackpot = { premio: number; created_at: string; nombre: string };
type Datos = {
  saldo: number;
  apuestas: number[];
  rtp: number;
  ultimos: Giro[];
  jackpots: Jackpot[];
};

/** Cuándo frena cada rodillo, en ms desde que llega la respuesta. */
const FRENADA = [420, 700, 1020];
const MS_CUADRO = 70;

export default function SlotsPage() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [apuesta, setApuesta] = useState(100);
  const [visibles, setVisibles] = useState<Simbolo[]>(["cereza", "campana", "limon"]);
  const [quietos, setQuietos] = useState([true, true, true]);
  const [girando, setGirando] = useState(false);
  const [ultimo, setUltimo] = useState<{ premio: number; detalle: string; jackpot: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verPagos, setVerPagos] = useState(false);
  const [festejo, setFestejo] = useState(false);

  const intervalo = useRef<ReturnType<typeof setInterval> | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const vivo = useRef(true);
  const enVuelo = useRef(false);
  // Espejo de `quietos` para leerlo desde el interval sin tener que recrearlo
  // en cada frenada.
  const quietosRef = useRef(quietos);
  useEffect(() => {
    quietosRef.current = quietos;
  }, [quietos]);

  const limpiar = useCallback(() => {
    if (intervalo.current) clearInterval(intervalo.current);
    intervalo.current = null;
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
      limpiar();
    };
  }, [limpiar]);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/slots");
      if (!r.ok) {
        if (r.status === 401) { window.location.href = "/login"; return; }
        throw new Error((await r.json())?.error ?? "No se pudo cargar");
      }
      const d = (await r.json()) as Datos;
      if (!vivo.current) return;
      setDatos(d);
      if (d.ultimos?.[0]?.simbolos?.length === 3) setVisibles(d.ultimos[0].simbolos);
    } catch (e) {
      if (vivo.current) setError(e instanceof Error ? e.message : "Error");
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function tirar() {
    if (enVuelo.current || girando) return;
    // Si el teléfono pide menos animación, mostramos el resultado directo.
    const sinMovimiento = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (datos && datos.saldo < apuesta) {
      setError(`Te faltan fichas: la apuesta es ${fmt(apuesta)} y tenés ${fmt(datos.saldo)}.`);
      return;
    }
    enVuelo.current = true;
    setError(null);
    setUltimo(null);
    setFestejo(false);
    setGirando(true);
    setQuietos([false, false, false]);
    limpiar();

    // Los rodillos giran mientras esperamos la respuesta del servidor.
    if (!sinMovimiento) {
      intervalo.current = setInterval(() => {
        setVisibles((v) =>
          v.map((s, i) => (quietosRef.current[i] ? s : TIRA[Math.floor(Math.random() * TIRA.length)]))
        );
      }, MS_CUADRO);
    }

    try {
      const r = await fetch("/api/slots", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apuesta }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error ?? "No se pudo girar");
      if (!vivo.current) return;

      const finales = d.simbolos as Simbolo[];

      const frenar = (i: number) => {
        setVisibles((v) => v.map((s, j) => (j === i ? finales[i] : s)));
        setQuietos((q) => q.map((x, j) => (j === i ? true : x)));
      };

      if (sinMovimiento) {
        limpiar();
        setVisibles(finales);
        setQuietos([true, true, true]);
        rematar(d);
      } else {
        FRENADA.forEach((ms, i) => {
          timers.current.push(
            setTimeout(() => {
              if (!vivo.current) return;
              frenar(i);
              if (i === 2) {
                limpiar();
                rematar(d);
              }
            }, ms)
          );
        });
      }
    } catch (e) {
      limpiar();
      if (vivo.current) {
        setGirando(false);
        setQuietos([true, true, true]);
        setError(e instanceof Error ? e.message : "Error");
      }
      enVuelo.current = false;
    }
  }

  function rematar(d: { premio: number; detalle: string; jackpot: boolean; saldo: number }) {
    setGirando(false);
    setUltimo({ premio: d.premio, detalle: d.detalle, jackpot: d.jackpot });
    setDatos((prev) => (prev ? { ...prev, saldo: d.saldo } : prev));
    enVuelo.current = false;
    if (d.premio > 0 && typeof navigator !== "undefined") {
      navigator.vibrate?.(d.jackpot ? [80, 60, 80, 60, 200] : 45);
    }
    if (d.jackpot) setFestejo(true);
    // Refrescar el historial sin bloquear la interacción.
    cargar();
  }

  const ventaja = datos ? (1 - datos.rtp) * 100 : null;
  const saldo = datos?.saldo ?? null;
  const alcanza = saldo === null || saldo >= apuesta;

  return (
    <NocturneShell>
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-5">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-2xl font-medium">Tragamonedas</h1>
          <span className="text-sm text-tinta/60">
            {saldo === null ? "…" : <><span className="text-tinta/45">fichas </span><b className="tabular-nums text-oro">{fmt(saldo)}</b></>}
          </span>
        </div>

        {/* Rodillos */}
        <div className="ncard relative overflow-hidden border border-white/[0.08] p-4">
          <div className="grid grid-cols-3 gap-2.5">
            {visibles.map((s, i) => (
              <div
                key={i}
                className={`flex aspect-square items-center justify-center rounded-xl bg-black/40 text-[clamp(2.6rem,17vw,4.4rem)] leading-none transition-transform duration-150 ${
                  quietos[i] ? "" : "blur-[1.5px]"
                } ${ultimo && ultimo.premio > 0 && quietos[i] ? "ring-2 ring-oro/70" : "ring-1 ring-white/[0.07]"}`}
                style={{ transform: quietos[i] ? "none" : "translateY(-2px)" }}
              >
                <span aria-hidden>{POR_ID[s]?.emoji ?? "❔"}</span>
              </div>
            ))}
          </div>

          <p className="sr-only" aria-live="polite">
            {girando
              ? "Girando"
              : ultimo
                ? `${visibles.map((s) => POR_ID[s]?.nombre).join(", ")}. ${ultimo.detalle}. ${ultimo.premio > 0 ? `Ganaste ${ultimo.premio} fichas` : "Sin premio"}`
                : ""}
          </p>

          {/* Resultado */}
          <div className="mt-3 min-h-[2.6rem] text-center">
            {girando && <p className="m-0 text-sm text-tinta/50">Girando…</p>}
            {!girando && ultimo && (
              <p
                className={`m-0 text-sm ${ultimo.premio > 0 ? "text-oro" : "text-tinta/45"}`}
              >
                {ultimo.premio > 0 ? (
                  <>
                    <b className="text-base">{ultimo.detalle}</b>
                    <br />
                    <span className="tabular-nums">+{fmt(ultimo.premio)} fichas</span>
                  </>
                ) : (
                  "Sin premio esta vez"
                )}
              </p>
            )}
            {!girando && !ultimo && (
              <p className="m-0 text-sm text-tinta/40">Elegí la apuesta y girá.</p>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* Apuesta */}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-[0.08em] text-tinta/45">Apuesta por giro</span>
          <div className="grid grid-cols-4 gap-2">
            {(datos?.apuestas ?? [50, 100, 250, 500]).map((a) => (
              <button
                key={a}
                onClick={() => setApuesta(a)}
                disabled={girando}
                className={`min-h-[46px] rounded-lg border py-3 text-sm tabular-nums transition ${
                  apuesta === a
                    ? "border-acento bg-acento/10 text-acento"
                    : "border-white/12 text-tinta/70 hover:bg-white/5"
                } disabled:opacity-50`}
              >
                {fmt(a)}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={tirar}
          disabled={girando || !alcanza}
          className="nbtn nbtn-primary !py-4 text-base font-medium disabled:opacity-45"
        >
          {girando ? "Girando…" : !alcanza ? "Fichas insuficientes" : `Girar por ${fmt(apuesta)}`}
        </button>

        {!alcanza && (
          <p className="m-0 text-center text-[13px] text-tinta/50">
            Pedile una carga al administrador desde tu <a href="/perfil" className="text-acento underline">perfil</a>.
          </p>
        )}

        {/* Último jackpot de la casa */}
        {datos?.jackpots?.[0] && (
          <div className="rounded-lg border border-oro/30 bg-oro/[0.07] px-3 py-2 text-center text-[13px] text-oro">
            Último jackpot: <b>{datos.jackpots[0].nombre}</b> se llevó{" "}
            <b className="tabular-nums">{fmt(datos.jackpots[0].premio)}</b> fichas
          </div>
        )}

        {/* Tabla de pagos */}
        <div className="ncard border border-white/[0.06]">
          <button
            onClick={() => setVerPagos((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm"
            aria-expanded={verPagos}
          >
            <span className="font-medium">Tabla de pagos</span>
            <span className="text-tinta/45">{verPagos ? "ocultar" : "ver"}</span>
          </button>
          {verPagos && (
            <div className="flex flex-col gap-1.5 border-t border-white/[0.06] px-4 py-3">
              {[...SIMBOLOS].reverse().map((s) => (
                <div key={s.id} className="flex items-center justify-between text-sm">
                  <span className="text-lg">
                    {s.emoji} {s.emoji} {s.emoji}
                  </span>
                  <span className="tabular-nums text-tinta/75">
                    {s.paga3}× <span className="text-tinta/40">= {fmt(apuesta * s.paga3)}</span>
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-white/[0.06] pt-1.5 text-sm">
                <span className="flex items-baseline gap-1.5 text-lg">
                  🍒 🍒
                  <span className="text-[11px] text-tinta/45">+ cualquiera</span>
                </span>
                <span className="tabular-nums text-tinta/75">
                  {PAGA_2_CEREZAS}× <span className="text-tinta/40">= {fmt(apuesta * PAGA_2_CEREZAS)}</span>
                </span>
              </div>
              <p className="m-0 mt-2 text-[12px] leading-relaxed text-tinta/45">
                Se paga la línea de los tres símbolos. Dos cerezas pagan aunque el tercero no
                acompañe. Los tres rodillos se sortean por separado en el servidor con un
                generador criptográfico — nadie puede ver ni tocar el resultado antes de tiempo.
                {ventaja !== null && (
                  <>
                    {" "}
                    Devuelve el <b className="text-tinta/70">{(100 - ventaja).toFixed(2)}%</b> de lo
                    apostado a la larga: la ventaja de la casa es del{" "}
                    <b className="text-tinta/70">{ventaja.toFixed(2)}%</b>. En cualquier rato corto
                    podés estar muy arriba o muy abajo de ese número.
                  </>
                )}
              </p>
            </div>
          )}
        </div>

        {/* Historial */}
        {datos && datos.ultimos.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-[0.08em] text-tinta/45">
              Tus últimos giros
            </span>
            {datos.ultimos.map((g) => (
              <div
                key={g.id}
                className="flex items-center gap-3 rounded-md bg-white/[0.03] px-3 py-1.5 text-sm"
              >
                <span className="text-base">
                  {g.simbolos.map((s) => POR_ID[s]?.emoji ?? "❔").join(" ")}
                </span>
                <span className="ml-auto tabular-nums text-tinta/40">−{fmt(g.apuesta)}</span>
                <span
                  className={`w-24 text-right tabular-nums ${
                    g.premio > 0 ? "text-emerald-300" : "text-tinta/25"
                  }`}
                >
                  {g.premio > 0 ? `+${fmt(g.premio)}` : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Festejo de jackpot */}
      {festejo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setFestejo(false)}
          role="dialog"
          aria-label="Jackpot"
        >
          <div className="ncard max-w-sm border border-oro/50 p-6 text-center">
            <div className="text-5xl">7️⃣ 7️⃣ 7️⃣</div>
            <h2 className="mt-3 text-2xl font-medium text-oro">¡JACKPOT!</h2>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-oro">
              +{fmt(ultimo?.premio ?? 0)}
            </p>
            <p className="mt-2 text-sm text-tinta/60">
              Sale una vez cada 68.921 giros. Te tocó a vos.
            </p>
            <button className="nbtn nbtn-primary mt-4 w-full" onClick={() => setFestejo(false)}>
              Seguir
            </button>
          </div>
        </div>
      )}
    </NocturneShell>
  );
}
