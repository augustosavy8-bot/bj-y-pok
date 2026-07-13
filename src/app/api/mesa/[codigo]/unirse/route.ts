import { getSupabaseAdmin } from "@/lib/supabase/server";
import { mesaPorCodigo } from "@/lib/server/mesa";
import { requerirUsuario } from "@/lib/server/auth";
import { buyInMesa, registrarMovimiento } from "@/lib/server/creditos";
import { json, errorJson, errorFrom } from "@/lib/utils";
import type { Jugador } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: { codigo: string } }
) {
  try {
    const admin = getSupabaseAdmin();
    // Identidad y nombre salen de la sesión / perfil, no del body.
    const user = await requerirUsuario();
    const authUid = user.id;

    const mesa = await mesaPorCodigo(admin, params.codigo);

    // Reconexión idempotente: si ya tenés asiento, se devuelve (sin recobrar).
    {
      const { data: existente } = await admin
        .from("jugadores")
        .select("*")
        .eq("mesa_id", mesa.id)
        .eq("auth_uid", authUid)
        .maybeSingle();
      if (existente) {
        if ((existente as Jugador).es_crupier) {
          return errorJson(
            "Sos el crupier de esta mesa. Para jugar, entrá desde otra cuenta.",
            409
          );
        }
        return json({ jugador: existente });
      }
    }

    if (mesa.estado !== "esperando") {
      return errorJson("La partida ya empezó; no se puede entrar ahora.", 409);
    }

    const { data: perfil } = await admin
      .from("perfiles")
      .select("nombre")
      .eq("id", authUid)
      .maybeSingle();
    const nombre = ((perfil?.nombre as string) ?? user.email ?? "Jugador").slice(0, 40);

    // Siguiente posición libre.
    const { data: jugadores } = await admin
      .from("jugadores")
      .select("posicion")
      .eq("mesa_id", mesa.id)
      .eq("es_crupier", false);
    const usadas = (jugadores ?? []).map((j: { posicion: number }) => j.posicion);
    let posicion = 0;
    while (usadas.includes(posicion)) posicion++;

    // Buy-in: cobra créditos en mesas reales; fichas gratis en práctica.
    const { fichas, cobroCreditos } = await buyInMesa(admin, mesa, authUid);

    const refund = async () => {
      if (cobroCreditos) {
        await registrarMovimiento(admin, {
          userId: authUid,
          tipo: "cash_out_mesa",
          monto: fichas,
          mesaId: mesa.id,
          realizadoPor: authUid,
          notas: "Reversa de buy-in (no se pudo sentar)",
        });
      }
    };

    const { data: nuevo, error } = await admin
      .from("jugadores")
      .insert({
        mesa_id: mesa.id,
        auth_uid: authUid,
        nombre,
        fichas,
        total_comprado: fichas,
        posicion,
        estado: "activo",
        es_crupier: false,
      })
      .select()
      .single();

    if (error || !nuevo) {
      if (error?.code === "23505") {
        // Carrera: ya existe el asiento. Revertir el cobro y devolverlo.
        await refund();
        const { data: yaExiste } = await admin
          .from("jugadores")
          .select("*")
          .eq("mesa_id", mesa.id)
          .eq("auth_uid", authUid)
          .maybeSingle();
        if (yaExiste) return json({ jugador: yaExiste as Jugador });
      }
      await refund();
      return errorJson("No se pudo unir: " + error?.message, 500);
    }

    return json({ jugador: nuevo as Jugador });
  } catch (e) {
    return errorFrom(e, 500);
  }
}
