"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getSupabaseBrowser, usuarioActualId, cerrarSesion } from "@/lib/supabase/client";
import { SaldoBadge } from "@/components/SaldoBadge";

type Item = { href: string; label: string; icon: React.ReactNode; soloAdmin?: boolean };

const ICONOS = {
  inicio: (
    <path d="M4 11.5 12 5l8 6.5M6 10v9h12v-9" />
  ),
  perfil: (
    <>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
    </>
  ),
  admin: (
    <path d="M12 3l7 3v5c0 4.2-2.9 7.7-7 9-4.1-1.3-7-4.8-7-9V6l7-3Z" />
  ),
};

const ITEMS: Item[] = [
  { href: "/home", label: "Inicio", icon: ICONOS.inicio },
  { href: "/perfil", label: "Perfil", icon: ICONOS.perfil },
  { href: "/admin", label: "Admin", icon: ICONOS.admin, soloAdmin: true },
];

// Shell de plataforma: header financiero fijo + sidebar (desktop) + bottom nav
// (mobile). Envuelve las páginas fuera del juego (home, perfil, admin). Estética
// club privado: carbón + oro, sin neón.
export function AppShell({
  children,
  activo,
  saldoKey = 0,
}: {
  children: React.ReactNode;
  // href del item activo (para resaltar). Si no se pasa, se usa el pathname.
  activo?: string;
  saldoKey?: number;
}) {
  const pathname = usePathname();
  const actual = activo ?? pathname;
  const [esAdmin, setEsAdmin] = useState(false);
  const [nombre, setNombre] = useState("");

  useEffect(() => {
    (async () => {
      const uid = await usuarioActualId();
      if (!uid) return;
      const supabase = getSupabaseBrowser();
      const { data } = await supabase.from("perfiles").select("rol, nombre").eq("id", uid).maybeSingle();
      if (data) {
        setEsAdmin((data as { rol: string }).rol === "admin");
        setNombre((data as { nombre: string }).nombre ?? "");
      }
    })();
  }, []);

  const items = ITEMS.filter((i) => !i.soloAdmin || esAdmin);

  return (
    <div className="min-h-screen">
      {/* Header financiero fijo */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-white/10 bg-carbon-dark/95 px-4 backdrop-blur">
        <a href="/home" className="flex items-center gap-2 font-bold tracking-wide text-oro">
          <span className="text-lg">♠</span>
          <span className="hidden sm:inline">Mesa</span>
        </a>
        <div className="flex items-center gap-3">
          {nombre && <span className="hidden text-sm text-white/50 sm:inline">Hola, {nombre}</span>}
          <SaldoBadge refreshKey={saldoKey} />
          <button
            onClick={cerrarSesion}
            className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/70 hover:bg-white/20"
          >
            Salir
          </button>
        </div>
      </header>

      {/* Sidebar desktop */}
      <aside className="fixed left-0 top-14 bottom-0 z-20 hidden w-56 flex-col gap-1 border-r border-white/10 bg-carbon-dark/70 p-3 lg:flex">
        {items.map((i) => (
          <ItemNav key={i.href} item={i} activo={actual === i.href} orientacion="lateral" />
        ))}
      </aside>

      {/* Contenido */}
      <main className="px-3 pb-24 pt-16 lg:pb-8 lg:pl-60">{children}</main>

      {/* Bottom nav mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-white/10 bg-carbon-dark/95 backdrop-blur lg:hidden">
        {items.map((i) => (
          <ItemNav key={i.href} item={i} activo={actual === i.href} orientacion="inferior" />
        ))}
      </nav>
    </div>
  );
}

function ItemNav({
  item,
  activo,
  orientacion,
}: {
  item: Item;
  activo: boolean;
  orientacion: "lateral" | "inferior";
}) {
  const icono = (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {item.icon}
    </svg>
  );

  if (orientacion === "inferior") {
    return (
      <a
        href={item.href}
        className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${
          activo ? "text-oro" : "text-white/55"
        }`}
      >
        {icono}
        {item.label}
      </a>
    );
  }

  return (
    <a
      href={item.href}
      className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${
        activo ? "bg-white/10 text-oro" : "text-white/70 hover:bg-white/5"
      }`}
    >
      {activo && <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-oro" />}
      {icono}
      {item.label}
    </a>
  );
}
