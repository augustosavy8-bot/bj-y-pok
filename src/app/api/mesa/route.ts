import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requerirUsuario } from "@/lib/server/auth";
import { generarCodigoSala, json, errorJson, errorFrom } from "@/lib/utils";

export const runtime = "nodejs";

// Crear una mesa nueva + el asiento del crupier.
export async function POST(req: Request) {
  try {
    const admin = getSupabaseAdmin();
    // El crupier es el usuario logueado (identidad de la sesión).
    const user = await requerirUsuario();
    const authUid = user.id;
    const body = await req.json();
    const ciega_chica = Number(body?.ciega_chica) || 10;
    const ciega_grande = Number(body?.ciega_grande) || 20;
    const fichas_iniciales = Number(body?.fichas_iniciales) || 1000;
    const es_practica = Boolean(body?.es_practica);
    const creditos_minimos = es_practica ? 0 : Math.max(0, Number(body?.creditos_minimos) || 0);
    const tipo_juego =
      body?.tipo_juego === "blackjack" ? "blackjack" : "poker_holdem";

    // Nombre del crupier = nombre del perfil (ya no viene del body).
    const { data: perfil } = await admin
      .from("perfiles")
      .select("nombre")
      .eq("id", authUid)
      .maybeSingle();
    const nombre = ((perfil?.nombre as string) ?? user.email ?? "Crupier").slice(0, 40);

    // Generar código único (reintentar ante colisión).
    let codigo = "";
    for (let intento = 0; intento < 6; intento++) {
      codigo = generarCodigoSala();
      const { data } = await admin
        .from("mesas")
        .select("id")
        .eq("codigo_sala", codigo)
        .maybeSingle();
      if (!data) break;
    }

    const { data: mesa, error } = await admin
      .from("mesas")
      .insert({
        codigo_sala: codigo,
        estado: "esperando",
        tipo_juego,
        es_practica,
        creditos_minimos,
        ciega_chica,
        ciega_grande,
        fichas_iniciales,
        dealer_position: -1,
      })
      .select()
      .single();
    if (error || !mesa) return errorJson("No se pudo crear la mesa: " + error?.message, 500);

    const { data: crupier, error: errC } = await admin
      .from("jugadores")
      .insert({
        mesa_id: mesa.id,
        auth_uid: authUid,
        nombre,
        fichas: 0,
        posicion: -1,
        estado: "activo",
        es_crupier: true,
      })
      .select()
      .single();
    if (errC || !crupier) return errorJson("No se pudo crear el crupier: " + errC?.message, 500);

    return json({ codigo_sala: codigo, mesa_id: mesa.id, jugador_id: crupier.id });
  } catch (e) {
    return errorFrom(e, 500);
  }
}
