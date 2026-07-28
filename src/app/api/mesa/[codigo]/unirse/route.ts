import { getSupabaseAdmin } from "@/lib/supabase/server";
import { mesaPorCodigo } from "@/lib/server/mesa";
import { requerirUsuario } from "@/lib/server/auth";
import { buyInMesa, registrarMovimiento, saldoActual } from "@/lib/server/creditos";
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

    // Se puede entrar mientras la mesa está "esperando" o "jugando": el nuevo
    // jugador queda sentado y entra en la próxima ronda de apuestas. Solo se
    // bloquea si la mesa ya terminó.
    if (mesa.estado === "terminada") {
      return errorJson("La mesa ya terminó; no se puede entrar.", 409);
    }

    // ¿Ya tenía asiento en esta mesa?
    {
      const { data: existente } = await admin
        .from("jugadores")
        .select("*")
        .eq("mesa_id", mesa.id)
        .eq("auth_uid", authUid)
        .maybeSingle();

      if (existente) {
        const asiento = existente as Jugador;
        if (asiento.es_crupier) {
          return errorJson(
            "Sos el crupier de esta mesa. Para jugar, entrá desde otra cuenta.",
            409
          );
        }

        // Sigue sentado: reconexión idempotente, no se cobra nada.
        if (asiento.estado !== "eliminado") return json({ jugador: asiento });

        // REINGRESO: se había ido. Antes esto devolvía el asiento "zombi"
        // (eliminado, 0 fichas), que dejaba al jugador sin poder apostar y a la
        // mesa sin jugadores vivos. Ahora se revive el asiento y se cobra el
        // cargo de reingreso, si la mesa lo tiene.
        //
        // Excepción: si al asiento lo liberó el sistema por inactividad, no se
        // cobra nada — el jugador no eligió irse.
        const cargo = asiento.salida_automatica ? 0 : mesa.costo_reingreso ?? 0;
        if (cargo > 0) {
          const saldo = await saldoActual(admin, authUid);
          const requerido = cargo + (mesa.es_practica ? 0 : mesa.creditos_minimos);
          if (saldo < requerido) {
            return errorJson(
              `Volver a entrar cuesta ${cargo} créditos y necesitás ${requerido} en total; tenés ${saldo}.`,
              402
            );
          }
          await registrarMovimiento(admin, {
            userId: authUid,
            tipo: "buy_in_mesa",
            monto: -cargo,
            mesaId: mesa.id,
            realizadoPor: authUid,
            notas: `Reingreso a la mesa ${mesa.codigo_sala}`,
          });
        }

        const { fichas: fichasReingreso } = await buyInMesa(admin, mesa, authUid);

        const { data: revivido, error: errRevivir } = await admin
          .from("jugadores")
          .update({
            estado: "activo",
            fichas: fichasReingreso,
            apuesta_ronda: 0,
            total_apostado_mano: 0,
            ha_actuado: false,
            salida_automatica: false,
            ultima_actividad_at: new Date().toISOString(),
          })
          .eq("id", asiento.id)
          .select()
          .single();

        if (errRevivir || !revivido) {
          return errorJson("No se pudo volver a entrar: " + errRevivir?.message, 500);
        }
        return json({ jugador: revivido as Jugador, reingreso: true, cargo });
      }
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
