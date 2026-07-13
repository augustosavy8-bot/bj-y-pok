import { getSupabaseAdmin } from "@/lib/supabase/server";
import { verificarCrupier } from "@/lib/server/mesa";
import { cargarEstado, asignarCarta } from "@/lib/server/juego";
import { json, errorJson, errorFrom } from "@/lib/utils";
import { VALORES, PALOS } from "@/lib/types";
import type { Valor, Palo } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: { codigo: string } }
) {
  try {
    const admin = getSupabaseAdmin();
    const mesa = await verificarCrupier(admin, params.codigo);
    const body = await req.json();

    const valor = body?.valor as Valor;
    const palo = body?.palo as Palo;
    if (!VALORES.includes(valor) || !PALOS.includes(palo)) {
      return errorJson("Valor o palo inválido.", 400);
    }

    const { jugadores, mano } = await cargarEstado(admin, mesa.id);
    if (!mano) return errorJson("No hay una mano en curso.", 400);

    const { carta, mensaje } = await asignarCarta(admin, mesa, mano, jugadores, {
      valor,
      palo,
      confianza: 1,
    });
    return json({ carta, mensaje });
  } catch (e) {
    return errorFrom(e);
  }
}
