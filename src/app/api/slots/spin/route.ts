import { requerirUsuario, AuthError } from "@/lib/server/auth";
import { getSupabaseServer } from "@/lib/supabase/server-ssr";
import { json, errorJson } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Un giro. TODA la lógica (RNG, evaluación de líneas, pagos, saldo) vive en la
// RPC play_spin (SECURITY DEFINER). Acá: validar sesión y delegar. Cero juego.
//
// Se llama con el cliente SSR (JWT del usuario) para que auth.uid() dentro de
// play_spin identifique al jugador; la RPC bypassa RLS para escribir el ledger.
export async function POST(req: Request) {
  try {
    // Valida sesión y que la cuenta esté activa (lanza AuthError si no).
    await requerirUsuario();

    const body = await req.json().catch(() => ({}));
    const slot = String(body?.slot ?? "").trim();
    const bet = Number(body?.bet);
    const clientSeed = String(body?.clientSeed ?? "").trim();

    if (!slot) return errorJson("Falta el slot.", 400);
    if (!Number.isInteger(bet) || bet <= 0) return errorJson("Apuesta inválida.", 400);
    if (!clientSeed) return errorJson("Falta el clientSeed.", 400);

    const supabase = getSupabaseServer();
    const { data, error } = await supabase.rpc("play_spin", {
      p_slot: slot,
      p_bet: bet,
      p_client_seed: clientSeed,
    });

    if (error) {
      const m = error.message || "";
      if (/saldo_insuficiente/.test(m)) return errorJson("Te quedaste sin fichas para esta apuesta.", 402);
      if (/apuesta_invalida/.test(m)) return errorJson("Esa apuesta no está permitida.", 400);
      if (/slot_no_encontrado/.test(m)) return errorJson("Ese slot no existe o está inactivo.", 404);
      if (/no_session/.test(m)) return errorJson("No hay sesión activa.", 401);
      return errorJson("No se pudo procesar el giro: " + m, 500);
    }

    return json(data);
  } catch (e) {
    if (e instanceof AuthError) return errorJson(e.message, e.status);
    return errorJson(e instanceof Error ? e.message : "Error", 500);
  }
}
