import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requerirUsuario, AuthError } from "@/lib/server/auth";
import { registrarMovimiento, saldoActual, SaldoError } from "@/lib/server/creditos";
import { json, errorJson } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function manejar(e: unknown) {
  if (e instanceof AuthError) return errorJson(e.message, e.status);
  if (e instanceof SaldoError) return errorJson(e.message, e.status);
  return errorJson(e instanceof Error ? e.message : "Error", 500);
}

type Fecha = {
  id: string;
  nombre: string;
  estado: "borrador" | "abierta" | "cerrada" | "resuelta";
  entrada: number;
  comision_pct: number;
  cierra_at: string | null;
};

/** La fecha que le interesa al jugador: la abierta; si no, la última que hubo. */
async function fechaVigente(admin: ReturnType<typeof getSupabaseAdmin>) {
  const { data: abierta } = await admin
    .from("quiniela_fechas")
    .select("*")
    .in("estado", ["abierta", "cerrada"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (abierta) return abierta as Fecha;

  const { data: ultima } = await admin
    .from("quiniela_fechas")
    .select("*")
    .eq("estado", "resuelta")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (ultima ?? null) as Fecha | null;
}

export async function GET() {
  try {
    const user = await requerirUsuario();
    const admin = getSupabaseAdmin();
    const fecha = await fechaVigente(admin);
    if (!fecha) return json({ fecha: null });

    const [{ data: partidos }, { data: mia }, { data: mios }, { data: tabla }, { data: parts }] =
      await Promise.all([
        admin.from("quiniela_partidos").select("*").eq("fecha_id", fecha.id).order("orden"),
        admin
          .from("quiniela_participaciones")
          .select("*")
          .eq("fecha_id", fecha.id)
          .eq("user_id", user.id)
          .maybeSingle(),
        admin
          .from("quiniela_pronosticos")
          .select("partido_id, signo, goles_local, goles_visitante")
          .eq("user_id", user.id),
        admin.rpc("quiniela_tabla", { p_fecha: fecha.id }),
        admin.from("quiniela_participaciones").select("pagado").eq("fecha_id", fecha.id),
      ]);

    const idsPartidos = new Set((partidos ?? []).map((p: { id: string }) => p.id));
    const pozo = (parts ?? []).reduce(
      (s: number, p: { pagado: number }) => s + (p.pagado || 0),
      0
    );

    return json({
      fecha,
      partidos: partidos ?? [],
      mi_participacion: mia ?? null,
      mis_pronosticos: (mios ?? []).filter((p: { partido_id: string }) =>
        idsPartidos.has(p.partido_id)
      ),
      tabla: fecha.estado === "abierta" ? [] : tabla ?? [],
      pozo,
      mi_saldo: await saldoActual(admin, user.id),
    });
  } catch (e) {
    return manejar(e);
  }
}

/** Pagar la entrada (si hace falta) y guardar / actualizar los pronósticos. */
export async function POST(req: Request) {
  try {
    const user = await requerirUsuario();
    const admin = getSupabaseAdmin();
    const body = await req.json();
    const pronosticos = (body?.pronosticos ?? []) as {
      partido_id: string;
      signo: "1" | "X" | "2";
      goles_local?: number | null;
      goles_visitante?: number | null;
    }[];

    const fecha = await fechaVigente(admin);
    if (!fecha) return errorJson("No hay ninguna fecha de quiniela.", 404);
    if (fecha.estado !== "abierta") {
      return errorJson("La fecha ya cerró: no se pueden cargar pronósticos.", 409);
    }
    if (fecha.cierra_at && Date.now() > new Date(fecha.cierra_at).getTime()) {
      return errorJson("Se pasó la hora de cierre de esta fecha.", 409);
    }

    const { data: partidos } = await admin
      .from("quiniela_partidos")
      .select("id")
      .eq("fecha_id", fecha.id);
    const validos = new Set((partidos ?? []).map((p: { id: string }) => p.id));
    const limpios = pronosticos.filter(
      (p) => validos.has(p.partido_id) && ["1", "X", "2"].includes(p.signo)
    );
    if (limpios.length === 0) return errorJson("No mandaste ningún pronóstico válido.", 400);

    // Cobro de la entrada: sólo la primera vez. Después puede corregir sus
    // pronósticos gratis mientras la fecha siga abierta.
    const { data: yaEsta } = await admin
      .from("quiniela_participaciones")
      .select("id")
      .eq("fecha_id", fecha.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!yaEsta) {
      if (fecha.entrada > 0) {
        const saldo = await saldoActual(admin, user.id);
        if (saldo < fecha.entrada) {
          return errorJson(
            `La entrada cuesta ${fecha.entrada} créditos y tenés ${saldo}.`,
            402
          );
        }
        await registrarMovimiento(admin, {
          userId: user.id,
          tipo: "ajuste",
          monto: -fecha.entrada,
          realizadoPor: user.id,
          notas: `Entrada quiniela ${fecha.nombre}`,
        });
      }
      const { error } = await admin
        .from("quiniela_participaciones")
        .insert({ fecha_id: fecha.id, user_id: user.id, pagado: fecha.entrada });
      if (error && error.code !== "23505") {
        return errorJson("No se pudo registrar la participación.", 500);
      }
    }

    const filas = limpios.map((p) => ({
      partido_id: p.partido_id,
      user_id: user.id,
      signo: p.signo,
      goles_local: p.goles_local ?? null,
      goles_visitante: p.goles_visitante ?? null,
    }));
    const { error: errPron } = await admin
      .from("quiniela_pronosticos")
      .upsert(filas, { onConflict: "partido_id,user_id" });
    if (errPron) return errorJson("No se pudieron guardar los pronósticos.", 500);

    return json({ ok: true, guardados: filas.length });
  } catch (e) {
    return manejar(e);
  }
}
