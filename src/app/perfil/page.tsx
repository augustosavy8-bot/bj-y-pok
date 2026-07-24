"use client";

import { useCallback, useEffect, useState } from "react";
import { NocturneShell } from "@/components/nocturne/NocturneShell";
import type { CreditoMovimiento, SolicitudRetiro } from "@/lib/types";

const TIPO_LABEL: Record<string, string> = {
  carga: "Carga",
  retiro: "Retiro",
  buy_in_mesa: "Buy-in mesa",
  cash_out_mesa: "Cash-out mesa",
  ajuste: "Ajuste",
};
const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  pagada: "Pagada",
};

export default function PerfilPage() {
  const [saldo, setSaldo] = useState(0);
  const [movimientos, setMovimientos] = useState<CreditoMovimiento[]>([]);
  const [solicitudes, setSolicitudes] = useState<SolicitudRetiro[]>([]);
  const [monto, setMonto] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch("/api/creditos/mi");
    if (res.ok) {
      const d = await res.json();
      setSaldo(d.saldo);
      setMovimientos(d.movimientos);
      setSolicitudes(d.solicitudes);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const comprometido = solicitudes
    .filter((s) => s.estado === "pendiente" || s.estado === "aprobada")
    .reduce((s, r) => s + r.monto_solicitado, 0);
  const disponible = saldo - comprometido;

  async function solicitar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/creditos/solicitar-retiro", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ monto }),
      });
      const d = await res.json();
      if (!res.ok) setError(d?.error ?? "Error");
      else {
        setOk("Solicitud enviada. El admin la va a revisar.");
        setMonto(0);
        cargar();
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <NocturneShell>
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-medium">Mi perfil</h1>

        <section className="ncard flex items-center justify-between border border-white/[0.06] p-5 shadow-n-sm">
          <div>
            <div className="text-[11px] uppercase tracking-[0.1em] text-tinta/55">Saldo de créditos</div>
            <div className="text-3xl font-medium tabular-nums text-acento-300">{saldo.toLocaleString("es")}</div>
          </div>
          <div className="text-right text-sm text-tinta/60">
            <div className="text-[11px] uppercase tracking-[0.1em]">Disponible para retirar</div>
            <div className="text-lg font-medium tabular-nums text-tinta">{disponible.toLocaleString("es")}</div>
          </div>
        </section>

        {/* Solicitar retiro */}
        <section className="ncard flex flex-col gap-3 border border-white/[0.06] p-5">
          <h2 className="font-medium">Solicitar retiro</h2>
          <form onSubmit={solicitar} className="flex gap-2">
            <input
              type="number"
              min={1}
              max={disponible}
              value={monto || ""}
              onChange={(e) => setMonto(Number(e.target.value))}
              placeholder="Monto"
              className="ninput flex-1"
            />
            <button className="nbtn nbtn-primary" disabled={enviando || monto <= 0 || monto > disponible}>
              Solicitar
            </button>
          </form>
          {error && <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}
          {ok && <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{ok}</div>}
        </section>

        {/* Mis solicitudes */}
        {solicitudes.length > 0 && (
          <section className="ncard flex flex-col gap-2 border border-white/[0.06] p-5">
            <h2 className="font-medium">Mis solicitudes de retiro</h2>
            {solicitudes.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-md bg-white/[0.04] px-3 py-2 text-sm">
                <span>{new Date(s.created_at).toLocaleDateString("es")} · {s.monto_solicitado.toLocaleString("es")}</span>
                <span className="flex items-center gap-2">
                  <EstadoRetiro estado={s.estado} />
                  {s.notas_admin && <span className="text-tinta/50">{s.notas_admin}</span>}
                </span>
              </div>
            ))}
          </section>
        )}

        {/* Movimientos */}
        <section className="ncard flex flex-col gap-2 border border-white/[0.06] p-5">
          <h2 className="font-medium">Historial de movimientos</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-[0.08em] text-tinta/50">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Fecha</th>
                  <th className="py-1.5 pr-3 font-medium">Tipo</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Monto</th>
                  <th className="py-1.5 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m) => (
                  <tr key={m.id} className="border-t border-white/[0.07]">
                    <td className="py-2 pr-3 text-tinta/55">
                      {new Date(m.created_at).toLocaleString("es", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="py-2 pr-3">{TIPO_LABEL[m.tipo]}</td>
                    <td className={`py-2 pr-3 text-right tabular-nums ${m.monto >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                      {m.monto >= 0 ? "+" : ""}{m.monto.toLocaleString("es")}
                    </td>
                    <td className="py-2 text-right tabular-nums">{m.saldo_resultante.toLocaleString("es")}</td>
                  </tr>
                ))}
                {movimientos.length === 0 && (
                  <tr><td colSpan={4} className="py-4 text-center text-tinta/40">Sin movimientos todavía.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </NocturneShell>
  );
}

function EstadoRetiro({ estado }: { estado: string }) {
  const color: Record<string, string> = {
    pendiente: "bg-acento-800 text-acento-100",
    aprobada: "bg-amber-500/20 text-amber-200",
    rechazada: "bg-red-500/20 text-red-200",
    pagada: "bg-emerald-500/20 text-emerald-200",
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${color[estado] ?? ""}`}>
      {ESTADO_LABEL[estado] ?? estado}
    </span>
  );
}
