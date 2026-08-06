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
                  className="group rounded-2xl p-5 transition hover:scale-[1.01]"
                  style={{
                    background: "#1a130b",
                    boxShadow: "inset 0 0 0 2px color-mix(in srgb, #d8b166 40%, transparent)",
                    ...(tema?.colors as React.CSSProperties),
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 shrink-0" dangerouslySetInnerHTML={{ __html: wild }} />
                    <div>
                      <div className="text-lg font-semibold" style={{ color: "var(--brass, #d8b166)" }}>
                        {s.name}
                      </div>
                      <div className="text-xs text-tinta/70">{s.tagline}</div>
                    </div>
                  </div>
                  <div className="mt-4 text-sm" style={{ color: "var(--cream, #f3e7c9)" }}>
                    {s.reels} rodillos · {s.rows} filas
                  </div>
                  <div className="mt-2 text-sm text-acento group-hover:underline">Jugar →</div>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </NocturneShell>
  );
}
