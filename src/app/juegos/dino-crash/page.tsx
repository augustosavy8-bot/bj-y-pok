import { redirect } from "next/navigation";
import { perfilActual } from "@/lib/server/auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { saldoActual } from "@/lib/server/creditos";
import { NocturneShell } from "@/components/nocturne/NocturneShell";
import { DinoCrash, type CrashConfig, type ActiveRound } from "@/components/DinoCrash";

export const dynamic = "force-dynamic";

// Página de Dino Crash. Server component: carga la config, el saldo y (si hubo)
// una ronda activa para retomar, y se lo pasa al client <DinoCrash>. La lógica
// del juego vive en las RPC crash_* (provably fair).
export default async function DinoCrashPage() {
  const perfil = await perfilActual();
  if (!perfil) redirect("/login?next=/juegos/dino-crash");

  const admin = getSupabaseAdmin();
  const [{ data: cfg }, saldo, { data: round }] = await Promise.all([
    admin.from("crash_config").select("growth,max_win,min_bet,max_bet,bet_options").eq("id", 1).maybeSingle(),
    saldoActual(admin, perfil.id),
    admin
      .from("crash_rounds")
      .select("id,bet,started_at")
      .eq("user_id", perfil.id)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  const c = (cfg ?? {}) as {
    growth?: number; max_win?: number; min_bet?: number; max_bet?: number; bet_options?: number[];
  };
  const config: CrashConfig = {
    growth: Number(c.growth ?? 0.14),
    maxWin: Number(c.max_win ?? 200000),
    minBet: Number(c.min_bet ?? 10),
    maxBet: Number(c.max_bet ?? 10000),
    betOptions: (c.bet_options ?? [45, 100, 250, 500, 1000, 2500, 5000, 10000]).map(Number),
  };

  const r = round as { id: string; bet: number; started_at: string } | null;
  const activa: ActiveRound | null = r
    ? { roundId: r.id, bet: r.bet, startedAt: new Date(r.started_at).getTime() / 1000 }
    : null;

  return (
    <NocturneShell>
      <DinoCrash config={config} saldoInicial={saldo} activa={activa} />
    </NocturneShell>
  );
}
