import { getSupabaseAdmin } from "@/lib/supabase/server";
import { verificarCrupier } from "@/lib/server/mesa";
import { json, errorJson, errorFrom } from "@/lib/utils";
import type { Jugador } from "@/lib/types";

export const runtime = "nodejs";

// Agrega un jugador "de prueba" a la mesa (auth_uid nulo), para poder jugar
// una mano completa desde un solo dispositivo. Sólo el crupier, y SOLO en
// mesas de práctica (sin crédito real), donde estos asientos son operables.
export async function POST(
  req: Request,
  { params }: { params: { codigo: string } }
) {
  try {
    const admin = getSupabaseAdmin();
    const mesa = await verificarCrupier(admin, params.codigo);
    const body = await req.json().catch(() => ({}));
    const nombre = (body?.nombre ?? "").toString().trim().slice(0, 40) || "Jugador";

    if (!mesa.es_practica) {
      return errorJson(
        "Los jugadores de prueba solo se permiten en mesas de práctica (sin crédito real).",
        403
      );
    }
    if (mesa.estado !== "esperando") {
      return errorJson(
        "Sólo se pueden agregar jugadores antes de iniciar la primera mano.",
        409
      );
    }

    // Siguiente posición libre entre los jugadores (no crupier).
    const { data: jugadores } = await admin
      .from("jugadores")
      .select("posicion")
      .eq("mesa_id", mesa.id)
      .eq("es_crupier", false);
    const usadas = (jugadores ?? []).map((j: { posicion: number }) => j.posicion);
    let posicion = 0;
    while (usadas.includes(posicion)) posicion++;

    const { data: nuevo, error } = await admin
      .from("jugadores")
      .insert({
        mesa_id: mesa.id,
        auth_uid: null, // sin identidad: cualquiera puede jugar por él (modo prueba)
        nombre,
        fichas: mesa.fichas_iniciales,
        total_comprado: mesa.fichas_iniciales,
        posicion,
        estado: "activo",
        es_crupier: false,
      })
      .select()
      .single();
    if (error || !nuevo) return errorJson("No se pudo agregar: " + error?.message, 500);

    return json({ jugador: nuevo as Jugador });
  } catch (e) {
    return errorFrom(e);
  }
}
