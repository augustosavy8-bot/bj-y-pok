"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getSupabaseBrowser, usuarioActualId, cerrarSesion } from "@/lib/supabase/client";
import { estaOculto, puedeVerJuego } from "@/lib/juegos-visibles";

// Header sticky + footer del sistema Nocturne. Envuelve las páginas de
// plataforma (home, perfil, admin). El marco de sesión (nombre/saldo/rol) se
// resuelve acá.
export function NocturneShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [nombre, setNombre] = useState("");
  const [esAdmin, setEsAdmin] = useState(false);
  const [saldo, setSaldo] = useState<number | null>(null);

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

  // `juego` marca las entradas que se pueden esconder desde
  // src/lib/juegos-visibles.ts. El admin las sigue viendo, con un punto al lado.
  const nav = [
    { href: "/home", label: "Mesas" },
    { href: "/slots", label: "Slots", juego: "slots" },
    { href: "/juegos/dino-crash", label: "Minijuegos", juego: "dino-crash" },
    { href: "/perfil", label: "Perfil" },
    ...(esAdmin ? [{ href: "/admin", label: "Admin" }] : []),
  ].filter((n) => !n.juego || puedeVerJuego(n.juego, esAdmin));

  return (
    // Chrome migrado a los design tokens "Speakeasy". El saldo (dinero) va en gold.
    <div className="flex min-h-screen flex-col bg-surface-0 text-ink">
      <header className="fade-b sticky top-0 z-40 backdrop-blur" style={{ backgroundColor: "color-mix(in srgb, var(--nc-bg-0) 88%, transparent)" }}>
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-8">
          <a href="/home" className="mr-auto flex items-center gap-2.5 text-ink">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--nc-accent)" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="9.3" /><circle cx="12" cy="12" r="4.3" />
              <path d="M12 2.7V7.2M12 16.8v4.5M2.7 12h4.5M16.8 12h4.5" />
            </svg>
            <span className="font-medium tracking-[0.22em]">NOCTURNA</span>
          </a>
          <div className="flex items-center gap-5 text-sm">
            {nav.map((n) => (
              <a
                key={n.href}
                href={n.href}
                aria-current={pathname === n.href ? "page" : undefined}
                className={`inline-flex items-center gap-1 ${
                  pathname === n.href ? "font-medium text-ink" : "text-ink-muted hover:text-ink"
                }`}
              >
                {n.label}
                {n.juego && estaOculto(n.juego) && (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-gold/80"
                    title="Oculto para los jugadores: sólo lo ves vos"
                    aria-label="oculto para los jugadores"
                  />
                )}
              </a>
            ))}
          </div>
          <div className="h-5 w-px bg-edge" />
          <div className="flex items-center gap-3">
            <a href="/perfil" className="flex flex-col items-end leading-tight" title="Ver mi perfil y créditos">
              <span className="text-[10px] uppercase tracking-[0.1em] text-ink-dim">Créditos</span>
              <span className="text-sm font-semibold tabular-nums text-gold">
                {saldo === null ? "…" : saldo.toLocaleString("es")}
              </span>
            </a>
            {nombre && (
              <div className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-[12px] font-medium text-ink">
                {nombre.slice(0, 2).toUpperCase()}
              </div>
            )}
            <button
              onClick={cerrarSesion}
              className="text-[11px] uppercase tracking-wide text-ink-dim transition hover:text-ink"
            >
              Salir
            </button>
          </div>
        </nav>
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
            <a href="/home" className="hover:text-ink">Mesas</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
