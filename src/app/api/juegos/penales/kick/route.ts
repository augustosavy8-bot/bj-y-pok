import { requerirUsuario, AuthError } from "@/lib/server/auth";
import { getSupabaseServer } from "@/lib/supabase/server-ssr";
import { json, errorJson } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Una patada a la zona indicada (0..5). El resultado lo decide la RPC
// penales_kick (SECURITY DEFINER); acá sólo validamos y delegamos.
export async function POST(req: Request) {
  try {
    await requerirUsuario();

    const body = await req.json().catch(() => ({}));
    const zona = Number(body?.zona);
    if (!Number.isInteger(zona) || zona < 0 || zona > 5) return errorJson("Zona inválida.", 400);

    const supabase = getSupabaseServer();
    const { data, error } = await supabase.rpc("penales_kick", { p_zona: zona });

    if (error) {
      const m = error.message || "";
      if (/zona_invalida/.test(m)) return errorJson("Zona inválida.", 400);
      if (/sin_tanda/.test(m)) return errorJson("No tenés una tanda en juego.", 409);
      if (/no_session/.test(m)) return errorJson("No hay sesión activa.", 401);
      return errorJson("No se pudo patear: " + m, 500);
    }

    return json(data);
  } catch (e) {
    if (e instanceof AuthError) return errorJson(e.message, e.status);
    return errorJson(e instanceof Error ? e.message : "Error", 500);
  }
}
