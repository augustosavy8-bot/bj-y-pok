"use client";

import { useState } from "react";
import type { Carta, Valor, Palo } from "@/lib/types";
import { VALORES, PALOS } from "@/lib/types";
import { Carta as CartaVisual } from "@/components/Carta";
import { SIMBOLO_PALO, esPaloRojo } from "@/lib/poker/cards";

// Carta con botón discreto de edición (para la vista crupier).
// En tablet el ícono siempre está visible; en desktop aparece al hover.
export function CartaEditable({
  carta,
  size = "sm",
  onEditar,
}: {
  carta: Carta;
  size?: "sm" | "md" | "lg";
  onEditar: (c: Carta) => void;
}) {
  return (
    <div className="group relative">
      <CartaVisual valor={carta.valor} palo={carta.palo} size={size} />
      <button
        type="button"
        onClick={() => onEditar(carta)}
        title="Corregir carta"
        aria-label="Corregir carta"
        className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/80 text-xs text-white shadow ring-1 ring-white/30 transition opacity-100 hover:bg-oro hover:text-black lg:opacity-0 lg:group-hover:opacity-100"
      >
        ✎
      </button>
    </div>
  );
}

// Modal para corregir el valor/palo de una carta ya asignada.
export function ModalCorregirCarta({
  carta,
  codigo,
  authUid,
  onClose,
  onGuardado,
}: {
  carta: Carta;
  codigo: string;
  authUid: string;
  onClose: () => void;
  onGuardado: (mensaje: string) => void;
}) {
  const [valor, setValor] = useState<Valor>(carta.valor);
  const [palo, setPalo] = useState<Palo>(carta.palo);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch("/api/carta/corregir", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          auth_uid: authUid,
          carta_id: carta.id,
          nuevo_valor: valor,
          nuevo_palo: palo,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "No se pudo corregir la carta.");
        return;
      }
      onGuardado("Carta corregida");
      onClose();
    } catch {
      setError("Error de red.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="panel flex w-full max-w-sm flex-col gap-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Corregir carta</h3>
          <span className="text-xs text-white/50">
            {carta.tipo === "hole" ? "Carta privada" : "Comunitaria"}
          </span>
        </div>

        <div className="flex items-center justify-center gap-4">
          <div className="text-center">
            <div className="mb-1 text-xs text-white/50">Antes</div>
            <CartaVisual valor={carta.valor} palo={carta.palo} size="md" />
          </div>
          <div className="text-2xl text-white/40">→</div>
          <div className="text-center">
            <div className="mb-1 text-xs text-white/50">Ahora</div>
            <CartaVisual valor={valor} palo={palo} size="md" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            Valor
            <select
              className="mt-1 w-full rounded-lg bg-white/10 p-2"
              value={valor}
              onChange={(e) => setValor(e.target.value as Valor)}
            >
              {VALORES.map((v) => (
                <option key={v} value={v} className="text-black">
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Palo
            <select
              className="mt-1 w-full rounded-lg bg-white/10 p-2"
              value={palo}
              onChange={(e) => setPalo(e.target.value as Palo)}
            >
              {PALOS.map((p) => (
                <option key={p} value={p} className="text-black">
                  {p} {SIMBOLO_PALO[p]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Vista rápida de palos */}
        <div className="flex justify-center gap-2">
          {PALOS.map((p) => (
            <button
              key={p}
              onClick={() => setPalo(p)}
              className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg ${
                palo === p ? "bg-oro text-black" : "bg-white/10"
              } ${esPaloRojo(p) && palo !== p ? "text-red-400" : ""}`}
            >
              {SIMBOLO_PALO[p]}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-lg bg-red-900/50 px-3 py-2 text-sm text-red-100">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-gris" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
          <button className="btn btn-oro" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar cambio"}
          </button>
        </div>
      </div>
    </div>
  );
}
