import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requerirAdmin, AuthError } from "@/lib/server/auth";
import { json, errorJson } from "@/lib/utils";

export const runtime = "nodejs";

function manejarError(e: unknown) {
  if (e instanceof AuthError) return errorJson(e.message, e.status);
  return errorJson(e instanceof Error ? e.message : "Error", 500);
}

// Listar usuarios (perfiles).
export async function GET() {
  try {
    await requerirAdmin();
    const admin = getSupabaseAdmin();
    const { data } = await admin
      .from("perfiles")
      .select("*")
      .order("created_at", { ascending: false });
    return json({ usuarios: data ?? [] });
  } catch (e) {
    return manejarError(e);
  }
}

// Activar / desactivar un usuario.
export async function PATCH(req: Request) {
  try {
    const admin_perfil = await requerirAdmin();
    const admin = getSupabaseAdmin();
    const body = await req.json();
    const id: string = body?.id;
    const activo = Boolean(body?.activo);
    if (!id) return errorJson("Falta id.", 400);
    if (id === admin_perfil.id && !activo) {
      return errorJson("No podés desactivar tu propia cuenta.", 400);
    }
    const { error } = await admin.from("perfiles").update({ activo }).eq("id", id);
    if (error) return errorJson(error.message, 500);
    return json({ ok: true });
  } catch (e) {
    return manejarError(e);
  }
}
