import { requerirUsuario, AuthError } from "@/lib/server/auth";
import { getSupabaseServer } from "@/lib/supabase/server-ssr";
import { json, errorJson } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Abre una tanda de penales. Toda la lógica (débito, seed, estado) vive en la
// RPC penales_start (SECURITY DEFINER). Acá: validar sesión y delegar.
export async function POST(req: Request) {
  try {
    await requerirUsuario();

    const body = await req.json().catch(() => ({}));
    const bet = Number(body?.bet);
    const clientSeed = String(body?.clientSeed ?? "").trim();

    if (!Number.isInteger(bet) || bet <= 0) return errorJson("Apuesta inválida.", 400);
    if (!clientSeed) return errorJson("Falta el clientSeed.", 400);

    const supabase = getSupabaseServer();
    const { data, error } = await supabase.rpc("penales_start", {
      p_bet: bet,
      p_client_seed: clientSeed,
    });

    if (error) {
      const m = error.message || "";
      if (/saldo_insuficiente/.test(m)) return errorJson("Te quedaste sin fichas para esta apuesta.", 402);
      if (/apuesta_invalida/.test(m)) return errorJson("Esa apuesta no está permitida.", 400);
      if (/tanda_abierta/.test(m)) return errorJson("Ya tenés una tanda en juego.", 409);
      if (/no_session/.test(m)) return errorJson("No hay sesión activa.", 401);
      return errorJson("No se pudo iniciar la tanda: " + m, 500);
    }

    return json(data);
  } catch (e) {
    if (e instanceof AuthError) return errorJson(e.message, e.status);
    return errorJson(e instanceof Error ? e.message : "Error", 500);
  }
}
