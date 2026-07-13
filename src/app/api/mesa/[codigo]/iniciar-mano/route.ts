import { getSupabaseAdmin } from "@/lib/supabase/server";
import { verificarCrupier } from "@/lib/server/mesa";
import { iniciarNuevaMano } from "@/lib/server/juego";
import { json, errorFrom } from "@/lib/utils";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: { codigo: string } }
) {
  try {
    const admin = getSupabaseAdmin();
    const mesa = await verificarCrupier(admin, params.codigo);
    const res = await iniciarNuevaMano(admin, mesa);
    return json(res);
  } catch (e) {
    return errorFrom(e);
  }
}
