import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requerirUsuario } from "@/lib/server/auth";
import { saldoActual } from "@/lib/server/creditos";
import { json, errorFrom } from "@/lib/utils";

export const runtime = "nodejs";

// Saldo + movimientos + solicitudes de retiro del usuario logueado.
export async function GET() {
  try {
    const admin = getSupabaseAdmin();
    const user = await requerirUsuario();
    const [saldo, mov, sol] = await Promise.all([
      saldoActual(admin, user.id),
      admin
        .from("creditos_movimientos")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
      admin
        .from("solicitudes_retiro")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]);
    return json({
      saldo,
      movimientos: mov.data ?? [],
      solicitudes: sol.data ?? [],
    });
  } catch (e) {
    return errorFrom(e);
  }
}
