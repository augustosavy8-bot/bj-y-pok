// Liquidación greedy: minimiza la cantidad de transacciones para saldar
// los netos de una sesión. Sirve para poker y blackjack por igual.
//
// neto = fichas_actuales - total_comprado
//   > 0 → le tienen que pagar
//   < 0 → tiene que pagar

export interface NetoJugador {
  jugador_id: string;
  nombre: string;
  neto: number;
}

export interface Transaccion {
  de: string; // jugador_id que paga
  de_nombre: string;
  a: string; // jugador_id que cobra
  a_nombre: string;
  monto: number;
}

export function calcularLiquidacion(netos: NetoJugador[]): Transaccion[] {
  // Deudores (neto < 0) y acreedores (neto > 0).
  const deudores = netos
    .filter((n) => n.neto < 0)
    .map((n) => ({ ...n, resto: -n.neto }))
    .sort((a, b) => b.resto - a.resto);
  const acreedores = netos
    .filter((n) => n.neto > 0)
    .map((n) => ({ ...n, resto: n.neto }))
    .sort((a, b) => b.resto - a.resto);

  const tx: Transaccion[] = [];
  let i = 0;
  let j = 0;
  while (i < deudores.length && j < acreedores.length) {
    const d = deudores[i];
    const a = acreedores[j];
    const monto = Math.min(d.resto, a.resto);
    if (monto > 0) {
      tx.push({
        de: d.jugador_id,
        de_nombre: d.nombre,
        a: a.jugador_id,
        a_nombre: a.nombre,
        monto,
      });
      d.resto -= monto;
      a.resto -= monto;
    }
    if (d.resto === 0) i++;
    if (a.resto === 0) j++;
  }
  return tx;
}
