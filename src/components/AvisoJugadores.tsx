"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { reproducir } from "@/lib/sonidos";

type MesaViva = {
  codigo_sala: string;
  jugadores: { id: string; nombre: string }[];
};

const CLAVE = "nocturna-avisos";
// No avisar dos veces por la misma persona en esta ventana (entra y sale,
// se reconecta, cambia de mesa…).
const MS_ANTI_REPETIDO = 5 * 60 * 1000;

/**
 * Vigía de la mesa: avisa cuando alguien se sienta a jugar.
 *
 * Funciona con la app abierta (aunque esté minimizada o en otra pestaña), que
 * es el caso de tenerla instalada en el escritorio. Para avisar con la app
 * CERRADA haría falta Web Push, que necesita claves propias en el servidor.
 */
export function AvisoJugadores() {
  const supabase = getSupabaseBrowser();
  const [activo, setActivo] = useState(false);
  const [permiso, setPermiso] = useState<NotificationPermission | "no-soportado">("default");
  const [enMesa, setEnMesa] = useState<MesaViva[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Última vez que avisamos por cada jugador, para no repetir.
  const avisados = useRef<Map<string, number>>(new Map());
  const primeraLectura = useRef(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) {
      setPermiso("no-soportado");
      return;
    }
    setPermiso(Notification.permission);
    setActivo(localStorage.getItem(CLAVE) === "1" && Notification.permission === "granted");
  }, []);

  const notificar = useCallback((titulo: string, cuerpo: string) => {
    try {
      reproducir("turno");
    } catch {
      /* el sonido es opcional */
    }
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const n = new Notification(titulo, {
      body: cuerpo,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "nocturna-jugando",
      renotify: true,
    } as NotificationOptions);
    n.onclick = () => {
      window.focus();
      n.close();
    };
  }, []);

  // Lee quién está sentado ahora mismo y avisa por los que son nuevos.
  const revisar = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("jugadores")
      .select("id, nombre, es_crupier, estado, mesa_id, mesas!inner(codigo_sala, estado)")
      .eq("es_crupier", false)
      .neq("estado", "eliminado")
      .neq("mesas.estado", "terminada");

    if (err) {
      setError("No se pudo leer el estado de las mesas.");
      return;
    }
    setError(null);

    type Fila = {
      id: string;
      nombre: string;
      mesas: { codigo_sala: string } | { codigo_sala: string }[];
    };
    const filas = (data ?? []) as unknown as Fila[];

    const porMesa = new Map<string, { id: string; nombre: string }[]>();
    for (const f of filas) {
      const m = Array.isArray(f.mesas) ? f.mesas[0] : f.mesas;
      const cod = m?.codigo_sala ?? "—";
      if (!porMesa.has(cod)) porMesa.set(cod, []);
      porMesa.get(cod)!.push({ id: f.id, nombre: f.nombre });
    }
    setEnMesa([...porMesa.entries()].map(([codigo_sala, jugadores]) => ({ codigo_sala, jugadores })));

    // La primera lectura sólo fija el punto de partida: si ya había gente
    // jugando cuando abriste la app, no tiene sentido avisarte de golpe.
    if (primeraLectura.current) {
      primeraLectura.current = false;
      const ahora = Date.now();
      for (const f of filas) avisados.current.set(f.id, ahora);
      return;
    }

    const ahora = Date.now();
    const nuevos: { nombre: string; mesa: string }[] = [];
    for (const [cod, js] of porMesa) {
      for (const j of js) {
        const visto = avisados.current.get(j.id);
        if (!visto || ahora - visto > MS_ANTI_REPETIDO) {
          nuevos.push({ nombre: j.nombre, mesa: cod });
        }
        avisados.current.set(j.id, ahora);
      }
    }

    if (nuevos.length === 1) {
      notificar("Alguien está jugando", `${nuevos[0].nombre} se sentó en la mesa ${nuevos[0].mesa}.`);
    } else if (nuevos.length > 1) {
      notificar(
        `${nuevos.length} jugadores en la mesa`,
        nuevos.map((n) => n.nombre).join(", ")
      );
    }
  }, [supabase, notificar]);

  // Escucha en vivo mientras el aviso esté encendido.
  useEffect(() => {
    if (!activo) return;
    primeraLectura.current = true;
    void revisar();

    const canal = supabase
      .channel("vigia-jugadores")
      .on("postgres_changes", { event: "*", schema: "public", table: "jugadores" }, () => {
        void revisar();
      })
      .subscribe();

    // Respaldo por si el canal se cae: la app puede quedar horas de fondo.
    const iv = setInterval(() => void revisar(), 30_000);

    return () => {
      supabase.removeChannel(canal);
      clearInterval(iv);
    };
  }, [activo, supabase, revisar]);

  async function alternar() {
    if (permiso === "no-soportado") return;
    if (activo) {
      setActivo(false);
      localStorage.setItem(CLAVE, "0");
      return;
    }
    let p = Notification.permission;
    if (p === "default") p = await Notification.requestPermission();
    setPermiso(p);
    if (p !== "granted") return;
    setActivo(true);
    localStorage.setItem(CLAVE, "1");
  }

  const totalJugando = enMesa.reduce((s, m) => s + m.jugadores.length, 0);

  return (
    <section className="ncard flex flex-col gap-3 border border-white/[0.06] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-medium">Avisarme cuando alguien juegue</h3>
          <p className="m-0 text-[12px] text-tinta/50">
            {permiso === "no-soportado"
              ? "Este navegador no soporta notificaciones."
              : permiso === "denied"
              ? "Bloqueaste las notificaciones para este sitio; habilitalas desde el candado de la barra de direcciones."
              : "Suena y te avisa apenas alguien se sienta. Funciona con la app abierta o minimizada."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={activo}
          disabled={permiso === "no-soportado" || permiso === "denied"}
          onClick={alternar}
          className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-40 ${
            activo ? "bg-acento" : "bg-white/15"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
              activo ? "left-[22px]" : "left-0.5"
            }`}
          />
        </button>
      </div>

      <div className="flex items-center gap-2.5 rounded-md border border-white/10 bg-black/25 px-3 py-2">
        <span className="relative flex h-2 w-2 shrink-0">
          {totalJugando > 0 && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          )}
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${
              totalJugando > 0 ? "bg-emerald-400" : "bg-tinta/35"
            }`}
          />
        </span>
        <span className="text-[13px]">
          {totalJugando === 0 ? (
            <span className="text-tinta/60">Nadie jugando ahora</span>
          ) : (
            <span className="text-emerald-200">
              {totalJugando === 1 ? "1 jugador" : `${totalJugando} jugadores`} en mesa
              <span className="text-tinta/50">
                {" · "}
                {enMesa
                  .filter((m) => m.jugadores.length > 0)
                  .map((m) => `${m.codigo_sala}: ${m.jugadores.map((j) => j.nombre).join(", ")}`)
                  .join(" · ")}
              </span>
            </span>
          )}
        </span>
      </div>

      {error && <p className="m-0 text-[12px] text-amber-200">{error}</p>}
    </section>
  );
}
