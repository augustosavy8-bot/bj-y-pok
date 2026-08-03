import { NextResponse } from "next/server";
import { requerirAdmin } from "@/lib/server/auth";
import { COMANDA_HTML_B64 } from "@/content/comandaHtml";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Herramienta "Ticket Comanda (offline)" — HTML autocontenido, servido tal cual.
// SOLO administradores: requerirAdmin() valida rol server-side; los no-admin
// (o sin sesión) se redirigen. La página nunca queda en /public.
export async function GET(req: Request) {
  try {
    await requerirAdmin();
  } catch {
    return NextResponse.redirect(new URL("/home", req.url));
  }

  const html = Buffer.from(COMANDA_HTML_B64, "base64").toString("utf8");
  return new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
