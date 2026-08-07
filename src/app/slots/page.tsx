import { redirect } from "next/navigation";
import { perfilActual } from "@/lib/server/auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { NocturneShell } from "@/components/nocturne/NocturneShell";
import { temaDe } from "@/lib/slots/themes";

export const dynamic = "force-dynamic";

// Hub de slots: lista los slots activos de la DB y linkea a /slots/[slug].
// Reemplaza el slot único viejo. Cada tarjeta usa el tema local por slug.
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
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
        <h1 className="mb-1 text-2xl font-semibold text-acento">Slots</h1>
        <p className="mb-6 text-sm text-tinta/70">Elegí una máquina. El saldo es el mismo de tus fichas.</p>

        {slots.length === 0 ? (
          <p className="text-tinta/60">No hay slots activos por ahora.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {slots.map((s) => {
              const tema = temaDe(s.slug);
              const symKeys = Object.keys(tema?.symbols ?? {});
              const wild = tema?.symbols.wild ?? (symKeys.length ? tema?.symbols[symKeys[0]] : "") ?? "";
              return (
                <a
                  key={s.slug}
                  href={`/slots/${s.slug}`}
                  className="group block overflow-hidden rounded-2xl transition hover:scale-[1.01] hover:shadow-2xl"
                  style={{
                    background: "#120d07",
                    boxShadow: "inset 0 0 0 1px color-mix(in srgb, #d8b166 35%, transparent)",
                    ...(tema?.colors as React.CSSProperties),
                  }}
                >
                  {tema?.card ? (
                    // Banner de presentación: imagen 16:9 con el nombre superpuesto.
                    <div className="relative aspect-[16/9] w-full overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={tema.card}
                        alt={s.name}
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
                      />
                      <div
                        className="absolute inset-0"
                        style={{ background: "linear-gradient(180deg, rgba(8,6,3,0) 38%, rgba(8,6,3,.88) 100%)" }}
                      />
                      <div className="absolute inset-x-0 bottom-0 p-4">
                        <div
                          className="text-xl font-semibold"
                          style={{ color: "var(--brass, #e7c477)", textShadow: "0 2px 10px rgba(0,0,0,.75)" }}
                        >
                          {s.name}
                        </div>
                        <div className="text-xs text-white/75">{s.tagline}</div>
                      </div>
                    </div>
                  ) : (
                    // Fallback (slot sin imagen): símbolo wild + título.
                    <div className="flex items-center gap-3 p-5">
                      <div className="h-12 w-12 shrink-0" dangerouslySetInnerHTML={{ __html: wild }} />
                      <div>
                        <div className="text-lg font-semibold" style={{ color: "var(--brass, #d8b166)" }}>
                          {s.name}
                        </div>
                        <div className="text-xs text-tinta/70">{s.tagline}</div>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-xs" style={{ color: "var(--cream, #f3e7c9)" }}>
                      {s.reels} rodillos · {s.rows} filas
                    </span>
                    <span className="text-sm text-acento group-hover:underline">Jugar →</span>
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
