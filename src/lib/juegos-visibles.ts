/**
 * Juegos que están terminados y funcionando, pero todavía no abiertos a los
 * jugadores. No se borra nada: sólo se les esconde la puerta de entrada (el
 * menú de arriba y las tarjetas del home).
 *
 * PARA MOSTRAR UN JUEGO: sacalo de esta lista y listo. No hay que tocar
 * ninguna otra cosa.
 *
 * El admin los sigue viendo siempre, con un cartelito que dice "oculto", así
 * podés entrar a probarlos sin que los demás los vean.
 */
export const JUEGOS_OCULTOS: readonly string[] = [];

export function estaOculto(juego: string): boolean {
  return JUEGOS_OCULTOS.includes(juego);
}

/** ¿Este usuario tiene que ver la entrada a este juego? */
export function puedeVerJuego(juego: string, esAdmin: boolean): boolean {
  return esAdmin || !estaOculto(juego);
}
