"use client";

import { useState } from "react";
import type { BJConfig } from "@/lib/blackjack/types";

const TIP: Record<string, string> = {
  cantidad_mazos: "Cuántos mazos hay en el shoe (se baraja con RNG y rebaraja solo al 75%).",
  soft_17_regla: "Qué hace el dealer con 17 blando (As+6). 'Se planta' es más favorable al jugador.",
  blackjack_pago: "Cuánto paga un blackjack natural. 3:2 (1.5x) es lo clásico; 6:5 (1.2x) favorece a la banca.",
  permite_double_after_split: "Permitir doblar después de un split.",
  permite_surrender: "Permitir rendirse (perder solo la mitad) antes de pedir carta.",
  permite_insurance: "Ofrecer seguro cuando el dealer muestra un As.",
  max_split_hands: "Máximo de manos que puede generar un jugador por splits.",
  apuesta_min: "Apuesta mínima por mano.",
  apuesta_max: "Apuesta máxima por mano.",
  segundos_por_turno: "Segundos para decidir antes del auto-plante.",
};

function Campo({ label, tip, children }: { label: string; tip: string; children: React.ReactNode }) {
  return (
    <label className="text-sm">
      <span className="flex items-center gap-1 text-tinta/80" title={tip}>
        {label} <span className="text-tinta/40">ⓘ</span>
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function ConfigBlackjack({
  codigo,
  authUid,
  config,
}: {
  codigo: string;
  authUid: string;
  config: BJConfig | null;
}) {
  const [f, setF] = useState({
    cantidad_mazos: config?.cantidad_mazos ?? 6,
    soft_17_regla: config?.soft_17_regla ?? "dealer_para",
    blackjack_pago: config?.blackjack_pago ?? "3_a_2",
    permite_double_after_split: config?.permite_double_after_split ?? true,
    permite_surrender: config?.permite_surrender ?? true,
    permite_insurance: config?.permite_insurance ?? true,
    max_split_hands: config?.max_split_hands ?? 4,
    apuesta_min: config?.apuesta_min ?? 10,
    apuesta_max: config?.apuesta_max ?? 500,
    segundos_por_turno: config?.segundos_por_turno ?? 30,
  });
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF((prev) => ({ ...prev, [k]: v }));
  }

  async function guardar() {
    setGuardando(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/blackjack/${codigo}/configurar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ auth_uid: authUid, ...f }),
      });
      const data = await res.json();
      setMsg(res.ok ? "Configuración guardada ✓" : data?.error ?? "Error");
    } catch {
      setMsg("Error de red");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="ncard flex flex-col gap-3 border border-white/[0.06] p-4">
      <h3 className="font-medium">Configuración de blackjack</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Campo label="Mazos" tip={TIP.cantidad_mazos}>
          <input type="number" min={1} max={8} value={f.cantidad_mazos}
            onChange={(e) => set("cantidad_mazos", Number(e.target.value))} className="ninput" />
        </Campo>
        <Campo label="Soft 17" tip={TIP.soft_17_regla}>
          <select value={f.soft_17_regla}
            onChange={(e) => set("soft_17_regla", e.target.value as typeof f.soft_17_regla)} className="ninput">
            <option value="dealer_para" className="text-black">Dealer se planta</option>
            <option value="dealer_pide" className="text-black">Dealer pide</option>
          </select>
        </Campo>
        <Campo label="Pago blackjack" tip={TIP.blackjack_pago}>
          <select value={f.blackjack_pago}
            onChange={(e) => set("blackjack_pago", e.target.value as typeof f.blackjack_pago)} className="ninput">
            <option value="3_a_2" className="text-black">3 a 2 (1.5x)</option>
            <option value="6_a_5" className="text-black">6 a 5 (1.2x)</option>
          </select>
        </Campo>
        <Campo label="Máx. manos de split" tip={TIP.max_split_hands}>
          <input type="number" min={1} max={4} value={f.max_split_hands}
            onChange={(e) => set("max_split_hands", Number(e.target.value))} className="ninput" />
        </Campo>
        <Campo label="Apuesta mín." tip={TIP.apuesta_min}>
          <input type="number" min={1} value={f.apuesta_min}
            onChange={(e) => set("apuesta_min", Number(e.target.value))} className="ninput" />
        </Campo>
        <Campo label="Apuesta máx." tip={TIP.apuesta_max}>
          <input type="number" min={1} value={f.apuesta_max}
            onChange={(e) => set("apuesta_max", Number(e.target.value))} className="ninput" />
        </Campo>
        <Campo label="Segundos/turno" tip={TIP.segundos_por_turno}>
          <input type="number" min={5} value={f.segundos_por_turno}
            onChange={(e) => set("segundos_por_turno", Number(e.target.value))} className="ninput" />
        </Campo>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2" title={TIP.permite_double_after_split}>
          <input type="checkbox" checked={f.permite_double_after_split}
            onChange={(e) => set("permite_double_after_split", e.target.checked)} />
          Double after split
        </label>
        <label className="flex items-center gap-2" title={TIP.permite_surrender}>
          <input type="checkbox" checked={f.permite_surrender}
            onChange={(e) => set("permite_surrender", e.target.checked)} />
          Surrender
        </label>
        <label className="flex items-center gap-2" title={TIP.permite_insurance}>
          <input type="checkbox" checked={f.permite_insurance}
            onChange={(e) => set("permite_insurance", e.target.checked)} />
          Insurance
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button className="nbtn nbtn-primary" onClick={guardar} disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar configuración"}
        </button>
        {msg && <span className="text-sm text-tinta/70">{msg}</span>}
      </div>
    </section>
  );
}
