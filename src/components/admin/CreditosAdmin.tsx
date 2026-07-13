"use client";

import { useCallback, useEffect, useState } from "react";
import type { CreditoMovimiento } from "@/lib/types";

interface Usuario {
  id: string;
  nombre: string;
  email: string;
}

const TIPO_LABEL: Record<string, string> = {
  carga: "Carga",
  retiro: "Retiro",
  buy_in_mesa: "Buy-in",
  cash_out_mesa: "Cash-out",
  ajuste: "Ajuste",
};

export function CreditosAdmin() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [saldos, setSaldos] = useState<Record<string, number>>({});
  const [expandido, setExpandido] = useState<string | null>(null);
  const [movimientos, setMovimientos] = useState<CreditoMovimiento[]>([]);
  const [montoCarga, setMontoCarga] = useState<Record<string, number>>({});
  const [notaCarga, setNotaCarga] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const cargarUsuarios = useCallback(async () => {
    const r = await fetch("/api/admin/usuarios");
    const d = await r.json();
    const us = (d.usuarios ?? []) as Usuario[];
    setUsuarios(us);
    // Saldos en paralelo.
    const entradas = await Promise.all(
      us.map(async (u) => {
        const rr = await fetch(`/api/admin/creditos?user_id=${u.id}`);
        const dd = rr.ok ? await rr.json() : { saldo: 0 };
        return [u.id, dd.saldo as number] as const;
      })
    );
    setSaldos(Object.fromEntries(entradas));
  }, []);

  useEffect(() => {
    cargarUsuarios();
  }, [cargarUsuarios]);

  async function verMovimientos(userId: string) {
    if (expandido === userId) {
      setExpandido(null);
      return;
    }
    const r = await fetch(`/api/admin/creditos?user_id=${userId}`);
    const d = await r.json();
    setMovimientos(d.movimientos ?? []);
    setExpandido(userId);
  }

  async function cargar(userId: string) {
    setError(null);
    const monto = montoCarga[userId] || 0;
    if (monto <= 0) return;
    const r = await fetch("/api/admin/creditos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_id: userId, monto, tipo: "carga", notas: notaCarga[userId] || null }),
    });
    const d = await r.json();
    if (!r.ok) setError(d?.error ?? "Error");
    else {
      setMontoCarga((m) => ({ ...m, [userId]: 0 }));
      setNotaCarga((n) => ({ ...n, [userId]: "" }));
      cargarUsuarios();
      if (expandido === userId) verMovimientos(userId);
    }
  }

  return (
    <section className="panel flex flex-col gap-3 p-4">
      <h2 className="font-semibold">Créditos</h2>
      {error && <div className="rounded-lg bg-red-900/50 px-3 py-2 text-sm text-red-100">{error}</div>}
      <div className="flex flex-col gap-2">
        {usuarios.map((u) => (
          <div key={u.id} className="rounded-lg bg-black/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium">{u.nombre}</div>
                <div className="text-xs text-white/50">{u.email}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-black/30 px-2 py-1 text-sm font-semibold text-oro tabular-nums">
                  {(saldos[u.id] ?? 0).toLocaleString("es")}
                </span>
                <button className="btn btn-gris !px-3 !py-1.5 text-xs" onClick={() => verMovimientos(u.id)}>
                  {expandido === u.id ? "Ocultar" : "Historial"}
                </button>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                type="number"
                min={1}
                value={montoCarga[u.id] || ""}
                onChange={(e) => setMontoCarga((m) => ({ ...m, [u.id]: Number(e.target.value) }))}
                placeholder="Monto"
                className="w-28 rounded-lg bg-white/10 p-2 text-sm"
              />
              <input
                value={notaCarga[u.id] || ""}
                onChange={(e) => setNotaCarga((n) => ({ ...n, [u.id]: e.target.value }))}
                placeholder="Nota (opcional)"
                className="flex-1 rounded-lg bg-white/10 p-2 text-sm"
              />
              <button className="btn btn-oro !px-3 !py-1.5 text-xs" onClick={() => cargar(u.id)}>
                Cargar créditos
              </button>
            </div>

            {expandido === u.id && (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-white/40">
                    <tr><th className="py-1 pr-2">Fecha</th><th className="py-1 pr-2">Tipo</th><th className="py-1 pr-2 text-right">Monto</th><th className="py-1 text-right">Saldo</th></tr>
                  </thead>
                  <tbody>
                    {movimientos.map((m) => (
                      <tr key={m.id} className="border-t border-white/10">
                        <td className="py-1 pr-2 text-white/50">{new Date(m.created_at).toLocaleString("es", { dateStyle: "short", timeStyle: "short" })}</td>
                        <td className="py-1 pr-2">{TIPO_LABEL[m.tipo]}</td>
                        <td className={`py-1 pr-2 text-right tabular-nums ${m.monto >= 0 ? "text-green-400" : "text-red-400"}`}>{m.monto >= 0 ? "+" : ""}{m.monto}</td>
                        <td className="py-1 text-right tabular-nums">{m.saldo_resultante}</td>
                      </tr>
                    ))}
                    {movimientos.length === 0 && <tr><td colSpan={4} className="py-2 text-center text-white/40">Sin movimientos.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
