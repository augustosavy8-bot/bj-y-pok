import { getSupabaseAdmin } from "@/lib/supabase/server";
import { mesaPorCodigo } from "@/lib/server/mesa";
import { requerirUsuario, autorizarOperarJugador } from "@/lib/server/auth";
import { accionJugadorBJ } from "@/lib/server/blackjack";
import { json, errorJson, errorFrom } from "@/lib/utils";
import type { Jugador } from "@/lib/types";
import type { AccionBJ } from "@/lib/blackjack/types";

export const runtime = "nodejs";

const ACCIONES: AccionBJ[] = ["hit", "stand", "double", "split", "surrender"];

export async function POST(req: Request, { params }: { params: { codigo: string } }) {
  try {
    const admin = getSupabaseAdmin();
    const user = await requerirUsuario();
    const body = await req.json();
    const jugadorId: string = body?.jugador_id;
    const manoId: string = body?.mano_id;
    const accion = body?.accion as AccionBJ;
    if (!ACCIONES.includes(accion)) return errorJson("Acción inválida.", 400);

    const mesa = await mesaPorCodigo(admin, params.codigo);
    const { data: jug } = await admin.from("jugadores").select("*").eq("id", jugadorId).maybeSingle();
    if (!jug) return errorJson("Jugador no encontrado.", 404);
    await autorizarOperarJugador(admin, mesa, jug as Jugador, user.id);

    const res = await accionJugadorBJ(admin, mesa, jugadorId, manoId, accion);
    return json(res);
  } catch (e) {
    return errorFrom(e);
  }
}
