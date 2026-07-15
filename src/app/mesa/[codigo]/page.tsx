"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMesa } from "@/lib/useMesa";
import { useIdentidad } from "@/lib/useIdentidad";
import { claveJugadorLocal } from "@/lib/utils";
import { MesaComunitaria } from "@/components/MesaComunitaria";
import { ControlesApuesta } from "@/components/ControlesApuesta";
import { HistorialAcciones } from "@/components/HistorialAcciones";
import { VistaJugadorBlackjack } from "@/components/blackjack/VistaJugadorBlackjack";
import { SaldoBadge } from "@/components/SaldoBadge";
import { Carta as CartaVisual, DorsoCarta } from "@/components/Carta";
import { FichasMonto, Ficha } from "@/components/Ficha";
import { SuperficieFieltro } from "@/components/mesa/SuperficieFieltro";
import { CamaraCrupier } from "@/components/mesa/CamaraCrupier";
import { ArcoJugadores } from "@/components/mesa/ArcoJugadores";
import { AsientoOtroJugador } from "@/components/mesa/AsientoOtroJugador";
import { AroTurno } from "@/components/mesa/AroTurno";
import type { TipoAccion } from "@/lib/types";

export default function VistaJugador() {
  const codigo = (useParams().codigo as string).toUpperCase();
  const { userId: authUid, jugadorId, refrescar: refrescarIdent } = useIdentidad(codigo);
  const [uniendo, setUniendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [saldoKey, setSaldoKey] = useState(0);

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
  const otrosJugadores = useMemo(
    () =>
      jugadores
        .filter((j) => !j.es_crupier && j.id !== yo?.id)
        .sort((a, b) => a.posicion - b.posicion),
    [jugadores, yo]
  );

  async function unirse() {
    setUniendo(true);
    setError(null);
    try {
      // El nombre y la identidad los toma el server del perfil/sesión.
      const res = await fetch(`/api/mesa/${codigo}/unirse`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "No se pudo entrar");
      localStorage.setItem(claveJugadorLocal(codigo), data.jugador.id);
      setSaldoKey((k) => k + 1); // el buy-in bajó el saldo
      await refrescarIdent(); // ahora mi-jugador devuelve el asiento
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setUniendo(false);
    }
  }

  async function salirDeMesa() {
    if (!confirm("¿Salir de la mesa? Tus fichas vuelven a tus créditos.")) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/mesa/${codigo}/salir`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "No se pudo salir.");
        return;
      }
      setSaldoKey((k) => k + 1);
      window.location.href = "/home";
    } finally {
      setEnviando(false);
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
        <div className="flex items-center justify-between">
          <a href="/home" className="text-sm text-white/60 underline">← Home</a>
          <SaldoBadge refreshKey={saldoKey} />
        </div>
        <h1 className="text-center text-2xl font-bold text-oro">Mesa {codigo}</h1>
        <div className="panel flex flex-col gap-3 p-5">
          {!mesa.es_practica && mesa.creditos_minimos > 0 && (
            <p className="text-center text-sm text-white/70">
              Buy-in: <b className="text-oro">{mesa.creditos_minimos}</b> créditos
            </p>
          )}
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

  const esMiTurno = mano?.turno_jugador_id === yo.id && yo.estado === "activo";
  const misCartasOrdenadas = [...misCartas].sort((a, b) => a.orden_escaneo - b.orden_escaneo);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-3 p-3 pb-28 lg:max-w-xl">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <a href="/home" className="text-sm text-white/60 underline">← Home</a>
          <div>
            <div className="text-[10px] text-white/50">Mesa</div>
            <div className="font-bold tracking-widest text-oro">{codigo}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SaldoBadge refreshKey={saldoKey} />
          <button
            className="rounded-full bg-red-900/50 px-3 py-1 text-xs text-red-100 hover:bg-red-900/80"
            disabled={enviando}
            onClick={salirDeMesa}
          >
            Salir
          </button>
        </div>
      </header>

      {/* Zona superior: arco de los demás jugadores */}
      <ArcoJugadores className="min-h-[104px] pt-2">
        {otrosJugadores.map((j) => {
          const susCartas = cartas.filter((c) => c.tipo === "hole" && c.jugador_id === j.id);
          return (
            <AsientoOtroJugador
              key={j.id}
              nombre={j.nombre}
              fichas={j.fichas}
              apuesta={j.apuesta_ronda}
              estado={j.estado}
              esTurno={mano?.turno_jugador_id === j.id}
              esDealer={mesa.dealer_position === j.posicion}
              holeCards={j.estado === "eliminado" ? 0 : 2}
              cartasReveladas={
                susCartas.length > 0 && susCartas.every((c) => c.valor && c.palo)
                  ? susCartas.sort((a, b) => a.orden_escaneo - b.orden_escaneo)
                  : undefined
              }
            />
          );
        })}
      </ArcoJugadores>

      {/* Zona central: cámara del crupier + fieltro con comunitarias y pozo */}
      <SuperficieFieltro className="flex flex-col items-center gap-3 p-3">
        <CamaraCrupier activa={mesa.estado === "jugando"} />
        <MesaComunitaria mano={mano} comunitarias={comunitarias} />
      </SuperficieFieltro>

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

      {/* Zona inferior: mi asiento */}
      <AroTurno activo={!!esMiTurno} className="panel p-3">
        <div className="flex flex-col items-center gap-2">
          <div className="relative flex h-24 items-center justify-center">
            {misCartasOrdenadas.length > 0 ? (
              misCartasOrdenadas.map((c, i) => (
                <div
                  key={c.id}
                  className={i === 0 ? "-rotate-6 -mr-4" : "rotate-3"}
                  style={{ zIndex: i }}
                >
                  <CartaVisual valor={c.valor} palo={c.palo} size="lg" nueva />
                </div>
              ))
            ) : (
              <>
                <div className="-rotate-6 -mr-4">
                  <DorsoCarta size="lg" />
                </div>
                <div className="rotate-3">
                  <DorsoCarta size="lg" />
                </div>
              </>
            )}
          </div>
          <div className="text-sm font-semibold text-crema">
            {yo.nombre} <span className="text-oro">(vos)</span>
          </div>
          <FichasMonto monto={yo.fichas} />
          {yo.apuesta_ronda > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-oro/90">
              <Ficha monto={yo.apuesta_ronda} size={16} />
              apuesta: {yo.apuesta_ronda.toLocaleString("es")}
            </div>
          )}
        </div>
      </AroTurno>

      {mano && mano.fase !== "terminada" && (
        <ControlesApuesta
          jugador={yo}
          mesa={mesa}
          mano={mano}
          onAccion={actuar}
          enviando={enviando}
        />
      )}

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
