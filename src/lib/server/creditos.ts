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
 * Buy-in de una mesa REAL (no práctica): valida saldo >= creditos_minimos,
 * descuenta y devuelve la cantidad que entra como fichas.
 * En mesas de práctica no toca créditos: devuelve fichas_iniciales.
 */
export async function buyInMesa(
  admin: SupabaseClient,
  mesa: Mesa,
  userId: string
): Promise<{ fichas: number; cobroCreditos: boolean }> {
  if (mesa.es_practica || mesa.creditos_minimos <= 0) {
    return { fichas: mesa.fichas_iniciales, cobroCreditos: false };
  }
  const saldo = await saldoActual(admin, userId);
  if (saldo < mesa.creditos_minimos) {
    throw new SaldoError(
      `Necesitás al menos ${mesa.creditos_minimos} créditos para entrar a esta mesa, tenés ${saldo}.`
    );
  }
  await registrarMovimiento(admin, {
    userId,
    tipo: "buy_in_mesa",
    monto: -mesa.creditos_minimos,
    mesaId: mesa.id,
    realizadoPor: userId,
    notas: `Buy-in mesa ${mesa.codigo_sala}`,
  });
  return { fichas: mesa.creditos_minimos, cobroCreditos: true };
}
