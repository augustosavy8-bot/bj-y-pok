import { requerirUsuario, AuthError } from "@/lib/server/auth";
import { getSupabaseServer } from "@/lib/supabase/server-ssr";
import { json, errorJson } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Prueba provably-fair de una tanda ya cerrada: revela el server_seed y devuelve
// la reconstrucción patada por patada (valor RNG, umbral, resultado y zona del
// arquero), con match=true si todo coincide con lo guardado.
export async function POST(req: Request) {
  try {
    await requerirUsuario();

    const body = await req.json().catch(() => ({}));
    const tandaId = String(body?.tandaId ?? "").trim();
    if (!tandaId) return errorJson("Falta el tandaId.", 400);

    const supabase = getSupabaseServer();
    const { data, error } = await supabase.rpc("penales_verify", { p_tanda_id: tandaId });

    if (error) {
      const m = error.message || "";
      if (/tanda_no_encontrada/.test(m)) return errorJson("No se encontró esa tanda.", 404);
      return errorJson("No se pudo verificar: " + m, 500);
    }

    return json(data);
  } catch (e) {
    if (e instanceof AuthError) return errorJson(e.message, e.status);
    return errorJson(e instanceof Error ? e.message : "Error", 500);
  }
}
