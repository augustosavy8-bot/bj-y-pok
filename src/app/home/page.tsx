"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser, usuarioActualId, cerrarSesion } from "@/lib/supabase/client";

export default function HomePage() {
  const router = useRouter();
  const [modo, setModo] = useState<"inicio" | "crear">("inicio");
  const [tipoJuego, setTipoJuego] = useState<"poker_holdem" | "blackjack">("poker_holdem");
  const [esPractica, setEsPractica] = useState(true);
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [ciegaChica, setCiegaChica] = useState(10);
  const [ciegaGrande, setCiegaGrande] = useState(20);
  const [fichas, setFichas] = useState(1000);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [esAdmin, setEsAdmin] = useState(false);
  const [miNombre, setMiNombre] = useState<string>("");

  useEffect(() => {
    (async () => {
      const uid = await usuarioActualId();
      if (!uid) return;
      const supabase = getSupabaseBrowser();
      const { data } = await supabase
        .from("perfiles")
        .select("rol, nombre")
        .eq("id", uid)
        .maybeSingle();
      if (data) {
        setEsAdmin((data as { rol: string }).rol === "admin");
        setMiNombre((data as { nombre: string }).nombre ?? "");
      }
    })();
  }, []);

  async function crearMesa() {
    setCargando(true);
    setError(null);
    try {
      // La identidad va por la cookie de sesión; no se manda auth_uid.
      const res = await fetch("/api/mesa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nombre_crupier: nombre || miNombre || "Crupier",
          tipo_juego: tipoJuego,
          es_practica: esPractica,
          ciega_chica: ciegaChica,
          ciega_grande: ciegaGrande,
          fichas_iniciales: fichas,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "No se pudo crear la mesa");
      router.push(`/mesa/${data.codigo_sala}/crupier`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setCargando(false);
    }
  }

  function entrar() {
    const c = codigo.trim().toUpperCase();
    if (c.length !== 6) {
      setError("El código tiene 6 caracteres.");
      return;
    }
    router.push(`/mesa/${c}`);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <div className="flex items-center justify-between text-sm">
        <span className="text-white/60">{miNombre && `Hola, ${miNombre}`}</span>
        <div className="flex gap-3">
          {esAdmin && (
            <a href="/admin" className="text-oro underline">Admin</a>
          )}
          <button className="text-white/60 underline" onClick={cerrarSesion}>Salir</button>
        </div>
      </div>

      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-oro">♠ Mesa de Poker ♥</h1>
        <p className="mt-2 text-white/70">Poker &amp; Blackjack con crupier real</p>
      </div>

      {modo === "inicio" && (
        <div className="flex flex-col gap-4">
          <div className="panel flex flex-col gap-3 p-5">
            <h2 className="font-semibold">Entrar a una mesa</h2>
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              maxLength={6}
              placeholder="CÓDIGO"
              className="rounded-xl bg-white/10 p-3 text-center text-2xl tracking-[0.4em] uppercase placeholder:tracking-normal placeholder:text-white/40"
            />
            <button className="btn btn-oro" onClick={entrar}>Entrar como jugador</button>
          </div>
          <button className="btn btn-verde" onClick={() => setModo("crear")}>
            Soy el crupier — crear mesa
          </button>
        </div>
      )}

      {modo === "crear" && (
        <div className="panel flex flex-col gap-3 p-5">
          <h2 className="font-semibold">Crear mesa (crupier)</h2>
          <div>
            <div className="mb-1 text-sm text-white/70">¿Qué juego?</div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setTipoJuego("poker_holdem")}
                className={`btn ${tipoJuego === "poker_holdem" ? "btn-oro" : "btn-gris"}`}>
                ♠ Poker Hold&apos;em
              </button>
              <button type="button" onClick={() => setTipoJuego("blackjack")}
                className={`btn ${tipoJuego === "blackjack" ? "btn-oro" : "btn-gris"}`}>
                🂡 Blackjack
              </button>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-white/80">
            <input type="checkbox" checked={esPractica}
              onChange={(e) => setEsPractica(e.target.checked)} />
            Mesa de práctica (sin crédito real; permite jugadores de prueba)
          </label>
          <label className="text-sm text-white/70">
            Tu nombre
            <input value={nombre} onChange={(e) => setNombre(e.target.value)}
              placeholder={miNombre || "Crupier"}
              className="mt-1 w-full rounded-xl bg-white/10 p-3" />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-sm text-white/70">
              Ciega chica
              <input type="number" value={ciegaChica}
                onChange={(e) => setCiegaChica(Number(e.target.value))}
                className="mt-1 w-full rounded-xl bg-white/10 p-3" />
            </label>
            <label className="text-sm text-white/70">
              Ciega grande
              <input type="number" value={ciegaGrande}
                onChange={(e) => setCiegaGrande(Number(e.target.value))}
                className="mt-1 w-full rounded-xl bg-white/10 p-3" />
            </label>
            <label className="text-sm text-white/70">
              Fichas
              <input type="number" value={fichas}
                onChange={(e) => setFichas(Number(e.target.value))}
                className="mt-1 w-full rounded-xl bg-white/10 p-3" />
            </label>
          </div>
          <button className="btn btn-oro" onClick={crearMesa} disabled={cargando}>
            {cargando ? "Creando…" : "Crear mesa"}
          </button>
          <button className="text-sm text-white/50 underline" onClick={() => setModo("inicio")}>
            Volver
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-900/50 px-3 py-2 text-center text-sm text-red-100">
          {error}
        </div>
      )}
    </main>
  );
}
