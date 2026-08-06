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
  const [{ data: slot }, { data: symbols }, saldo, { data: free }] = await Promise.all([
    admin.from("slots").select("*").eq("slug", slug).eq("active", true).maybeSingle(),
    admin.from("slot_symbols").select("*").eq("slot_slug", slug).order("sort", { ascending: true }),
    saldoActual(admin, perfil.id),
    admin
      .from("slot_free_balance")
      .select("free_spins")
      .eq("user_id", perfil.id)
      .eq("slot_slug", slug)
      .maybeSingle(),
  ]);

  if (!slot) notFound();

  const config = slot as unknown as SlotConfig;
  const simbolos = (symbols ?? []) as unknown as SlotSymbolRow[];
  const freeSpins = (free as { free_spins: number } | null)?.free_spins ?? 0;

  return (
    <SlotMachine
      config={config}
      symbols={simbolos}
      theme={tema}
      saldoInicial={saldo}
      freeInicial={freeSpins}
    />
  );
}
