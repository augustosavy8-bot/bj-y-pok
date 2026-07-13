import { getSupabaseAdmin } from "@/lib/supabase/server";
import { verificarCrupier } from "@/lib/server/mesa";
import { cargarEstado, avanzarFase } from "@/lib/server/juego";
import { json, errorJson, errorFrom } from "@/lib/utils";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: { codigo: string } }
) {
  try {
    const admin = getSupabaseAdmin();
    const mesa = await verificarCrupier(admin, params.codigo);

    const { jugadores, mano } = await cargarEstado(admin, mesa.id);
    if (!mano) return errorJson("No hay una mano en curso.", 400);

    const res = await avanzarFase(admin, mesa, mano, jugadores);
    return json(res);
  } catch (e) {
    return errorFrom(e);
  }
}
