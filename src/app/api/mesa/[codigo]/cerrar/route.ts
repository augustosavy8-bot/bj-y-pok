import { getSupabaseAdmin } from "@/lib/supabase/server";
import { mesaPorCodigo } from "@/lib/server/mesa";
import { requerirUsuario, verificarCrupierSesion } from "@/lib/server/auth";
import { registrarMovimiento } from "@/lib/server/creditos";
import { json, errorFrom } from "@/lib/utils";
import type { Jugador } from "@/lib/types";

export const runtime = "nodejs";

// Cierra la mesa: cash-out de todos los jugadores y estado = terminada, para
// que no queden mesas pendientes. Solo el crupier (admin) puede hacerlo. Se
// permite cerrar en cualquier momento (el admin decide cuándo).
export async function POST(_req: Request, { params }: { params: { codigo: string } }) {
  try {
    const admin = getSupabaseAdmin();
    const user = await requerirUsuario();
    const mesa = await mesaPorCodigo(admin, params.codigo);
    await verificarCrupierSesion(admin, mesa.codigo_sala, user.id);

    if (mesa.estado === "terminada") {
      return json({ ok: true, ya_cerrada: true, cash_out: 0 });
    }

    // Cash-out de cada jugador (no crupier) que siga en la mesa.
    const { data: jugRaw } = await admin
      .from("jugadores")
      .select("*")
      .eq("mesa_id", mesa.id)
      .eq("es_crupier", false)
      .neq("estado", "eliminado");
    const jugadores = (jugRaw ?? []) as Jugador[];

    let totalCashOut = 0;
    for (const j of jugadores) {
      if (j.auth_uid && !mesa.es_practica && mesa.creditos_minimos > 0 && j.fichas > 0) {
        await registrarMovimiento(admin, {
          userId: j.auth_uid,
          tipo: "cash_out_mesa",
          monto: j.fichas,
          mesaId: mesa.id,
          realizadoPor: user.id,
          notas: `Cierre de mesa ${mesa.codigo_sala}`,
        });
        totalCashOut += j.fichas;
      }
      await admin.from("jugadores").update({ estado: "eliminado", fichas: 0 }).eq("id", j.id);
    }

    await admin.from("mesas").update({ estado: "terminada" }).eq("id", mesa.id);

    return json({ ok: true, cash_out: totalCashOut, jugadores: jugadores.length });
  } catch (e) {
    return errorFrom(e);
  }
}
