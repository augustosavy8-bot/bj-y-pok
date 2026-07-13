"use client";

import { useCallback, useEffect, useState } from "react";

interface SolicitudConPerfil {
  id: string;
  monto_solicitado: number;
  estado: "pendiente" | "aprobada" | "rechazada" | "pagada";
  notas_admin: string | null;
  created_at: string;
  solicitante: { nombre: string; email: string } | null;
}

export function RetirosAdmin() {
  const [solicitudes, setSolicitudes] = useState<SolicitudConPerfil[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const r = await fetch("/api/admin/retiros");
    const d = await r.json();
    setSolicitudes(d.solicitudes ?? []);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function accion(id: string, accion: "aprobar" | "rechazar" | "pagar") {
    setError(null);
    let notas: string | null = null;
    if (accion === "rechazar") {
      notas = window.prompt("Motivo del rechazo:") ?? null;
      if (!notas) return;
    }
    const r = await fetch("/api/admin/retiros", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, accion, notas }),
    });
    const d = await r.json();
    if (!r.ok) setError(d?.error ?? "Error");
    else cargar();
  }

  const pendientes = solicitudes.filter((s) => s.estado === "pendiente" || s.estado === "aprobada");
  const resto = solicitudes.filter((s) => s.estado === "rechazada" || s.estado === "pagada");

  return (
    <section className="panel flex flex-col gap-3 p-4">
      <h2 className="font-semibold">Solicitudes de retiro</h2>
      {error && <div className="rounded-lg bg-red-900/50 px-3 py-2 text-sm text-red-100">{error}</div>}

      {pendientes.length === 0 && <p className="text-sm text-white/50">No hay solicitudes activas.</p>}
      {pendientes.map((s) => (
        <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-black/20 p-3 text-sm">
          <div>
            <div className="font-medium">{s.solicitante?.nombre ?? "—"}</div>
            <div className="text-xs text-white/50">
              {s.monto_solicitado.toLocaleString("es")} créditos · {new Date(s.created_at).toLocaleDateString("es")}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {s.estado === "pendiente" && (
              <>
                <button className="btn btn-verde !px-3 !py-1.5 text-xs" onClick={() => accion(s.id, "aprobar")}>Aprobar</button>
                <button className="btn btn-rojo !px-3 !py-1.5 text-xs" onClick={() => accion(s.id, "rechazar")}>Rechazar</button>
              </>
            )}
            {s.estado === "aprobada" && (
              <>
                <span className="rounded bg-yellow-900/50 px-2 py-0.5 text-xs text-yellow-100">aprobada</span>
                <button className="btn btn-oro !px-3 !py-1.5 text-xs" onClick={() => accion(s.id, "pagar")}>Marcar como pagada</button>
                <button className="btn btn-rojo !px-3 !py-1.5 text-xs" onClick={() => accion(s.id, "rechazar")}>Rechazar</button>
              </>
            )}
          </div>
        </div>
      ))}

      {resto.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-white/60">Historial ({resto.length})</summary>
          <div className="mt-2 flex flex-col gap-1">
            {resto.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded bg-black/10 px-3 py-1.5">
                <span>{s.solicitante?.nombre ?? "—"} · {s.monto_solicitado.toLocaleString("es")}</span>
                <span className={s.estado === "pagada" ? "text-green-400" : "text-red-400"}>
                  {s.estado}{s.notas_admin ? ` · ${s.notas_admin}` : ""}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
