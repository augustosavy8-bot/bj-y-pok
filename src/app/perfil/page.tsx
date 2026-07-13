"use client";

import { useCallback, useEffect, useState } from "react";
import { cerrarSesion } from "@/lib/supabase/client";
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
    <main className="mx-auto flex max-w-2xl flex-col gap-5 p-6">
      <header className="flex items-center justify-between">
        <div>
          <a href="/home" className="text-sm text-white/60 underline">← Volver al home</a>
          <h1 className="mt-1 text-2xl font-bold text-oro">Mi perfil</h1>
        </div>
        <button className="text-sm text-white/60 underline" onClick={cerrarSesion}>Salir</button>
      </header>

      <section className="panel flex items-center justify-between p-5">
        <div>
          <div className="text-sm text-white/60">Saldo de créditos</div>
          <div className="text-3xl font-bold text-oro tabular-nums">{saldo.toLocaleString("es")}</div>
        </div>
        <div className="text-right text-sm text-white/60">
          <div>Disponible para retirar</div>
          <div className="text-lg font-semibold text-white">{disponible.toLocaleString("es")}</div>
        </div>
      </section>

      {/* Solicitar retiro */}
      <section className="panel flex flex-col gap-3 p-5">
        <h2 className="font-semibold">Solicitar retiro</h2>
        <form onSubmit={solicitar} className="flex gap-2">
          <input
            type="number"
            min={1}
            max={disponible}
            value={monto || ""}
            onChange={(e) => setMonto(Number(e.target.value))}
            placeholder="Monto"
            className="flex-1 rounded-xl bg-white/10 p-3"
          />
          <button className="btn btn-oro" disabled={enviando || monto <= 0 || monto > disponible}>
            Solicitar
          </button>
        </form>
        {error && <div className="rounded-lg bg-red-900/50 px-3 py-2 text-sm text-red-100">{error}</div>}
        {ok && <div className="rounded-lg bg-green-900/40 px-3 py-2 text-sm text-green-100">{ok}</div>}
      </section>

      {/* Mis solicitudes */}
      {solicitudes.length > 0 && (
        <section className="panel flex flex-col gap-2 p-5">
          <h2 className="font-semibold">Mis solicitudes de retiro</h2>
          {solicitudes.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2 text-sm">
              <span>{new Date(s.created_at).toLocaleDateString("es")} · {s.monto_solicitado.toLocaleString("es")}</span>
              <span className="flex items-center gap-2">
                <EstadoRetiro estado={s.estado} />
                {s.notas_admin && <span className="text-white/50">{s.notas_admin}</span>}
              </span>
            </div>
          ))}
        </section>
      )}

      {/* Movimientos */}
      <section className="panel flex flex-col gap-2 p-5">
        <h2 className="font-semibold">Historial de movimientos</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-white/50">
              <tr>
                <th className="py-1 pr-3">Fecha</th>
                <th className="py-1 pr-3">Tipo</th>
                <th className="py-1 pr-3 text-right">Monto</th>
                <th className="py-1 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((m) => (
                <tr key={m.id} className="border-t border-white/10">
                  <td className="py-2 pr-3 text-white/60">
                    {new Date(m.created_at).toLocaleString("es", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="py-2 pr-3">{TIPO_LABEL[m.tipo]}</td>
                  <td className={`py-2 pr-3 text-right tabular-nums ${m.monto >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {m.monto >= 0 ? "+" : ""}{m.monto.toLocaleString("es")}
                  </td>
                  <td className="py-2 text-right tabular-nums">{m.saldo_resultante.toLocaleString("es")}</td>
                </tr>
              ))}
              {movimientos.length === 0 && (
                <tr><td colSpan={4} className="py-4 text-center text-white/40">Sin movimientos todavía.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function EstadoRetiro({ estado }: { estado: string }) {
  const color: Record<string, string> = {
    pendiente: "bg-blue-900/50 text-blue-200",
    aprobada: "bg-yellow-900/50 text-yellow-100",
    rechazada: "bg-red-900/50 text-red-200",
    pagada: "bg-green-900/50 text-green-200",
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${color[estado] ?? ""}`}>
      {ESTADO_LABEL[estado] ?? estado}
    </span>
  );
}
