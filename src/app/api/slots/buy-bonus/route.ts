import { requerirUsuario, AuthError } from "@/lib/server/auth";
import { getSupabaseServer } from "@/lib/supabase/server-ssr";
import { json, errorJson } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Compra de un tier de bonus (standard / super / max). La lógica (precio, cobro
// por el ledger, creación de la sesión) vive en la RPC buy_bonus (SECURITY
// DEFINER). Se llama con el cliente SSR (JWT del usuario).
export async function POST(req: Request) {
  try {
    await requerirUsuario();

    const body = await req.json().catch(() => ({}));
    const slot = String(body?.slot ?? "").trim();
    const bet = Number(body?.bet);
    const tier = String(body?.tier ?? "").trim();

    if (!slot) return errorJson("Falta el slot.", 400);
    if (!Number.isInteger(bet) || bet <= 0) return errorJson("Apuesta inválida.", 400);
    if (!["standard", "super", "max"].includes(tier)) return errorJson("Tier inválido.", 400);

    const supabase = getSupabaseServer();
    const { data, error } = await supabase.rpc("buy_bonus", {
      p_slot: slot,
      p_bet: bet,
      p_tier: tier,
    });

    if (error) {
      const m = error.message || "";
      if (/saldo_insuficiente/.test(m)) return errorJson("No te alcanzan las fichas para este bonus.", 402);
      if (/bonus_ya_activo/.test(m)) return errorJson("Ya tenés un bonus en curso en este slot.", 409);
      if (/tier_no_config|tier_invalido/.test(m)) return errorJson("Ese bonus no está disponible.", 400);
      if (/apuesta_invalida/.test(m)) return errorJson("Esa apuesta no está permitida.", 400);
      if (/slot_no_encontrado/.test(m)) return errorJson("Ese slot no existe o está inactivo.", 404);
      if (/no_session/.test(m)) return errorJson("No hay sesión activa.", 401);
      return errorJson("No se pudo comprar el bonus: " + m, 500);
    }

    return json(data);
  } catch (e) {
    if (e instanceof AuthError) return errorJson(e.message, e.status);
    return errorJson(e instanceof Error ? e.message : "Error", 500);
  }
}
