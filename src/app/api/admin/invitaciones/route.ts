import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requerirAdmin, AuthError } from "@/lib/server/auth";
import { json, errorJson } from "@/lib/utils";

export const runtime = "nodejs";

function manejarError(e: unknown) {
  if (e instanceof AuthError) return errorJson(e.message, e.status);
  return errorJson(e instanceof Error ? e.message : "Error", 500);
}

// Listar invitaciones.
export async function GET() {
  try {
    await requerirAdmin();
    const admin = getSupabaseAdmin();
    const { data } = await admin
      .from("invitaciones")
      .select("*")
      .order("created_at", { ascending: false });
    return json({ invitaciones: data ?? [] });
  } catch (e) {
    return manejarError(e);
  }
}

// Crear invitación (email opcional).
export async function POST(req: Request) {
  try {
    const perfil = await requerirAdmin();
    const admin = getSupabaseAdmin();
    const body = await req.json().catch(() => ({}));
    const email = body?.email ? String(body.email).trim().toLowerCase() : null;

    const { data, error } = await admin
      .from("invitaciones")
      .insert({ email, creada_por: perfil.id })
      .select()
      .single();
    if (error) return errorJson("No se pudo crear: " + error.message, 500);
    return json({ invitacion: data });
  } catch (e) {
    return manejarError(e);
  }
}

// Revocar una invitación pendiente.
export async function PATCH(req: Request) {
  try {
    await requerirAdmin();
    const admin = getSupabaseAdmin();
    const body = await req.json();
    const id: string = body?.id;
    if (!id) return errorJson("Falta id.", 400);
    const { error } = await admin
      .from("invitaciones")
      .update({ estado: "revocada" })
      .eq("id", id)
      .eq("estado", "pendiente");
    if (error) return errorJson(error.message, 500);
    return json({ ok: true });
  } catch (e) {
    return manejarError(e);
  }
}
