import { requerirUsuario, AuthError } from "@/lib/server/auth";
import { getSupabaseServer } from "@/lib/supabase/server-ssr";
import { json, errorJson } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Prueba provably-fair de una ronda cerrada: revela el server_seed y recomputa el
// punto de crash. match=true prueba que el crash estaba fijado desde el inicio.
export async function POST(req: Request) {
  try {
    await requerirUsuario();

    const body = await req.json().catch(() => ({}));
    const roundId = String(body?.roundId ?? "").trim();
    if (!roundId) return errorJson("Falta la ronda.", 400);

    const supabase = getSupabaseServer();
    const { data, error } = await supabase.rpc("crash_verify", { p_round_id: roundId });

    if (error) {
      const m = error.message || "";
      if (/ronda_no_encontrada/.test(m)) return errorJson("No se encontró la ronda.", 404);
      if (/ronda_en_curso/.test(m)) return errorJson("La ronda todavía está en curso.", 409);
      return errorJson("No se pudo verificar: " + m, 500);
    }

    return json(data);
  } catch (e) {
    if (e instanceof AuthError) return errorJson(e.message, e.status);
    return errorJson(e instanceof Error ? e.message : "Error", 500);
  }
}
