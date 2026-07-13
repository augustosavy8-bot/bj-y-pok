import { getSupabaseAdmin } from "@/lib/supabase/server";
import { verificarCrupierSesion, requerirUsuario } from "@/lib/server/auth";
import { json, errorJson, errorFrom } from "@/lib/utils";
import { VALORES, PALOS } from "@/lib/types";
import type { Valor, Palo, Carta, Mano, Mesa } from "@/lib/types";

export const runtime = "nodejs";

// Corregir una carta ya escaneada en la mano en curso.
export async function PATCH(req: Request) {
  try {
    const admin = getSupabaseAdmin();
    const user = await requerirUsuario();
    const body = await req.json();
    const cartaId: string = body?.carta_id;
    const nuevoValor = body?.nuevo_valor as Valor;
    const nuevoPalo = body?.nuevo_palo as Palo;

    if (!cartaId) return errorJson("Falta carta_id.", 400);
    if (!VALORES.includes(nuevoValor) || !PALOS.includes(nuevoPalo)) {
      return errorJson("Valor o palo inválido.", 400);
    }

    // Cargar carta → mano → mesa.
    const { data: cartaRaw } = await admin
      .from("cartas")
      .select("*")
      .eq("id", cartaId)
      .maybeSingle();
    if (!cartaRaw) return errorJson("Carta no encontrada.", 404);
    const carta = cartaRaw as Carta;

    const { data: manoRaw } = await admin
      .from("manos")
      .select("*")
      .eq("id", carta.mano_id)
      .maybeSingle();
    if (!manoRaw) return errorJson("Mano no encontrada.", 404);
    const mano = manoRaw as Mano;

    const { data: mesaRaw } = await admin
      .from("mesas")
      .select("*")
      .eq("id", mano.mesa_id)
      .maybeSingle();
    if (!mesaRaw) return errorJson("Mesa no encontrada.", 404);
    const mesa = mesaRaw as Mesa;

    // Verificar que el usuario de la sesión es el crupier de la mesa.
    await verificarCrupierSesion(admin, mesa.codigo_sala, user.id);

    // No se puede corregir si la mano ya terminó o si se resolvió el showdown.
    if (mano.fase === "terminada") {
      return errorJson("La mano ya terminó; no se puede corregir la carta.", 409);
    }
    if (mano.fase === "showdown" && mano.ganador_id) {
      return errorJson("El showdown ya se resolvió; no se puede corregir.", 409);
    }

    // Si no cambia nada, salir temprano.
    if (carta.valor === nuevoValor && carta.palo === nuevoPalo) {
      return json({ ok: true, sin_cambios: true });
    }

    // Chequear que la nueva carta no duplique otra de la misma mano.
    const { data: dup } = await admin
      .from("cartas")
      .select("id")
      .eq("mano_id", carta.mano_id)
      .eq("valor", nuevoValor)
      .eq("palo", nuevoPalo)
      .neq("id", cartaId)
      .maybeSingle();
    if (dup) {
      return errorJson(
        `Ya hay otra ${nuevoValor} de ${nuevoPalo} en esta mano.`,
        409
      );
    }

    // Aplicar el cambio.
    const { error: errUpd } = await admin
      .from("cartas")
      .update({ valor: nuevoValor, palo: nuevoPalo })
      .eq("id", cartaId);
    if (errUpd) {
      return errorJson("No se pudo corregir la carta: " + errUpd.message, 500);
    }

    // Log de auditoría.
    await admin.from("correcciones_cartas").insert({
      carta_id: cartaId,
      valor_anterior: carta.valor,
      palo_anterior: carta.palo,
      valor_nuevo: nuevoValor,
      palo_nuevo: nuevoPalo,
      corregida_por_auth_uid: user.id,
    });

    return json({ ok: true });
  } catch (e) {
    return errorFrom(e);
  }
}
