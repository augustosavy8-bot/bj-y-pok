import type { SupabaseClient } from "@supabase/supabase-js";
import type { Mesa } from "@/lib/types";
import {
  cargarEstadoBJ,
  iniciarRondaBJ,
  cerrarApuestas,
  cerrarSeguro,
  accionJugadorBJ,
  jugadoresDeMesa,
  jugarDealerAuto,
} from "@/lib/server/blackjack";

type DB = SupabaseClient;

// Ritmo del ciclo automático (ms). Espeja los tiempos que ve el jugador.
export const MS_APUESTAS = 10_000; // ventana para apostar (alineada a ronda.created_at)
export const MS_ENTRE_RONDAS = 3_000; // pausa para ver el resultado
export const MS_SEGURO = 8_000; // ventana para decidir el seguro
const MS_PRIMERA_RONDA = 2_000; // arranque cuando la mesa estaba quieta
const MS_WATCHDOG = 20_000; // reintento si una fase intermedia se colgó

/**
 * Arma (o dispara) un paso con deadline. La primera vez que se ve una `clave`
 * nueva se guarda el vencimiento; en un tick posterior, ya vencido, se ejecuta.
 * Esto hace el ciclo idempotente: no importa cuántas veces se llame al tick.
 */
async function conDeadline(
  admin: DB,
  mesaId: string,
  clave: string,
  demoraMs: number,
  accion: () => Promise<string>
): Promise<string> {
  const { data } = await admin
    .from("bj_auto_estado")
    .select("clave, proximo_at")
    .eq("mesa_id", mesaId)
    .maybeSingle();

  const prev = data as { clave: string; proximo_at: string | null } | null;

  if (!prev || prev.clave !== clave || !prev.proximo_at) {
    const proximo = new Date(Date.now() + demoraMs).toISOString();
    await admin
      .from("bj_auto_estado")
      .upsert({ mesa_id: mesaId, clave, proximo_at: proximo, ultimo_tick_at: new Date().toISOString() });
    return `esperando (${clave})`;
  }

  if (Date.now() < new Date(prev.proximo_at).getTime()) {
    return `esperando (${clave})`;
  }

  const resultado = await accion();
  // Se limpia la clave para que el próximo estado vuelva a armar su deadline.
  await admin
    .from("bj_auto_estado")
    .upsert({
      mesa_id: mesaId,
      clave: `${clave}:hecho`,
      proximo_at: null,
      ultimo_tick_at: new Date().toISOString(),
      ultimo_evento: resultado,
    });
  return resultado;
}

/**
 * Avanza UN paso del ciclo de una mesa permanente, si corresponde.
 * Se llama repetidamente desde el cron; es seguro llamarlo de más.
 */
export async function tickMesaAuto(admin: DB, mesa: Mesa): Promise<string> {
  const estado = await cargarEstadoBJ(admin, mesa.id);
  const ronda = estado.ronda;
  const jugadores = jugadoresDeMesa(estado.jugadores);
  const ahora = Date.now();

  // A) Turno de un jugador: si venció el reloj, se planta por él.
  //    (Antes esto dependía del navegador del jugador: si cerraba la pestaña,
  //    la mesa quedaba colgada para siempre.)
  if (ronda?.estado === "turnos_jugadores") {
    const mano = estado.manos.find((m) => m.id === ronda.turno_mano_id);
    if (!mano) return "sin mano en turno";
    const vence = ronda.turno_expira_at ? new Date(ronda.turno_expira_at).getTime() : 0;
    if (!ronda.turno_expira_at || ahora >= vence) {
      await accionJugadorBJ(admin, mesa, mano.jugador_id, mano.id, "stand");
      return "auto-plantado (turno vencido)";
    }
    return "turno en curso";
  }

  // B) Fase de seguro: se cierra sola al vencer la ventana.
  if (ronda?.fase_seguro) {
    return await conDeadline(admin, mesa.id, `seguro:${ronda.id}`, MS_SEGURO, async () => {
      await cerrarSeguro(admin, mesa);
      return "seguro cerrado";
    });
  }

  // C) Apuestas abiertas: se cierran al vencer la ventana, pero SOLO si alguien
  //    apostó. Con la mesa vacía se queda esperando (no quema cartas ni rondas).
  if (ronda?.estado === "apuestas") {
    const hayApuesta = estado.manos.some((m) => m.apuesta_fichas > 0);
    if (!hayApuesta) return "esperando apuestas";
    const abre = new Date(ronda.created_at).getTime();
    if (ahora < abre + MS_APUESTAS) return "ventana de apuestas abierta";
    await cerrarApuestas(admin, mesa);
    return "apuestas cerradas → reparto";
  }

  // D) Sin ronda, o la última terminó: arrancar la próxima si hay gente sentada.
  if (!ronda || ronda.estado === "terminada") {
    if (jugadores.length === 0) return "mesa vacía (esperando jugadores)";
    const clave = `nueva:${ronda?.id ?? "inicial"}`;
    const demora = ronda ? MS_ENTRE_RONDAS : MS_PRIMERA_RONDA;
    return await conDeadline(admin, mesa.id, clave, demora, async () => {
      await iniciarRondaBJ(admin, mesa);
      return "ronda iniciada";
    });
  }

  // E) Fases intermedias (reparto_inicial / turno_dealer / pagos). Normalmente
  //    se resuelven solas dentro de la misma llamada que las inició. Si quedaron
  //    colgadas (timeout de la función, error de red), el watchdog las destraba.
  if (ronda.estado === "turno_dealer") {
    return await conDeadline(admin, mesa.id, `dealer:${ronda.id}`, MS_WATCHDOG, async () => {
      await jugarDealerAuto(admin, mesa.id);
      return "watchdog: mano del dealer resuelta";
    });
  }

  return `en curso (${ronda.estado})`;
}

/** Corre un tick sobre todas las mesas permanentes vivas. */
export async function tickTodasLasMesas(admin: DB) {
  const { data } = await admin
    .from("mesas")
    .select("*")
    .eq("es_permanente", true)
    .eq("tipo_juego", "blackjack")
    .neq("estado", "terminada");

  const mesas = (data ?? []) as Mesa[];
  const salida: { mesa: string; resultado: string }[] = [];

  for (const mesa of mesas) {
    try {
      const resultado = await tickMesaAuto(admin, mesa);
      salida.push({ mesa: mesa.codigo_sala, resultado });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      salida.push({ mesa: mesa.codigo_sala, resultado: `error: ${msg}` });
      await admin
        .from("bj_auto_estado")
        .upsert({
          mesa_id: mesa.id,
          clave: "error",
          proximo_at: null,
          ultimo_tick_at: new Date().toISOString(),
          ultimo_evento: `error: ${msg}`,
        });
    }
  }

  return salida;
}
