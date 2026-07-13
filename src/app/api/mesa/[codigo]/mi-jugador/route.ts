import { getSupabaseAdmin } from "@/lib/supabase/server";
import { mesaPorCodigo } from "@/lib/server/mesa";
import { requerirUsuario } from "@/lib/server/auth";
import { json, errorFrom } from "@/lib/utils";
import type { Jugador } from "@/lib/types";

export const runtime = "nodejs";

// Devuelve el asiento del usuario logueado en esta mesa (jugador o crupier).
// Reemplaza la resolución de identidad por auth_uid en el cliente, que ya no
// puede leer esa columna.
export async function GET(_req: Request, { params }: { params: { codigo: string } }) {
  try {
    const admin = getSupabaseAdmin();
    const user = await requerirUsuario();
    const mesa = await mesaPorCodigo(admin, params.codigo);

    const { data } = await admin
      .from("jugadores")
      .select("*")
      .eq("mesa_id", mesa.id)
      .eq("auth_uid", user.id)
      .maybeSingle();

    const jugador = (data as Jugador) ?? null;
    return json({
      jugador,
      es_crupier: jugador?.es_crupier ?? false,
      es_practica: mesa.es_practica,
      tipo_juego: mesa.tipo_juego,
    });
  } catch (e) {
    return errorFrom(e);
  }
}
