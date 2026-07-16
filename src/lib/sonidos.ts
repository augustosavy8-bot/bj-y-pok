"use client";

// Motor de sonido mínimo, sintetizado con Web Audio (sin archivos externos ni
// licencias). Paleta corta: carta, ficha, turno propio, win. Mute persistido en
// localStorage; default activado en desktop, desactivado en mobile.

type TipoSonido = "carta" | "ficha" | "turno" | "win";

const CLAVE = "sonido-activo";
let ctx: AudioContext | null = null;

function esMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
}

export function sonidoActivo(): boolean {
  if (typeof window === "undefined") return false;
  const v = localStorage.getItem(CLAVE);
  if (v === null) return !esMobile();
  return v === "1";
}

export function setSonidoActivo(on: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CLAVE, on ? "1" : "0");
}

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tono(freq: number, t0: number, dur: number, vol: number, tipo: OscillatorType = "sine") {
  const c = ctx!;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = tipo;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function ruido(t0: number, dur: number, vol: number, hp = 1500) {
  const c = ctx!;
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filt = c.createBiquadFilter();
  filt.type = "highpass";
  filt.frequency.value = hp;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(filt).connect(g).connect(c.destination);
  src.start(t0);
}

export function reproducir(tipo: TipoSonido) {
  if (!sonidoActivo()) return;
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime;
  switch (tipo) {
    case "carta":
      ruido(t, 0.09, 0.14, 1800);
      break;
    case "ficha":
      tono(1400, t, 0.05, 0.12, "triangle");
      tono(1150, t + 0.05, 0.06, 0.1, "triangle");
      break;
    case "turno":
      tono(660, t, 0.12, 0.1);
      tono(880, t + 0.1, 0.16, 0.1);
      break;
    case "win":
      tono(523, t, 0.14, 0.1);
      tono(659, t + 0.1, 0.14, 0.1);
      tono(784, t + 0.2, 0.22, 0.11);
      break;
  }
}
