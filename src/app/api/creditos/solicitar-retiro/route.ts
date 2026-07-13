import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requerirUsuario } from "@/lib/server/auth";
import { saldoActual } from "@/lib/server/creditos";
import { json, errorJson, errorFrom } from "@/lib/utils";
import type { SolicitudRetiro } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const admin = getSupabaseAdmin();
    const user = await requerirUsuario();
    const body = await req.json();
    const monto = Math.floor(Number(body?.monto) || 0);
    if (monto <= 0) return errorJson("Ingresá un monto válido.", 400);

    // Disponible = saldo menos lo ya comprometido en retiros pendientes/aprobados.
    const saldo = await saldoActual(admin, user.id);
    const { data: pendientes } = await admin
      .from("solicitudes_retiro")
      .select("monto_solicitado")
      .eq("user_id", user.id)
      .in("estado", ["pendiente", "aprobada"]);
    const comprometido = (pendientes ?? []).reduce(
      (s, r: { monto_solicitado: number }) => s + r.monto_solicitado,
      0
    );
    const disponible = saldo - comprometido;

    if (monto > disponible) {
      return errorJson(
        `No podés retirar más que tu saldo disponible (${disponible}).`,
        400
      );
    }

    const { data, error } = await admin
      .from("solicitudes_retiro")
      .insert({ user_id: user.id, monto_solicitado: monto })
      .select()
      .single();
    if (error) return errorJson("No se pudo crear la solicitud: " + error.message, 500);
    return json({ solicitud: data as SolicitudRetiro });
  } catch (e) {
    return errorFrom(e);
  }
}
