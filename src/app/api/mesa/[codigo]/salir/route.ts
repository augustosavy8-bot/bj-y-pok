import { getSupabaseAdmin } from "@/lib/supabase/server";
import { mesaPorCodigo } from "@/lib/server/mesa";
import { requerirUsuario } from "@/lib/server/auth";
import { registrarMovimiento } from "@/lib/server/creditos";
import { foldJugadorSalida } from "@/lib/server/juego";
import { jugadorEnRondaActivaBJ } from "@/lib/server/blackjack";
import { json, errorJson, errorFrom } from "@/lib/utils";
import type { Jugador } from "@/lib/types";

export const runtime = "nodejs";

// Cash-out: el jugador sale de la mesa. Sus fichas vuelven a créditos (en
// mesas reales), queda eliminado (no se borra la fila, por auditoría) y, si
// estaba en una mano activa de poker, se lo trata como fold.
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
      return json({ ok: true, cobrado: 0, ya_retirado: true });
    }

    // Fold / salida de la partida en curso.
    if (mesa.tipo_juego === "blackjack") {
      if (await jugadorEnRondaActivaBJ(admin, mesa.id, jugador.id)) {
        return errorJson(
          "No podés salir en medio de una ronda de blackjack; esperá a que termine.",
          409
        );
      }
    } else {
      await foldJugadorSalida(admin, mesa, jugador.id);
    }

    // Recargar fichas (por si el fold cambió algo) y hacer el cash-out.
    const { data: actualRaw } = await admin
      .from("jugadores")
      .select("fichas")
      .eq("id", jugador.id)
      .single();
    const fichas = (actualRaw as { fichas: number }).fichas;

    if (!mesa.es_practica && mesa.creditos_minimos > 0 && fichas > 0) {
      await registrarMovimiento(admin, {
        userId: user.id,
        tipo: "cash_out_mesa",
        monto: fichas,
        mesaId: mesa.id,
        realizadoPor: user.id,
        notas: `Cash-out mesa ${mesa.codigo_sala}`,
      });
    }

    await admin
      .from("jugadores")
      .update({ estado: "eliminado", fichas: 0 })
      .eq("id", jugador.id);

    return json({ ok: true, cobrado: fichas });
  } catch (e) {
    return errorFrom(e);
  }
}
