import { redirect } from "next/navigation";
import { perfilActual } from "@/lib/server/auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { NocturneShell } from "@/components/nocturne/NocturneShell";
import { temaDe } from "@/lib/slots/themes";

export const dynamic = "force-dynamic";

// Iconos de stats (línea, tono dorado por currentColor).
const IcoRodillos = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M9 6v12M15 6v12" />
  </svg>
);
const IcoFilas = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9.3h18M3 14.6h18" />
  </svg>
);

// Motivo decorativo: luna creciente sobre una pirámide, en un halo tenue.
const Motivo = (
  <div className="pointer-events-none absolute -top-2 right-0 hidden h-56 w-56 place-items-center sm:grid" aria-hidden>
    <div
      className="absolute inset-0 rounded-full"
      style={{ background: "radial-gradient(circle at 50% 45%, rgba(145,132,217,.14), transparent 68%)" }}
    />
    <svg width="150" height="150" viewBox="0 0 150 150" fill="none">
      <path d="M104 44a30 30 0 1 0 12 30 24 24 0 1 1-12-30z" fill="#b9b2e8" opacity=".8" />
      <path d="M30 118 L64 70 L98 118 Z" fill="none" stroke="#8a83c8" strokeWidth="2" opacity=".65" />
      <path d="M64 70 L74 118 H30 Z" fill="#8a83c8" opacity=".16" />
    </svg>
  </div>
);

// Hub de slots: lista los slots activos de la DB y linkea a /slots/[slug].
export default async function SlotsHub() {
  const perfil = await perfilActual();
  if (!perfil) redirect("/login?next=/slots");

  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("slots")
    .select("slug, name, tagline, reels, rows")
    .eq("active", true)
    .order("created_at", { ascending: true });

  const slots = (data ?? []) as { slug: string; name: string; tagline: string | null; reels: number; rows: number }[];

  return (
    <NocturneShell>
      <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-8">
        {Motivo}
        <span className="inline-flex items-center gap-2 text-[13px] uppercase tracking-[0.16em] text-[#e7c477]">
          <span aria-hidden>✦</span> Máquinas
        </span>
        <h1 className="mt-1.5 font-serif text-5xl font-semibold leading-none">Slots</h1>
        <p className="mt-3 max-w-xl text-[15px] text-ink-muted">Elegí una máquina. El saldo es el mismo de tus fichas.</p>

        {slots.length === 0 ? (
          <p className="mt-10 text-ink-muted">No hay slots activos por ahora.</p>
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {slots.map((s) => {
              const tema = temaDe(s.slug);
              return (
                <a
                  key={s.slug}
                  href={`/slots/${s.slug}`}
                  className="group overflow-hidden rounded-2xl border border-[#d8b46a]/20 bg-gradient-to-b from-[#1b1d2c] to-[#15161f] transition hover:-translate-y-0.5 hover:border-[#d8b46a]/45 hover:shadow-2xl"
                >
                  <div className="relative aspect-[16/9] overflow-hidden">
                    {tema?.card ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={tema.card}
                        alt={s.name}
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="h-full w-full bg-[#12131b]" />
                    )}
                    <div
                      className="absolute inset-0"
                      style={{ background: "linear-gradient(180deg, rgba(10,12,20,0) 55%, rgba(10,12,20,.85))" }}
                    />
                  </div>
                  <div className="p-4 text-center">
                    <div className="font-serif text-[23px] font-semibold leading-tight text-[#e7c477]">{s.name}</div>
                    <div className="divider-diamante my-2.5" aria-hidden>◆</div>
                    <div className="flex items-center justify-center gap-3.5 text-[12.5px] text-ink-muted">
                      <span className="inline-flex items-center gap-1.5 text-[#e7c477]/85">
                        {IcoRodillos}
                        <span className="text-ink-muted">{s.reels} rodillos</span>
                      </span>
                      <span className="h-4 w-px bg-white/15" />
                      <span className="inline-flex items-center gap-1.5 text-[#e7c477]/85">
                        {IcoFilas}
                        <span className="text-ink-muted">{s.rows} filas</span>
                      </span>
                    </div>
                    <span className="mt-4 flex w-full items-center justify-center rounded-lg border border-accent py-2.5 text-[15px] text-ink transition group-hover:bg-[color-mix(in_srgb,var(--nc-accent)_10%,transparent)]">
                      Jugar →
                    </span>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </NocturneShell>
  );
}
