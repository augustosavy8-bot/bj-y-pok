"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser, usuarioActualId } from "@/lib/supabase/client";
import { NocturneShell } from "@/components/nocturne/NocturneShell";
import { AvisoJugadores } from "@/components/AvisoJugadores";
import { estaOculto, puedeVerJuego } from "@/lib/juegos-visibles";
import { TEMAS } from "@/lib/slots/themes";
import type { Mesa } from "@/lib/types";

// Slots para el teaser del home (del registro de temas: slug/nombre/banner).
const SLOTS_HOME = Object.values(TEMAS);

// Iconos de línea para stats (heredan color por currentColor).
const IcoRodillos = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="6" width="18" height="12" rx="2" /><path d="M9 6v12M15 6v12" />
  </svg>
);
const IcoJugadores = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="8" r="3" /><path d="M3 20c0-3 3-5 6-5s6 2 6 5" /><path d="M16 6a3 3 0 0 1 0 6" />
  </svg>
);
const IcoMazos = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 9h16M9 9v11" />
  </svg>
);

type Juego = "poker_holdem" | "blackjack";
type Cat = "todas" | Juego;
type MesaMia = Mesa & { soy_crupier: boolean };

// Mesa de la casa: siempre abierta, se entra sin código.
type MesaCasa = {
  codigo_sala: string;
  tipo_juego: Juego;
  estado: string;
  es_practica: boolean;
  creditos_minimos: number;
  apuesta_min: number | null;
  apuesta_max: number | null;
  cantidad_mazos: number;
  jugadores: number;
  ya_sentado: boolean;
  soy_crupier: boolean;
  costo_reingreso: number;
  puedo_entrar: boolean;
};

const NOMBRE_JUEGO: Record<Juego, string> = {
  poker_holdem: "Póker Hold'em",
  blackjack: "Blackjack",
};
const GLIFO: Record<Juego, string> = { poker_holdem: "♠", blackjack: "🂡" };
const BANNER: Record<Juego, string> = {
  poker_holdem: "/juegos/poker.webp",
  blackjack: "/juegos/blackjack-mesa.webp",
};

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
  const [casa, setCasa] = useState<MesaCasa[]>([]);
  const [cat, setCat] = useState<Cat>("todas");
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

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

  // Mesas de la casa (permanentes). Se refrescan solas para ver quién hay.
  const cargarCasa = useCallback(async () => {
    const r = await fetch("/api/mesas/permanentes");
    if (r.ok) setCasa((await r.json()).mesas ?? []);
  }, []);
  useEffect(() => {
    cargarCasa();
    const iv = setInterval(cargarCasa, 10_000);
    return () => clearInterval(iv);
  }, [cargarCasa]);

  // Las permanentes tienen su propia sección arriba: no se repiten en "Tus mesas".
  const codigosCasa = useMemo(() => new Set(casa.map((c) => c.codigo_sala)), [casa]);
  const filtradas = useMemo(
    () =>
      mesas.filter(
        (m) =>
          !codigosCasa.has(m.codigo_sala) &&
          (cat === "todas" || m.tipo_juego === cat)
      ),
    [mesas, cat, codigosCasa]
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

  // ── Búsqueda (filtra las filas de juegos en el cliente) ──
  const ql = q.trim().toLowerCase();
  const match = (s: string) => !ql || s.toLowerCase().includes(ql);
  const slotsVisibles = puedeVerJuego("slots", esAdmin);
  const dinoVisible = puedeVerJuego("dino-crash", esAdmin);
  const slotsFiltrados = SLOTS_HOME.filter((t) => match(t.displayName) || match(t.tagline ?? ""));
  const casaFiltrada = casa.filter((m) => match(NOMBRE_JUEGO[m.tipo_juego] ?? m.tipo_juego));
  const dinoMatch = match("dino crash") || match("minijuegos") || match("crash");
  const casaBJ = casa.find((m) => m.tipo_juego === "blackjack");

  return (
    <NocturneShell>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        {/* ── Banners destacados ── */}
        {!ql && (
          <div className="grid gap-4 md:grid-cols-2">
            {/* Blackjack en vivo */}
            <a
              href={casaBJ ? `/mesa/${casaBJ.codigo_sala}` : "#tus-mesas"}
              className="group relative block overflow-hidden rounded-2xl border border-edge transition hover:-translate-y-0.5 hover:border-accent hover:shadow-2xl"
            >
              <div className="relative aspect-[16/8] overflow-hidden sm:aspect-[16/7]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/juegos/blackjack-mesa.webp" alt="Blackjack" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(6,20,14,.86) 0%, rgba(6,20,14,.45) 46%, transparent 78%)" }} />
                <div className="relative z-10 flex h-full flex-col justify-end p-5">
                  <span className="mb-1 inline-flex w-fit items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300 backdrop-blur">
                    <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" /></span>
                    En vivo
                  </span>
                  <div className="font-serif text-[30px] font-semibold leading-none text-ink sm:text-[38px]">Blackjack</div>
                  <div className="mt-1 text-[13px] text-ink-muted">
                    Paño verde, paga 3:2 · {casaBJ ? `${casaBJ.jugadores} en la mesa` : "mesa abierta"}
                  </div>
                </div>
              </div>
            </a>

            {/* Dino Crash */}
            {dinoVisible && (
              <a
                href="/juegos/dino-crash"
                className="group relative block overflow-hidden rounded-2xl border border-[#f0912a]/30 transition hover:-translate-y-0.5 hover:border-[#f0912a]/60 hover:shadow-2xl"
              >
                <div className="relative aspect-[16/8] overflow-hidden sm:aspect-[16/7]" style={{ background: "linear-gradient(120deg,#1a1140 0%,#3a1a55 45%,#7a2b53 100%)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/juegos/dino-crash/night_sky.webp" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-60 transition duration-500 group-hover:scale-105" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/juegos/dino-crash/ground.webp" alt="" aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 w-full" />
                  <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(10,8,20,.72) 0%, rgba(10,8,20,.25) 52%, transparent 80%)" }} />
                  <div className="relative z-10 flex h-full items-center gap-3 p-5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/juegos/dino-crash/dino_badge.webp" alt="Dino Crash" className="h-[74%] w-auto drop-shadow-[0_6px_16px_rgba(240,145,42,.5)]" />
                    <div className="min-w-0">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-amber-400/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200">✦ Nuevo</span>
                      <div className="mt-1 font-serif text-[30px] font-semibold leading-none text-[#ffd98a] sm:text-[38px]">Dino Crash</div>
                      <div className="mt-1 text-[13px] text-ink-muted">Retirá antes del meteorito.</div>
                    </div>
                  </div>
                </div>
              </a>
            )}
          </div>
        )}

        {/* ── Buscador ── */}
        <div className="relative mt-6">
          <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-dim" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar juegos…"
            className="w-full rounded-xl border border-edge bg-surface-1 py-3 pl-10 pr-4 text-sm text-ink outline-none transition placeholder:text-ink-dim focus:border-accent"
          />
        </div>

        {/* ── La mesa de la casa ── */}
        {casaFiltrada.length > 0 && (
          <Fila titulo="La mesa de la casa" eyebrow="En vivo · sin código">
            {casaFiltrada.map((m) => (
              <button
                key={m.codigo_sala}
                onClick={() => router.push(`/mesa/${m.codigo_sala}${m.soy_crupier ? "/crupier" : ""}`)}
                disabled={!m.puedo_entrar && !m.ya_sentado && !m.soy_crupier}
                className="group w-[272px] shrink-0 overflow-hidden rounded-2xl border border-edge bg-surface-1 text-left transition hover:-translate-y-0.5 hover:border-accent disabled:opacity-50"
              >
                <div className="relative aspect-[16/9] overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={BANNER[m.tipo_juego] ?? BANNER.poker_holdem} alt={NOMBRE_JUEGO[m.tipo_juego] ?? m.tipo_juego} className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                  <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(5,9,11,.08) 50%, rgba(5,9,11,.78))" }} />
                  <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded bg-black/45 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-emerald-300 backdrop-blur">
                    <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" /></span>
                    24 hs
                  </span>
                </div>
                <div className="p-3.5">
                  <div className="font-serif text-[19px] font-semibold leading-tight text-ink">{NOMBRE_JUEGO[m.tipo_juego] ?? m.tipo_juego}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-muted">
                    <span className="inline-flex items-center gap-1">{IcoJugadores}{m.jugadores === 0 ? "libre" : `${m.jugadores} jugando`}</span>
                    <span className="inline-flex items-center gap-1">{IcoMazos}{m.es_practica ? "práctica" : `entrada ${m.creditos_minimos}`}</span>
                  </div>
                  <span className="mt-3 flex w-full items-center justify-center rounded-lg border border-accent py-1.5 text-[13px] text-ink transition group-hover:bg-[color-mix(in_srgb,var(--nc-accent)_12%,transparent)]">
                    {m.soy_crupier ? "Abrir como crupier" : m.ya_sentado ? "Volver a la mesa" : "Entrar a jugar →"}
                  </span>
                </div>
              </button>
            ))}
          </Fila>
        )}

        {/* ── Slots ── */}
        {slotsVisibles && slotsFiltrados.length > 0 && (
          <Fila
            titulo="Slots"
            eyebrow="Máquinas"
            verTodo="/slots"
            aviso={estaOculto("slots") && esAdmin ? "ocultas · sólo las ves vos" : undefined}
          >
            {slotsFiltrados.map((t) => {
              const stats = (t.tagline ?? "").split("·").map((x) => x.trim()).filter(Boolean);
              return (
                <a
                  key={t.slug}
                  href={`/slots/${t.slug}`}
                  className="group w-[172px] shrink-0 overflow-hidden rounded-2xl border border-edge bg-surface-1 transition hover:-translate-y-0.5 hover:border-accent"
                >
                  <div className="relative aspect-[3/4] overflow-hidden">
                    {t.card && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.card} alt={t.displayName} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                    )}
                    <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(10,12,20,0) 52%, rgba(10,12,20,.9))" }} />
                    <div className="absolute inset-x-0 bottom-0 p-2.5">
                      <div className="font-serif text-[15px] font-semibold leading-tight text-ink">{t.displayName}</div>
                      <div className="mt-0.5 inline-flex items-center gap-1 text-[10.5px] text-ink-muted">{IcoRodillos}{stats[0] ?? "5 rodillos"}</div>
                    </div>
                  </div>
                </a>
              );
            })}
          </Fila>
        )}

        {/* ── Minijuegos ── */}
        {dinoVisible && dinoMatch && (
          <Fila titulo="Minijuegos" eyebrow="Crash" verTodo="/juegos/dino-crash">
            <a
              href="/juegos/dino-crash"
              className="group relative w-[300px] shrink-0 overflow-hidden rounded-2xl border border-[#f0912a]/30 transition hover:-translate-y-0.5 hover:border-[#f0912a]/60"
            >
              <div className="relative aspect-[16/10] overflow-hidden" style={{ background: "linear-gradient(120deg,#1a1140 0%,#3a1a55 45%,#7a2b53 100%)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/juegos/dino-crash/night_sky.webp" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-60 transition duration-500 group-hover:scale-105" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/juegos/dino-crash/ground.webp" alt="" aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 w-full" />
                <div className="absolute inset-0" style={{ background: "linear-gradient(0deg, rgba(10,8,20,.7), transparent 60%)" }} />
                <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/juegos/dino-crash/dino_badge.webp" alt="Dino Crash" className="h-11 w-auto drop-shadow-[0_4px_10px_rgba(240,145,42,.5)]" />
                  <div>
                    <div className="font-serif text-[18px] font-semibold leading-none text-[#ffd98a]">Dino Crash</div>
                    <div className="text-[11px] text-ink-muted">Ronda compartida en vivo</div>
                  </div>
                </div>
              </div>
            </a>
          </Fila>
        )}

        {/* ── Tus mesas ── */}
        <section id="tus-mesas" className="mt-10">
          <div className="mb-3">
            <span className="text-[11px] uppercase tracking-[0.16em] text-ink-muted"><span aria-hidden>✦</span> Tu juego</span>
            <h2 className="font-serif text-[24px] font-semibold leading-tight">Tus mesas</h2>
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            {(["todas", "poker_holdem", "blackjack"] as Cat[]).map((c) => {
              const activo = cat === c;
              return (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition ${
                    activo ? "border-accent text-ink" : "border-white/12 text-ink-muted hover:bg-white/5"
                  }`}
                >
                  {activo && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                  {c === "todas" ? "Todas" : NOMBRE_JUEGO[c]}
                </button>
              );
            })}
          </div>

          {filtradas.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtradas.map((m) => (
                <div key={m.id} className="ncard group flex flex-col gap-3 border border-white/[0.06] p-4 transition hover:-translate-y-0.5 hover:border-accent">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.1em] text-ink-muted">{NOMBRE_JUEGO[m.tipo_juego as Juego] ?? m.tipo_juego}</div>
                      <div className="font-mono text-lg tracking-[0.25em] text-ink">{m.codigo_sala}</div>
                    </div>
                    <span className="text-2xl text-white/15">{GLIFO[m.tipo_juego as Juego] ?? "♠"}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[11px]">
                    <span className="rounded bg-white/[0.06] px-2 py-0.5 text-ink-muted">{m.soy_crupier ? "Dirigís" : "Jugás"}</span>
                    <span className="rounded bg-white/[0.06] px-2 py-0.5 text-ink-muted">{m.es_practica ? "Práctica" : `Min ${m.creditos_minimos}`}</span>
                  </div>
                  <div className="mt-1 flex gap-2">
                    <button onClick={() => router.push(`/mesa/${m.codigo_sala}${m.soy_crupier ? "/crupier" : ""}`)} className="nbtn nbtn-primary flex-1">Sentarse</button>
                    {m.soy_crupier && (
                      <button onClick={() => cerrarMesa(m.codigo_sala)} className="nbtn nbtn-danger">Cerrar</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="ncard border border-white/[0.06] p-8 text-center text-sm text-ink-muted">
              {mesas.length === 0
                ? "Todavía no estás en ninguna mesa. Entrá a la mesa de la casa (siempre abierta) o pedile a un admin que cree una."
                : "Sin mesas para ese filtro."}
            </div>
          )}

          {esAdmin && (
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <CrearMesa router={router} onCreada={cargarMesas} cat={cat} />
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-center text-sm text-red-200">{error}</div>
          )}
        </section>

        {/* Vigía de la mesa: herramienta de operador, sólo para el admin. */}
        {esAdmin && (
          <div className="mt-10">
            <AvisoJugadores />
          </div>
        )}

        {/* Reglas de la casa — texto plano, al fondo */}
        <div className="mt-12 border-t border-edge pt-6">
          <p className="text-[11px] uppercase tracking-[0.14em] text-ink-dim">Reglas de la casa</p>
          <p className="mt-2 text-[13px] text-ink-muted">{REGLAS_CASA.map((r) => `${r.label}: ${r.value}`).join("  ·  ")}</p>
          <p className="mt-1 text-[12px] text-ink-dim">La ventaja de la casa y las reglas de cada mesa aparecen en su ficha, antes de sentarte.</p>
        </div>
      </div>
    </NocturneShell>
  );
}

// Fila horizontal de tarjetas (scroll lateral, estilo lobby).
function Fila({
  titulo,
  eyebrow,
  verTodo,
  aviso,
  children,
}: {
  titulo: string;
  eyebrow?: string;
  verTodo?: string;
  aviso?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          {eyebrow && (
            <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-ink-muted">
              <span aria-hidden>✦</span> {eyebrow}
              {aviso && <span className="rounded bg-amber-400/15 px-2 py-0.5 text-[10px] normal-case tracking-normal text-amber-300">{aviso}</span>}
            </span>
          )}
          <h2 className="font-serif text-[24px] font-semibold leading-tight">{titulo}</h2>
        </div>
        {verTodo && <a href={verTodo} className="shrink-0 text-[13px] text-ink-muted hover:text-ink">Ver todo →</a>}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </section>
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
  const [creditosMin, setCreditosMin] = useState(500);
  const [ciegaChica, setCiegaChica] = useState(10);
  const [ciegaGrande, setCiegaGrande] = useState(20);
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
          es_practica: false,
          creditos_minimos: creditosMin,
          ciega_chica: ciegaChica,
          ciega_grande: ciegaGrande,
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
        <span className="text-[10px] uppercase tracking-wide text-ink-muted">solo admin</span>
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
                  juego === j ? "border-accent text-ink" : "border-white/12 text-ink-muted"
                }`}
              >
                {NOMBRE_JUEGO[j]}
              </button>
            ))}
          </div>
          <label className="text-sm text-ink">
            <span className="text-ink-muted">Créditos mínimos para sentarse</span>
            <input
              type="number"
              min={1}
              value={creditosMin}
              onChange={(e) => setCreditosMin(Number(e.target.value))}
              placeholder="Buy-in mínimo"
              className="ninput mt-1"
            />
          </label>
          {juego === "poker_holdem" && (
            <div className="grid grid-cols-2 gap-2">
              <input type="number" value={ciegaChica} onChange={(e) => setCiegaChica(Number(e.target.value))} className="ninput" title="Ciega chica" />
              <input type="number" value={ciegaGrande} onChange={(e) => setCiegaGrande(Number(e.target.value))} className="ninput" title="Ciega grande" />
            </div>
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
