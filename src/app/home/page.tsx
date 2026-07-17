"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser, usuarioActualId, cerrarSesion } from "@/lib/supabase/client";
import { SaldoBadge } from "@/components/SaldoBadge";
import type { Mesa } from "@/lib/types";

type Juego = "poker_holdem" | "blackjack";
type MesaMia = Mesa & { soy_crupier: boolean };

const NOMBRE_JUEGO: Record<Juego, string> = {
  poker_holdem: "Poker Texas Hold'em",
  blackjack: "Blackjack",
};

export default function HomePage() {
  const router = useRouter();
  const [juego, setJuego] = useState<Juego | null>(null);
  const [esAdmin, setEsAdmin] = useState(false);
  const [miNombre, setMiNombre] = useState("");

  useEffect(() => {
    (async () => {
      const uid = await usuarioActualId();
      if (!uid) return;
      const supabase = getSupabaseBrowser();
      const { data } = await supabase.from("perfiles").select("rol, nombre").eq("id", uid).maybeSingle();
      if (data) {
        setEsAdmin((data as { rol: string }).rol === "admin");
        setMiNombre((data as { nombre: string }).nombre ?? "");
      }
    })();
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <span className="text-sm text-white/60">{miNombre && `Hola, ${miNombre}`}</span>
        <div className="flex items-center gap-3">
          <SaldoBadge />
          {esAdmin && <a href="/admin" className="text-sm text-oro underline">Admin</a>}
          <button className="text-sm text-white/60 underline" onClick={cerrarSesion}>Salir</button>
        </div>
      </header>

      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-oro">♠ Mesa de Poker ♥</h1>
      </div>

      {!juego ? (
        <div className="flex flex-col gap-4">
          <p className="text-center text-white/70">Elegí un juego</p>
          <button
            onClick={() => setJuego("poker_holdem")}
            className="panel flex flex-col items-center gap-2 p-8 transition hover:brightness-125"
          >
            <span className="text-5xl">♠</span>
            <span className="text-lg font-semibold">Poker Texas Hold&apos;em</span>
          </button>
          <button
            onClick={() => setJuego("blackjack")}
            className="panel flex flex-col items-center gap-2 p-8 transition hover:brightness-125"
          >
            <span className="text-5xl">🂡</span>
            <span className="text-lg font-semibold">Blackjack</span>
          </button>
        </div>
      ) : (
        <VistaJuego juego={juego} onVolver={() => setJuego(null)} router={router} esAdmin={esAdmin} />
      )}
    </main>
  );
}

function VistaJuego({
  juego,
  onVolver,
  router,
  esAdmin,
}: {
  juego: Juego;
  onVolver: () => void;
  router: ReturnType<typeof useRouter>;
  esAdmin: boolean;
}) {
  const [mesas, setMesas] = useState<MesaMia[]>([]);
  const [codigo, setCodigo] = useState("");
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form de creación.
  const [esPractica, setEsPractica] = useState(true);
  const [creditosMin, setCreditosMin] = useState(100);
  const [ciegaChica, setCiegaChica] = useState(10);
  const [ciegaGrande, setCiegaGrande] = useState(20);
  const [fichas, setFichas] = useState(1000);
  const [cargando, setCargando] = useState(false);

  const cargarMesas = useCallback(async () => {
    const r = await fetch(`/api/mis-mesas?tipo=${juego}`);
    if (r.ok) setMesas((await r.json()).mesas ?? []);
  }, [juego]);

  useEffect(() => {
    cargarMesas();
  }, [cargarMesas]);

  async function crearMesa() {
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
      router.push(`/mesa/${d.codigo_sala}/crupier`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setCargando(false);
    }
  }

  async function cerrarMesa(cod: string) {
    if (!confirm(`¿Cerrar la mesa ${cod}? Los jugadores reciben sus fichas de vuelta y la mesa deja de estar activa.`))
      return;
    setError(null);
    const r = await fetch(`/api/mesa/${cod}/cerrar`, { method: "POST" });
    const d = await r.json();
    if (!r.ok) {
      setError(d?.error ?? "No se pudo cerrar la mesa.");
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
    // Pre-validar saldo contra el mínimo de esa mesa.
    const r = await fetch(`/api/mesa/${c}/info`);
    if (!r.ok) {
      const d = await r.json();
      setError(d?.error ?? "No se encontró la mesa.");
      return;
    }
    const info = await r.json();
    if (!info.puedo_entrar) {
      setError(
        `Necesitás ${info.creditos_minimos} créditos para entrar a esa mesa, tenés ${info.mi_saldo}.`
      );
      return;
    }
    router.push(`/mesa/${c}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <button onClick={onVolver} className="self-start text-sm text-white/60 underline">
        ← Cambiar juego
      </button>
      <h2 className="text-xl font-semibold text-oro">{NOMBRE_JUEGO[juego]}</h2>

      {/* Mis mesas activas */}
      {mesas.length > 0 && (
        <section className="panel flex flex-col gap-2 p-4">
          <h3 className="font-semibold">Mis mesas activas</h3>
          {mesas.map((m) => (
            <div key={m.id} className="flex items-center gap-2">
              <button
                onClick={() => router.push(`/mesa/${m.codigo_sala}${m.soy_crupier ? "/crupier" : ""}`)}
                className="flex flex-1 items-center justify-between rounded-lg bg-black/20 px-3 py-2 text-left hover:bg-black/40"
              >
                <span className="font-mono tracking-widest text-oro">{m.codigo_sala}</span>
                <span className="text-xs text-white/60">
                  {m.soy_crupier ? "crupier" : "jugador"} · {m.es_practica ? "práctica" : `min ${m.creditos_minimos}`}
                </span>
              </button>
              {m.soy_crupier && (
                <button
                  onClick={() => cerrarMesa(m.codigo_sala)}
                  className="shrink-0 rounded-lg bg-red-900/50 px-3 py-2 text-xs text-red-100 hover:bg-red-900/80"
                  title="Cerrar mesa"
                >
                  Cerrar
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Unirme con código */}
      <section className="panel flex flex-col gap-2 p-4">
        <h3 className="font-semibold">Unirme con código</h3>
        <div className="flex gap-2">
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="CÓDIGO"
            className="flex-1 rounded-xl bg-white/10 p-3 text-center text-xl uppercase tracking-[0.3em] placeholder:tracking-normal placeholder:text-white/40"
          />
          <button className="btn btn-oro" onClick={unirse}>Entrar</button>
        </div>
      </section>

      {/* Crear mesa — solo administradores */}
      {!esAdmin ? null : !creando ? (
        <button className="btn btn-verde" onClick={() => setCreando(true)}>
          Crear mesa nueva
        </button>
      ) : (
        <section className="panel flex flex-col gap-3 p-4">
          <h3 className="font-semibold">Crear mesa de {NOMBRE_JUEGO[juego]}</h3>
          <label className="flex items-center gap-2 text-sm text-white/80">
            <input type="checkbox" checked={esPractica} onChange={(e) => setEsPractica(e.target.checked)} />
            Mesa de práctica (sin créditos reales)
          </label>
          {!esPractica && (
            <label className="text-sm text-white/70">
              Buy-in mínimo (créditos)
              <input type="number" min={1} value={creditosMin}
                onChange={(e) => setCreditosMin(Number(e.target.value))}
                className="mt-1 w-full rounded-xl bg-white/10 p-3" />
              <span className="mt-1 block text-xs text-white/40">
                Cada jugador entra con esta cantidad de créditos como fichas.
              </span>
            </label>
          )}
          {juego === "poker_holdem" && (
            <div className="grid grid-cols-3 gap-2">
              <label className="text-sm text-white/70">Ciega chica
                <input type="number" value={ciegaChica} onChange={(e) => setCiegaChica(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl bg-white/10 p-3" /></label>
              <label className="text-sm text-white/70">Ciega grande
                <input type="number" value={ciegaGrande} onChange={(e) => setCiegaGrande(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl bg-white/10 p-3" /></label>
              <label className="text-sm text-white/70">
                {esPractica ? "Fichas" : "—"}
                <input type="number" value={fichas} onChange={(e) => setFichas(Number(e.target.value))}
                  disabled={!esPractica}
                  className="mt-1 w-full rounded-xl bg-white/10 p-3 disabled:opacity-40" /></label>
            </div>
          )}
          {juego === "blackjack" && esPractica && (
            <label className="text-sm text-white/70">Fichas iniciales
              <input type="number" value={fichas} onChange={(e) => setFichas(Number(e.target.value))}
                className="mt-1 w-full rounded-xl bg-white/10 p-3" /></label>
          )}
          <div className="flex gap-2">
            <button className="btn btn-gris flex-1" onClick={() => setCreando(false)}>Cancelar</button>
            <button className="btn btn-oro flex-1" onClick={crearMesa} disabled={cargando}>
              {cargando ? "Creando…" : "Crear"}
            </button>
          </div>
        </section>
      )}

      {error && (
        <div className="rounded-lg bg-red-900/50 px-3 py-2 text-center text-sm text-red-100">{error}</div>
      )}
    </div>
  );
}
