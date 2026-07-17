import { getSupabaseAdmin } from "@/lib/supabase/server";
import { mesaPorCodigo } from "@/lib/server/mesa";
import { requerirUsuario, verificarCrupierSesion } from "@/lib/server/auth";
import { registrarMovimiento } from "@/lib/server/creditos";
import { json, errorJson, errorFrom } from "@/lib/utils";
import type { Jugador } from "@/lib/types";

export const runtime = "nodejs";

// Cierra la mesa: cash-out de todos los jugadores y estado = terminada, para
// que no queden mesas pendientes. Solo el crupier (que es admin) puede hacerlo.
// Se rechaza si hay una mano/ronda en curso, para no dejar el dinero en un
// estado inconsistente.
export async function POST(_req: Request, { params }: { params: { codigo: string } }) {
  try {
    const admin = getSupabaseAdmin();
    const user = await requerirUsuario();
    const mesa = await mesaPorCodigo(admin, params.codigo);
    await verificarCrupierSesion(admin, mesa.codigo_sala, user.id);

    if (mesa.estado === "terminada") {
      return json({ ok: true, ya_cerrada: true, cash_out: 0 });
    }

    // No cerrar en medio de una mano/ronda activa.
    if (mesa.tipo_juego === "blackjack") {
      const { data: ronda } = await admin
        .from("bj_rondas")
        .select("estado")
        .eq("mesa_id", mesa.id)
        .order("numero_ronda", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (ronda && (ronda as { estado: string }).estado !== "terminada") {
        return errorJson("Terminá la ronda de blackjack antes de cerrar la mesa.", 409);
      }
    } else {
      const { data: mano } = await admin
        .from("manos")
        .select("fase")
        .eq("mesa_id", mesa.id)
        .order("numero_mano", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (mano && (mano as { fase: string }).fase !== "terminada") {
        return errorJson("Terminá la mano en curso antes de cerrar la mesa.", 409);
      }
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
