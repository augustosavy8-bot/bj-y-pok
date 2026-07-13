import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requerirAdmin, AuthError } from "@/lib/server/auth";
import { registrarMovimiento, SaldoError } from "@/lib/server/creditos";
import { json, errorJson } from "@/lib/utils";
import type { SolicitudRetiro } from "@/lib/types";

export const runtime = "nodejs";

function manejar(e: unknown) {
  if (e instanceof AuthError) return errorJson(e.message, e.status);
  if (e instanceof SaldoError) return errorJson(e.message, e.status);
  return errorJson(e instanceof Error ? e.message : "Error", 500);
}

// Listar solicitudes de retiro (con nombre/email del solicitante).
export async function GET() {
  try {
    await requerirAdmin();
    const admin = getSupabaseAdmin();
    const { data } = await admin
      .from("solicitudes_retiro")
      .select("*, solicitante:perfiles!user_id(nombre,email)")
      .order("created_at", { ascending: false });
    return json({ solicitudes: data ?? [] });
  } catch (e) {
    return manejar(e);
  }
}

// Resolver una solicitud: aprobar / rechazar / marcar pagada.
export async function PATCH(req: Request) {
  try {
    const adminPerfil = await requerirAdmin();
    const admin = getSupabaseAdmin();
    const body = await req.json();
    const id: string = body?.id;
    const accion: string = body?.accion; // 'aprobar' | 'rechazar' | 'pagar'
    const notas: string | null = body?.notas ? String(body.notas).slice(0, 300) : null;
    if (!id || !accion) return errorJson("Faltan datos.", 400);

    const { data: solRaw } = await admin
      .from("solicitudes_retiro")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!solRaw) return errorJson("Solicitud no encontrada.", 404);
    const sol = solRaw as SolicitudRetiro;

    const ahora = new Date().toISOString();

    if (accion === "aprobar") {
      if (sol.estado !== "pendiente") return errorJson("La solicitud no está pendiente.", 409);
      await admin
        .from("solicitudes_retiro")
        .update({ estado: "aprobada", resuelta_por: adminPerfil.id, resuelta_at: ahora })
        .eq("id", id);
      return json({ ok: true });
    }

    if (accion === "rechazar") {
      if (sol.estado !== "pendiente" && sol.estado !== "aprobada") {
        return errorJson("No se puede rechazar en este estado.", 409);
      }
      if (!notas) return errorJson("Poné el motivo del rechazo.", 400);
      await admin
        .from("solicitudes_retiro")
        .update({ estado: "rechazada", resuelta_por: adminPerfil.id, resuelta_at: ahora, notas_admin: notas })
        .eq("id", id);
      return json({ ok: true });
    }

    if (accion === "pagar") {
      if (sol.estado !== "aprobada") {
        return errorJson("Solo se puede pagar una solicitud aprobada.", 409);
      }
      // Recién ahora se descuenta del saldo (atómico; puede fallar si el
      // usuario gastó el saldo entre la aprobación y el pago).
      await registrarMovimiento(admin, {
        userId: sol.user_id,
        tipo: "retiro",
        monto: -sol.monto_solicitado,
        realizadoPor: adminPerfil.id,
        solicitudId: sol.id,
        notas: notas ?? "Retiro pagado",
      });
      await admin
        .from("solicitudes_retiro")
        .update({ estado: "pagada", resuelta_por: adminPerfil.id, resuelta_at: ahora })
        .eq("id", id);
      return json({ ok: true });
    }

    return errorJson("Acción inválida.", 400);
  } catch (e) {
    return manejar(e);
  }
}
