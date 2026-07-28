import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requerirUsuario } from "@/lib/server/auth";
import { saldoActual } from "@/lib/server/creditos";
import { json, errorFrom } from "@/lib/utils";
import type { Mesa } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mesas de la casa: las permanentes (24/7). Las ve cualquier usuario logueado
 * sin necesidad de código — se muestran fijas en el home.
 */
export async function GET() {
  try {
    const admin = getSupabaseAdmin();
    const user = await requerirUsuario();
    const saldo = await saldoActual(admin, user.id);

    const { data } = await admin
      .from("mesas")
      .select("*")
      .eq("es_permanente", true)
      .neq("estado", "terminada")
      .order("created_at", { ascending: true });

    const mesas = (data ?? []) as Mesa[];
    if (mesas.length === 0) return json({ mesas: [], mi_saldo: saldo });

    const ids = mesas.map((m) => m.id);

    const [{ data: asientos }, { data: configs }] = await Promise.all([
      admin
        .from("jugadores")
        .select("mesa_id, auth_uid, es_crupier, estado, salida_automatica")
        .in("mesa_id", ids),
      admin
        .from("bj_configuracion_sesion")
        .select("mesa_id, apuesta_min, apuesta_max, cantidad_mazos")
        .in("mesa_id", ids),
    ]);

    type Asiento = {
      mesa_id: string;
      auth_uid: string | null;
      es_crupier: boolean;
      estado: string;
      salida_automatica: boolean;
    };
    type Cfg = { mesa_id: string; apuesta_min: number; apuesta_max: number; cantidad_mazos: number };

    const salida = mesas.map((m) => {
      const suyos = ((asientos ?? []) as Asiento[]).filter((a) => a.mesa_id === m.id);
      const cfg = ((configs ?? []) as Cfg[]).find((c) => c.mesa_id === m.id);
      const mio = suyos.find((a) => a.auth_uid === user.id);
      const sentado = !!mio && !mio.es_crupier && mio.estado !== "eliminado";
      // Se fue antes: al volver paga el cargo de reingreso. Salvo que lo haya
      // levantado el sistema por inactividad, que no se cobra.
      const reingresa =
        !!mio && !mio.es_crupier && mio.estado === "eliminado" && !mio.salida_automatica;
      const cargo = reingresa ? m.costo_reingreso ?? 0 : 0;
      const requiere = (m.es_practica ? 0 : m.creditos_minimos) + cargo;
      return {
        codigo_sala: m.codigo_sala,
        tipo_juego: m.tipo_juego,
        estado: m.estado,
        es_practica: m.es_practica,
        creditos_minimos: m.creditos_minimos,
        apuesta_min: cfg?.apuesta_min ?? null,
        apuesta_max: cfg?.apuesta_max ?? null,
        cantidad_mazos: cfg?.cantidad_mazos ?? 6,
        jugadores: suyos.filter((a) => !a.es_crupier && a.estado !== "eliminado").length,
        ya_sentado: sentado,
        soy_crupier: !!mio?.es_crupier,
        costo_reingreso: cargo,
        puedo_entrar: saldo >= requiere,
      };
    });

    return json({ mesas: salida, mi_saldo: saldo });
  } catch (e) {
    return errorFrom(e);
  }
}
