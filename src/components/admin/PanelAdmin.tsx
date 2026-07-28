"use client";

import { useCallback, useEffect, useState } from "react";
import { NocturneShell } from "@/components/nocturne/NocturneShell";
import { CasaAdmin } from "@/components/admin/CasaAdmin";
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

  // Alta directa de usuario (sin link de invitación).
  const [nuevo, setNuevo] = useState({ nombre: "", email: "", password: "", rol: "jugador" });
  const [creando, setCreando] = useState(false);
  const [okAlta, setOkAlta] = useState<string | null>(null);

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

  async function crearUsuario() {
    setError(null);
    setOkAlta(null);
    setCreando(true);
    try {
      const res = await fetch("/api/admin/usuarios", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(nuevo),
      });
      const data = await res.json();
      if (!res.ok) setError(data?.error ?? "Error");
      else {
        setOkAlta(`Usuario ${data.email} creado. Ya puede ingresar con su email y contraseña.`);
        setNuevo({ nombre: "", email: "", password: "", rol: "jugador" });
        cargar();
      }
    } catch {
      setError("Error de red");
    } finally {
      setCreando(false);
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
    <NocturneShell>
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-medium">Panel de administración</h1>

        {error && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>
        )}

        {/* Cómo va el negocio */}
        <CasaAdmin />

        {/* Créditos y retiros */}
        <CreditosAdmin />
        <RetirosAdmin />

        {/* Crear usuario directo */}
        <section className="ncard flex flex-col gap-3 border border-white/[0.06] p-4">
          <div>
            <h2 className="font-medium">Crear usuario</h2>
            <p className="text-xs text-tinta/50">
              Alta directa: la cuenta queda lista al instante. Pasale el email y la contraseña a la persona.
            </p>
          </div>
          {okAlta && (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
              {okAlta}
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-tinta/70">
              Nombre
              <input
                value={nuevo.nombre}
                onChange={(e) => setNuevo((n) => ({ ...n, nombre: e.target.value }))}
                className="ninput mt-1"
                placeholder="Juan Pérez"
              />
            </label>
            <label className="text-xs text-tinta/70">
              Email
              <input
                type="email"
                value={nuevo.email}
                onChange={(e) => setNuevo((n) => ({ ...n, email: e.target.value }))}
                className="ninput mt-1"
                placeholder="juan@email.com"
                autoComplete="off"
              />
            </label>
            <label className="text-xs text-tinta/70">
              Contraseña (mín. 8)
              <input
                type="text"
                value={nuevo.password}
                onChange={(e) => setNuevo((n) => ({ ...n, password: e.target.value }))}
                className="ninput mt-1 font-mono"
                placeholder="mín. 8 caracteres"
                autoComplete="off"
              />
            </label>
            <label className="text-xs text-tinta/70">
              Rol
              <select
                value={nuevo.rol}
                onChange={(e) => setNuevo((n) => ({ ...n, rol: e.target.value }))}
                className="ninput mt-1"
              >
                <option value="jugador" className="text-black">Jugador</option>
                <option value="admin" className="text-black">Admin</option>
              </select>
            </label>
          </div>
          <div>
            <button
              className="nbtn nbtn-primary"
              onClick={crearUsuario}
              disabled={creando || !nuevo.nombre.trim() || !nuevo.email.trim() || nuevo.password.length < 8}
            >
              {creando ? "Creando…" : "Crear usuario"}
            </button>
          </div>
        </section>

        {/* Invitaciones (alternativa: link para que la persona se dé de alta sola) */}
        <section className="ncard flex flex-col gap-3 border border-white/[0.06] p-4">
          <h2 className="font-medium">Invitaciones</h2>
          <p className="text-xs text-tinta/50">
            Alternativa al alta directa: generás un link y la persona elige su propia contraseña.
          </p>
          <div className="flex gap-2">
            <input
              value={emailInv}
              onChange={(e) => setEmailInv(e.target.value)}
              placeholder="Email (opcional)"
              className="ninput flex-1"
            />
            <button className="nbtn nbtn-primary" onClick={generarInvitacion}>Generar invitación</button>
          </div>
          <div className="flex flex-col gap-2">
            {invitaciones.length === 0 && (
              <p className="text-sm text-tinta/50">Todavía no generaste invitaciones.</p>
            )}
            {invitaciones.map((inv) => {
              const expirada = estaExpirada(inv);
              const estado = expirada ? "expirada" : inv.estado;
              return (
                <div key={inv.id} className="rounded-md bg-white/[0.04] p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <EstadoBadge estado={estado} />
                      {inv.email && <span className="text-tinta/70">{inv.email}</span>}
                      <span className="text-tinta/40">
                        vence {new Date(inv.expires_at).toLocaleDateString("es")}
                      </span>
                    </span>
                    {inv.estado === "pendiente" && !expirada && (
                      <div className="flex gap-2">
                        <button
                          className="nbtn nbtn-secondary !px-3 !py-1.5 text-xs"
                          onClick={() => {
                            navigator.clipboard?.writeText(linkDe(inv.token));
                            setCopiado(inv.id);
                            setTimeout(() => setCopiado(null), 1500);
                          }}
                        >
                          {copiado === inv.id ? "¡Copiado!" : "Copiar link"}
                        </button>
                        <button className="nbtn nbtn-danger !px-3 !py-1.5 text-xs" onClick={() => revocar(inv.id)}>
                          Revocar
                        </button>
                      </div>
                    )}
                  </div>
                  {inv.estado === "pendiente" && !expirada && (
                    <div className="mt-1 break-all font-mono text-xs text-tinta/45">{linkDe(inv.token)}</div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Usuarios */}
        <section className="ncard flex flex-col gap-3 border border-white/[0.06] p-4">
          <h2 className="font-medium">Usuarios</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-[0.08em] text-tinta/50">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Nombre</th>
                  <th className="py-1.5 pr-3 font-medium">Email</th>
                  <th className="py-1.5 pr-3 font-medium">Rol</th>
                  <th className="py-1.5 pr-3 font-medium">Alta</th>
                  <th className="py-1.5 pr-3 font-medium">Estado</th>
                  <th className="py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <tr key={u.id} className="border-t border-white/[0.07]">
                    <td className="py-2 pr-3">{u.nombre}{u.id === miId && " (vos)"}</td>
                    <td className="py-2 pr-3 text-tinta/70">{u.email}</td>
                    <td className="py-2 pr-3">
                      {u.rol === "admin" ? <span className="text-acento-300">admin</span> : "jugador"}
                    </td>
                    <td className="py-2 pr-3 text-tinta/50">{new Date(u.created_at).toLocaleDateString("es")}</td>
                    <td className="py-2 pr-3">
                      {u.activo ? (
                        <span className="text-emerald-300">activo</span>
                      ) : (
                        <span className="text-red-300">inactivo</span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      {u.id !== miId && (
                        <button
                          className={`nbtn !px-3 !py-1.5 text-xs ${u.activo ? "nbtn-danger" : "nbtn-primary"}`}
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
    </NocturneShell>
  );
}

function EstadoBadge({ estado }: { estado: string }) {
  const color: Record<string, string> = {
    pendiente: "bg-acento-800 text-acento-100",
    usada: "bg-emerald-500/20 text-emerald-200",
    expirada: "bg-white/10 text-tinta/50",
    revocada: "bg-red-500/20 text-red-200",
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${color[estado] ?? ""}`}>
      {estado}
    </span>
  );
}
