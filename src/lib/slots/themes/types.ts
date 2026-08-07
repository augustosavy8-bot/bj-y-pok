import type { SoundProfile } from "../sound";

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
   * URL de un logo (imagen) para la marquesina. Si se define, se muestra en
   * lugar del título de texto.
   */
  logo?: string;
  /**
   * URL de una imagen de presentación (banner 16:9) para la card del hub de
   * slots (/slots). Si se define, la card la muestra de fondo en vez del layout
   * plano. Si se omite, se usa el fallback con el símbolo wild.
   */
  card?: string;
  /**
   * true = los símbolos son "tiles" de celda completa (traen su propio fondo).
   * La celda se renderiza SIN padding y la imagen a `cover`, así el rodillo
   * queda continuo. false/omitido = símbolos flotantes centrados con padding.
   */
  tile?: boolean;
  /**
   * Perfil de sonido del slot (nota base, escala, timbre). Hace que cada
   * máquina suene distinta. Si se omite, usa un default.
   */
  sound?: SoundProfile;
  /**
   * SVG (string) por símbolo. La clave es el `symbol` de slot_symbols
   * ('club','diam','heart','spade','moon','seven','wild', ...). Cada SVG debe
   * escalar al contenedor (viewBox + width/height 100%).
   */
  symbols: Record<string, string>;
}
