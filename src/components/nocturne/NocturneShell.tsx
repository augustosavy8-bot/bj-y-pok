"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getSupabaseBrowser, usuarioActualId, cerrarSesion } from "@/lib/supabase/client";
import { estaOculto, puedeVerJuego } from "@/lib/juegos-visibles";

// — Iconos de línea (heredan color por currentColor) —
const Ico = {
  inicio: <><path d="M4 11.5 12 5l8 6.5" /><path d="M6 10v9h12v-9" /></>,
  slots: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M9 6v12M15 6v12" /></>,
  crash: <><path d="M3 17l5-6 3.5 4L15 8l6 9" /><circle cx="18" cy="5.5" r="1.6" /></>,
  perfil: <><circle cx="12" cy="8" r="3.4" /><path d="M5.5 19a6.5 6.5 0 0 1 13 0" /></>,
  admin: <path d="M12 3l7 3v5c0 4.2-2.9 7.7-7 9-4.1-1.3-7-4.8-7-9V6l7-3Z" />,
};

type NavItem = { href: string; label: string; icon: React.ReactNode; juego?: string };

// Header con sidebar desplegable a la izquierda (estilo lobby de casino) +
// barra superior con el saldo. Envuelve las páginas de plataforma.
export function NocturneShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [nombre, setNombre] = useState("");
  const [esAdmin, setEsAdmin] = useState(false);
  const [saldo, setSaldo] = useState<number | null>(null);
  const [colapsado, setColapsado] = useState(false);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    setColapsado(localStorage.getItem("nc-rail") === "1");
  }, []);
  function toggleRail() {
    setColapsado((c) => {
      const n = !c;
      localStorage.setItem("nc-rail", n ? "1" : "0");
      return n;
    });
  }

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
      const r = await fetch("/api/creditos/mi");
      if (r.ok) setSaldo((await r.json()).saldo ?? 0);
    })();
  }, []);

  // Cerrar el drawer al navegar.
  useEffect(() => {
    setDrawer(false);
  }, [pathname]);

  const nav: NavItem[] = [
    { href: "/home", label: "Inicio", icon: Ico.inicio },
    { href: "/slots", label: "Slots", icon: Ico.slots, juego: "slots" },
    { href: "/juegos/dino-crash", label: "Minijuegos", icon: Ico.crash, juego: "dino-crash" },
    { href: "/perfil", label: "Perfil", icon: Ico.perfil },
    ...(esAdmin ? [{ href: "/admin", label: "Admin", icon: Ico.admin }] : []),
  ].filter((n) => !n.juego || puedeVerJuego(n.juego, esAdmin));

  const anchoAside = colapsado ? "lg:w-[76px]" : "lg:w-60";

  return (
    <div className="min-h-screen bg-surface-0 text-ink">
      {/* ── Sidebar (desktop) ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-edge bg-surface-1 transition-[width] duration-200 lg:flex ${anchoAside}`}
      >
        <SidebarContenido
          nav={nav}
          pathname={pathname}
          colapsado={colapsado}
          onToggle={toggleRail}
          esAdmin={esAdmin}
        />
      </aside>

      {/* ── Drawer (mobile) ── */}
      {drawer && (
        <>
          <div className="fixed inset-0 z-40 bg-black/55 lg:hidden" onClick={() => setDrawer(false)} aria-hidden />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-edge bg-surface-1 lg:hidden">
            <SidebarContenido
              nav={nav}
              pathname={pathname}
              colapsado={false}
              onToggle={() => setDrawer(false)}
              esAdmin={esAdmin}
              cerrar
            />
          </aside>
        </>
      )}

      {/* ── Columna de contenido ── */}
      <div className={`flex min-h-screen flex-col transition-[padding] duration-200 ${colapsado ? "lg:pl-[76px]" : "lg:pl-60"}`}>
        {/* Barra superior */}
        <header
          className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-edge px-3 backdrop-blur sm:px-5"
          style={{ backgroundColor: "color-mix(in srgb, var(--nc-bg-0) 86%, transparent)" }}
        >
          <button
            onClick={() => setDrawer(true)}
            className="grid h-9 w-9 place-items-center rounded-md text-ink-muted hover:bg-white/5 hover:text-ink lg:hidden"
            aria-label="Abrir menú"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>

          <a href="/home" className="flex items-center gap-2 lg:hidden">
            <span className="font-medium tracking-[0.22em]">NOCTURNA</span>
          </a>

          <div className="ml-auto flex items-center gap-2.5 sm:gap-3">
            <a
              href="/perfil"
              className="flex items-center gap-2 rounded-lg border border-edge bg-surface-2 px-3 py-1.5 transition hover:border-accent"
              title="Ver mi perfil y créditos"
            >
              <span className="hidden text-[10px] uppercase tracking-[0.1em] text-ink-dim sm:inline">Créditos</span>
              <span className="text-sm font-semibold tabular-nums text-gold">
                {saldo === null ? "…" : saldo.toLocaleString("es")}
              </span>
            </a>
            {nombre && (
              <a href="/perfil" className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-[12px] font-medium text-ink" title={nombre}>
                {nombre.slice(0, 2).toUpperCase()}
              </a>
            )}
            <button
              onClick={cerrarSesion}
              className="hidden text-[11px] uppercase tracking-wide text-ink-dim transition hover:text-ink sm:inline"
            >
              Salir
            </button>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="mt-16">
          <div className="hr mx-auto max-w-6xl" />
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <div className="flex items-center gap-2">
              <span className="font-medium tracking-[0.18em] text-ink">NOCTURNA</span>
              <span className="text-ink-dim">·</span>
              <span>+18 · juego responsable</span>
            </div>
            <div className="flex gap-4">
              <a href="/perfil" className="hover:text-ink">Mi cuenta</a>
              <a href="/home" className="hover:text-ink">Inicio</a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

function SidebarContenido({
  nav,
  pathname,
  colapsado,
  onToggle,
  esAdmin,
  cerrar = false,
}: {
  nav: NavItem[];
  pathname: string;
  colapsado: boolean;
  onToggle: () => void;
  esAdmin: boolean;
  cerrar?: boolean;
}) {
  return (
    <>
      {/* Marca + toggle */}
      <div className={`flex h-14 items-center border-b border-edge ${colapsado ? "justify-center px-0" : "px-3"}`}>
        {!colapsado && (
          <a href="/home" className="mr-auto flex items-center gap-2 text-ink">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--nc-accent)" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="9.3" /><circle cx="12" cy="12" r="4.3" />
              <path d="M12 2.7V7.2M12 16.8v4.5M2.7 12h4.5M16.8 12h4.5" />
            </svg>
            <span className="text-[15px] font-medium tracking-[0.2em]">NOCTURNA</span>
          </a>
        )}
        <button
          onClick={onToggle}
          className="grid h-9 w-9 place-items-center rounded-md text-ink-muted hover:bg-white/5 hover:text-ink"
          aria-label={cerrar ? "Cerrar menú" : "Contraer menú"}
        >
          {cerrar ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              {colapsado ? <path d="M9 6l6 6-6 6" /> : <path d="M15 6l-6 6 6 6" />}
            </svg>
          )}
        </button>
      </div>

      {/* Navegación */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
        {nav.map((n) => {
          const activo = pathname === n.href || (n.href !== "/home" && pathname.startsWith(n.href));
          return (
            <a
              key={n.href}
              href={n.href}
              aria-current={activo ? "page" : undefined}
              title={colapsado ? n.label : undefined}
              className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                colapsado ? "justify-center" : ""
              } ${
                activo
                  ? "bg-[color-mix(in_srgb,var(--nc-accent)_16%,transparent)] font-medium text-ink"
                  : "text-ink-muted hover:bg-white/5 hover:text-ink"
              }`}
            >
              {activo && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-accent" />}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                {n.icon}
              </svg>
              {!colapsado && <span className="truncate">{n.label}</span>}
              {!colapsado && n.juego && estaOculto(n.juego) && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-gold/80" title="Oculto para los jugadores: sólo lo ves vos" />
              )}
            </a>
          );
        })}
      </nav>

      {/* Pie */}
      <div className="border-t border-edge p-2">
        <button
          onClick={cerrarSesion}
          title={colapsado ? "Salir" : undefined}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-ink-muted transition hover:bg-white/5 hover:text-ink ${
            colapsado ? "justify-center" : ""
          }`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <path d="M15 5l-1.5-1.5a2 2 0 0 0-1.4-.5H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6a2 2 0 0 0 1.4-.6L15 19" /><path d="M20 12H10M17 9l3 3-3 3" />
          </svg>
          {!colapsado && <span>Salir</span>}
        </button>
        {!colapsado && (
          <p className="px-3 pt-2 text-[10px] leading-tight text-ink-dim">+18 · juego responsable</p>
        )}
      </div>
    </>
  );
}
