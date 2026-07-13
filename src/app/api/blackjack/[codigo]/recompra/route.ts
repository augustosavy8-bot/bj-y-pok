import { getSupabaseAdmin } from "@/lib/supabase/server";
import { verificarCrupier } from "@/lib/server/mesa";
import { recompra } from "@/lib/server/blackjack";
import { json, errorJson, errorFrom } from "@/lib/utils";

export const runtime = "nodejs";

// Recompra de fichas (buy-in). La dispara el crupier para cualquier jugador
// (incluida la banca cuando se funde).
export async function POST(req: Request, { params }: { params: { codigo: string } }) {
  try {
    const admin = getSupabaseAdmin();
    const mesa = await verificarCrupier(admin, params.codigo);
    const body = await req.json();
    const jugadorId: string = body?.jugador_id;
    const monto = Number(body?.monto) || 0;
    if (!jugadorId) return errorJson("Falta jugador_id.", 400);
    const res = await recompra(admin, mesa, jugadorId, monto);
    return json(res);
  } catch (e) {
    return errorFrom(e);
  }
}
