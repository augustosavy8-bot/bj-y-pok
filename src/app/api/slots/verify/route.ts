import { requerirUsuario, AuthError } from "@/lib/server/auth";
import { getSupabaseServer } from "@/lib/supabase/server-ssr";
import { json, errorJson } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Prueba provably-fair de un giro ya cerrado: revela el server_seed y devuelve
// la grilla guardada + la grilla RECOMPUTADA por la RPC (match=true prueba que
// no hubo manipulación). Además incluimos abajo la fórmula para recomputar el
// HMAC del lado cliente y confirmarlo de forma independiente.
export async function POST(req: Request) {
  try {
    await requerirUsuario();

    const body = await req.json().catch(() => ({}));
    const spinId = String(body?.spinId ?? "").trim();
    if (!spinId) return errorJson("Falta el spinId.", 400);

    const supabase = getSupabaseServer();
    const { data, error } = await supabase.rpc("verify_spin", { p_spin_id: spinId });

    if (error) {
      if (/spin_no_encontrado/.test(error.message)) return errorJson("No se encontró ese giro.", 404);
      return errorJson("No se pudo verificar: " + error.message, 500);
    }

    return json(data);
  } catch (e) {
    if (e instanceof AuthError) return errorJson(e.message, e.status);
    return errorJson(e instanceof Error ? e.message : "Error", 500);
  }
}
