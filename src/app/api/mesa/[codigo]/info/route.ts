import { getSupabaseAdmin } from "@/lib/supabase/server";
import { mesaPorCodigo } from "@/lib/server/mesa";
import { requerirUsuario } from "@/lib/server/auth";
import { saldoActual } from "@/lib/server/creditos";
import { json, errorFrom } from "@/lib/utils";

export const runtime = "nodejs";

// Info de la mesa + si el usuario tiene saldo para el buy-in (pre-validación).
export async function GET(_req: Request, { params }: { params: { codigo: string } }) {
  try {
    const admin = getSupabaseAdmin();
    const user = await requerirUsuario();
    const mesa = await mesaPorCodigo(admin, params.codigo);
    const saldo = await saldoActual(admin, user.id);
    const requiere = mesa.es_practica ? 0 : mesa.creditos_minimos;
    return json({
      codigo_sala: mesa.codigo_sala,
      tipo_juego: mesa.tipo_juego,
      estado: mesa.estado,
      es_practica: mesa.es_practica,
      creditos_minimos: mesa.creditos_minimos,
      mi_saldo: saldo,
      puedo_entrar: saldo >= requiere,
    });
  } catch (e) {
    return errorFrom(e);
  }
}
