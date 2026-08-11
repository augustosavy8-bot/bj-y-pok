import { requerirUsuario, AuthError } from "@/lib/server/auth";
import { getSupabaseServer } from "@/lib/supabase/server-ssr";
import { json, errorJson } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Apostar en la ventana de apuestas de la ronda GLOBAL actual. Cobra la apuesta
// y registra la participación. Toda la lógica vive en crash_bet (SECURITY DEFINER).
export async function POST(req: Request) {
  try {
    await requerirUsuario();
    const body = await req.json().catch(() => ({}));
    const bet = Number(body?.bet);
    if (!Number.isInteger(bet) || bet <= 0) return errorJson("Apuesta inválida.", 400);

    const supabase = getSupabaseServer();
    const { data, error } = await supabase.rpc("crash_bet", { p_bet: bet });
    if (error) {
      const m = error.message || "";
      if (/saldo_insuficiente/.test(m)) return errorJson("Te quedaste sin fichas para esta apuesta.", 402);
      if (/apuestas_cerradas/.test(m)) return errorJson("Se cerraron las apuestas de esta ronda.", 409);
      if (/ya_apostaste/.test(m)) return errorJson("Ya apostaste en esta ronda.", 409);
      if (/apuesta_invalida/.test(m)) return errorJson("Esa apuesta no está permitida.", 400);
      if (/no_session/.test(m)) return errorJson("No hay sesión activa.", 401);
      return errorJson("No se pudo apostar: " + m, 500);
    }
    return json(data);
  } catch (e) {
    if (e instanceof AuthError) return errorJson(e.message, e.status);
    return errorJson(e instanceof Error ? e.message : "Error", 500);
  }
}
