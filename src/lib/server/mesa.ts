import type { SupabaseClient } from "@supabase/supabase-js";
import type { Mesa } from "@/lib/types";
import { requerirUsuario, verificarCrupierSesion } from "@/lib/server/auth";

/**
 * Verifica que el USUARIO DE LA SESIÓN (JWT de la cookie) sea el crupier de la
 * mesa. Ya no confía en ningún auth_uid del body. Devuelve la mesa.
 */
export async function verificarCrupier(
  admin: SupabaseClient,
  codigo: string
): Promise<Mesa> {
  const user = await requerirUsuario();
  return verificarCrupierSesion(admin, codigo, user.id);
}

export async function mesaPorCodigo(
  admin: SupabaseClient,
  codigo: string
): Promise<Mesa> {
  const { data: mesa } = await admin
    .from("mesas")
    .select("*")
    .eq("codigo_sala", codigo.toUpperCase())
    .single();
  if (!mesa) throw new Error("Mesa no encontrada.");
  return mesa as Mesa;
}
