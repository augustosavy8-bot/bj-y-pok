import { getSupabaseAdmin } from "@/lib/supabase/server";
import { mesaPorCodigo } from "@/lib/server/mesa";
import { calcularLiquidacion, type NetoJugador } from "@/lib/settlement";
import { json, errorJson } from "@/lib/utils";
import type { Jugador } from "@/lib/types";

export const runtime = "nodejs";

// Liquidación de la sesión (misma lógica para poker y blackjack):
//   neto = fichas_actuales - total_comprado
// y luego el greedy minimiza transacciones.
export async function GET(req: Request, { params }: { params: { codigo: string } }) {
  try {
    const admin = getSupabaseAdmin();
    const mesa = await mesaPorCodigo(admin, params.codigo);
    const { data } = await admin
      .from("jugadores")
      .select("*")
      .eq("mesa_id", mesa.id)
      .eq("es_crupier", false);
    const jugadores = (data ?? []) as Jugador[];

    const netos: NetoJugador[] = jugadores.map((j) => ({
      jugador_id: j.id,
      nombre: j.nombre,
      neto: j.fichas - j.total_comprado,
    }));

    const transacciones = calcularLiquidacion(netos);
    return json({ netos, transacciones });
  } catch (e) {
    return errorJson(e instanceof Error ? e.message : "Error", 400);
  }
}
