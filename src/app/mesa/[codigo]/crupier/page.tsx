import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server-ssr";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { verificarCrupierSesion } from "@/lib/server/auth";
import { CrupierClient } from "./CrupierClient";

export const dynamic = "force-dynamic";

// Guard SERVER-SIDE: solo el crupier verificado de la mesa recibe el HTML
// del panel. Un jugador (u otro usuario) es redirigido a su vista de jugador
// antes de que el panel llegue al navegador.
export default async function CrupierPage({
  params,
}: {
  params: { codigo: string };
}) {
  const codigo = params.codigo.toUpperCase();

  const supabase = getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/mesa/${codigo}/crupier`);

  const admin = getSupabaseAdmin();
  let esCrupier = false;
  try {
    // Lanza AuthError si no es el crupier (o la mesa no existe).
    await verificarCrupierSesion(admin, codigo, user.id);
    esCrupier = true;
  } catch {
    esCrupier = false;
  }
  // El redirect va FUERA del try/catch (redirect() funciona lanzando una
  // excepción interna que no hay que atrapar).
  if (!esCrupier) redirect(`/mesa/${codigo}`);

  return <CrupierClient userId={user.id} />;
}
