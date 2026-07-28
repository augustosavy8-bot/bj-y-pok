import { getSupabaseAdmin } from "@/lib/supabase/server";
import { tickTodasLasMesas } from "@/lib/server/bj-auto";
import { json, errorJson, errorFrom } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Admin = ReturnType<typeof getSupabaseAdmin>;

// Ventana de validez del vale emitido por el cron.
const NONCE_VALIDO_MS = 60_000;

/**
 * El latido se autentica de dos formas posibles:
 *
 * 1. Vale de un solo uso (por defecto, sin configurar nada): el cron de la base
 *    inserta un nonce aleatorio en `bj_tick_nonce` y lo manda en el header. Acá
 *    se consume con un DELETE .. RETURNING (atómico, single-use). Nadie de
 *    afuera puede fabricarlo: esa tabla solo la escribe la base misma.
 * 2. Secreto compartido `BJ_TICK_SECRET`, si algún día se prefiere esa vía.
 */
async function autorizado(req: Request, admin: Admin): Promise<boolean> {
  const secreto = process.env.BJ_TICK_SECRET;
  if (secreto && req.headers.get("x-tick-secret") === secreto) return true;

  const nonce = req.headers.get("x-tick-nonce");
  if (!nonce) return false;

  const desde = new Date(Date.now() - NONCE_VALIDO_MS).toISOString();
  const { data } = await admin
    .from("bj_tick_nonce")
    .delete()
    .eq("valor", nonce)
    .gt("created_at", desde)
    .select("valor");

  return Array.isArray(data) && data.length > 0;
}

/**
 * Latido de las mesas permanentes (24/7).
 *
 * Lo llama pg_cron desde Supabase cada pocos segundos. No depende de ningún
 * navegador: la mesa sigue girando aunque nadie tenga la app abierta.
 */
export async function POST(req: Request) {
  try {
    const admin = getSupabaseAdmin();
    if (!(await autorizado(req, admin))) return errorJson("No autorizado", 401);

    const mesas = await tickTodasLasMesas(admin);
    return json({ ok: true, mesas });
  } catch (e) {
    return errorFrom(e);
  }
}
