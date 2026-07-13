import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requerirAdmin, AuthError } from "@/lib/server/auth";
import { saldoActual, registrarMovimiento, SaldoError } from "@/lib/server/creditos";
import { json, errorJson } from "@/lib/utils";

export const runtime = "nodejs";

function manejar(e: unknown) {
  if (e instanceof AuthError) return errorJson(e.message, e.status);
  if (e instanceof SaldoError) return errorJson(e.message, e.status);
  return errorJson(e instanceof Error ? e.message : "Error", 500);
}

// Saldo + movimientos de un usuario (para el panel admin).
export async function GET(req: Request) {
  try {
    await requerirAdmin();
    const admin = getSupabaseAdmin();
    const userId = new URL(req.url).searchParams.get("user_id");
    if (!userId) return errorJson("Falta user_id.", 400);
    const [saldo, mov] = await Promise.all([
      saldoActual(admin, userId),
      admin
        .from("creditos_movimientos")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    return json({ saldo, movimientos: mov.data ?? [] });
  } catch (e) {
    return manejar(e);
  }
}

// Cargar créditos (o ajuste) a un usuario.
export async function POST(req: Request) {
  try {
    const adminPerfil = await requerirAdmin();
    const admin = getSupabaseAdmin();
    const body = await req.json();
    const userId: string = body?.user_id;
    const monto = Math.floor(Number(body?.monto) || 0);
    const tipo = body?.tipo === "ajuste" ? "ajuste" : "carga";
    const notas: string | null = body?.notas ? String(body.notas).slice(0, 300) : null;

    if (!userId) return errorJson("Falta user_id.", 400);
    if (monto === 0) return errorJson("El monto no puede ser 0.", 400);
    if (tipo === "carga" && monto < 0) return errorJson("Una carga debe ser positiva.", 400);

    const saldo = await registrarMovimiento(admin, {
      userId,
      tipo,
      monto,
      realizadoPor: adminPerfil.id,
      notas,
    });
    return json({ ok: true, saldo });
  } catch (e) {
    return manejar(e);
  }
}
