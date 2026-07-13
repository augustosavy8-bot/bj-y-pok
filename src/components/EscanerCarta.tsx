"use client";

import { useEffect, useRef, useState } from "react";
import { VALORES, PALOS } from "@/lib/types";
import type { Valor, Palo } from "@/lib/types";
import { Carta as CartaVisual } from "@/components/Carta";

type Lectura = { valor: Valor; palo: Palo; confianza: number };

export function EscanerCarta({
  codigo,
  authUid,
  proximaPista,
  onConfirmada,
  endpoint,
}: {
  codigo: string;
  authUid: string;
  proximaPista: string;
  onConfirmada: (mensaje: string) => void;
  // Endpoint donde publicar la carta confirmada. Por defecto, poker.
  endpoint?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [camaraOk, setCamaraOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [corrigiendo, setCorrigiendo] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: 1280, height: 720 },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCamaraOk(true);
        }
      } catch {
        setError("No se pudo acceder a la cámara. Revisá los permisos del navegador.");
      }
    })();
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function capturarBase64(): string | null {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.85);
  }

  async function escanear() {
    setError(null);
    const img = capturarBase64();
    if (!img) {
      setError("La cámara todavía no está lista.");
      return;
    }
    setLeyendo(true);
    try {
      const res = await fetch("/api/leer-carta", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imagen: img }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "No se pudo leer la carta.");
        setCorrigiendo(true);
        setLectura({ valor: "A", palo: "picas", confianza: 0 });
      } else {
        setLectura(data);
        setCorrigiendo(data.confianza < 0.7);
      }
    } catch {
      setError("Error de red al leer la carta.");
    } finally {
      setLeyendo(false);
    }
  }

  async function confirmar() {
    if (!lectura) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(endpoint ?? `/api/mesa/${codigo}/carta`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          auth_uid: authUid,
          valor: lectura.valor,
          palo: lectura.palo,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "No se pudo guardar la carta.");
      } else {
        onConfirmada(data.mensaje ?? "Carta publicada");
        setLectura(null);
        setCorrigiendo(false);
      }
    } catch {
      setError("Error de red al guardar.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="panel flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Estación de escaneo</h3>
        <span className="text-xs text-white/60">Próxima: {proximaPista}</span>
      </div>

      <div className="relative overflow-hidden rounded-xl bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          className="w-full aspect-video object-cover"
        />
        {/* Recuadro guía */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[70%] aspect-[2.5/3.5] rounded-lg border-2 border-oro/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        </div>
        {!camaraOk && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-white/60">
            Activando cámara…
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />

      {error && (
        <div className="rounded-lg bg-red-900/50 px-3 py-2 text-sm text-red-100">
          {error}
        </div>
      )}

      {!lectura ? (
        <button
          className="btn btn-oro"
          disabled={!camaraOk || leyendo}
          onClick={escanear}
        >
          {leyendo ? "Leyendo carta…" : "Escanear carta"}
        </button>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-black/25 p-4">
          <CartaVisual valor={lectura.valor} palo={lectura.palo} size="lg" />
          <div className="text-sm text-white/70">
            Confianza IA: {Math.round(lectura.confianza * 100)}%
          </div>

          {corrigiendo && (
            <div className="grid w-full grid-cols-2 gap-2">
              <label className="text-sm">
                Valor
                <select
                  className="mt-1 w-full rounded-lg bg-white/10 p-2"
                  value={lectura.valor}
                  onChange={(e) =>
                    setLectura({ ...lectura, valor: e.target.value as Valor })
                  }
                >
                  {VALORES.map((v) => (
                    <option key={v} value={v} className="text-black">
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Palo
                <select
                  className="mt-1 w-full rounded-lg bg-white/10 p-2"
                  value={lectura.palo}
                  onChange={(e) =>
                    setLectura({ ...lectura, palo: e.target.value as Palo })
                  }
                >
                  {PALOS.map((p) => (
                    <option key={p} value={p} className="text-black">
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <div className="grid w-full grid-cols-2 gap-2">
            <button
              className="btn btn-gris"
              disabled={guardando}
              onClick={() => setCorrigiendo((v) => !v)}
            >
              {corrigiendo ? "Ocultar corrección" : "Corregir"}
            </button>
            <button className="btn btn-oro" disabled={guardando} onClick={confirmar}>
              {guardando ? "Guardando…" : "Confirmar"}
            </button>
          </div>
          <button
            className="text-xs text-white/50 underline"
            onClick={() => {
              setLectura(null);
              setCorrigiendo(false);
            }}
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
