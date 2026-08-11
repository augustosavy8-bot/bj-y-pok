import { requerirUsuario, AuthError } from "@/lib/server/auth";
import { getSupabaseServer } from "@/lib/supabase/server-ssr";
import { json, errorJson } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Retiro (cash-out) de mi apuesta en la ronda GLOBAL corriendo. El server decide
// por el multiplicador compartido con techo por tiempo (anti-cheat) y tope de
// premio. Toda la lógica vive en crash_cashout (SECURITY DEFINER).
export async function POST(req: Request) {
  try {
    await requerirUsuario();
    const body = await req.json().catch(() => ({}));
    const mult = Number(body?.mult);
    if (!Number.isFinite(mult) || mult < 1) return errorJson("Multiplicador inválido.", 400);

    const supabase = getSupabaseServer();
    const { data, error } = await supabase.rpc("crash_cashout", { p_mult: mult });
    if (error) {
      const m = error.message || "";
      if (/sin_apuesta/.test(m)) return errorJson("No tenés una apuesta activa.", 409);
      if (/ronda_no_empezo/.test(m)) return errorJson("La ronda todavía no arrancó.", 409);
      if (/no_session/.test(m)) return errorJson("No hay sesión activa.", 401);
      return errorJson("No se pudo retirar: " + m, 500);
    }
    return json(data);
  } catch (e) {
    if (e instanceof AuthError) return errorJson(e.message, e.status);
    return errorJson(e instanceof Error ? e.message : "Error", 500);
  }
}
