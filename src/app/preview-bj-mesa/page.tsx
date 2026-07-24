"use client";

import { Carta, DorsoCarta } from "@/components/Carta";
import { Ficha } from "@/components/Ficha";

// Maqueta estática de la mesa de blackjack semicircular (aspecto de mesa real).
// No usa datos reales: es para validar la dirección visual antes de implementarla
// en VistaJugadorBlackjack. Paleta club privado (fieltro + oro).

function BadgeValor({ v, className = "" }: { v: string; className?: string }) {
  return (
    <span
      className={`inline-flex min-w-[30px] items-center justify-center rounded-md bg-black/80 px-2 py-0.5 text-sm font-bold tabular-nums text-crema shadow ${className}`}
    >
      {v}
    </span>
  );
}

function PilaFichas({ monto }: { monto: number }) {
  return (
    <div className="relative h-7 w-9">
      <div className="absolute left-1 top-2"><Ficha monto={monto} size={26} /></div>
      <div className="absolute left-0.5 top-1"><Ficha monto={monto} size={26} /></div>
      <div className="absolute left-0 top-0"><Ficha monto={monto} size={26} /></div>
    </div>
  );
}

function SpotOtro({
  nombre,
  fichas,
  valor,
  apuesta,
  cartas,
  className = "",
}: {
  nombre: string;
  fichas: number;
  valor: string;
  apuesta: number;
  cartas: [React.ReactNode, React.ReactNode];
  className?: string;
}) {
  return (
    <div className={`absolute flex w-40 flex-col items-center gap-1 ${className}`}>
      {/* Cartas encimadas */}
      <div className="relative flex h-16 items-center justify-center">
        <div className="-mr-3 -rotate-6">{cartas[0]}</div>
        <div className="rotate-6">{cartas[1]}</div>
        <BadgeValor v={valor} className="absolute -top-2" />
      </div>
      {/* Spot delineado con ficha de apuesta */}
      <div className="relative flex h-12 w-24 items-center justify-center rounded-[50%] border border-dashed border-oro/40 bg-black/15">
        <PilaFichas monto={apuesta} />
        <span className="absolute -bottom-1 rounded bg-black/60 px-1.5 text-[10px] font-semibold tabular-nums text-crema">
          {apuesta}
        </span>
      </div>
      <div className="text-center leading-tight">
        <div className="text-sm font-semibold text-crema">{nombre}</div>
        <div className="text-xs tabular-nums text-crema/60">{fichas.toLocaleString("es")}</div>
      </div>
    </div>
  );
}

export default function PreviewBJMesa() {
  return (
    <main className="min-h-screen bg-[#0b0b0d] px-4 py-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-4 text-center text-sm text-white/40">
          Maqueta — mesa de blackjack semicircular (validación de dirección)
        </h1>

        {/* Mesa: semi-óvalo de fieltro con riel de madera */}
        <div
          className="relative mx-auto"
          style={{ maxWidth: 860, aspectRatio: "860 / 620" }}
        >
          <div
            className="fieltro absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 70% 60% at 50% 30%, #176b41 0%, #0f3d2e 52%, #0a2a20 100%)",
              borderRadius: "46% 46% 48% 48% / 20% 20% 74% 74%",
              border: "12px solid #241a12",
              boxShadow: "inset 0 0 100px rgba(0,0,0,0.6), 0 12px 40px rgba(0,0,0,0.5)",
            }}
          />

          {/* Zona dealer (arriba-centro): mano + valor */}
          <div className="absolute left-1/2 top-[5%] flex -translate-x-1/2 flex-col items-center gap-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-crema/50">
              Dealer
            </div>
            <div className="relative flex items-center justify-center">
              <div className="-mr-3 -rotate-3"><Carta valor="10" palo="corazones" size="md" /></div>
              <div className="rotate-3"><DorsoCarta size="md" /></div>
              <BadgeValor v="10" className="absolute -top-2.5" />
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-crema/50">
              Dealer
            </div>
          </div>

          {/* Leyenda impresa en el fieltro */}
          <div className="absolute left-1/2 top-[40%] w-full -translate-x-1/2 text-center">
            <div className="text-[13px] font-bold uppercase tracking-[0.2em] text-crema/25">
              Blackjack paga 3 a 2
            </div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-crema/15">
              La banca planta en 17 · El seguro paga 2 a 1
            </div>
          </div>

          {/* Spots de otros jugadores en arco */}
          <SpotOtro
            className="left-[6%] top-[46%]"
            nombre="Marina"
            fichas={1120}
            valor="18"
            apuesta={50}
            cartas={[
              <Carta key="a" valor="10" palo="corazones" size="sm" />,
              <Carta key="b" valor="8" palo="treboles" size="sm" />,
            ]}
          />
          <SpotOtro
            className="right-[6%] top-[46%]"
            nombre="Diego"
            fichas={640}
            valor="20"
            apuesta={100}
            cartas={[
              <Carta key="a" valor="K" palo="picas" size="sm" />,
              <Carta key="b" valor="10" palo="diamantes" size="sm" />,
            ]}
          />

          {/* Mi asiento (centro-abajo, destacado con aro dorado) */}
          <div className="absolute bottom-[3%] left-1/2 flex w-56 -translate-x-1/2 flex-col items-center gap-1">
            <div className="relative flex items-end justify-center">
              <div className="-mr-4 -rotate-6"><Carta valor="K" palo="picas" size="lg" /></div>
              <div className="rotate-6"><Carta valor="7" palo="diamantes" size="lg" /></div>
              <BadgeValor v="17" className="absolute -top-3 !text-base" />
            </div>
            <div className="relative mt-1 flex h-14 w-32 items-center justify-center rounded-[50%] border-2 border-oro/70 bg-oro/10 shadow-[0_0_18px_rgba(224,182,77,0.25)]">
              <PilaFichas monto={50} />
              <span className="absolute -bottom-1 rounded bg-black/70 px-1.5 text-[11px] font-semibold tabular-nums text-oro">
                50
              </span>
            </div>
            <div className="text-center leading-tight">
              <div className="text-base font-bold text-oro">Vos</div>
              <div className="text-sm tabular-nums text-crema/70">845 fichas</div>
            </div>
          </div>
        </div>

        {/* Barra inferior: selector de fichas + acciones */}
        <div className="mx-auto mt-4 flex max-w-md flex-col gap-3">
          <div className="flex items-center justify-center gap-3">
            {[5, 25, 100, 500].map((d, i) => (
              <button
                key={d}
                className={`rounded-full transition ${i === 1 ? "-translate-y-1 ring-2 ring-oro" : "opacity-80 hover:opacity-100"}`}
                style={{ borderRadius: "50%" }}
              >
                <Ficha monto={d} size={40} />
              </button>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2">
            <button className="btn btn-verde">Pedir</button>
            <button className="btn btn-gris">Plantarse</button>
            <button className="btn btn-oro">Doblar</button>
            <button className="btn btn-oro">Split</button>
          </div>
          <button className="btn btn-gris">Rebet 50</button>
        </div>
      </div>
    </main>
  );
}
