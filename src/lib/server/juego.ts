import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Mesa,
  Jugador,
  Mano,
  Carta,
  LecturaCarta,
  TipoAccion,
} from "@/lib/types";
import {
  jugadoresDeLaMano,
  jugadoresActivos,
  jugadoresEnJuego,
  siguienteTurno,
  primeroPostflop,
  primeroPreflop,
  soloUnoEnJuego,
  montoParaIgualar,
  minimoParaSubir,
  posicionesCiegas,
} from "@/lib/poker/engine";
import { evaluarShowdown } from "@/lib/poker/showdown";

type DB = SupabaseClient;

// ------------------------------------------------------------
// Carga de estado
// ------------------------------------------------------------
export async function cargarEstado(admin: DB, mesaId: string) {
  const [{ data: mesa }, { data: jugadores }, { data: manos }] = await Promise.all([
    admin.from("mesas").select("*").eq("id", mesaId).single(),
    admin.from("jugadores").select("*").eq("mesa_id", mesaId).order("posicion"),
    admin
      .from("manos")
      .select("*")
      .eq("mesa_id", mesaId)
      .order("numero_mano", { ascending: false })
      .limit(1),
  ]);
  return {
    mesa: mesa as Mesa | null,
    jugadores: (jugadores ?? []) as Jugador[],
    mano: (manos?.[0] ?? null) as Mano | null,
  };
}

// ------------------------------------------------------------
// Orden de reparto (empieza a la izquierda del dealer = small blind)
// ------------------------------------------------------------
export function ordenReparto(jugadores: Jugador[], dealerPos: number): Jugador[] {
  const activos = jugadoresActivos(jugadores);
  const ordenados = [...activos].sort((a, b) => a.posicion - b.posicion);
  const arranque = ordenados.findIndex((j) => j.posicion > dealerPos);
  if (arranque === -1) return ordenados;
  return [...ordenados.slice(arranque), ...ordenados.slice(0, arranque)];
}

// ------------------------------------------------------------
// Iniciar una nueva mano: rota dealer, cobra ciegas, fija turno.
// ------------------------------------------------------------
export async function iniciarNuevaMano(admin: DB, mesa: Mesa) {
  const { data: jugadoresRaw } = await admin
    .from("jugadores")
    .select("*")
    .eq("mesa_id", mesa.id)
    .order("posicion");
  const jugadores = (jugadoresRaw ?? []) as Jugador[];

  const enMesa = jugadoresDeLaMano(jugadores).filter((j) => j.fichas > 0);
  if (enMesa.length < 2) {
    throw new Error("Se necesitan al menos 2 jugadores con fichas para iniciar.");
  }

  // Reiniciar estado de jugadores para la mano nueva.
  for (const j of jugadores) {
    if (j.es_crupier) continue;
    const eliminado = j.fichas <= 0;
    await admin
      .from("jugadores")
      .update({
        estado: eliminado ? "eliminado" : "activo",
        apuesta_ronda: 0,
        total_apostado_mano: 0,
        ha_actuado: false,
      })
      .eq("id", j.id);
    j.estado = eliminado ? "eliminado" : "activo";
    j.apuesta_ronda = 0;
    j.total_apostado_mano = 0;
    j.ha_actuado = false;
  }

  // Rotar el botón al siguiente jugador con fichas.
  const ordenados = jugadoresDeLaMano(jugadores).filter((j) => j.fichas > 0);
  const siguienteDealer =
    ordenados.find((j) => j.posicion > mesa.dealer_position) ?? ordenados[0];
  const dealerPos = siguienteDealer.posicion;

  // Crear la mano.
  const { data: numData } = await admin.rpc("siguiente_numero_mano", {
    p_mesa_id: mesa.id,
  });
  const numeroMano = (numData as number) ?? 1;

  const { data: manoData, error: manoErr } = await admin
    .from("manos")
    .insert({
      mesa_id: mesa.id,
      numero_mano: numeroMano,
      fase: "preflop",
      pozo: 0,
      apuesta_actual: 0,
      ultima_subida: 0,
    })
    .select()
    .single();
  if (manoErr || !manoData) throw new Error("No se pudo crear la mano");
  const mano = manoData as Mano;

  // Cobrar ciegas.
  const { smallBlind, bigBlind } = posicionesCiegas(ordenados, dealerPos);
  let pozo = 0;

  async function cobrarCiega(j: Jugador, monto: number) {
    const pagado = Math.min(monto, j.fichas);
    const fichas = j.fichas - pagado;
    const allIn = fichas <= 0;
    await admin
      .from("jugadores")
      .update({
        fichas,
        apuesta_ronda: pagado,
        total_apostado_mano: pagado,
        estado: allIn ? "all_in" : "activo",
        ha_actuado: false,
      })
      .eq("id", j.id);
    j.fichas = fichas;
    j.apuesta_ronda = pagado;
    j.total_apostado_mano = pagado;
    j.estado = allIn ? "all_in" : "activo";
    await admin.from("acciones").insert({
      mano_id: mano.id,
      jugador_id: j.id,
      tipo: "blind",
      monto: pagado,
      fase: "preflop",
    });
    pozo += pagado;
  }

  await cobrarCiega(smallBlind, mesa.ciega_chica);
  await cobrarCiega(bigBlind, mesa.ciega_grande);

  const primero = primeroPreflop(ordenados, bigBlind);

  await admin
    .from("manos")
    .update({
      pozo,
      apuesta_actual: mesa.ciega_grande,
      ultima_subida: mesa.ciega_grande,
      turno_jugador_id: primero.id,
      ultimo_agresor_id: bigBlind.id,
    })
    .eq("id", mano.id);

  await admin
    .from("mesas")
    .update({ estado: "jugando", dealer_position: dealerPos })
    .eq("id", mesa.id);

  return { mano_id: mano.id, numero_mano: numeroMano };
}

// ------------------------------------------------------------
// Asignar una carta escaneada según la fase y el orden de reparto.
// ------------------------------------------------------------
export async function asignarCarta(
  admin: DB,
  mesa: Mesa,
  mano: Mano,
  jugadores: Jugador[],
  lectura: LecturaCarta
): Promise<{ carta: Carta; mensaje: string }> {
  // Chequear duplicado en la mano.
  const { data: existentes } = await admin
    .from("cartas")
    .select("*")
    .eq("mano_id", mano.id);
  const cartas = (existentes ?? []) as Carta[];
  if (cartas.some((c) => c.valor === lectura.valor && c.palo === lectura.palo)) {
    throw new Error(
      `La carta ${lectura.valor} de ${lectura.palo} ya fue escaneada en esta mano.`
    );
  }

  const orden = cartas.length + 1;
  let tipo: "hole" | "comunitaria";
  let jugadorId: string | null = null;
  let mensaje = "";

  if (mano.fase === "preflop") {
    // Cartas ocultas: reparto en orden, dos vueltas.
    const orden_reparto = ordenReparto(jugadores, mesa.dealer_position);
    const holeCount = cartas.filter((c) => c.tipo === "hole").length;
    const p = orden_reparto.length;
    if (p === 0) throw new Error("No hay jugadores activos para repartir.");
    if (holeCount >= p * 2) {
      throw new Error("Ya se repartieron las 2 cartas a cada jugador.");
    }
    const destino = orden_reparto[holeCount % p];
    tipo = "hole";
    jugadorId = destino.id;
    mensaje = `Carta privada para ${destino.nombre}`;
  } else if (mano.fase === "flop" || mano.fase === "turn" || mano.fase === "river") {
    const comunitarias = cartas.filter((c) => c.tipo === "comunitaria").length;
    const maxPorFase: Record<string, number> = { flop: 3, turn: 4, river: 5 };
    if (comunitarias >= maxPorFase[mano.fase]) {
      throw new Error(`Ya se escanearon todas las cartas comunitarias de ${mano.fase}.`);
    }
    tipo = "comunitaria";
    mensaje = "Carta comunitaria";
  } else {
    throw new Error(`No se pueden escanear cartas en la fase '${mano.fase}'.`);
  }

  const { data, error } = await admin
    .from("cartas")
    .insert({
      mano_id: mano.id,
      valor: lectura.valor,
      palo: lectura.palo,
      tipo,
      jugador_id: jugadorId,
      orden_escaneo: orden,
    })
    .select()
    .single();
  if (error || !data) {
    throw new Error("No se pudo guardar la carta: " + (error?.message ?? ""));
  }
  return { carta: data as Carta, mensaje };
}

// ------------------------------------------------------------
// Procesar una acción de apuesta.
// ------------------------------------------------------------
export async function procesarAccion(
  admin: DB,
  mesa: Mesa,
  mano: Mano,
  jugadores: Jugador[],
  jugadorId: string,
  tipo: TipoAccion,
  montoParam: number
): Promise<{ ok: true }> {
  const jugador = jugadores.find((j) => j.id === jugadorId);
  if (!jugador) throw new Error("Jugador no encontrado.");
  if (mano.turno_jugador_id !== jugadorId) {
    throw new Error("No es tu turno.");
  }
  if (jugador.estado !== "activo") {
    throw new Error("No podés actuar en este momento.");
  }

  let nuevaApuestaActual = mano.apuesta_actual;
  let nuevaUltimaSubida = mano.ultima_subida;
  let nuevoAgresor = mano.ultimo_agresor_id;
  let reabreAccion = false;

  const upd: Partial<Jugador> = { ha_actuado: true };
  let montoAccion = 0;
  // Monto que se registra en el historial. Para 'raise' guardamos el total
  // "subir a" (más útil para narrar), para el resto las fichas movidas.
  let montoLog: number | null = null;

  const pagar = (cantidad: number) => {
    const pagado = Math.min(cantidad, jugador.fichas);
    upd.fichas = jugador.fichas - pagado;
    upd.apuesta_ronda = jugador.apuesta_ronda + pagado;
    upd.total_apostado_mano = jugador.total_apostado_mano + pagado;
    if (upd.fichas <= 0) upd.estado = "all_in";
    montoAccion = pagado;
    return pagado;
  };

  switch (tipo) {
    case "fold":
      upd.estado = "fold";
      break;

    case "check":
      if (jugador.apuesta_ronda < mano.apuesta_actual) {
        throw new Error("No podés pasar (check); hay una apuesta que igualar.");
      }
      break;

    case "call": {
      const necesita = montoParaIgualar(jugador, mano.apuesta_actual);
      if (necesita <= 0) throw new Error("No hay nada que igualar; usá check.");
      pagar(necesita);
      break;
    }

    case "raise": {
      // montoParam = 'subir a' (nuevo total de apuesta_ronda del jugador).
      const objetivo = montoParam;
      const minimo = minimoParaSubir(
        mano.apuesta_actual,
        mano.ultima_subida,
        mesa.ciega_grande
      );
      const maxPosible = jugador.apuesta_ronda + jugador.fichas;
      if (objetivo > maxPosible) {
        throw new Error("No tenés fichas suficientes para esa subida.");
      }
      const esAllIn = objetivo === maxPosible;
      if (!esAllIn && objetivo < minimo) {
        throw new Error(`La subida mínima es a ${minimo}.`);
      }
      const incremento = objetivo - mano.apuesta_actual;
      pagar(objetivo - jugador.apuesta_ronda);
      montoLog = objetivo;
      nuevaApuestaActual = objetivo;
      // Sólo reabre acción completa si el incremento es una subida entera.
      if (incremento >= mano.ultima_subida) {
        nuevaUltimaSubida = incremento;
        nuevoAgresor = jugador.id;
        reabreAccion = true;
      }
      break;
    }

    case "all_in": {
      const objetivo = jugador.apuesta_ronda + jugador.fichas;
      pagar(jugador.fichas);
      upd.estado = "all_in";
      if (objetivo > mano.apuesta_actual) {
        const incremento = objetivo - mano.apuesta_actual;
        nuevaApuestaActual = objetivo;
        if (incremento >= mano.ultima_subida) {
          nuevaUltimaSubida = incremento;
          nuevoAgresor = jugador.id;
          reabreAccion = true;
        }
      }
      break;
    }

    default:
      throw new Error("Acción inválida.");
  }

  // Persistir cambios del jugador.
  await admin.from("jugadores").update(upd).eq("id", jugador.id);
  Object.assign(jugador, upd);

  await admin.from("acciones").insert({
    mano_id: mano.id,
    jugador_id: jugador.id,
    tipo,
    monto: montoLog ?? montoAccion,
    fase: mano.fase,
  });

  // Si una subida reabrió la acción, los demás activos deben volver a actuar.
  if (reabreAccion) {
    for (const j of jugadores) {
      if (j.id !== jugador.id && j.estado === "activo") {
        await admin.from("jugadores").update({ ha_actuado: false }).eq("id", j.id);
        j.ha_actuado = false;
      }
    }
  }

  const nuevoPozo = mano.pozo + montoAccion;
  mano.apuesta_actual = nuevaApuestaActual;
  mano.ultima_subida = nuevaUltimaSubida;
  mano.ultimo_agresor_id = nuevoAgresor;
  mano.pozo = nuevoPozo;

  // ¿Todos foldearon menos uno? Gana sin mostrar.
  if (soloUnoEnJuego(jugadores)) {
    await admin
      .from("manos")
      .update({
        pozo: nuevoPozo,
        apuesta_actual: nuevaApuestaActual,
        ultima_subida: nuevaUltimaSubida,
        ultimo_agresor_id: nuevoAgresor,
        turno_jugador_id: null,
      })
      .eq("id", mano.id);
    await finalizarPorAbandono(admin, mesa, mano, jugadores);
    return { ok: true };
  }

  // Siguiente turno o cierre de ronda.
  const siguiente = siguienteTurno(jugadores, jugador.posicion, nuevaApuestaActual);
  await admin
    .from("manos")
    .update({
      pozo: nuevoPozo,
      apuesta_actual: nuevaApuestaActual,
      ultima_subida: nuevaUltimaSubida,
      ultimo_agresor_id: nuevoAgresor,
      turno_jugador_id: siguiente ? siguiente.id : null, // null = ronda cerrada
    })
    .eq("id", mano.id);

  return { ok: true };
}

// ------------------------------------------------------------
// Avanzar de fase (lo dispara el crupier cuando la ronda está cerrada).
// ------------------------------------------------------------
export async function avanzarFase(
  admin: DB,
  mesa: Mesa,
  mano: Mano,
  jugadores: Jugador[]
): Promise<{ fase: string }> {
  if (mano.turno_jugador_id) {
    throw new Error("La ronda de apuestas todavía no terminó.");
  }

  const siguienteFase: Record<string, string> = {
    preflop: "flop",
    flop: "turn",
    turn: "river",
    river: "showdown",
  };
  const nueva = siguienteFase[mano.fase];
  if (!nueva) throw new Error(`No se puede avanzar desde la fase '${mano.fase}'.`);

  if (nueva === "showdown") {
    await resolverShowdown(admin, mesa, mano, jugadores);
    return { fase: "showdown" };
  }

  // Nueva calle de apuestas: reiniciar apuestas de ronda.
  for (const j of jugadores) {
    if (j.es_crupier) continue;
    if (j.estado === "activo") {
      await admin
        .from("jugadores")
        .update({ apuesta_ronda: 0, ha_actuado: false })
        .eq("id", j.id);
      j.apuesta_ronda = 0;
      j.ha_actuado = false;
    } else if (j.estado === "all_in") {
      await admin.from("jugadores").update({ apuesta_ronda: 0 }).eq("id", j.id);
      j.apuesta_ronda = 0;
    }
  }

  const primero = primeroPostflop(jugadores, mesa.dealer_position);

  await admin
    .from("manos")
    .update({
      fase: nueva,
      apuesta_actual: 0,
      ultima_subida: 0,
      ultimo_agresor_id: null,
      turno_jugador_id: primero ? primero.id : null,
    })
    .eq("id", mano.id);

  return { fase: nueva };
}

// ------------------------------------------------------------
// Resolución de la mano
// ------------------------------------------------------------
async function finalizarPorAbandono(
  admin: DB,
  mesa: Mesa,
  mano: Mano,
  jugadores: Jugador[]
) {
  const enJuego = jugadoresEnJuego(jugadores);
  const ganador = enJuego[0];
  if (!ganador) return;

  const totalPozo = jugadoresDeLaMano(jugadores).reduce(
    (s, j) => s + j.total_apostado_mano,
    0
  );
  await admin
    .from("jugadores")
    .update({ fichas: ganador.fichas + totalPozo })
    .eq("id", ganador.id);

  await admin
    .from("manos")
    .update({
      fase: "terminada",
      pozo: totalPozo,
      ganador_id: ganador.id,
      turno_jugador_id: null,
      resultado: {
        botes: [
          {
            monto: totalPozo,
            ganadores: [ganador.id],
            descripcion: "Todos se retiraron",
          },
        ],
        ganancias: { [ganador.id]: totalPozo },
      },
    })
    .eq("id", mano.id);
}

export async function resolverShowdown(
  admin: DB,
  mesa: Mesa,
  mano: Mano,
  jugadores: Jugador[]
) {
  const { data: cartasRaw } = await admin
    .from("cartas")
    .select("*")
    .eq("mano_id", mano.id);
  const cartas = (cartasRaw ?? []) as Carta[];

  const comunitarias = cartas.filter((c) => c.tipo === "comunitaria");
  const holePorJugador: Record<string, Carta[]> = {};
  for (const c of cartas) {
    if (c.tipo === "hole" && c.jugador_id) {
      (holePorJugador[c.jugador_id] ??= []).push(c);
    }
  }

  const resultado = evaluarShowdown({ jugadores, comunitarias, holePorJugador });

  // Acreditar ganancias.
  for (const [jid, ganado] of Object.entries(resultado.ganancias)) {
    const j = jugadores.find((x) => x.id === jid);
    if (!j) continue;
    await admin
      .from("jugadores")
      .update({ fichas: j.fichas + ganado })
      .eq("id", jid);
  }

  const ganadorPrincipal =
    resultado.botes[0]?.ganadores[0] ?? null;

  await admin
    .from("manos")
    .update({
      fase: "terminada",
      turno_jugador_id: null,
      ganador_id: ganadorPrincipal,
      resultado,
    })
    .eq("id", mano.id);
}
