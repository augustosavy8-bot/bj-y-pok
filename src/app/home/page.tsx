"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser, usuarioActualId } from "@/lib/supabase/client";
import { NocturneShell } from "@/components/nocturne/NocturneShell";
import { ChipsCanvas } from "@/components/nocturne/ChipsCanvas";
import type { Mesa } from "@/lib/types";

type Juego = "poker_holdem" | "blackjack";
type Cat = "todas" | Juego;
type MesaMia = Mesa & { soy_crupier: boolean };

const NOMBRE_JUEGO: Record<Juego, string> = {
  poker_holdem: "Póker Hold'em",
  blackjack: "Blackjack",
};
const GLIFO: Record<Juego, string> = { poker_holdem: "♠", blackjack: "🂡" };

const REGLAS_CASA = [
  { label: "Blackjack paga", value: "3 : 2" },
  { label: "La banca planta en", value: "17" },
  { label: "Mazos en el shoe", value: "6" },
  { label: "Reparto", value: "RNG servidor" },
];

export default function HomePage() {
  const router = useRouter();
  const [esAdmin, setEsAdmin] = useState(false);
  const [mesas, setMesas] = useState<MesaMia[]>([]);
  const [cat, setCat] = useState<Cat>("todas");
  const [q, setQ] = useState("");
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const uid = await usuarioActualId();
      if (!uid) return;
      const supabase = getSupabaseBrowser();
      const { data } = await supabase.from("perfiles").select("rol").eq("id", uid).maybeSingle();
      if (data) setEsAdmin((data as { rol: string }).rol === "admin");
    })();
  }, []);

  const cargarMesas = useCallback(async () => {
    const r = await fetch("/api/mis-mesas");
    if (r.ok) setMesas((await r.json()).mesas ?? []);
  }, []);
  useEffect(() => {
    cargarMesas();
  }, [cargarMesas]);

  const filtradas = useMemo(
    () =>
      mesas.filter(
        (m) =>
          (cat === "todas" || m.tipo_juego === cat) &&
          (!q || m.codigo_sala.includes(q.toUpperCase()))
      ),
    [mesas, cat, q]
  );

  async function cerrarMesa(cod: string) {
    if (!confirm(`¿Cerrar la mesa ${cod}? Los jugadores reciben sus fichas de vuelta.`)) return;
    setError(null);
    const r = await fetch(`/api/mesa/${cod}/cerrar`, { method: "POST" });
    if (!r.ok) {
      setError((await r.json())?.error ?? "No se pudo cerrar.");
      return;
    }
    cargarMesas();
  }

  async function unirse() {
    const c = codigo.trim().toUpperCase();
    if (c.length !== 6) {
      setError("El código tiene 6 caracteres.");
      return;
    }
    setError(null);
    const r = await fetch(`/api/mesa/${c}/info`);
    if (!r.ok) {
      setError((await r.json())?.error ?? "No se encontró la mesa.");
      return;
    }
    const info = await r.json();
    if (!info.puedo_entrar) {
      setError(`Necesitás ${info.creditos_minimos} créditos para entrar; tenés ${info.mi_saldo}.`);
      return;
    }
    router.push(`/mesa/${c}`);
  }

  return (
    <NocturneShell>
      {/* Hero */}
      <section
        className="relative overflow-hidden"
        style={{
          backgroundImage:
            "radial-gradient(110% 80% at 82% 0%, color-mix(in srgb, var(--color-section) 48%, transparent), transparent 62%), radial-gradient(65% 70% at 4% 100%, color-mix(in srgb, var(--color-accent-900) 70%, transparent), transparent 70%)",
        }}
      >
        <ChipsCanvas density={0.45} />
        <div className="relative z-[2] mx-auto grid max-w-6xl grid-cols-1 items-start gap-10 px-4 py-16 sm:px-8 lg:grid-cols-[1fr_360px] lg:py-20">
          <div className="max-w-xl">
            <div className="mb-4 text-[11px] uppercase tracking-[0.14em] text-tinta/60">
              Blackjack · Póker · Mesa clásica
            </div>
            <h1 className="text-[clamp(38px,5vw,58px)] font-medium leading-[1.04] tracking-tight text-balance">
              La mesa está
              <br />
              <span className="text-acento-300">siempre servida.</span>
            </h1>
            <p className="mt-4 max-w-md text-[17px] leading-relaxed text-tinta/75">
              Blackjack y póker con reglas publicadas por mesa y reparto RNG del lado del
              servidor. Créditos internos, sin ruido, sin trucos.
            </p>
            <div className="mt-7 flex flex-wrap gap-2.5">
              <a href="#mesas" className="nbtn nbtn-primary px-5 py-2.5 text-[15px]">
                Ver mis mesas
              </a>
              {esAdmin && (
                <a href="#crear" className="nbtn nbtn-secondary px-5 py-2.5 text-[15px]">
                  Crear una mesa
                </a>
              )}
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-tinta/55">
              <span className="inline-flex items-center gap-1.5">
                <Escudo /> RNG del lado del servidor
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Reloj /> Reglas publicadas por mesa
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Prohibido /> +18 · juego responsable
              </span>
            </div>
          </div>

          <div className="flex w-full flex-col gap-3 lg:justify-self-end">
            <div className="ncard elev-md p-5" style={{ boxShadow: "0 0 0 1px #595d6c, 0 6px 18px rgba(0,0,0,0.55)" }}>
              <span className="text-[10px] uppercase tracking-[0.1em] text-acento">Reglas de la casa</span>
              <div className="mt-2 flex flex-col gap-2.5">
                {REGLAS_CASA.map((r) => (
                  <div key={r.label} className="flex items-baseline justify-between gap-4 text-[13px]">
                    <span className="text-tinta/70">{r.label}</span>
                    <span className="font-medium tabular-nums">{r.value}</span>
                  </div>
                ))}
              </div>
              <div className="hr my-3" />
              <p className="m-0 text-[11px] leading-relaxed text-tinta/50">
                La ventaja de la casa y las reglas de cada mesa aparecen en su ficha, antes
                de sentarte.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Mesas */}
      <section id="mesas" className="mx-auto max-w-6xl px-4 pt-14 sm:px-8">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-[26px] font-medium">Tus mesas</h2>
            <p className="m-0 text-[13px] text-tinta/55">Las mesas donde estás sentado o que dirigís.</p>
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value.toUpperCase())}
            placeholder="Buscar por código"
            className="ninput w-44 uppercase tracking-widest placeholder:tracking-normal"
          />
        </div>

        {/* Chip bar de variante */}
        <div className="mb-5 flex flex-wrap gap-2">
          {(["todas", "poker_holdem", "blackjack"] as Cat[]).map((c) => {
            const activo = cat === c;
            return (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition ${
                  activo ? "border-acento text-acento" : "border-white/12 text-tinta/70 hover:bg-white/5"
                }`}
              >
                {activo && <span className="h-1.5 w-1.5 rounded-full bg-acento" />}
                {c === "todas" ? "Todas" : NOMBRE_JUEGO[c]}
              </button>
            );
          })}
        </div>

        {filtradas.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtradas.map((m) => (
              <div
                key={m.id}
                className="ncard group flex flex-col gap-3 border border-white/[0.06] p-4 transition hover:-translate-y-0.5 hover:border-acento/60"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.1em] text-acento">
                      {NOMBRE_JUEGO[m.tipo_juego as Juego] ?? m.tipo_juego}
                    </div>
                    <div className="font-mono text-lg tracking-[0.25em] text-tinta">{m.codigo_sala}</div>
                  </div>
                  <span className="text-2xl text-white/15">{GLIFO[m.tipo_juego as Juego] ?? "♠"}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <span className="rounded bg-white/[0.06] px-2 py-0.5 text-tinta/70">
                    {m.soy_crupier ? "Dirigís" : "Jugás"}
                  </span>
                  <span className="rounded bg-white/[0.06] px-2 py-0.5 text-tinta/70">
                    {m.es_practica ? "Práctica" : `Min ${m.creditos_minimos}`}
                  </span>
                </div>
                <div className="mt-1 flex gap-2">
                  <button
                    onClick={() => router.push(`/mesa/${m.codigo_sala}${m.soy_crupier ? "/crupier" : ""}`)}
                    className="nbtn nbtn-primary flex-1"
                  >
                    Sentarse
                  </button>
                  {m.soy_crupier && (
                    <button onClick={() => cerrarMesa(m.codigo_sala)} className="nbtn nbtn-danger">
                      Cerrar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="ncard border border-white/[0.06] p-8 text-center text-sm text-tinta/55">
            {mesas.length === 0
              ? "Todavía no estás en ninguna mesa. Unite con un código o pedile a un admin que cree una."
              : "Sin mesas para ese filtro."}
          </div>
        )}

        {/* Unirme con código */}
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <div className="ncard flex flex-col gap-2 border border-white/[0.06] p-4">
            <h3 className="text-[15px] font-medium">Unirme con código</h3>
            <div className="flex gap-2">
              <input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                maxLength={6}
                placeholder="CÓDIGO"
                className="ninput flex-1 text-center text-lg uppercase tracking-[0.3em] placeholder:tracking-normal"
              />
              <button className="nbtn nbtn-primary" onClick={unirse}>
                Entrar
              </button>
            </div>
          </div>
          {esAdmin && <CrearMesa router={router} onCreada={cargarMesas} cat={cat} />}
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-center text-sm text-red-200">
            {error}
          </div>
        )}
      </section>

      {/* Banda de confianza (único campo saturado de la página) */}
      <section
        className="mt-14 w-full"
        style={{ background: "var(--color-section)" }}
      >
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 sm:px-8 md:grid-cols-4">
          {[
            { t: "RNG del lado del servidor", d: "El cliente nunca decide una carta." },
            { t: "Reglas publicadas", d: "Pago y penetración visibles por mesa." },
            { t: "Créditos internos", d: "Fichas de la casa, no dinero real." },
            { t: "+18 · juego responsable", d: "Límites y autoexclusión en el perfil." },
          ].map((c) => (
            <div key={c.t} className="flex flex-col gap-1">
              <span className="text-sm font-medium text-tinta">{c.t}</span>
              <span className="text-[12px] leading-snug text-tinta/60">{c.d}</span>
            </div>
          ))}
        </div>
      </section>
    </NocturneShell>
  );
}

function CrearMesa({
  router,
  onCreada,
  cat,
}: {
  router: ReturnType<typeof useRouter>;
  onCreada: () => void;
  cat: Cat;
}) {
  const [abierto, setAbierto] = useState(false);
  const [juego, setJuego] = useState<Juego>(cat === "blackjack" ? "blackjack" : "poker_holdem");
  const [esPractica, setEsPractica] = useState(true);
  const [creditosMin, setCreditosMin] = useState(100);
  const [ciegaChica, setCiegaChica] = useState(10);
  const [ciegaGrande, setCiegaGrande] = useState(20);
  const [fichas, setFichas] = useState(1000);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear() {
    setCargando(true);
    setError(null);
    try {
      const r = await fetch("/api/mesa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tipo_juego: juego,
          es_practica: esPractica,
          creditos_minimos: esPractica ? 0 : creditosMin,
          ciega_chica: ciegaChica,
          ciega_grande: ciegaGrande,
          fichas_iniciales: fichas,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error ?? "No se pudo crear");
      onCreada();
      router.push(`/mesa/${d.codigo_sala}/crupier`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setCargando(false);
    }
  }

  return (
    <div id="crear" className="ncard flex flex-col gap-2 border border-white/[0.06] p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-medium">Crear una mesa</h3>
        <span className="text-[10px] uppercase tracking-wide text-acento">solo admin</span>
      </div>
      {!abierto ? (
        <button className="nbtn nbtn-primary" onClick={() => setAbierto(true)}>
          Nueva mesa
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="seg-like flex gap-2">
            {(["poker_holdem", "blackjack"] as Juego[]).map((j) => (
              <button
                key={j}
                onClick={() => setJuego(j)}
                className={`flex-1 rounded-md border px-2 py-1.5 text-sm ${
                  juego === j ? "border-acento text-acento" : "border-white/12 text-tinta/70"
                }`}
              >
                {NOMBRE_JUEGO[j]}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-tinta/80">
            <input type="checkbox" checked={esPractica} onChange={(e) => setEsPractica(e.target.checked)} />
            Práctica (sin créditos reales)
          </label>
          {!esPractica && (
            <input
              type="number"
              min={1}
              value={creditosMin}
              onChange={(e) => setCreditosMin(Number(e.target.value))}
              placeholder="Buy-in mínimo"
              className="ninput"
            />
          )}
          {juego === "poker_holdem" && (
            <div className="grid grid-cols-3 gap-2">
              <input type="number" value={ciegaChica} onChange={(e) => setCiegaChica(Number(e.target.value))} className="ninput" title="Ciega chica" />
              <input type="number" value={ciegaGrande} onChange={(e) => setCiegaGrande(Number(e.target.value))} className="ninput" title="Ciega grande" />
              <input type="number" value={fichas} onChange={(e) => setFichas(Number(e.target.value))} disabled={!esPractica} className="ninput disabled:opacity-40" title="Fichas" />
            </div>
          )}
          {juego === "blackjack" && esPractica && (
            <input type="number" value={fichas} onChange={(e) => setFichas(Number(e.target.value))} className="ninput" title="Fichas iniciales" />
          )}
          <div className="flex gap-2">
            <button className="nbtn nbtn-secondary flex-1" onClick={() => setAbierto(false)}>
              Cancelar
            </button>
            <button className="nbtn nbtn-primary flex-1" onClick={crear} disabled={cargando}>
              {cargando ? "Creando…" : "Crear"}
            </button>
          </div>
          {error && <div className="text-xs text-red-300">{error}</div>}
        </div>
      )}
    </div>
  );
}

function Escudo() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7.5 2.8v5.9c0 4.6-3.1 7.6-7.5 9.1-4.4-1.5-7.5-4.5-7.5-9.1V5.8L12 3z" />
      <path d="M8.9 12.1l2.2 2.2 4-4.3" />
    </svg>
  );
}
function Reloj() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="12" cy="12" r="8.6" /><path d="M12 7.6V12l3.2 2.1" />
    </svg>
  );
}
function Prohibido() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="12" cy="12" r="8.6" /><path d="M8.4 15.6l7.2-7.2" />
    </svg>
  );
}
