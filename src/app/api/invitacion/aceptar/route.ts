import { getSupabaseAdmin } from "@/lib/supabase/server";
import { json, errorJson } from "@/lib/utils";

export const runtime = "nodejs";

// Acepta una invitación: crea el usuario con service role (signup cerrado),
// marca la invitación como usada y completa el perfil. Público (sin sesión).
export async function POST(req: Request) {
  try {
    const admin = getSupabaseAdmin();
    const body = await req.json();
    const token: string = body?.token;
    const nombre = (body?.nombre ?? "").toString().trim().slice(0, 60);
    const emailBody = (body?.email ?? "").toString().trim().toLowerCase();
    const password: string = body?.password ?? "";

    if (!token) return errorJson("Falta el token.", 400);
    if (!nombre) return errorJson("Poné tu nombre.", 400);
    if (password.length < 8) return errorJson("La contraseña debe tener al menos 8 caracteres.", 400);

    // Revalidar el token server-side.
    const { data: inv } = await admin
      .from("invitaciones")
      .select("*")
      .eq("token", token)
      .maybeSingle();
    if (!inv || inv.estado !== "pendiente") {
      return errorJson("Este link de invitación ya no es válido.", 410);
    }
    if (new Date(inv.expires_at).getTime() < Date.now()) {
      await admin.from("invitaciones").update({ estado: "expirada" }).eq("id", inv.id);
      return errorJson("Este link de invitación expiró.", 410);
    }

    // Si la invitación fija un email, se usa ese; si no, el que ingresó.
    const email = (inv.email as string | null)?.toLowerCase() || emailBody;
    if (!email) return errorJson("Falta el email.", 400);

    // Crear el usuario (signup cerrado → solo por acá con service role).
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
    const userId = creado.user.id;

    // El trigger creó el perfil; completar nombre + invitado_por.
    await admin
      .from("perfiles")
      .update({ nombre, invitado_por: inv.creada_por })
      .eq("id", userId);

    // Marcar la invitación como usada.
    await admin
      .from("invitaciones")
      .update({ estado: "usada", usada_por: userId })
      .eq("id", inv.id);

    return json({ ok: true, email });
  } catch (e) {
    return errorJson(e instanceof Error ? e.message : "Error", 500);
  }
}
