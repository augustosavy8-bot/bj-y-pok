import { getSupabaseAdmin } from "@/lib/supabase/server";
import { mesaPorCodigo } from "@/lib/server/mesa";
import { requerirUsuario } from "@/lib/server/auth";
import { buyInMesa } from "@/lib/server/creditos";
import { json, errorJson, errorFrom } from "@/lib/utils";
import type { Jugador } from "@/lib/types";

export const runtime = "nodejs";

// Recompra self-service: el jugador agrega otro buy-in. En mesas reales
// descuenta de sus créditos (mismo mínimo); en práctica son fichas gratis.
export async function POST(_req: Request, { params }: { params: { codigo: string } }) {
  try {
    const admin = getSupabaseAdmin();
    const user = await requerirUsuario();
    const mesa = await mesaPorCodigo(admin, params.codigo);

    const { data: jugRaw } = await admin
      .from("jugadores")
      .select("*")
      .eq("mesa_id", mesa.id)
      .eq("auth_uid", user.id)
      .eq("es_crupier", false)
      .maybeSingle();
    if (!jugRaw) return errorJson("No estás sentado en esta mesa.", 404);
    const jugador = jugRaw as Jugador;
    if (jugador.estado === "eliminado") {
      return errorJson("Saliste de la mesa; para volver, unite de nuevo.", 409);
    }

    // buyInMesa valida saldo y cobra (o devuelve fichas gratis en práctica).
    const { fichas: monto } = await buyInMesa(admin, mesa, user.id);

    await admin
      .from("jugadores")
      .update({
        fichas: jugador.fichas + monto,
        total_comprado: jugador.total_comprado + monto,
      })
      .eq("id", jugador.id);

    return json({ ok: true, agregado: monto, fichas: jugador.fichas + monto });
  } catch (e) {
    return errorFrom(e);
  }
}
