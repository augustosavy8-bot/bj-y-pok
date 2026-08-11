import { redirect } from "next/navigation";
import { perfilActual } from "@/lib/server/auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { saldoActual } from "@/lib/server/creditos";
import { NocturneShell } from "@/components/nocturne/NocturneShell";
import { DinoCrash } from "@/components/DinoCrash";

export const dynamic = "force-dynamic";

// Dino Crash: ronda GLOBAL compartida. El estado (fase, timing, config, mi
// apuesta) sale del poll crash_tick; acá sólo autenticamos y pasamos el saldo
// inicial para mostrarlo al toque.
export default async function DinoCrashPage() {
  const perfil = await perfilActual();
  if (!perfil) redirect("/login?next=/juegos/dino-crash");

  const admin = getSupabaseAdmin();
  const saldo = await saldoActual(admin, perfil.id);

  return (
    <NocturneShell>
      <DinoCrash saldoInicial={saldo} />
    </NocturneShell>
  );
}
