import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requerirUsuario, AuthError } from "@/lib/server/auth";
import { saldoActual } from "@/lib/server/creditos";
import { json, errorJson } from "@/lib/utils";
import { APUESTAS, calcularRTP, type Simbolo } from "@/lib/slots/maquina";
import { girar } from "@/lib/slots/girar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function manejar(e: unknown) {
  if (e instanceof AuthError) return errorJson(e.message, e.status);
  return errorJson(e instanceof Error ? e.message : "Error", 500);
}

/** Saldo, últimos giros y los jackpots que hubo. */
export async function GET() {
  try {
    const user = await requerirUsuario();
    const admin = getSupabaseAdmin();

    const [saldo, { data: mios }, { data: jackpots }] = await Promise.all([
      saldoActual(admin, user.id),
      admin
        .from("slots_giros")
        .select("id, apuesta, simbolos, multiplicador, premio, jackpot, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(12),
      admin
        .from("slots_giros")
        .select("premio, created_at, user_id")
        .eq("jackpot", true)
        .order("created_at", { ascending: false })
        .limit(3),
    ]);

    // Nombre de quien ganó cada jackpot (para el cartel de "último gran premio").
    let nombres: Record<string, string> = {};
    const ids = [...new Set((jackpots ?? []).map((j: { user_id: string }) => j.user_id))];
    if (ids.length > 0) {
      const { data: perfiles } = await admin.from("perfiles").select("id, nombre").in("id", ids);
      nombres = Object.fromEntries(
        (perfiles ?? []).map((p: { id: string; nombre: string }) => [p.id, p.nombre])
      );
    }

    const { rtp } = calcularRTP();
    return json({
      saldo,
      apuestas: APUESTAS,
      rtp,
      ultimos: mios ?? [],
      jackpots: (jackpots ?? []).map((j: { premio: number; created_at: string; user_id: string }) => ({
        premio: j.premio,
        created_at: j.created_at,
        nombre: nombres[j.user_id] ?? "Alguien",
      })),
    });
  } catch (e) {
    return manejar(e);
  }
}

/** Un giro. El sorteo pasa en el servidor; el cliente sólo lo anima. */
export async function POST(req: Request) {
  try {
    const user = await requerirUsuario();
    const admin = getSupabaseAdmin();

    const body = await req.json().catch(() => ({}));
    const apuesta = Number(body?.apuesta);
    if (!APUESTAS.includes(apuesta as (typeof APUESTAS)[number])) {
      return errorJson("Esa apuesta no está permitida.", 400);
    }

    // Chequeo temprano sólo para dar un mensaje lindo. El chequeo que vale es
    // el de slots_registrar_giro, que corre con el lock del usuario tomado.
    const saldoPrevio = await saldoActual(admin, user.id);
    if (saldoPrevio < apuesta) {
      return errorJson(
        `Te faltan fichas: la apuesta es ${apuesta} y tenés ${saldoPrevio}.`,
        402
      );
    }

    const r = girar(apuesta);

    const { data, error } = await admin.rpc("slots_registrar_giro", {
      p_user: user.id,
      p_apuesta: apuesta,
      p_simbolos: r.simbolos as Simbolo[],
      p_multiplicador: r.multiplicador,
      p_premio: r.premio,
      p_jackpot: r.jackpot,
      p_detalle: r.detalle,
    });

    if (error) {
      if (/saldo_insuficiente/.test(error.message)) {
        return errorJson("Te quedaste sin fichas para esta apuesta.", 402);
      }
      return errorJson("No se pudo registrar el giro: " + error.message, 500);
    }

    const fila = Array.isArray(data) ? data[0] : data;
    return json({
      simbolos: r.simbolos,
      multiplicador: r.multiplicador,
      premio: r.premio,
      detalle: r.detalle,
      jackpot: r.jackpot,
      apuesta,
      saldo: (fila as { saldo: number })?.saldo ?? saldoPrevio - apuesta + r.premio,
    });
  } catch (e) {
    return manejar(e);
  }
}
