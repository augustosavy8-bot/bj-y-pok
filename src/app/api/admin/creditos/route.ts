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

// Sin user_id → saldos de TODOS en una sola consulta (el panel los pedía de a
// uno: con N usuarios eran N+1 requests y la pantalla tardaba en abrir).
// Con user_id → saldo + movimientos de ese usuario.
export async function GET(req: Request) {
  try {
    await requerirAdmin();
    const admin = getSupabaseAdmin();
    const userId = new URL(req.url).searchParams.get("user_id");

    if (!userId) {
      const { data, error } = await admin.rpc("saldos_todos");
      if (error) return errorJson(error.message, 500);
      const saldos: Record<string, number> = {};
      for (const f of (data ?? []) as { user_id: string; saldo: number }[]) {
        saldos[f.user_id] = Number(f.saldo) || 0;
      }
      return json({ saldos });
    }
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

// Cargar o BAJAR créditos a un usuario.
//  · tipo "carga"  → siempre positivo (acreditar).
//  · tipo "ajuste" → positivo o negativo. Es la vía para descontarle créditos
//    a alguien sin que haya pedido un retiro.
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

    // Al descontar: no tocarle el saldo a alguien con una mano viva. Su apuesta
    // ya está retenida y bajarle créditos dejaría la ronda inconsistente.
    if (monto < 0) {
      const { data: asientos } = await admin
        .from("jugadores")
        .select("id")
        .eq("auth_uid", userId)
        .eq("es_crupier", false)
        .neq("estado", "eliminado");
      const ids = (asientos ?? []).map((a: { id: string }) => a.id);
      if (ids.length > 0) {
        const { data: manosVivas } = await admin
          .from("bj_manos_jugador")
          .select("id, bj_rondas!inner(estado)")
          .in("jugador_id", ids)
          .in("estado_mano", ["apostando", "jugando"])
          .neq("bj_rondas.estado", "terminada");
        if (manosVivas && manosVivas.length > 0) {
          return errorJson(
            "Ese jugador está en medio de una mano. Esperá a que termine la ronda.",
            409
          );
        }
      }
    }

    const saldo = await registrarMovimiento(admin, {
      userId,
      tipo,
      monto,
      realizadoPor: adminPerfil.id,
      notas,
    });

    // En blackjack las fichas de la mesa son un espejo del saldo: si está
    // sentado hay que sincronizarlas, o quedaría apostando plata que ya no
    // tiene y la ronda fallaría al cerrar las apuestas.
    await admin
      .from("jugadores")
      .update({ fichas: saldo })
      .eq("auth_uid", userId)
      .eq("es_crupier", false)
      .neq("estado", "eliminado");

    return json({ ok: true, saldo });
  } catch (e) {
    return manejar(e);
  }
}
