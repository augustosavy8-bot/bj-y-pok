import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieAEscribir = { name: string; value: string; options?: CookieOptions };

// Cliente Supabase ligado a las cookies de la request (sesión del usuario).
// Se usa en Server Components y route handlers para leer la sesión REAL
// (JWT en cookie) vía supabase.auth.getUser(). Respeta RLS como el usuario.
export function getSupabaseServer() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieAEscribir[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Llamado desde un Server Component (donde set no está permitido):
            // el middleware ya refresca la cookie, así que se puede ignorar.
          }
        },
      },
    }
  );
}
