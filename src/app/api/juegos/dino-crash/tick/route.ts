import { requerirUsuario, AuthError } from "@/lib/server/auth";
import { getSupabaseServer } from "@/lib/supabase/server-ssr";
import { json, errorJson } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Poll de la ronda GLOBAL compartida. crash_tick avanza el reloj de la ronda
// (perezoso) y devuelve el estado público (sin revelar el crash salvo que ya
// haya crasheado) + mi apuesta en la ronda actual.
export async function POST() {
  try {
    await requerirUsuario();
    const supabase = getSupabaseServer();
    const { data, error } = await supabase.rpc("crash_tick");
    if (error) {
      if (/no_session/.test(error.message)) return errorJson("No hay sesión activa.", 401);
      return errorJson("No se pudo consultar la ronda: " + error.message, 500);
    }
    return json(data);
  } catch (e) {
    if (e instanceof AuthError) return errorJson(e.message, e.status);
    return errorJson(e instanceof Error ? e.message : "Error", 500);
  }
}
