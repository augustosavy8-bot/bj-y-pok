"use client";

import { createBrowserClient } from "@supabase/ssr";

// Cliente de navegador (anon key). Respeta RLS.
// Se usa un singleton para no crear múltiples canales de realtime.
let cliente: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowser() {
  if (cliente) return cliente;
  cliente = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  return cliente;
}

/**
 * Id del usuario logueado (sesión real email/password). Devuelve null si no
 * hay sesión — en rutas protegidas el middleware ya habría redirigido a /login.
 */
export async function usuarioActualId(): Promise<string | null> {
  const supabase = getSupabaseBrowser();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Cierra la sesión y redirige a /login. */
export async function cerrarSesion(): Promise<void> {
  const supabase = getSupabaseBrowser();
  await supabase.auth.signOut();
  window.location.href = "/login";
}
