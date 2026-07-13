import { getSupabaseAdmin } from "@/lib/supabase/server";
import { verificarCrupier } from "@/lib/server/mesa";
import { asignarCartaBJ } from "@/lib/server/blackjack";
import { json, errorJson, errorFrom } from "@/lib/utils";
import { VALORES, PALOS } from "@/lib/types";
import type { Valor, Palo } from "@/lib/types";

export const runtime = "nodejs";

// Escanear/asignar una carta en la ronda de blackjack según la fase.
export async function POST(req: Request, { params }: { params: { codigo: string } }) {
  try {
    const admin = getSupabaseAdmin();
    const mesa = await verificarCrupier(admin, params.codigo);
    const body = await req.json();

    const valor = body?.valor as Valor;
    const palo = body?.palo as Palo;
    if (!VALORES.includes(valor) || !PALOS.includes(palo)) {
      return errorJson("Valor o palo inválido.", 400);
    }

    const res = await asignarCartaBJ(admin, mesa, { valor, palo, confianza: 1 });
    return json(res);
  } catch (e) {
    return errorFrom(e);
  }
}
