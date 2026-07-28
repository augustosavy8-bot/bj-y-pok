import { getSupabaseAdmin } from "@/lib/supabase/server";
import { tickTodasLasMesas } from "@/lib/server/bj-auto";
import { json, errorJson, errorFrom } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Latido de las mesas permanentes (24/7).
 *
 * Lo llama pg_cron desde Supabase cada pocos segundos. No lo maneja ningún
 * navegador: la mesa sigue girando aunque no haya nadie con la app abierta.
 *
 * Autenticación: header `x-tick-secret`. Se compara contra BJ_TICK_SECRET si
 * está definida; si no, contra el SERVICE_ROLE_KEY (que Vercel y Supabase ya
 * comparten, para no exigir configuración extra).
 */
export async function POST(req: Request) {
  try {
    const secreto = process.env.BJ_TICK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secreto) return errorJson("Falta BJ_TICK_SECRET", 500);
    if (req.headers.get("x-tick-secret") !== secreto) {
      return errorJson("No autorizado", 401);
    }

    const admin = getSupabaseAdmin();
    const mesas = await tickTodasLasMesas(admin);
    return json({ ok: true, mesas });
  } catch (e) {
    return errorFrom(e);
  }
}
