import { type NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

// Rutas accesibles sin sesión (incluye los mockups de preview, que son estáticos).
const PUBLICAS = ["/login", "/invitacion", "/preview-mesa", "/preview-bj-mesa"];

type CookieAEscribir = { name: string; value: string; options?: CookieOptions };

export async function middleware(request: NextRequest) {
  // Next prefetchea los <Link> al pasar el mouse / entrar al viewport. Esos
  // requests NO se le muestran al usuario y no deben redirigir, pero igual
  // pegaban a Supabase (getUser + perfiles) en cada uno → latencia y carga
  // inútil que hacía sentir toda la navegación lenta. Los dejamos pasar sin
  // tocar auth; la navegación REAL sí valida abajo, y las páginas/APIs siguen
  // protegidas por su cuenta.
  const esPrefetch =
    request.headers.get("next-router-prefetch") === "1" ||
    request.headers.get("purpose") === "prefetch" ||
    (request.headers.get("sec-purpose") ?? "").includes("prefetch");
  if (esPrefetch) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet: CookieAEscribir[]) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() valida el JWT (no confía solo en la cookie).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const esPublica = PUBLICAS.some((p) => path === p || path.startsWith(p + "/"));

  // Sin sesión y ruta protegida → /login guardando el destino.
  if (!user && !esPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  if (user) {
    // Cuenta desactivada en caliente → cerrar sesión y a /login.
    const { data: perfil } = await supabase
      .from("perfiles")
      .select("activo")
      .eq("id", user.id)
      .maybeSingle();
    const inactivo = perfil && (perfil as { activo: boolean }).activo === false;

    if (inactivo && !esPublica) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("error", "cuenta-desactivada");
      return NextResponse.redirect(url);
    }

    // Logueado y activo entrando a /login → a /home.
    if (!inactivo && path === "/login") {
      const url = request.nextUrl.clone();
      url.pathname = "/home";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  // Excluye estáticos y /api (las API validan la sesión por su cuenta; el
  // juego no debe recibir un redirect 307 a /login en un fetch).
  // Ojo: manifest.webmanifest y sw.js DEBEN quedar afuera. Si pasan por acá,
  // sin sesión se los redirige a /login y el navegador recibe HTML en lugar
  // del archivo → la app deja de ser instalable y el service worker no
  // registra.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
