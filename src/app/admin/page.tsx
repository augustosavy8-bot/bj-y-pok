import { redirect } from "next/navigation";
import { perfilActual } from "@/lib/server/auth";
import { PanelAdmin } from "@/components/admin/PanelAdmin";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const perfil = await perfilActual();
  if (!perfil) redirect("/login?next=/admin");
  if (perfil.rol !== "admin" || !perfil.activo) redirect("/home?error=solo-admin");

  return <PanelAdmin miId={perfil.id} />;
}
