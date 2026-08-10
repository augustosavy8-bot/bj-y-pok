import { requerirUsuario, AuthError } from "@/lib/server/auth";
import { getSupabaseServer } from "@/lib/supabase/server-ssr";
import { json, errorJson } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Compra de giros gratis / bonus buy. Toda la lógica (precio, cobro por el
// ledger, acreditación) vive en la RPC buy_free_spins (SECURITY DEFINER). Acá:
// validar sesión y delegar. Se llama con el cliente SSR (JWT del usuario) para
// que auth.uid() identifique al jugador.
export async function POST(req: Request) {
  try {
    await requerirUsuario();

    const body = await req.json().catch(() => ({}));
    const slot = String(body?.slot ?? "").trim();
    const bet = Number(body?.bet);
    const qty = Number(body?.qty);

    if (!slot) return errorJson("Falta el slot.", 400);
    if (!Number.isInteger(bet) || bet <= 0) return errorJson("Apuesta inválida.", 400);
    if (!Number.isInteger(qty) || qty <= 0) return errorJson("Cantidad inválida.", 400);

    const supabase = getSupabaseServer();
    const { data, error } = await supabase.rpc("buy_free_spins", {
      p_slot: slot,
      p_bet: bet,
      p_qty: qty,
    });

    if (error) {
      const m = error.message || "";
      if (/saldo_insuficiente/.test(m)) return errorJson("No te alcanzan las fichas para esta compra.", 402);
      if (/giros_gratis_otra_apuesta/.test(m)) return errorJson("Terminá tus giros gratis actuales antes de comprar a otra apuesta.", 409);
      if (/cantidad_invalida/.test(m)) return errorJson("Esa cantidad no está permitida.", 400);
      if (/apuesta_invalida/.test(m)) return errorJson("Esa apuesta no está permitida.", 400);
      if (/slot_no_encontrado/.test(m)) return errorJson("Ese slot no existe o está inactivo.", 404);
      if (/no_session/.test(m)) return errorJson("No hay sesión activa.", 401);
      return errorJson("No se pudo procesar la compra: " + m, 500);
    }

    return json(data);
  } catch (e) {
    if (e instanceof AuthError) return errorJson(e.message, e.status);
    return errorJson(e instanceof Error ? e.message : "Error", 500);
  }
}
