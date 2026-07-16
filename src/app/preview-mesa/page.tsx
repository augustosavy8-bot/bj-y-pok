"use client";

// Harness de QA visual para el rediseño de la mesa. Datos 100% simulados,
// no toca Supabase/hooks/lógica real. Temporal — se retira antes de mergear
// (ver nota en middleware.ts).

import { useMemo, useState } from "react";
import { MesaComunitaria } from "@/components/MesaComunitaria";
import { ControlesApuesta } from "@/components/ControlesApuesta";
import { Carta as CartaVisual, DorsoCarta } from "@/components/Carta";
import { FichasMonto, Ficha } from "@/components/Ficha";
import { SuperficieFieltro } from "@/components/mesa/SuperficieFieltro";
import { CamaraCrupier } from "@/components/mesa/CamaraCrupier";
import { ArcoJugadores } from "@/components/mesa/ArcoJugadores";
import { AsientoOtroJugador } from "@/components/mesa/AsientoOtroJugador";
import { AroTurno } from "@/components/mesa/AroTurno";
import { ManoBJ, ManoDealer } from "@/components/blackjack/ManoBJ";
import { TimerCircular } from "@/components/mesa/TimerCircular";
import { OverlayResultado } from "@/components/mesa/OverlayResultado";
import { LeyendaFieltro } from "@/components/mesa/LeyendaFieltro";
import { BotonSonido } from "@/components/mesa/BotonSonido";
import type { Carta, Jugador, Mano, Mesa } from "@/lib/types";
import type { BJCarta, BJManoJugador } from "@/lib/blackjack/types";

const MESA: Mesa = {
  id: "mesa-1",
  codigo_sala: "AB12CD",
  estado: "jugando",
  tipo_juego: "poker_holdem",
  ciega_chica: 5,
  ciega_grande: 10,
  fichas_iniciales: 1000,
  dealer_position: 1,
  es_practica: true,
  creditos_minimos: 0,
  created_at: new Date(0).toISOString(),
};

const JUGADORES: Jugador[] = [
  { id: "yo", mesa_id: "mesa-1", auth_uid: "u1", nombre: "Vos", fichas: 845, posicion: 0, estado: "activo", es_crupier: false, apuesta_ronda: 20, total_apostado_mano: 20, ha_actuado: true, total_comprado: 1000, created_at: "" },
  { id: "j2", mesa_id: "mesa-1", auth_uid: "u2", nombre: "Marina", fichas: 1120, posicion: 1, estado: "activo", es_crupier: false, apuesta_ronda: 20, total_apostado_mano: 20, ha_actuado: true, total_comprado: 1000, created_at: "" },
  { id: "j3", mesa_id: "mesa-1", auth_uid: "u3", nombre: "Diego", fichas: 0, posicion: 2, estado: "all_in", es_crupier: false, apuesta_ronda: 380, total_apostado_mano: 380, ha_actuado: true, total_comprado: 1000, created_at: "" },
  { id: "j4", mesa_id: "mesa-1", auth_uid: "u4", nombre: "Sole", fichas: 640, posicion: 3, estado: "fold", es_crupier: false, apuesta_ronda: 0, total_apostado_mano: 20, ha_actuado: true, total_comprado: 1000, created_at: "" },
  { id: "cr", mesa_id: "mesa-1", auth_uid: "u5", nombre: "Crupier", fichas: 0, posicion: 9, estado: "activo", es_crupier: true, apuesta_ronda: 0, total_apostado_mano: 0, ha_actuado: false, total_comprado: 0, created_at: "" },
];

const MANO: Mano = {
  id: "mano-1",
  mesa_id: "mesa-1",
  numero_mano: 14,
  fase: "flop",
  pozo: 440,
  apuesta_actual: 20,
  ultima_subida: 20,
  turno_jugador_id: "yo",
  ultimo_agresor_id: "j3",
  ganador_id: null,
  resultado: null,
  created_at: "",
};

const COMUNITARIAS: Carta[] = [
  { id: "c1", mano_id: "mano-1", valor: "A", palo: "picas", tipo: "comunitaria", jugador_id: null, orden_escaneo: 1, created_at: "" },
  { id: "c2", mano_id: "mano-1", valor: "K", palo: "corazones", tipo: "comunitaria", jugador_id: null, orden_escaneo: 2, created_at: "" },
  { id: "c3", mano_id: "mano-1", valor: "7", palo: "treboles", tipo: "comunitaria", jugador_id: null, orden_escaneo: 3, created_at: "" },
];

const MIS_CARTAS: Carta[] = [
  { id: "h1", mano_id: "mano-1", valor: "Q", palo: "diamantes", tipo: "hole", jugador_id: "yo", orden_escaneo: 1, created_at: "" },
  { id: "h2", mano_id: "mano-1", valor: "Q", palo: "picas", tipo: "hole", jugador_id: "yo", orden_escaneo: 2, created_at: "" },
];

function PokerJugador() {
  const yo = JUGADORES[0];
  const otros = JUGADORES.filter((j) => !j.es_crupier && j.id !== yo.id);
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-3 p-3 pb-10 lg:max-w-xl">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="text-sm text-white/60 underline">← Home</span>
          <div>
            <div className="text-[10px] text-white/50">Mesa</div>
            <div className="font-bold tracking-widest text-oro">{MESA.codigo_sala}</div>
          </div>
        </div>
        <div className="rounded-full bg-red-900/50 px-3 py-1 text-xs text-red-100">Salir</div>
      </header>

      <ArcoJugadores className="min-h-[104px] pt-2">
        {otros.map((j) => (
          <AsientoOtroJugador
            key={j.id}
            nombre={j.nombre}
            fichas={j.fichas}
            apuesta={j.apuesta_ronda}
            estado={j.estado}
            esTurno={MANO.turno_jugador_id === j.id}
            esDealer={MESA.dealer_position === j.posicion}
            holeCards={j.estado === "eliminado" ? 0 : 2}
          />
        ))}
      </ArcoJugadores>

      <SuperficieFieltro className="flex flex-col items-center gap-3 p-3">
        <CamaraCrupier activa />
        <MesaComunitaria mano={MANO} comunitarias={COMUNITARIAS} />
      </SuperficieFieltro>

      <AroTurno activo className="panel p-3">
        <div className="flex flex-col items-center gap-2">
          <div className="relative flex h-24 items-center justify-center">
            {MIS_CARTAS.map((c, i) => (
              <div key={c.id} className={i === 0 ? "-rotate-6 -mr-4" : "rotate-3"} style={{ zIndex: i }}>
                <CartaVisual valor={c.valor} palo={c.palo} size="lg" />
              </div>
            ))}
          </div>
          <div className="text-sm font-semibold text-crema">
            {yo.nombre} <span className="text-oro">(vos)</span>
          </div>
          <FichasMonto monto={yo.fichas} />
          <div className="flex items-center gap-1.5 text-xs text-oro/90">
            <Ficha monto={yo.apuesta_ronda} size={16} />
            apuesta: {yo.apuesta_ronda.toLocaleString("es")}
          </div>
        </div>
      </AroTurno>

      <ControlesApuesta jugador={yo} mesa={MESA} mano={MANO} onAccion={() => {}} enviando={false} />
    </main>
  );
}

function PokerCrupier() {
  const jugadoresMesa = JUGADORES.filter((j) => !j.es_crupier);
  return (
    <main className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-[1fr_380px]">
      <div className="flex flex-col gap-4">
        <header className="panel flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <div className="text-xs text-white/50">Mesa · Crupier</div>
            <div className="text-2xl font-bold tracking-widest text-oro">{MESA.codigo_sala}</div>
          </div>
        </header>

        <SuperficieFieltro className="flex flex-col items-center gap-3 p-3 sm:p-5">
          <CamaraCrupier activa etiqueta="Tu cámara (vista de los jugadores)" className="sm:aspect-[21/9]" />
          <MesaComunitaria mano={MANO} comunitarias={COMUNITARIAS} />
        </SuperficieFieltro>

        <section className="panel flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-gris">Reiniciar mano</button>
            <button className="btn btn-oro">Avanzar fase</button>
            <span className="ml-auto text-sm text-white/60">
              Mano #{MANO.numero_mano} · en juego
            </span>
          </div>
        </section>

        <section className="panel p-4">
          <h3 className="mb-3 font-semibold">Cartas de los jugadores</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {jugadoresMesa.map((j) => (
              <div
                key={j.id}
                className={`rounded-xl border border-white/10 bg-black/20 p-3 shadow-asiento ${
                  MANO.turno_jugador_id === j.id ? "ring-2 ring-oro animate-turn-pulse" : ""
                }`}
              >
                <div className="mb-2 truncate text-sm font-medium">{j.nombre}</div>
                <div className="flex gap-2.5">
                  <DorsoCarta size="sm" />
                  <DorsoCarta size="sm" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:h-fit">
        <div className="panel p-4 text-center text-sm text-white/60">
          Estación de escaneo (placeholder — requiere cámara real)
        </div>
        <div className="panel flex flex-col overflow-hidden">
          <div className="border-b border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white/60">
            Historial
          </div>
          <div className="flex-1 px-3 py-2">
            <div className="rounded-lg bg-white/5 px-3 py-1.5 text-sm">Diego fue all-in por 380</div>
          </div>
        </div>
      </div>
    </main>
  );
}

const BJ_DEALER_CARTAS: BJCarta[] = [
  { id: "d1", ronda_id: "r1", mano_jugador_id: null, es_carta_dealer: true, es_hole_card: false, revelada: true, valor: "9", palo: "corazones", orden_recibida: 1, created_at: "" },
];

function bjMano(id: string, cartas: [string, string][]): { mano: BJManoJugador; cartas: BJCarta[] } {
  const mano: BJManoJugador = {
    id,
    ronda_id: "r1",
    jugador_id: id,
    orden_asiento: 0,
    apuesta_fichas: 50,
    seguro_fichas: null,
    doblada: false,
    estado_mano: "jugando",
    es_split_de: null,
    orden_mano: 0,
    created_at: "",
  };
  const cs: BJCarta[] = cartas.map(([valor, palo], i) => ({
    id: `${id}-${i}`,
    ronda_id: "r1",
    mano_jugador_id: id,
    es_carta_dealer: false,
    es_hole_card: false,
    revelada: true,
    valor: valor as BJCarta["valor"],
    palo: palo as BJCarta["palo"],
    orden_recibida: i,
    created_at: "",
  }));
  return { mano, cartas: cs };
}

function BlackjackJugador() {
  const mia = bjMano("yo", [["K", "picas"], ["7", "diamantes"]]);
  const marina = bjMano("j2", [["10", "corazones"], ["8", "treboles"]]);
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-white/60 underline">← Home</span>
      </div>
      <header className="flex items-center justify-between">
        <div>
          <div className="text-xs text-white/50">Blackjack · {MESA.codigo_sala}</div>
          <div className="font-bold text-oro">Ronda #6 · turnos_jugadores</div>
        </div>
        <div className="flex items-center gap-2">
          <BotonSonido />
          <FichasMonto monto={845} />
        </div>
      </header>

      <SuperficieFieltro className="flex flex-col items-center gap-3 p-3">
        <CamaraCrupier activa />
        <ManoDealer cartas={BJ_DEALER_CARTAS} holeRevelada={false} />
        <LeyendaFieltro pago="3 A 2" limiteMin={5} limiteMax={500} />
      </SuperficieFieltro>

      <section className="flex flex-wrap justify-center gap-2">
        <div className="rounded-lg bg-black/20 px-2 py-1 text-center shadow-asiento">
          <div className="text-xs text-white/70">Marina</div>
          <ManoBJ cartas={marina.cartas} mano={marina.mano} size="sm" />
        </div>
      </section>

      <section className="panel flex flex-col items-center gap-2 p-3">
        <div className="text-xs uppercase tracking-wide text-white/50">Tu mano</div>
        <ManoBJ cartas={mia.cartas} mano={mia.mano} destacada />
      </section>

      <section className="panel flex flex-col gap-2 p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-oro">Tu turno</span>
          <TimerCircular restante={9} total={15} size={38}>
            <span className="text-xs font-bold tabular-nums text-white/70">9</span>
          </TimerCircular>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-verde">Pedir (hit)</button>
          <button className="btn btn-gris">Plantarse</button>
          <button className="btn btn-oro">Doblar</button>
          <button className="btn btn-oro">Split</button>
        </div>
      </section>
    </main>
  );
}

function BlackjackCrupier() {
  const marina = bjMano("j2", [["10", "corazones"], ["8", "treboles"]]);
  const diego = bjMano("j3", [["A", "picas"], ["9", "diamantes"]]);
  return (
    <main className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-[1fr_380px]">
      <div className="flex flex-col gap-4">
        <header className="panel flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <div className="text-xs text-white/50">Blackjack · Crupier</div>
            <div className="text-2xl font-bold tracking-widest text-oro">{MESA.codigo_sala}</div>
          </div>
          <div className="text-right text-sm">
            <div className="text-white/60">Banca de la ronda:</div>
            <div className="font-semibold">Sole</div>
          </div>
        </header>

        <SuperficieFieltro className="flex flex-col items-center gap-4 p-3 sm:p-4">
          <CamaraCrupier activa etiqueta="Tu cámara (vista de los jugadores)" className="sm:aspect-[21/9]" />
          <ManoDealer cartas={BJ_DEALER_CARTAS} holeRevelada={false} verHole />
          <div className="flex w-full flex-wrap justify-center gap-3">
            <div className="rounded-xl border border-white/10 bg-black/25 p-2 shadow-asiento">
              <div className="text-center text-xs text-white/70">Marina</div>
              <ManoBJ cartas={marina.cartas} mano={marina.mano} size="sm" />
            </div>
            <div className="rounded-xl border border-white/10 bg-black/25 p-2 shadow-asiento">
              <div className="text-center text-xs text-white/70">Diego</div>
              <ManoBJ cartas={diego.cartas} mano={diego.mano} size="sm" destacada />
            </div>
          </div>
        </SuperficieFieltro>

        <section className="panel flex flex-wrap items-center gap-2 p-4">
          <button className="btn btn-oro">Cerrar apuestas y repartir</button>
          <span className="ml-auto text-sm text-white/60">Estado: turnos_jugadores</span>
        </section>
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:h-fit">
        <section className="panel flex flex-col gap-2 p-4">
          <h3 className="font-semibold">Shoe</h3>
          <div className="text-sm text-white/70">Cartas repartidas: 62 / 312 (6 mazos)</div>
        </section>
        <div className="panel p-4 text-center text-sm text-white/60">
          Estación de escaneo (placeholder — requiere cámara real)
        </div>
      </div>
    </main>
  );
}

const VISTAS = {
  "poker-jugador": { label: "Poker · Jugador", Comp: PokerJugador },
  "poker-crupier": { label: "Poker · Crupier", Comp: PokerCrupier },
  "bj-jugador": { label: "Blackjack · Jugador", Comp: BlackjackJugador },
  "bj-crupier": { label: "Blackjack · Crupier", Comp: BlackjackCrupier },
} as const;

export default function PreviewMesa() {
  const [vista, setVista] = useState<keyof typeof VISTAS>("poker-jugador");
  const Comp = useMemo(() => VISTAS[vista].Comp, [vista]);
  return (
    <div>
      <div className="sticky top-0 z-50 flex flex-wrap gap-1 bg-black/80 p-2 backdrop-blur">
        {(Object.keys(VISTAS) as (keyof typeof VISTAS)[]).map((k) => (
          <button
            key={k}
            onClick={() => setVista(k)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              vista === k ? "bg-oro text-black" : "bg-white/10 text-white/70"
            }`}
          >
            {VISTAS[k].label}
          </button>
        ))}
      </div>
      <Comp />
    </div>
  );
}
