// Contrato de un TEMA de slot. Un tema es puramente estético: SVG de símbolos
// y colores. La lógica (RNG, pagos) vive en la RPC; el motor (engine.ts) es
// agnóstico al tema. Para sumar un slot nuevo alcanza con crear un tema como
// éste + su fila de config en la DB. Ver src/lib/slots/README.md.

export interface SlotTheme {
  slug: string;
  displayName: string;
  tagline: string;
  /** Variables CSS del gabinete (se inyectan como estilos inline). */
  colors: Record<string, string>;
  /**
   * Fondo de pantalla COMPLETA del slot (valor CSS `background`, puede tener
   * varias capas). Al entrar al slot toda la pantalla toma esta estética. Si se
   * omite, se usa un fallback genérico con los colores del tema.
   */
  scene?: string;
  /**
   * SVG (string) por símbolo. La clave es el `symbol` de slot_symbols
   * ('club','diam','heart','spade','moon','seven','wild', ...). Cada SVG debe
   * escalar al contenedor (viewBox + width/height 100%).
   */
  symbols: Record<string, string>;
}
