import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requerirUsuario } from "@/lib/server/auth";
import { json, errorFrom } from "@/lib/utils";
import type { Mesa } from "@/lib/types";

export const runtime = "nodejs";

// Mesas activas donde el usuario ya participa (como jugador o crupier),
// opcionalmente filtradas por tipo de juego.
export async function GET(req: Request) {
  try {
    const admin = getSupabaseAdmin();
    const user = await requerirUsuario();
    const tipo = new URL(req.url).searchParams.get("tipo");

    const { data: asientos } = await admin
      .from("jugadores")
      .select("mesa_id, es_crupier")
      .eq("auth_uid", user.id)
      .neq("estado", "eliminado");
    const ids = Array.from(new Set((asientos ?? []).map((a: { mesa_id: string }) => a.mesa_id)));
    if (ids.length === 0) return json({ mesas: [] });

    let q = admin.from("mesas").select("*").in("id", ids).neq("estado", "terminada");
    if (tipo === "poker_holdem" || tipo === "blackjack") q = q.eq("tipo_juego", tipo);
    const { data: mesas } = await q.order("created_at", { ascending: false });

    const rolPorMesa: Record<string, boolean> = {};
    for (const a of asientos ?? []) rolPorMesa[(a as { mesa_id: string }).mesa_id] = (a as { es_crupier: boolean }).es_crupier;

    const salida = (mesas ?? []).map((m) => ({
      ...(m as Mesa),
      soy_crupier: rolPorMesa[(m as Mesa).id] ?? false,
    }));
    return json({ mesas: salida });
  } catch (e) {
    return errorFrom(e);
  }
}
