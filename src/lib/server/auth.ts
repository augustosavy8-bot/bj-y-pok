import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase/server-ssr";
import type { Jugador, Mesa } from "@/lib/types";

export interface UsuarioSesion {
  id: string;
  email: string | null;
}

export interface Perfil {
  id: string;
  email: string;
  nombre: string;
  rol: "admin" | "jugador";
  activo: boolean;
  invitado_por: string | null;
  created_at: string;
}

// Error tipado para mapear a códigos HTTP en los route handlers.
export class AuthError extends Error {
  status: number;
  constructor(mensaje: string, status = 401) {
    super(mensaje);
    this.status = status;
  }
}

/**
 * Usuario autenticado según el JWT de la cookie (validado contra Supabase).
 * NUNCA confía en identificadores del body. Lanza AuthError(401) si no hay
 * sesión o si el perfil está inactivo.
 */
export async function requerirUsuario(): Promise<UsuarioSesion> {
  const supabase = getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("No hay sesión activa.", 401);

  // Verificar que el perfil siga activo.
  const { data: perfil } = await supabase
    .from("perfiles")
    .select("activo")
    .eq("id", user.id)
    .maybeSingle();
  if (perfil && (perfil as { activo: boolean }).activo === false) {
    throw new AuthError("Tu cuenta está desactivada.", 403);
  }

  return { id: user.id, email: user.email ?? null };
}

/** Perfil del usuario actual (o null si no hay sesión). */
export async function perfilActual(): Promise<Perfil | null> {
  const supabase = getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("perfiles").select("*").eq("id", user.id).maybeSingle();
  return (data as Perfil) ?? null;
}

export async function requerirAdmin(): Promise<Perfil> {
  const perfil = await perfilActual();
  if (!perfil) throw new AuthError("No hay sesión activa.", 401);
  if (perfil.rol !== "admin" || !perfil.activo) {
    throw new AuthError("Solo un administrador puede hacer esto.", 403);
  }
  return perfil;
}

/**
 * El jugador (no crupier) del usuario `userId` en la mesa. null si no tiene
 * asiento. Usa el service role, así que ve auth_uid.
 */
export async function jugadorEnMesa(
  admin: SupabaseClient,
  mesaId: string,
  userId: string
): Promise<Jugador | null> {
  const { data } = await admin
    .from("jugadores")
    .select("*")
    .eq("mesa_id", mesaId)
    .eq("auth_uid", userId)
    .eq("es_crupier", false)
    .maybeSingle();
  return (data as Jugador) ?? null;
}

/**
 * Verifica que `userId` sea el crupier de la mesa `codigo`. Devuelve la mesa.
 * Reemplaza la vieja verificación por auth_uid del body.
 */
export async function verificarCrupierSesion(
  admin: SupabaseClient,
  codigo: string,
  userId: string
): Promise<Mesa> {
  const { data: mesa } = await admin
    .from("mesas")
    .select("*")
    .eq("codigo_sala", codigo.toUpperCase())
    .single();
  if (!mesa) throw new AuthError("Mesa no encontrada.", 404);

  const { data: crupier } = await admin
    .from("jugadores")
    .select("auth_uid")
    .eq("mesa_id", (mesa as Mesa).id)
    .eq("es_crupier", true)
    .maybeSingle();

  if (!crupier || (crupier as { auth_uid: string | null }).auth_uid !== userId) {
    throw new AuthError("Solo el crupier puede realizar esta acción.", 403);
  }
  return mesa as Mesa;
}

/**
 * Resuelve qué jugador puede operar `userId` sobre `jugadorObjetivo`:
 *  - Si el objetivo es del propio usuario → OK.
 *  - Si el objetivo es un asiento de prueba (auth_uid null) → OK solo si la
 *    mesa es de práctica Y el usuario es el crupier de la mesa.
 * Lanza AuthError(403) si no está permitido.
 */
export async function autorizarOperarJugador(
  admin: SupabaseClient,
  mesa: Mesa,
  jugadorObjetivo: Jugador,
  userId: string
): Promise<void> {
  if (jugadorObjetivo.auth_uid === userId) return;

  if (jugadorObjetivo.auth_uid === null && mesa.es_practica) {
    const { data: crupier } = await admin
      .from("jugadores")
      .select("auth_uid")
      .eq("mesa_id", mesa.id)
      .eq("es_crupier", true)
      .maybeSingle();
    if (crupier && (crupier as { auth_uid: string | null }).auth_uid === userId) return;
  }
  throw new AuthError("No podés operar por ese jugador.", 403);
}
