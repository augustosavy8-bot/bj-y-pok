import { getSupabaseAdmin } from "@/lib/supabase/server";
import { mesaPorCodigo } from "@/lib/server/mesa";
import { requerirUsuario } from "@/lib/server/auth";
import { json, errorJson, errorFrom } from "@/lib/utils";
import type { Jugador } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: { codigo: string } }
) {
  try {
    const admin = getSupabaseAdmin();
    // Identidad de la sesión (JWT), no del body.
    const user = await requerirUsuario();
    const authUid = user.id;
    const body = await req.json();
    const nombre = (body?.nombre ?? "").toString().trim().slice(0, 40);
    if (!nombre) return errorJson("Poné tu nombre para entrar.", 400);

    const mesa = await mesaPorCodigo(admin, params.codigo);

    // Si este usuario ya tiene un asiento en la mesa, devolverlo (idempotente).
    {
      const { data: existente } = await admin
        .from("jugadores")
        .select("*")
        .eq("mesa_id", mesa.id)
        .eq("auth_uid", authUid)
        .maybeSingle();
      if (existente) {
        // Si el asiento existente es el del crupier, NO lo devolvemos como
        // jugador: significa que este mismo dispositivo creó la mesa. El
        // crupier no juega; para jugar hay que entrar desde otro dispositivo.
        if ((existente as Jugador).es_crupier) {
          return errorJson(
            "Este dispositivo es el crupier de la mesa. Para jugar, entrá con el " +
              "código desde otro dispositivo o navegador (por ejemplo una ventana " +
              "de incógnito).",
            409
          );
        }
        return json({ jugador: existente });
      }
    }

    if (mesa.estado !== "esperando") {
      return errorJson("La partida ya empezó; no se puede entrar ahora.", 409);
    }

    // Calcular la siguiente posición libre (jugadores no crupier).
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
        auth_uid: authUid,
        nombre,
        fichas: mesa.fichas_iniciales, // fichas iniciales de la mesa, no 0
        total_comprado: mesa.fichas_iniciales, // base para la liquidación
        posicion, // siguiente posición libre, arrancando en 0
        estado: "activo",
        es_crupier: false, // en este flujo SIEMPRE es jugador
      })
      .select()
      .single();

    if (error || !nuevo) {
      // Carrera: dos requests simultáneos (doble-click / doble render) que
      // pasaron el guard de arriba. El índice único (mesa_id, auth_uid)
      // rechaza el segundo insert (código 23505); devolvemos el asiento ya
      // creado en vez de un error.
      if (error?.code === "23505") {
        const { data: yaExiste } = await admin
          .from("jugadores")
          .select("*")
          .eq("mesa_id", mesa.id)
          .eq("auth_uid", authUid)
          .maybeSingle();
        if (yaExiste) return json({ jugador: yaExiste as Jugador });
      }
      return errorJson("No se pudo unir: " + error?.message, 500);
    }

    return json({ jugador: nuevo as Jugador });
  } catch (e) {
    return errorFrom(e, 500);
  }
}
