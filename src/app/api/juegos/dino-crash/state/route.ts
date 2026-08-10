import { requerirUsuario, AuthError } from "@/lib/server/auth";
import { getSupabaseServer } from "@/lib/supabase/server-ssr";
import { json, errorJson } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Poll del estado de una ronda. Si ya pasó el tiempo del crash, la RPC la marca
// 'busted' y recién ahí revela el crash_point. Mientras sigue viva NO lo revela.
export async function POST(req: Request) {
  try {
    await requerirUsuario();

    const body = await req.json().catch(() => ({}));
    const roundId = String(body?.roundId ?? "").trim();
    if (!roundId) return errorJson("Falta la ronda.", 400);

    const supabase = getSupabaseServer();
    const { data, error } = await supabase.rpc("crash_state", { p_round_id: roundId });

    if (error) {
      const m = error.message || "";
      if (/ronda_no_encontrada/.test(m)) return errorJson("No se encontró la ronda.", 404);
      if (/no_autorizado/.test(m)) return errorJson("Esa ronda no es tuya.", 403);
      if (/no_session/.test(m)) return errorJson("No hay sesión activa.", 401);
      return errorJson("No se pudo consultar la ronda: " + m, 500);
    }

    return json(data);
  } catch (e) {
    if (e instanceof AuthError) return errorJson(e.message, e.status);
    return errorJson(e instanceof Error ? e.message : "Error", 500);
  }
}
