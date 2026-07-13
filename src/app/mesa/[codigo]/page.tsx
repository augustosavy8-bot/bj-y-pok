"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMesa } from "@/lib/useMesa";
import { useIdentidad } from "@/lib/useIdentidad";
import { claveJugadorLocal } from "@/lib/utils";
import { MesaComunitaria } from "@/components/MesaComunitaria";
import { ListaJugadores } from "@/components/ListaJugadores";
import { ControlesApuesta } from "@/components/ControlesApuesta";
import { HistorialAcciones } from "@/components/HistorialAcciones";
import { VistaJugadorBlackjack } from "@/components/blackjack/VistaJugadorBlackjack";
import { Carta as CartaVisual, DorsoCarta } from "@/components/Carta";
import type { TipoAccion } from "@/lib/types";

export default function VistaJugador() {
  const codigo = (useParams().codigo as string).toUpperCase();
  const { userId: authUid, jugadorId, refrescar: refrescarIdent } = useIdentidad(codigo);
  const [nombre, setNombre] = useState("");
  const [uniendo, setUniendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const { mesa, jugadores, mano, cartas, acciones, cargando } = useMesa(codigo);

  // Drawer de historial + badge de acciones nuevas desde la última apertura.
  const [drawerAbierto, setDrawerAbierto] = useState(false);
  const [vistas, setVistas] = useState(0);
  const badge = drawerAbierto ? 0 : Math.max(0, acciones.length - vistas);

  useEffect(() => {
    // Nueva mano → reiniciar el conteo del badge.
    setVistas(0);
  }, [mano?.id]);

  useEffect(() => {
    if (drawerAbierto) setVistas(acciones.length);
  }, [drawerAbierto, acciones.length]);

  const yo = useMemo(
    () => jugadores.find((j) => j.id === jugadorId && !j.es_crupier),
    [jugadores, jugadorId]
  );

  const misCartas = useMemo(
    () => cartas.filter((c) => c.tipo === "hole" && c.jugador_id === yo?.id),
    [cartas, yo]
  );
  const comunitarias = useMemo(
    () => cartas.filter((c) => c.tipo === "comunitaria"),
    [cartas]
  );

  async function unirse() {
    if (!nombre.trim()) return;
    setUniendo(true);
    setError(null);
    try {
      const res = await fetch(`/api/mesa/${codigo}/unirse`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nombre: nombre.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "No se pudo entrar");
      localStorage.setItem(claveJugadorLocal(codigo), data.jugador.id);
      await refrescarIdent(); // ahora mi-jugador devuelve el asiento
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setUniendo(false);
    }
  }

  async function actuar(tipo: TipoAccion, monto?: number) {
    if (!yo || !authUid) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/mesa/${codigo}/accion`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          auth_uid: authUid,
          jugador_id: yo.id,
          tipo,
          monto: monto ?? 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data?.error ?? "Acción rechazada");
    } catch {
      setError("Error de red");
    } finally {
      setEnviando(false);
    }
  }

  if (cargando && !mesa) {
    return <Centrado>Cargando mesa…</Centrado>;
  }
  if (!mesa) {
    return <Centrado>No existe la mesa {codigo}.</Centrado>;
  }

  // Pantalla de ingreso (todavía no se unió).
  if (!yo) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
        <h1 className="text-center text-2xl font-bold text-oro">
          Mesa {codigo}
        </h1>
        <div className="panel flex flex-col gap-3 p-5">
          <label className="text-sm text-white/70">
            Tu nombre
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre"
              className="mt-1 w-full rounded-xl bg-white/10 p-3"
            />
          </label>
          <button className="btn btn-oro" onClick={unirse} disabled={uniendo}>
            {uniendo ? "Entrando…" : "Sentarme a la mesa"}
          </button>
          {mesa.estado !== "esperando" && (
            <p className="text-center text-xs text-white/50">
              La partida ya empezó. Si ya tenías asiento, se recuperará solo.
            </p>
          )}
        </div>
        {error && <ErrorBox>{error}</ErrorBox>}
      </main>
    );
  }

  // Blackjack usa su propia vista (el ingreso/join es compartido).
  if (mesa.tipo_juego === "blackjack") {
    return (
      <VistaJugadorBlackjack codigo={codigo} authUid={authUid ?? ""} yoId={yo.id} />
    );
  }

  const resultado = mano?.resultado;
  const ganadorNombre = resultado
    ? jugadores.find((j) => resultado.botes[0]?.ganadores.includes(j.id))?.nombre
    : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-4 pb-24">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-xs text-white/50">Mesa</div>
          <div className="font-bold tracking-widest text-oro">{codigo}</div>
        </div>
        <div className="text-right text-sm text-white/70">
          {jugadores.filter((j) => !j.es_crupier).length} jugadores
        </div>
      </header>

      <section className="panel p-4">
        <MesaComunitaria mano={mano} comunitarias={comunitarias} />
      </section>

      {/* Mis cartas */}
      <section className="flex flex-col items-center gap-2">
        <div className="text-xs uppercase tracking-wide text-white/50">Tus cartas</div>
        <div className="flex gap-3">
          {misCartas.length > 0 ? (
            misCartas
              .sort((a, b) => a.orden_escaneo - b.orden_escaneo)
              .map((c) => (
                <CartaVisual key={c.id} valor={c.valor} palo={c.palo} size="lg" nueva />
              ))
          ) : (
            <>
              <DorsoCarta size="lg" />
              <DorsoCarta size="lg" />
            </>
          )}
        </div>
      </section>

      {mano && mano.fase !== "terminada" && (
        <ControlesApuesta
          jugador={yo}
          mesa={mesa}
          mano={mano}
          onAccion={actuar}
          enviando={enviando}
        />
      )}

      {mano?.fase === "terminada" && (
        <div className="panel p-4 text-center">
          <div className="text-oro font-bold">Mano terminada</div>
          {ganadorNombre && (
            <div className="mt-1 text-sm">
              Ganó <b>{ganadorNombre}</b>
              {resultado?.botes[0]?.descripcion
                ? ` — ${resultado.botes[0].descripcion}`
                : ""}
            </div>
          )}
          <div className="mt-1 text-xs text-white/50">
            Esperando al crupier para la próxima mano…
          </div>
        </div>
      )}

      <section>
        <div className="mb-2 text-xs uppercase tracking-wide text-white/50">
          Jugadores
        </div>
        <ListaJugadores jugadores={jugadores} mesa={mesa} mano={mano} miId={yo.id} />
      </section>

      {error && <ErrorBox>{error}</ErrorBox>}

      {/* Drawer de historial (colapsable desde abajo) */}
      <DrawerHistorial
        abierto={drawerAbierto}
        badge={badge}
        onToggle={() => setDrawerAbierto((v) => !v)}
      >
        <HistorialAcciones
          manoId={mano?.id ?? null}
          jugadores={jugadores}
          comunitarias={comunitarias}
          fase={mano?.fase ?? null}
          resultado={mano?.resultado ?? null}
          className="h-[52vh] border-0 !bg-transparent"
        />
      </DrawerHistorial>
    </main>
  );
}

function DrawerHistorial({
  abierto,
  badge,
  onToggle,
  children,
}: {
  abierto: boolean;
  badge: number;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      {abierto && (
        <div
          className="fixed inset-0 z-30 bg-black/40"
          onClick={onToggle}
          aria-hidden
        />
      )}
      <div
        className={`fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md transform transition-transform duration-300 ${
          abierto ? "translate-y-0" : "translate-y-[calc(100%-3.5rem)]"
        }`}
      >
        <button
          onClick={onToggle}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-t-2xl border-t border-white/10 bg-fieltro-dark/95 font-semibold backdrop-blur"
        >
          <span className="text-white/50">{abierto ? "▾" : "▴"}</span>
          Historial de la mano
          {!abierto && badge > 0 && (
            <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-oro px-1.5 text-xs font-bold text-black">
              {badge}
            </span>
          )}
        </button>
        <div className="max-h-[60vh] overflow-hidden bg-fieltro-dark/95 backdrop-blur">
          {children}
        </div>
      </div>
    </>
  );
}

function Centrado({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-center text-white/70">
      {children}
    </div>
  );
}
function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-red-900/50 px-3 py-2 text-center text-sm text-red-100">
      {children}
    </div>
  );
}
