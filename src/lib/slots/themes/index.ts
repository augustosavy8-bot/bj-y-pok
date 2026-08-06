import type { SlotTheme } from "./types";
import { elSalon } from "./el-salon";

// Registro de temas por slug. Para sumar un slot nuevo: creá su archivo de tema
// y agregá una línea acá. El resto (motor, RPC, ruta) funciona solo.
export const TEMAS: Record<string, SlotTheme> = {
  "el-salon": elSalon,
};

export function temaDe(slug: string): SlotTheme | null {
  return TEMAS[slug] ?? null;
}

export type { SlotTheme } from "./types";
