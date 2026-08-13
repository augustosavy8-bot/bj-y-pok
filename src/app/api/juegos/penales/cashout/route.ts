import { requerirUsuario, AuthError } from "@/lib/server/auth";
import { getSupabaseServer } from "@/lib/supabase/server-ssr";
import { json, errorJson } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Retira el pozo (sólo post-gol). La RPC penales_cashout acredita al ledger.
export async function POST() {
  try {
    await requerirUsuario();

    const supabase = getSupabaseServer();
    const { data, error } = await supabase.rpc("penales_cashout");

    if (error) {
      const m = error.message || "";
      if (/nada_para_cobrar/.test(m)) return errorJson("Todavía no hay pozo para retirar.", 409);
      if (/sin_tanda/.test(m)) return errorJson("No tenés una tanda en juego.", 409);
      if (/no_session/.test(m)) return errorJson("No hay sesión activa.", 401);
      return errorJson("No se pudo retirar: " + m, 500);
    }

    return json(data);
  } catch (e) {
    if (e instanceof AuthError) return errorJson(e.message, e.status);
    return errorJson(e instanceof Error ? e.message : "Error", 500);
  }
}
