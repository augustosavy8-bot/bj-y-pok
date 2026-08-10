import { redirect, notFound } from "next/navigation";
import { perfilActual } from "@/lib/server/auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { saldoActual } from "@/lib/server/creditos";
import { temaDe } from "@/lib/slots/themes";
import { SlotMachine, type SlotConfig, type SlotSymbolRow } from "@/components/SlotMachine";

export const dynamic = "force-dynamic";

// Ruta dinámica de un slot. Server component: carga la config (slots +
// slot_symbols) y el saldo, y se lo pasa al client <SlotMachine>. El tema
// (SVG/colores) sale del registro local por slug. Sin lógica de juego acá.
export default async function SlotPage({ params }: { params: { slug: string } }) {
  const slug = params.slug;

  const perfil = await perfilActual();
  if (!perfil) redirect(`/login?next=/slots/${slug}`);

  const tema = temaDe(slug);
  if (!tema) notFound();

  const admin = getSupabaseAdmin();
  const [{ data: slot }, { data: symbols }, saldo, { data: bonus }] = await Promise.all([
    admin.from("slots").select("*").eq("slug", slug).eq("active", true).maybeSingle(),
    admin.from("slot_symbols").select("*").eq("slot_slug", slug).order("sort", { ascending: true }),
    saldoActual(admin, perfil.id),
    // Sesión de bonus activa (para retomar la tanda si se recarga la página).
    admin
      .from("bonus_sessions")
      .select("source, tier, bet_locked, spins_total, spins_played, total_multiplier")
      .eq("user_id", perfil.id)
      .eq("slot_slug", slug)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  if (!slot) notFound();

  const config = slot as unknown as SlotConfig;
  const simbolos = (symbols ?? []) as unknown as SlotSymbolRow[];

  return (
    <SlotMachine
      config={config}
      symbols={simbolos}
      theme={tema}
      saldoInicial={saldo}
      bonusInicial={(bonus as unknown as import("@/components/SlotMachine").BonusSesion | null) ?? null}
    />
  );
}
