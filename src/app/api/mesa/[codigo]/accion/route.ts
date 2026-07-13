import { getSupabaseAdmin } from "@/lib/supabase/server";
import { mesaPorCodigo } from "@/lib/server/mesa";
import { requerirUsuario, autorizarOperarJugador } from "@/lib/server/auth";
import { cargarEstado, procesarAccion } from "@/lib/server/juego";
import { json, errorJson, errorFrom } from "@/lib/utils";
import type { TipoAccion } from "@/lib/types";

export const runtime = "nodejs";

const TIPOS: TipoAccion[] = ["fold", "check", "call", "raise", "all_in"];

export async function POST(
  req: Request,
  { params }: { params: { codigo: string } }
) {
  try {
    const admin = getSupabaseAdmin();
    const user = await requerirUsuario();
    const body = await req.json();
    const jugadorId: string = body?.jugador_id;
    const tipo = body?.tipo as TipoAccion;
    const monto = Number(body?.monto) || 0;

    if (!TIPOS.includes(tipo)) return errorJson("Acción inválida.", 400);

    const mesa = await mesaPorCodigo(admin, params.codigo);
    const { jugadores, mano } = await cargarEstado(admin, mesa.id);
    if (!mano) return errorJson("No hay una mano en curso.", 400);

    const jugador = jugadores.find((j) => j.id === jugadorId);
    if (!jugador) return errorJson("Jugador no encontrado.", 404);
    // Identidad de la sesión (JWT), nunca del body.
    await autorizarOperarJugador(admin, mesa, jugador, user.id);

    await procesarAccion(admin, mesa, mano, jugadores, jugadorId, tipo, monto);
    return json({ ok: true });
  } catch (e) {
    return errorFrom(e);
  }
}
