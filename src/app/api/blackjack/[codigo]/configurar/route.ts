import { getSupabaseAdmin } from "@/lib/supabase/server";
import { verificarCrupier } from "@/lib/server/mesa";
import { asegurarConfig, jugadoresDeMesa, cargarEstadoBJ } from "@/lib/server/blackjack";
import { json, errorJson, errorFrom } from "@/lib/utils";

export const runtime = "nodejs";

// Crear/actualizar la configuración de la sesión de blackjack.
export async function POST(req: Request, { params }: { params: { codigo: string } }) {
  try {
    const admin = getSupabaseAdmin();
    const mesa = await verificarCrupier(admin, params.codigo);
    const body = await req.json();
    await asegurarConfig(admin, mesa);

    const { jugadores } = await cargarEstadoBJ(admin, mesa.id);
    const ordenDefault = jugadoresDeMesa(jugadores).map((j) => j.id);

    const campos = [
      "cantidad_mazos",
      "barajar_cada_manos",
      "soft_17_regla",
      "blackjack_pago",
      "permite_double_after_split",
      "permite_surrender",
      "permite_insurance",
      "rotacion_banca",
      "max_split_hands",
      "apuesta_min",
      "apuesta_max",
      "segundos_por_turno",
    ] as const;

    const update: Record<string, unknown> = {};
    for (const c of campos) if (body[c] !== undefined) update[c] = body[c];
    update.orden_banca =
      Array.isArray(body.orden_banca) && body.orden_banca.length > 0
        ? body.orden_banca
        : ordenDefault;

    const { data, error } = await admin
      .from("bj_configuracion_sesion")
      .update(update)
      .eq("mesa_id", mesa.id)
      .select()
      .single();
    if (error) return errorJson("No se pudo guardar la configuración: " + error.message, 500);

    // Sincronizar cantidad de mazos con el shoe.
    if (update.cantidad_mazos !== undefined) {
      await admin
        .from("bj_shoe")
        .update({ cantidad_mazos: update.cantidad_mazos })
        .eq("mesa_id", mesa.id);
    }
    return json({ config: data });
  } catch (e) {
    return errorFrom(e);
  }
}
