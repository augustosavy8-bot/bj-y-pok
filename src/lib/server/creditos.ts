import type { SupabaseClient } from "@supabase/supabase-js";
import type { Mesa, TipoMovimientoCredito } from "@/lib/types";

// Error de saldo insuficiente (mapea a HTTP 400 vía errorFrom).
export class SaldoError extends Error {
  status = 400;
  constructor(mensaje: string) {
    super(mensaje);
  }
}

/** Saldo actual del usuario (suma de movimientos). Service role → bypassa RLS. */
export async function saldoActual(admin: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await admin.rpc("saldo_actual", { p_user: userId });
  if (error) throw new Error("No se pudo calcular el saldo: " + error.message);
  return (data as number) ?? 0;
}

/**
 * Registra un movimiento de créditos de forma atómica (advisory lock por
 * usuario). Devuelve el nuevo saldo. Lanza SaldoError si un débito dejaría el
 * saldo negativo.
 */
export async function registrarMovimiento(
  admin: SupabaseClient,
  params: {
    userId: string;
    tipo: TipoMovimientoCredito;
    monto: number;
    mesaId?: string | null;
    realizadoPor?: string | null;
    notas?: string | null;
    solicitudId?: string | null;
  }
): Promise<number> {
  const { data, error } = await admin.rpc("registrar_movimiento_credito", {
    p_user: params.userId,
    p_tipo: params.tipo,
    p_monto: params.monto,
    p_mesa_id: params.mesaId ?? null,
    p_realizado_por: params.realizadoPor ?? null,
    p_notas: params.notas ?? null,
    p_solicitud: params.solicitudId ?? null,
  });
  if (error) {
    if (error.code === "P0001" || /saldo_insuficiente/.test(error.message)) {
      throw new SaldoError("Saldo insuficiente para esta operación.");
    }
    throw new Error("No se pudo registrar el movimiento: " + error.message);
  }
  return (data as number) ?? 0;
}

/**
 * Al sentarse en una mesa se juega con los créditos reales del usuario:
 *  - Blackjack: SIEMPRE real. El stack (fichas) es un ESPEJO del saldo; no hay
 *    buy-in ni modo práctica. Cada apuesta/pago mueve el ledger directamente
 *    (ver ajustarFichasBJ). Sólo se exige un saldo mínimo para sentarse.
 *  - Poker: entra con TODO su saldo real como stack (se cashea al salir), porque
 *    el juego necesita fichas en la mesa para apostar/all-in/side-pots. En mesas
 *    de práctica no toca créditos: devuelve fichas_iniciales.
 */
export async function buyInMesa(
  admin: SupabaseClient,
  mesa: Mesa,
  userId: string
): Promise<{ fichas: number; cobroCreditos: boolean }> {
  // Blackjack: siempre créditos reales, sin importar es_practica.
  if (mesa.tipo_juego === "blackjack") {
    const saldo = await saldoActual(admin, userId);
    if (mesa.creditos_minimos > 0 && saldo < mesa.creditos_minimos) {
      throw new SaldoError(
        `Necesitás al menos ${mesa.creditos_minimos} créditos para sentarte, tenés ${saldo}.`
      );
    }
    return { fichas: saldo, cobroCreditos: false };
  }

  // Poker en práctica: fichas gratis, sin tocar créditos.
  if (mesa.es_practica || mesa.creditos_minimos <= 0) {
    return { fichas: mesa.fichas_iniciales, cobroCreditos: false };
  }
  const saldo = await saldoActual(admin, userId);
  if (saldo < mesa.creditos_minimos) {
    throw new SaldoError(
      `Necesitás al menos ${mesa.creditos_minimos} créditos para entrar a esta mesa, tenés ${saldo}.`
    );
  }

  // Poker real: mover todo el saldo real a la mesa como stack.
  await registrarMovimiento(admin, {
    userId,
    tipo: "buy_in_mesa",
    monto: -saldo,
    mesaId: mesa.id,
    realizadoPor: userId,
    notas: `Buy-in mesa ${mesa.codigo_sala}`,
  });
  return { fichas: saldo, cobroCreditos: true };
}

/**
 * Ajuste de fichas para BLACKJACK. El stack es un espejo del saldo real:
 * registra el movimiento en el ledger de créditos y sincroniza `fichas` con el
 * nuevo saldo. Devuelve las fichas resultantes. (Un asiento sin auth_uid mueve
 * sólo el stack, pero esos asientos ya no se crean.)
 */
export async function ajustarFichasBJ(
  admin: SupabaseClient,
  mesa: Mesa,
  jugador: { id: string; auth_uid: string | null; fichas: number },
  delta: number,
  tipo: TipoMovimientoCredito,
  notas: string
): Promise<number> {
  // Blackjack es siempre real: cualquier jugador con identidad mueve créditos.
  // (Sólo los asientos sin auth_uid —que ya no se crean— quedan fuera del ledger.)
  const real = !!jugador.auth_uid;
  if (!real) {
    const nueva = jugador.fichas + delta;
    await admin.from("jugadores").update({ fichas: nueva }).eq("id", jugador.id);
    return nueva;
  }
  const nuevoSaldo = await registrarMovimiento(admin, {
    userId: jugador.auth_uid!,
    tipo,
    monto: delta,
    mesaId: mesa.id,
    realizadoPor: jugador.auth_uid!,
    notas,
  });
  await admin.from("jugadores").update({ fichas: nuevoSaldo }).eq("id", jugador.id);
  return nuevoSaldo;
}
