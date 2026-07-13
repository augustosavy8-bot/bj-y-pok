import type { SupabaseClient } from "@supabase/supabase-js";
import type { Mesa, Jugador, LecturaCarta } from "@/lib/types";
import type {
  BJConfig,
  BJShoe,
  BJRonda,
  BJManoJugador,
  BJCarta,
  AccionBJ,
} from "@/lib/blackjack/types";
import { evaluarMano } from "@/lib/blackjack/hand";
import { dealerDebePedir } from "@/lib/blackjack/dealer";
import { calcularPagoMano } from "@/lib/blackjack/pagos";
import { accionesDisponibles } from "@/lib/blackjack/acciones";

type DB = SupabaseClient;

// ============================================================
// Carga de estado
// ============================================================
export interface EstadoBJ {
  mesa: Mesa;
  jugadores: Jugador[];
  config: BJConfig | null;
  shoe: BJShoe | null;
  ronda: BJRonda | null;
  manos: BJManoJugador[];
  cartas: BJCarta[];
}

export async function cargarEstadoBJ(admin: DB, mesaId: string): Promise<EstadoBJ> {
  const [{ data: mesa }, { data: jugadores }, { data: config }, { data: shoe }, { data: rondas }] =
    await Promise.all([
      admin.from("mesas").select("*").eq("id", mesaId).single(),
      admin.from("jugadores").select("*").eq("mesa_id", mesaId).order("posicion"),
      admin.from("bj_configuracion_sesion").select("*").eq("mesa_id", mesaId).maybeSingle(),
      admin.from("bj_shoe").select("*").eq("mesa_id", mesaId).maybeSingle(),
      admin
        .from("bj_rondas")
        .select("*")
        .eq("mesa_id", mesaId)
        .order("numero_ronda", { ascending: false })
        .limit(1),
    ]);

  const ronda = (rondas?.[0] ?? null) as BJRonda | null;
  let manos: BJManoJugador[] = [];
  let cartas: BJCarta[] = [];
  if (ronda) {
    const [{ data: m }, { data: c }] = await Promise.all([
      admin.from("bj_manos_jugador").select("*").eq("ronda_id", ronda.id),
      admin.from("bj_cartas_asignadas").select("*").eq("ronda_id", ronda.id).order("orden_recibida"),
    ]);
    manos = (m ?? []) as BJManoJugador[];
    cartas = (c ?? []) as BJCarta[];
  }

  return {
    mesa: mesa as Mesa,
    jugadores: (jugadores ?? []) as Jugador[],
    config: (config ?? null) as BJConfig | null,
    shoe: (shoe ?? null) as BJShoe | null,
    ronda,
    manos,
    cartas,
  };
}

// ============================================================
// Helpers de dominio
// ============================================================
export function jugadoresDeMesa(jugadores: Jugador[]): Jugador[] {
  return jugadores
    .filter((j) => !j.es_crupier && j.estado !== "eliminado")
    .sort((a, b) => a.posicion - b.posicion);
}

export function cartasDeMano(cartas: BJCarta[], manoId: string): BJCarta[] {
  return cartas
    .filter((c) => c.mano_jugador_id === manoId)
    .sort((a, b) => a.orden_recibida - b.orden_recibida);
}

export function cartasDealer(cartas: BJCarta[]): BJCarta[] {
  return cartas
    .filter((c) => c.es_carta_dealer)
    .sort((a, b) => a.orden_recibida - b.orden_recibida);
}

export function manosOrdenadas(manos: BJManoJugador[]): BJManoJugador[] {
  return [...manos].sort((a, b) =>
    a.orden_asiento !== b.orden_asiento
      ? a.orden_asiento - b.orden_asiento
      : a.orden_mano - b.orden_mano
  );
}

// Fichas ya comprometidas por un jugador en la ronda (apuestas + dobles + seguro).
function comprometido(manos: BJManoJugador[], jugadorId: string): number {
  return manos
    .filter((m) => m.jugador_id === jugadorId)
    .reduce(
      (s, m) => s + m.apuesta_fichas * (m.doblada ? 2 : 1) + (m.seguro_fichas ?? 0),
      0
    );
}

// ============================================================
// Configuración
// ============================================================
export async function asegurarConfig(admin: DB, mesa: Mesa): Promise<BJConfig> {
  const { data } = await admin
    .from("bj_configuracion_sesion")
    .select("*")
    .eq("mesa_id", mesa.id)
    .maybeSingle();
  if (data) return data as BJConfig;

  const { data: nuevo } = await admin
    .from("bj_configuracion_sesion")
    .insert({ mesa_id: mesa.id })
    .select()
    .single();
  await admin
    .from("bj_shoe")
    .upsert({ mesa_id: mesa.id, cantidad_mazos: (nuevo as BJConfig).cantidad_mazos });
  return nuevo as BJConfig;
}

// ============================================================
// Banca rotativa
// ============================================================
function ordenBanca(config: BJConfig, jugadores: Jugador[]): string[] {
  const validos = jugadoresDeMesa(jugadores).map((j) => j.id);
  const orden = (config.orden_banca ?? []).filter((id) => validos.includes(id));
  return orden.length > 0 ? orden : validos;
}

function proximaBanca(
  config: BJConfig,
  jugadores: Jugador[],
  prev: BJRonda | null,
  numeroRonda: number
): string | null {
  const orden = ordenBanca(config, jugadores);
  if (orden.length === 0) return null;

  // Banca fija: siempre el mismo jugador, sin importar cuántas rondas pasen.
  if (config.rotacion_banca === "fija") {
    const fija = config.banca_fija_jugador_id;
    const valido = fija && jugadoresDeMesa(jugadores).some((j) => j.id === fija);
    return valido ? fija : orden[0] ?? null;
  }

  if (!prev || !prev.banca_jugador_id) return orden[0];

  const idx = orden.indexOf(prev.banca_jugador_id);
  const base = idx === -1 ? 0 : idx;
  const bancaPrev = jugadores.find((j) => j.id === prev.banca_jugador_id);

  let rotar = false;
  switch (config.rotacion_banca) {
    case "por_mano":
      rotar = true;
      break;
    case "cada_5":
      rotar = (numeroRonda - 1) % 5 === 0;
      break;
    case "cada_10":
      rotar = (numeroRonda - 1) % 10 === 0;
      break;
    case "hasta_fundirse":
      rotar = !bancaPrev || bancaPrev.fichas <= 0;
      break;
  }
  if (idx === -1) rotar = true; // la banca anterior ya no está
  return rotar ? orden[(base + 1) % orden.length] : orden[base];
}

// ============================================================
// Iniciar una ronda nueva (fase 'apuestas')
// ============================================================
export async function iniciarRondaBJ(admin: DB, mesa: Mesa) {
  const estado = await cargarEstadoBJ(admin, mesa.id);
  const config = estado.config ?? (await asegurarConfig(admin, mesa));

  const jugadoresValidos = jugadoresDeMesa(estado.jugadores);
  if (jugadoresValidos.length < 2) {
    throw new Error("Se necesitan al menos 2 jugadores para blackjack.");
  }

  // Asegurar shoe.
  if (!estado.shoe) {
    await admin.from("bj_shoe").upsert({ mesa_id: mesa.id, cantidad_mazos: config.cantidad_mazos });
  }

  const numero = (await admin.rpc("bj_siguiente_numero_ronda", { p_mesa_id: mesa.id }))
    .data as number;
  const banca = proximaBanca(config, estado.jugadores, estado.ronda, numero);

  const { data: ronda, error } = await admin
    .from("bj_rondas")
    .insert({
      mesa_id: mesa.id,
      numero_ronda: numero,
      banca_jugador_id: banca,
      estado: "apuestas",
    })
    .select()
    .single();
  if (error || !ronda) throw new Error("No se pudo crear la ronda: " + error?.message);

  await admin.from("mesas").update({ estado: "jugando" }).eq("id", mesa.id);
  return { ronda_id: (ronda as BJRonda).id, numero_ronda: numero, banca_jugador_id: banca };
}

// ============================================================
// Fase 'apuestas'
// ============================================================
export async function registrarApuesta(
  admin: DB,
  mesa: Mesa,
  jugadorId: string,
  monto: number
) {
  const estado = await cargarEstadoBJ(admin, mesa.id);
  const { ronda, config } = estado;
  if (!ronda || !config) throw new Error("No hay ronda de blackjack.");
  if (ronda.estado !== "apuestas") throw new Error("Ya no se puede apostar en esta ronda.");
  if (jugadorId === ronda.banca_jugador_id) throw new Error("La banca no apuesta.");

  const jugador = estado.jugadores.find((j) => j.id === jugadorId);
  if (!jugador) throw new Error("Jugador no encontrado.");
  if (monto < config.apuesta_min || monto > config.apuesta_max) {
    throw new Error(`La apuesta debe estar entre ${config.apuesta_min} y ${config.apuesta_max}.`);
  }
  if (monto > jugador.fichas) throw new Error("No te alcanzan las fichas.");

  // Upsert de la mano base del jugador.
  const existente = estado.manos.find((m) => m.jugador_id === jugadorId && !m.es_split_de);
  if (existente) {
    await admin.from("bj_manos_jugador").update({ apuesta_fichas: monto }).eq("id", existente.id);
  } else {
    await admin.from("bj_manos_jugador").insert({
      ronda_id: ronda.id,
      jugador_id: jugadorId,
      orden_asiento: jugador.posicion,
      apuesta_fichas: monto,
      estado_mano: "apostando",
      orden_mano: 0,
    });
  }
  return { ok: true };
}

// Cerrar apuestas → pasar a reparto_inicial.
export async function cerrarApuestas(admin: DB, mesa: Mesa) {
  const estado = await cargarEstadoBJ(admin, mesa.id);
  const { ronda } = estado;
  if (!ronda || ronda.estado !== "apuestas") throw new Error("No estás en fase de apuestas.");
  const conApuesta = estado.manos.filter((m) => m.apuesta_fichas > 0);
  if (conApuesta.length === 0) throw new Error("Nadie apostó todavía.");

  // Marcar las manos como 'jugando' (se ajusta tras el reparto).
  for (const m of conApuesta) {
    await admin.from("bj_manos_jugador").update({ estado_mano: "jugando" }).eq("id", m.id);
  }
  await admin.from("bj_rondas").update({ estado: "reparto_inicial" }).eq("id", ronda.id);
  return { ok: true };
}

// ============================================================
// Escaneo / asignación de carta según la fase
// ============================================================
export async function asignarCartaBJ(
  admin: DB,
  mesa: Mesa,
  lectura: LecturaCarta
): Promise<{ mensaje: string }> {
  const estado = await cargarEstadoBJ(admin, mesa.id);
  const { ronda, config, shoe } = estado;
  if (!ronda || !config) throw new Error("No hay ronda activa.");

  // Validación de duplicados dentro del shoe (según cantidad de mazos).
  await validarShoe(admin, mesa, config, shoe, lectura);

  const ordenRecibida = estado.cartas.length + 1;

  if (ronda.estado === "reparto_inicial") {
    return await repartoInicial(admin, estado, lectura, ordenRecibida);
  }
  if (ronda.estado === "turnos_jugadores") {
    return await cartaEnTurno(admin, estado, lectura, ordenRecibida);
  }
  if (ronda.estado === "turno_dealer") {
    return await cartaDealer(admin, estado, lectura, ordenRecibida);
  }
  throw new Error(`No se pueden escanear cartas en la fase '${ronda.estado}'.`);
}

async function validarShoe(
  admin: DB,
  mesa: Mesa,
  config: BJConfig,
  shoe: BJShoe | null,
  lectura: LecturaCarta
) {
  const desde = shoe?.ultimo_barajado_at ?? "1970-01-01";
  // Cartas de esta mesa desde el último barajado.
  const { data: rondas } = await admin.from("bj_rondas").select("id").eq("mesa_id", mesa.id);
  const ids = (rondas ?? []).map((r: { id: string }) => r.id);
  if (ids.length === 0) return;
  const { data: vistas } = await admin
    .from("bj_cartas_asignadas")
    .select("valor,palo,created_at")
    .in("ronda_id", ids)
    .gte("created_at", desde);
  const iguales = (vistas ?? []).filter(
    (c: { valor: string; palo: string }) => c.valor === lectura.valor && c.palo === lectura.palo
  ).length;
  if (iguales >= config.cantidad_mazos) {
    throw new Error(
      `La ${lectura.valor} de ${lectura.palo} ya apareció ${iguales} veces en ${config.cantidad_mazos} mazo(s). ¿Hay que barajar?`
    );
  }
}

async function insertarCarta(
  admin: DB,
  mesaId: string,
  rondaId: string,
  lectura: LecturaCarta,
  orden: number,
  opts: { mano_jugador_id?: string | null; es_carta_dealer?: boolean; es_hole_card?: boolean; revelada?: boolean }
) {
  await admin.from("bj_cartas_asignadas").insert({
    ronda_id: rondaId,
    mano_jugador_id: opts.mano_jugador_id ?? null,
    es_carta_dealer: opts.es_carta_dealer ?? false,
    es_hole_card: opts.es_hole_card ?? false,
    revelada: opts.revelada ?? true,
    valor: lectura.valor,
    palo: lectura.palo,
    orden_recibida: orden,
  });
  // Contador del shoe (cartas repartidas desde el último barajado).
  const { data: shoe } = await admin
    .from("bj_shoe")
    .select("cartas_repartidas")
    .eq("mesa_id", mesaId)
    .maybeSingle();
  if (shoe) {
    await admin
      .from("bj_shoe")
      .update({ cartas_repartidas: (shoe as { cartas_repartidas: number }).cartas_repartidas + 1 })
      .eq("mesa_id", mesaId);
  }
}

// -------- Reparto inicial --------
async function repartoInicial(
  admin: DB,
  estado: EstadoBJ,
  lectura: LecturaCarta,
  orden: number
): Promise<{ mensaje: string }> {
  const { ronda } = estado;
  const base = manosOrdenadas(estado.manos.filter((m) => !m.es_split_de));
  const N = base.length;
  const total = 2 * (N + 1);
  const yaRepartidas = estado.cartas.length;
  if (yaRepartidas >= total) {
    throw new Error("El reparto inicial ya está completo.");
  }

  let mensaje = "";
  if (yaRepartidas < N) {
    // 1ra vuelta jugadores
    const mano = base[yaRepartidas];
    await insertarCarta(admin, estado.mesa.id, ronda!.id, lectura, orden, { mano_jugador_id: mano.id });
    mensaje = `1ª carta para asiento ${mano.orden_asiento + 1}`;
  } else if (yaRepartidas === N) {
    // upcard del dealer (visible)
    await insertarCarta(admin, estado.mesa.id, ronda!.id, lectura, orden, { es_carta_dealer: true, revelada: true });
    mensaje = "Carta visible del dealer (upcard)";
  } else if (yaRepartidas < 2 * N + 1) {
    const idx = yaRepartidas - (N + 1);
    const mano = base[idx];
    await insertarCarta(admin, estado.mesa.id, ronda!.id, lectura, orden, { mano_jugador_id: mano.id });
    mensaje = `2ª carta para asiento ${mano.orden_asiento + 1}`;
  } else {
    // hole card del dealer (oculta)
    await insertarCarta(admin, estado.mesa.id, ronda!.id, lectura, orden, {
      es_carta_dealer: true,
      es_hole_card: true,
      revelada: false,
    });
    mensaje = "Hole card del dealer (oculta)";
    await avanzarTrasReparto(admin, estado.mesa.id);
  }
  return { mensaje };
}

// Tras completar el reparto inicial: marcar blackjacks naturales, ofrecer
// seguro si corresponde, y arrancar los turnos.
async function avanzarTrasReparto(admin: DB, mesaId: string) {
  const estado = await cargarEstadoBJ(admin, mesaId);
  const { ronda, config } = estado;
  if (!ronda || !config) return;

  const base = manosOrdenadas(estado.manos.filter((m) => !m.es_split_de));
  for (const m of base) {
    const e = evaluarMano(cartasDeMano(estado.cartas, m.id));
    if (e.es_blackjack) {
      await admin.from("bj_manos_jugador").update({ estado_mano: "blackjack" }).eq("id", m.id);
    }
  }

  const dealer = cartasDealer(estado.cartas);
  const upcard = dealer.find((c) => !c.es_hole_card);
  const ofreceSeguro = config.permite_insurance && upcard?.valor === "A";

  if (ofreceSeguro) {
    await admin.from("bj_rondas").update({ fase_seguro: true }).eq("id", ronda.id);
    // Se mantiene en reparto_inicial hasta cerrar el seguro.
    return;
  }
  await arrancarTurnos(admin, mesaId);
}

// Seguro: el jugador paga 0.5x su apuesta si el dealer muestra As.
export async function registrarSeguro(admin: DB, mesa: Mesa, jugadorId: string, tomar: boolean) {
  const estado = await cargarEstadoBJ(admin, mesa.id);
  const { ronda } = estado;
  if (!ronda || !ronda.fase_seguro) throw new Error("No hay fase de seguro abierta.");
  const mano = estado.manos.find((m) => m.jugador_id === jugadorId && !m.es_split_de);
  if (!mano) throw new Error("No tenés una mano en esta ronda.");
  if (!tomar) {
    await admin.from("bj_manos_jugador").update({ seguro_fichas: 0 }).eq("id", mano.id);
    return { ok: true };
  }
  const seguro = Math.floor(mano.apuesta_fichas / 2);
  const jugador = estado.jugadores.find((j) => j.id === jugadorId)!;
  if (comprometido(estado.manos, jugadorId) + seguro > jugador.fichas) {
    throw new Error("No te alcanzan las fichas para el seguro.");
  }
  await admin.from("bj_manos_jugador").update({ seguro_fichas: seguro }).eq("id", mano.id);
  return { ok: true };
}

// Cerrar la fase de seguro → chequear BJ del dealer y arrancar turnos.
export async function cerrarSeguro(admin: DB, mesa: Mesa) {
  const estado = await cargarEstadoBJ(admin, mesa.id);
  const { ronda } = estado;
  if (!ronda || !ronda.fase_seguro) throw new Error("No hay seguro para cerrar.");
  await admin.from("bj_rondas").update({ fase_seguro: false }).eq("id", ronda.id);

  const dealer = cartasDealer(estado.cartas);
  const dealerBJ = evaluarMano(dealer).es_blackjack;
  if (dealerBJ) {
    // El dealer tiene blackjack: se revela y se va directo a pagos.
    await revelarHole(admin, ronda.id, estado.cartas);
    await resolverPagos(admin, mesa.id);
    return { ok: true, dealer_blackjack: true };
  }
  await arrancarTurnos(admin, mesa.id);
  return { ok: true, dealer_blackjack: false };
}

async function arrancarTurnos(admin: DB, mesaId: string) {
  const estado = await cargarEstadoBJ(admin, mesaId);
  const { ronda } = estado;
  if (!ronda) return;
  const siguiente = manosOrdenadas(estado.manos).find((m) => m.estado_mano === "jugando");
  if (!siguiente) {
    // Todos con blackjack natural (o nadie jugable) → turno del dealer.
    await entrarTurnoDealer(admin, mesaId);
    return;
  }
  await admin
    .from("bj_rondas")
    .update({
      estado: "turnos_jugadores",
      turno_mano_id: siguiente.id,
      turno_expira_at: expira(estado.config),
    })
    .eq("id", ronda.id);
}

function expira(config: BJConfig | null): string | null {
  if (!config) return null;
  return new Date(Date.now() + config.segundos_por_turno * 1000).toISOString();
}

// -------- Carta durante turnos de jugadores (= hit) --------
async function cartaEnTurno(
  admin: DB,
  estado: EstadoBJ,
  lectura: LecturaCarta,
  orden: number
): Promise<{ mensaje: string }> {
  const { ronda } = estado;
  const manoId = ronda!.turno_mano_id;
  const mano = estado.manos.find((m) => m.id === manoId);
  if (!mano) throw new Error("No hay una mano en turno.");

  await insertarCarta(admin, estado.mesa.id, ronda!.id, lectura, orden, { mano_jugador_id: mano.id });

  const cartas = [...cartasDeMano(estado.cartas, mano.id), { valor: lectura.valor } as BJCarta];
  const e = evaluarMano(cartas);

  let mensaje = `Carta para asiento ${mano.orden_asiento + 1}`;
  if (e.es_bust) {
    await admin.from("bj_manos_jugador").update({ estado_mano: "pasado" }).eq("id", mano.id);
    mensaje += " — se pasó";
    await avanzarTurno(admin, estado.mesa.id);
  } else if (mano.doblada) {
    // Doble: exactamente 1 carta y se planta.
    await admin.from("bj_manos_jugador").update({ estado_mano: "plantado" }).eq("id", mano.id);
    mensaje += " (doble)";
    await avanzarTurno(admin, estado.mesa.id);
  } else if (mano.es_split_de && cartas.length === 2 && cartas[0].valor === "A") {
    // Split de ases: 1 sola carta por mano.
    await admin.from("bj_manos_jugador").update({ estado_mano: "plantado" }).eq("id", mano.id);
    await avanzarTurno(admin, estado.mesa.id);
  } else if (e.valor === 21) {
    await admin.from("bj_manos_jugador").update({ estado_mano: "plantado" }).eq("id", mano.id);
    mensaje += " — 21";
    await avanzarTurno(admin, estado.mesa.id);
  } else {
    // Sigue el mismo jugador: renovar el timer.
    await admin.from("bj_rondas").update({ turno_expira_at: expira(estado.config) }).eq("id", ronda!.id);
  }
  return { mensaje };
}

async function avanzarTurno(admin: DB, mesaId: string) {
  const estado = await cargarEstadoBJ(admin, mesaId);
  const { ronda } = estado;
  if (!ronda) return;
  const actual = estado.manos.find((m) => m.id === ronda.turno_mano_id);
  const orden = manosOrdenadas(estado.manos);
  const idx = actual ? orden.findIndex((m) => m.id === actual.id) : -1;
  const siguiente = orden.slice(idx + 1).find((m) => m.estado_mano === "jugando");
  if (siguiente) {
    await admin
      .from("bj_rondas")
      .update({ turno_mano_id: siguiente.id, turno_expira_at: expira(estado.config) })
      .eq("id", ronda.id);
  } else {
    await entrarTurnoDealer(admin, mesaId);
  }
}

// ============================================================
// Acciones del jugador
// ============================================================
export async function accionJugadorBJ(
  admin: DB,
  mesa: Mesa,
  jugadorId: string,
  manoId: string,
  accion: AccionBJ
) {
  const estado = await cargarEstadoBJ(admin, mesa.id);
  const { ronda, config } = estado;
  if (!ronda || !config) throw new Error("No hay ronda activa.");
  if (ronda.estado !== "turnos_jugadores") throw new Error("No es la fase de turnos.");
  if (ronda.turno_mano_id !== manoId) throw new Error("No es el turno de esa mano.");

  const mano = estado.manos.find((m) => m.id === manoId);
  if (!mano || mano.jugador_id !== jugadorId) throw new Error("Mano inválida.");
  if (mano.estado_mano !== "jugando") throw new Error("Esa mano ya no está en juego.");

  const jugador = estado.jugadores.find((j) => j.id === jugadorId)!;
  const cartas = cartasDeMano(estado.cartas, mano.id);
  const manosDelAsiento = estado.manos.filter((m) => m.orden_asiento === mano.orden_asiento).length;
  const disp = accionesDisponibles({
    cartas,
    apuesta: mano.apuesta_fichas,
    fichas: jugador.fichas - comprometido(estado.manos, jugadorId),
    esSplit: !!mano.es_split_de,
    manosDelAsiento,
    config,
  });

  switch (accion) {
    case "hit":
      // El pedido de carta lo materializa el crupier al escanear. No cambia
      // el estado; sólo renueva el timer.
      await admin.from("bj_rondas").update({ turno_expira_at: expira(config) }).eq("id", ronda.id);
      return { ok: true };

    case "stand":
      await admin.from("bj_manos_jugador").update({ estado_mano: "plantado" }).eq("id", mano.id);
      await avanzarTurno(admin, mesa.id);
      return { ok: true };

    case "double":
      if (!disp.double) throw new Error("No podés doblar en esta mano.");
      await admin.from("bj_manos_jugador").update({ doblada: true }).eq("id", mano.id);
      // El crupier escanea 1 carta; ahí se planta automáticamente.
      await admin.from("bj_rondas").update({ turno_expira_at: expira(config) }).eq("id", ronda.id);
      return { ok: true };

    case "surrender":
      if (!disp.surrender) throw new Error("No podés rendirte ahora.");
      await admin.from("bj_manos_jugador").update({ estado_mano: "rendido" }).eq("id", mano.id);
      await avanzarTurno(admin, mesa.id);
      return { ok: true };

    case "split": {
      if (!disp.split) throw new Error("No podés hacer split en esta mano.");
      // Crear la mano nueva y mover una de las dos cartas.
      const { data: nueva } = await admin
        .from("bj_manos_jugador")
        .insert({
          ronda_id: ronda.id,
          jugador_id: jugadorId,
          orden_asiento: mano.orden_asiento,
          apuesta_fichas: mano.apuesta_fichas,
          estado_mano: "jugando",
          es_split_de: mano.id,
          orden_mano: manosDelAsiento,
        })
        .select()
        .single();
      // Mover la 2da carta a la mano nueva.
      await admin
        .from("bj_cartas_asignadas")
        .update({ mano_jugador_id: (nueva as BJManoJugador).id })
        .eq("id", cartas[1].id);
      await admin.from("bj_rondas").update({ turno_expira_at: expira(config) }).eq("id", ronda.id);
      return { ok: true };
    }

    default:
      throw new Error("Acción inválida.");
  }
}

// ============================================================
// Turno del dealer
// ============================================================
async function revelarHole(admin: DB, rondaId: string, cartas: BJCarta[]) {
  const hole = cartas.find((c) => c.es_carta_dealer && c.es_hole_card);
  if (hole && !hole.revelada) {
    await admin.from("bj_cartas_asignadas").update({ revelada: true }).eq("id", hole.id);
  }
  await admin.from("bj_rondas").update({ hole_revelada: true }).eq("id", rondaId);
}

async function entrarTurnoDealer(admin: DB, mesaId: string) {
  const estado = await cargarEstadoBJ(admin, mesaId);
  const { ronda, config } = estado;
  if (!ronda || !config) return;

  await admin
    .from("bj_rondas")
    .update({ estado: "turno_dealer", turno_mano_id: null, turno_expira_at: null })
    .eq("id", ronda.id);
  await revelarHole(admin, ronda.id, estado.cartas);

  // ¿Queda alguna mano elegible (que no se haya pasado/rendido)?
  const elegibles = estado.manos.filter(
    (m) => m.estado_mano === "plantado" || m.estado_mano === "blackjack"
  );
  if (elegibles.length === 0) {
    await resolverPagos(admin, mesaId);
    return;
  }
  // Si el dealer ya no debe pedir con sus 2 cartas → pagos directo.
  const dealer = cartasDealer(estado.cartas);
  if (!dealerDebePedir(dealer, config.soft_17_regla)) {
    await resolverPagos(admin, mesaId);
  }
  // Si debe pedir, se espera a que el crupier escanee (cartaDealer).
}

async function cartaDealer(
  admin: DB,
  estado: EstadoBJ,
  lectura: LecturaCarta,
  orden: number
): Promise<{ mensaje: string }> {
  const { ronda, config } = estado;
  await insertarCarta(admin, estado.mesa.id, ronda!.id, lectura, orden, { es_carta_dealer: true, revelada: true });

  const dealer = [...cartasDealer(estado.cartas), { valor: lectura.valor } as BJCarta];
  const e = evaluarMano(dealer);
  let mensaje = `Carta del dealer (total ${e.valor})`;
  if (e.es_bust || !dealerDebePedir(dealer, config!.soft_17_regla)) {
    mensaje += e.es_bust ? " — se pasó" : " — se planta";
    await resolverPagos(admin, estado.mesa.id);
  }
  return { mensaje };
}

// ============================================================
// Pagos
// ============================================================
export async function resolverPagos(admin: DB, mesaId: string) {
  const estado = await cargarEstadoBJ(admin, mesaId);
  const { ronda, config } = estado;
  if (!ronda || !config) return;

  await admin.from("bj_rondas").update({ estado: "pagos" }).eq("id", ronda.id);
  await revelarHole(admin, ronda.id, estado.cartas);

  const dealerEval = evaluarMano(cartasDealer(estado.cartas));
  const bancaJugador = estado.jugadores.find((j) => j.id === ronda.banca_jugador_id);
  const fichasBancaInicio = bancaJugador?.fichas ?? 0;

  let netoBanca = 0;

  for (const mano of estado.manos) {
    const cartas = cartasDeMano(estado.cartas, mano.id);
    const jugadorEval = evaluarMano(cartas);
    const pago = calcularPagoMano({
      jugador: jugadorEval,
      dealer: dealerEval,
      estadoMano: mano.estado_mano,
      apuesta: mano.apuesta_fichas,
      doblada: mano.doblada,
      esSplit: !!mano.es_split_de,
      seguro: mano.seguro_fichas,
      blackjackPago: config.blackjack_pago,
    });

    // Aplicar fichas al jugador.
    const jug = estado.jugadores.find((j) => j.id === mano.jugador_id);
    if (jug) {
      await admin.from("jugadores").update({ fichas: jug.fichas + pago.delta }).eq("id", jug.id);
      jug.fichas += pago.delta; // por si tiene varias manos (split)
    }
    netoBanca -= pago.delta; // la banca es la contraparte

    await admin.from("bj_resultados").insert({
      mano_jugador_id: mano.id,
      resultado: pago.resultado,
      fichas_ganadas_o_perdidas: pago.delta,
      valor_final_mano: pago.valor_final,
    });
  }

  // Ajustar fichas de la banca con el neto.
  if (bancaJugador) {
    await admin
      .from("jugadores")
      .update({ fichas: fichasBancaInicio + netoBanca })
      .eq("id", bancaJugador.id);
  }
  await admin.from("bj_banca_balance").insert({
    ronda_id: ronda.id,
    banca_jugador_id: ronda.banca_jugador_id,
    fichas_al_inicio: fichasBancaInicio,
    fichas_al_final: fichasBancaInicio + netoBanca,
    delta: netoBanca,
  });

  // Contador de manos del shoe + posible aviso de barajado.
  if (estado.shoe) {
    await admin
      .from("bj_shoe")
      .update({ manos_desde_barajado: estado.shoe.manos_desde_barajado + 1 })
      .eq("mesa_id", mesaId);
  }

  await admin.from("bj_rondas").update({ estado: "terminada" }).eq("id", ronda.id);
}

// ¿El jugador está metido en una ronda activa con una mano viva?
// (Se usa para no dejar hacer cash-out en medio de una ronda de blackjack,
// donde las apuestas todavía no se resolvieron.)
export async function jugadorEnRondaActivaBJ(
  admin: DB,
  mesaId: string,
  jugadorId: string
): Promise<boolean> {
  const estado = await cargarEstadoBJ(admin, mesaId);
  const { ronda } = estado;
  if (!ronda || ronda.estado === "terminada") return false;
  return estado.manos.some(
    (m) =>
      m.jugador_id === jugadorId &&
      (m.estado_mano === "apostando" || m.estado_mano === "jugando")
  );
}

// ============================================================
// Barajar (reset del shoe)
// ============================================================
export async function barajarShoe(admin: DB, mesa: Mesa) {
  await admin
    .from("bj_shoe")
    .update({
      cartas_repartidas: 0,
      manos_desde_barajado: 0,
      ultimo_barajado_at: new Date().toISOString(),
    })
    .eq("mesa_id", mesa.id);
  return { ok: true };
}

// ============================================================
// Recompra (buy-in) — sirve para banca y jugadores
// ============================================================
export async function recompra(admin: DB, mesa: Mesa, jugadorId: string, monto: number) {
  if (monto <= 0) throw new Error("El monto debe ser positivo.");
  const { data: jug } = await admin.from("jugadores").select("*").eq("id", jugadorId).single();
  if (!jug) throw new Error("Jugador no encontrado.");
  const j = jug as Jugador;
  await admin
    .from("jugadores")
    .update({ fichas: j.fichas + monto, total_comprado: j.total_comprado + monto })
    .eq("id", jugadorId);
  await admin.from("bj_recompras").insert({ mesa_id: mesa.id, jugador_id: jugadorId, monto });
  return { ok: true };
}

// ============================================================
// Corregir última carta escaneada de la ronda
// ============================================================
export async function corregirUltimaCartaBJ(
  admin: DB,
  mesa: Mesa,
  nuevoValor: string,
  nuevoPalo: string
) {
  const estado = await cargarEstadoBJ(admin, mesa.id);
  const { ronda } = estado;
  if (!ronda) throw new Error("No hay ronda activa.");
  if (ronda.estado === "terminada" || ronda.estado === "pagos") {
    throw new Error("La ronda ya se resolvió; no se puede corregir.");
  }
  const ultima = [...estado.cartas].sort((a, b) => b.orden_recibida - a.orden_recibida)[0];
  if (!ultima) throw new Error("No hay cartas para corregir.");

  await admin
    .from("bj_cartas_asignadas")
    .update({ valor: nuevoValor, palo: nuevoPalo })
    .eq("id", ultima.id);
  return { ok: true, carta_id: ultima.id };
}
