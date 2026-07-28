import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requerirAdmin, AuthError } from "@/lib/server/auth";
import { json, errorJson } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function manejar(e: unknown) {
  if (e instanceof AuthError) return errorJson(e.message, e.status);
  return errorJson(e instanceof Error ? e.message : "Error", 500);
}

// Todo el manejo de la quiniela desde el panel: no hay API deportiva que
// cubra la Liga Cañadense, así que los partidos y los resultados se cargan
// a mano.
export async function POST(req: Request) {
  try {
    const perfil = await requerirAdmin();
    const admin = getSupabaseAdmin();
    const body = await req.json();
    const accion = String(body?.accion ?? "");

    switch (accion) {
      case "crear": {
        const nombre = String(body?.nombre ?? "").trim().slice(0, 60);
        const entrada = Math.max(0, Math.floor(Number(body?.entrada) || 0));
        const comision = Math.min(50, Math.max(0, Math.floor(Number(body?.comision_pct) || 0)));
        if (!nombre) return errorJson("Poné un nombre para la fecha.", 400);
        const { data, error } = await admin
          .from("quiniela_fechas")
          .insert({
            nombre,
            entrada,
            comision_pct: comision,
            cierra_at: body?.cierra_at || null,
            creada_por: perfil.id,
          })
          .select()
          .single();
        if (error) return errorJson(error.message, 500);
        return json({ ok: true, fecha: data });
      }

      case "agregar_partido": {
        const fechaId = String(body?.fecha_id ?? "");
        const local = String(body?.local ?? "").trim();
        const visitante = String(body?.visitante ?? "").trim();
        if (!fechaId || !local || !visitante) return errorJson("Faltan datos del partido.", 400);
        const { count } = await admin
          .from("quiniela_partidos")
          .select("id", { count: "exact", head: true })
          .eq("fecha_id", fechaId);
        const { error } = await admin
          .from("quiniela_partidos")
          .insert({ fecha_id: fechaId, local, visitante, orden: (count ?? 0) + 1 });
        if (error) return errorJson(error.message, 500);
        return json({ ok: true });
      }

      case "borrar_partido": {
        const { error } = await admin
          .from("quiniela_partidos")
          .delete()
          .eq("id", String(body?.partido_id ?? ""));
        if (error) return errorJson(error.message, 500);
        return json({ ok: true });
      }

      case "estado": {
        const estado = String(body?.estado ?? "");
        if (!["borrador", "abierta", "cerrada"].includes(estado)) {
          return errorJson("Estado inválido.", 400);
        }
        const { error } = await admin
          .from("quiniela_fechas")
          .update({ estado })
          .eq("id", String(body?.fecha_id ?? ""))
          .neq("estado", "resuelta");
        if (error) return errorJson(error.message, 500);
        return json({ ok: true });
      }

      case "resultado": {
        const gl = body?.goles_local;
        const gv = body?.goles_visitante;
        const { error } = await admin
          .from("quiniela_partidos")
          .update({
            goles_local: gl === null || gl === "" ? null : Math.max(0, Math.floor(Number(gl))),
            goles_visitante:
              gv === null || gv === "" ? null : Math.max(0, Math.floor(Number(gv))),
          })
          .eq("id", String(body?.partido_id ?? ""));
        if (error) return errorJson(error.message, 500);
        return json({ ok: true });
      }

      case "resolver": {
        const { data, error } = await admin.rpc("quiniela_resolver", {
          p_fecha: String(body?.fecha_id ?? ""),
          p_admin: perfil.id,
        });
        if (error) return errorJson(error.message, 400);
        return json(data);
      }

      default:
        return errorJson("Acción desconocida.", 400);
    }
  } catch (e) {
    return manejar(e);
  }
}

// Listado completo para el panel (incluye borradores).
export async function GET() {
  try {
    await requerirAdmin();
    const admin = getSupabaseAdmin();
    const [{ data: fechas }, { data: equipos }] = await Promise.all([
      admin.from("quiniela_fechas").select("*").order("created_at", { ascending: false }).limit(20),
      admin.from("quiniela_equipos").select("nombre").eq("activo", true).order("nombre"),
    ]);

    const ids = (fechas ?? []).map((f: { id: string }) => f.id);
    const { data: partidos } = ids.length
      ? await admin.from("quiniela_partidos").select("*").in("fecha_id", ids).order("orden")
      : { data: [] };

    return json({
      fechas: fechas ?? [],
      partidos: partidos ?? [],
      equipos: (equipos ?? []).map((e: { nombre: string }) => e.nombre),
    });
  } catch (e) {
    return manejar(e);
  }
}
