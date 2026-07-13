import { getSupabaseAdmin } from "@/lib/supabase/server";
import { json } from "@/lib/utils";

export const runtime = "nodejs";

// Valida un token de invitación (público, sin sesión). Service role.
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return json({ valido: false, motivo: "sin_token" });

  const admin = getSupabaseAdmin();
  const { data: inv } = await admin
    .from("invitaciones")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (!inv) return json({ valido: false, motivo: "no_existe" });
  if (inv.estado !== "pendiente") return json({ valido: false, motivo: inv.estado });

  if (new Date(inv.expires_at).getTime() < Date.now()) {
    await admin.from("invitaciones").update({ estado: "expirada" }).eq("id", inv.id);
    return json({ valido: false, motivo: "expirada" });
  }

  return json({ valido: true, email: inv.email as string | null });
}
