import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requerirAdmin, AuthError } from "@/lib/server/auth";
import { json, errorJson } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Resumen económico de la casa (solo admin). La agregación vive en la función
// casa_resumen() de Postgres, que solo puede ejecutar el service_role.
export async function GET(req: Request) {
  try {
    await requerirAdmin();
    const admin = getSupabaseAdmin();

    const diasParam = Number(new URL(req.url).searchParams.get("dias") ?? 30);
    const dias = [7, 30, 90, 3650].includes(diasParam) ? diasParam : 30;

    const { data, error } = await admin.rpc("casa_resumen", { p_dias: dias });
    if (error) return errorJson(error.message, 500);
    return json(data);
  } catch (e) {
    if (e instanceof AuthError) return errorJson(e.message, e.status);
    return errorJson(e instanceof Error ? e.message : "Error", 500);
  }
}
