"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { CreditosAdmin } from "@/components/admin/CreditosAdmin";
import { RetirosAdmin } from "@/components/admin/RetirosAdmin";

interface Usuario {
  id: string;
  email: string;
  nombre: string;
  rol: "admin" | "jugador";
  activo: boolean;
  created_at: string;
}
interface Invitacion {
  id: string;
  token: string;
  email: string | null;
  estado: "pendiente" | "usada" | "expirada" | "revocada";
  expires_at: string;
  created_at: string;
}

export function PanelAdmin({ miId }: { miId: string }) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [invitaciones, setInvitaciones] = useState<Invitacion[]>([]);
  const [emailInv, setEmailInv] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [u, i] = await Promise.all([
      fetch("/api/admin/usuarios").then((r) => r.json()),
      fetch("/api/admin/invitaciones").then((r) => r.json()),
    ]);
    setUsuarios(u.usuarios ?? []);
    setInvitaciones(i.invitaciones ?? []);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function toggleActivo(u: Usuario) {
    setError(null);
    const res = await fetch("/api/admin/usuarios", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: u.id, activo: !u.activo }),
    });
    if (!res.ok) setError((await res.json())?.error ?? "Error");
    else cargar();
  }

  async function generarInvitacion() {
    setError(null);
    const res = await fetch("/api/admin/invitaciones", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: emailInv.trim() || null }),
    });
    if (!res.ok) setError((await res.json())?.error ?? "Error");
    else {
      setEmailInv("");
      cargar();
    }
  }

  async function revocar(id: string) {
    await fetch("/api/admin/invitaciones", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    cargar();
  }

  function linkDe(token: string) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/invitacion/${token}`;
  }

  function estaExpirada(inv: Invitacion) {
    return inv.estado === "pendiente" && new Date(inv.expires_at).getTime() < Date.now();
  }

  return (
    <AppShell activo="/admin">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 py-4">
      <h1 className="text-2xl font-bold text-oro">Panel de administración</h1>

      {error && (
        <div className="rounded-lg bg-red-900/50 px-3 py-2 text-sm text-red-100">{error}</div>
      )}

      {/* Créditos y retiros */}
      <CreditosAdmin />
      <RetirosAdmin />

      {/* Invitaciones */}
      <section className="panel flex flex-col gap-3 p-4">
        <h2 className="font-semibold">Invitaciones</h2>
        <div className="flex gap-2">
          <input
            value={emailInv}
            onChange={(e) => setEmailInv(e.target.value)}
            placeholder="Email (opcional)"
            className="flex-1 rounded-xl bg-white/10 p-2.5"
          />
          <button className="btn btn-oro" onClick={generarInvitacion}>Generar invitación</button>
        </div>
        <div className="flex flex-col gap-2">
          {invitaciones.length === 0 && (
            <p className="text-sm text-white/50">Todavía no generaste invitaciones.</p>
          )}
          {invitaciones.map((inv) => {
            const expirada = estaExpirada(inv);
            const estado = expirada ? "expirada" : inv.estado;
            return (
              <div key={inv.id} className="rounded-lg bg-black/20 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <EstadoBadge estado={estado} />
                    {inv.email && <span className="text-white/70">{inv.email}</span>}
                    <span className="text-white/40">
                      vence {new Date(inv.expires_at).toLocaleDateString("es")}
                    </span>
                  </span>
                  {inv.estado === "pendiente" && !expirada && (
                    <div className="flex gap-2">
                      <button
                        className="btn btn-gris !px-3 !py-1.5 text-xs"
                        onClick={() => {
                          navigator.clipboard?.writeText(linkDe(inv.token));
                          setCopiado(inv.id);
                          setTimeout(() => setCopiado(null), 1500);
                        }}
                      >
                        {copiado === inv.id ? "¡Copiado!" : "Copiar link"}
                      </button>
                      <button
                        className="btn btn-rojo !px-3 !py-1.5 text-xs"
                        onClick={() => revocar(inv.id)}
                      >
                        Revocar
                      </button>
                    </div>
                  )}
                </div>
                {inv.estado === "pendiente" && !expirada && (
                  <div className="mt-1 break-all font-mono text-xs text-white/50">
                    {linkDe(inv.token)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Usuarios */}
      <section className="panel flex flex-col gap-3 p-4">
        <h2 className="font-semibold">Usuarios</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-white/50">
              <tr>
                <th className="py-1 pr-3">Nombre</th>
                <th className="py-1 pr-3">Email</th>
                <th className="py-1 pr-3">Rol</th>
                <th className="py-1 pr-3">Alta</th>
                <th className="py-1 pr-3">Estado</th>
                <th className="py-1"></th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className="border-t border-white/10">
                  <td className="py-2 pr-3">{u.nombre}{u.id === miId && " (vos)"}</td>
                  <td className="py-2 pr-3 text-white/70">{u.email}</td>
                  <td className="py-2 pr-3">
                    {u.rol === "admin" ? (
                      <span className="text-oro">admin</span>
                    ) : (
                      "jugador"
                    )}
                  </td>
                  <td className="py-2 pr-3 text-white/50">
                    {new Date(u.created_at).toLocaleDateString("es")}
                  </td>
                  <td className="py-2 pr-3">
                    {u.activo ? (
                      <span className="text-green-400">activo</span>
                    ) : (
                      <span className="text-red-400">inactivo</span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {u.id !== miId && (
                      <button
                        className={`btn !px-3 !py-1.5 text-xs ${u.activo ? "btn-rojo" : "btn-verde"}`}
                        onClick={() => toggleActivo(u)}
                      >
                        {u.activo ? "Desactivar" : "Reactivar"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      </div>
    </AppShell>
  );
}

function EstadoBadge({ estado }: { estado: string }) {
  const color: Record<string, string> = {
    pendiente: "bg-blue-900/50 text-blue-200",
    usada: "bg-green-900/50 text-green-200",
    expirada: "bg-white/10 text-white/50",
    revocada: "bg-red-900/50 text-red-200",
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${color[estado] ?? ""}`}>
      {estado}
    </span>
  );
}
