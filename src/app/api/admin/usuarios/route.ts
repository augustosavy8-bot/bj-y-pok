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

// Crear un usuario directo desde el panel (sin link de invitación).
// Signup sigue cerrado: solo un admin puede llegar acá (requerirAdmin).
export async function POST(req: Request) {
  try {
    const adminPerfil = await requerirAdmin();
    const admin = getSupabaseAdmin();
    const body = await req.json();
    const nombre = (body?.nombre ?? "").toString().trim().slice(0, 60);
    const email = (body?.email ?? "").toString().trim().toLowerCase();
    const password = (body?.password ?? "").toString();
    const rol = body?.rol === "admin" ? "admin" : "jugador";

    if (!nombre) return errorJson("Poné un nombre.", 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return errorJson("Email inválido.", 400);
    if (password.length < 8) return errorJson("La contraseña debe tener al menos 8 caracteres.", 400);

    const { data: creado, error: errCreate } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre },
    });
    if (errCreate || !creado.user) {
      const msg = /already registered|exists/i.test(errCreate?.message ?? "")
        ? "Ya existe una cuenta con ese email."
        : "No se pudo crear la cuenta: " + (errCreate?.message ?? "");
      return errorJson(msg, 400);
    }

    // El trigger creó el perfil; completar nombre, rol e invitado_por.
    const { error: errPerfil } = await admin
      .from("perfiles")
      .update({ nombre, rol, invitado_por: adminPerfil.id })
      .eq("id", creado.user.id);
    if (errPerfil) return errorJson("Cuenta creada pero no se pudo completar el perfil: " + errPerfil.message, 500);

    return json({ ok: true, id: creado.user.id, email });
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
