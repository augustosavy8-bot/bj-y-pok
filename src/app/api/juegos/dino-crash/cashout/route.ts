import { requerirUsuario, AuthError } from "@/lib/server/auth";
import { getSupabaseServer } from "@/lib/supabase/server-ssr";
import { json, errorJson } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Retiro (cash-out). El server decide gana/pierde comparando el multiplicador
// reclamado con el crash oculto, con techo por tiempo (anti-cheat) y tope de
// premio. Toda la lógica vive en crash_cashout (SECURITY DEFINER).
export async function POST(req: Request) {
  try {
    await requerirUsuario();

    const body = await req.json().catch(() => ({}));
    const roundId = String(body?.roundId ?? "").trim();
    const mult = Number(body?.mult);

    if (!roundId) return errorJson("Falta la ronda.", 400);
    if (!Number.isFinite(mult) || mult < 1) return errorJson("Multiplicador inválido.", 400);

    const supabase = getSupabaseServer();
    const { data, error } = await supabase.rpc("crash_cashout", { p_round_id: roundId, p_mult: mult });

    if (error) {
      const m = error.message || "";
      if (/ronda_no_encontrada/.test(m)) return errorJson("No se encontró la ronda.", 404);
      if (/no_autorizado/.test(m)) return errorJson("Esa ronda no es tuya.", 403);
      if (/no_session/.test(m)) return errorJson("No hay sesión activa.", 401);
      return errorJson("No se pudo retirar: " + m, 500);
    }

    return json(data);
  } catch (e) {
    if (e instanceof AuthError) return errorJson(e.message, e.status);
    return errorJson(e instanceof Error ? e.message : "Error", 500);
  }
}
