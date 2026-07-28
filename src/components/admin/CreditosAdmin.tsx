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
  const [enviando, setEnviando] = useState<string | null>(null);

  // Dos requests en total (usuarios + todos los saldos), no una por usuario.
  const cargarUsuarios = useCallback(async () => {
    const [rUsuarios, rSaldos] = await Promise.all([
      fetch("/api/admin/usuarios"),
      fetch("/api/admin/creditos"),
    ]);
    const d = await rUsuarios.json();
    setUsuarios((d.usuarios ?? []) as Usuario[]);
    if (rSaldos.ok) {
      const s = await rSaldos.json();
      setSaldos((s.saldos ?? {}) as Record<string, number>);
    }
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

  // signo: +1 acredita (tipo "carga"), -1 descuenta (tipo "ajuste").
  async function mover(userId: string, signo: 1 | -1) {
    setError(null);
    const monto = montoCarga[userId] || 0;
    if (monto <= 0) return;

    const usuario = usuarios.find((u) => u.id === userId);
    const saldo = saldos[userId] ?? 0;

    if (signo === -1) {
      if (monto > saldo) {
        setError(
          `${usuario?.nombre ?? "El usuario"} tiene ${saldo.toLocaleString("es")} créditos: no se le pueden bajar ${monto.toLocaleString("es")}.`
        );
        return;
      }
      const ok = confirm(
        `¿Bajarle ${monto.toLocaleString("es")} créditos a ${usuario?.nombre ?? "este usuario"}?\n\n` +
          `Saldo actual: ${saldo.toLocaleString("es")}\n` +
          `Quedaría en: ${(saldo - monto).toLocaleString("es")}\n\n` +
          `Queda registrado en su historial como ajuste.`
      );
      if (!ok) return;
    }

    setEnviando(userId);
    try {
      const r = await fetch("/api/admin/creditos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          monto: signo * monto,
          tipo: signo === 1 ? "carga" : "ajuste",
          notas: notaCarga[userId] || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) setError(d?.error ?? "Error");
      else {
        setMontoCarga((m) => ({ ...m, [userId]: 0 }));
        setNotaCarga((n) => ({ ...n, [userId]: "" }));
        cargarUsuarios();
        if (expandido === userId) verMovimientos(userId);
      }
    } finally {
      setEnviando(null);
    }
  }

  return (
    <section className="ncard flex flex-col gap-3 border border-white/[0.06] p-4">
      <h2 className="font-medium">Créditos</h2>
      {error && <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}
      <div className="flex flex-col gap-2">
        {usuarios.map((u) => (
          <div key={u.id} className="rounded-md bg-white/[0.04] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium">{u.nombre}</div>
                <div className="text-xs text-tinta/50">{u.email}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-white/[0.06] px-2 py-1 text-sm font-medium tabular-nums text-acento-300">
                  {(saldos[u.id] ?? 0).toLocaleString("es")}
                </span>
                <button className="nbtn nbtn-secondary !px-3 !py-1.5 text-xs" onClick={() => verMovimientos(u.id)}>
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
                className="ninput w-28"
              />
              <input
                value={notaCarga[u.id] || ""}
                onChange={(e) => setNotaCarga((n) => ({ ...n, [u.id]: e.target.value }))}
                placeholder="Motivo (opcional)"
                className="ninput flex-1"
              />
              <button
                className="nbtn nbtn-primary !px-3 !py-1.5 text-xs"
                disabled={enviando === u.id}
                onClick={() => mover(u.id, 1)}
              >
                Cargar
              </button>
              <button
                className="nbtn nbtn-danger !px-3 !py-1.5 text-xs"
                disabled={enviando === u.id}
                onClick={() => mover(u.id, -1)}
                title="Descontar créditos sin que el jugador haya pedido un retiro"
              >
                Bajar
              </button>
            </div>

            {expandido === u.id && (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-tinta/40">
                    <tr><th className="py-1 pr-2 font-medium">Fecha</th><th className="py-1 pr-2 font-medium">Tipo</th><th className="py-1 pr-2 text-right font-medium">Monto</th><th className="py-1 text-right font-medium">Saldo</th></tr>
                  </thead>
                  <tbody>
                    {movimientos.map((m) => (
                      <tr key={m.id} className="border-t border-white/[0.07]">
                        <td className="py-1 pr-2 text-tinta/50">{new Date(m.created_at).toLocaleString("es", { dateStyle: "short", timeStyle: "short" })}</td>
                        <td className="py-1 pr-2">{TIPO_LABEL[m.tipo]}</td>
                        <td className={`py-1 pr-2 text-right tabular-nums ${m.monto >= 0 ? "text-emerald-300" : "text-red-300"}`}>{m.monto >= 0 ? "+" : ""}{m.monto}</td>
                        <td className="py-1 text-right tabular-nums">{m.saldo_resultante}</td>
                      </tr>
                    ))}
                    {movimientos.length === 0 && <tr><td colSpan={4} className="py-2 text-center text-tinta/40">Sin movimientos.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
        {usuarios.length === 0 && <p className="text-sm text-tinta/45">No hay usuarios todavía.</p>}
      </div>
    </section>
  );
}
