// ============================================================
// sound.ts — Sonido sintetizado (Web Audio API) para los slots. Sin archivos:
// cada tema trae un "perfil" (nota base, escala, timbre) y todo se genera en
// vivo, así cada máquina suena distinta. Respeta un mute persistente y se
// desbloquea con el primer gesto del usuario (política de autoplay).
// ============================================================

export interface SoundProfile {
  /** Frecuencia de la tónica (Hz). */
  base: number;
  /** Offsets en semitonos para melodías (define el "modo" del tema). */
  scale: number[];
  /** Timbre de los osciladores. */
  wave: OscillatorType;
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
try {
  muted = typeof localStorage !== "undefined" && localStorage.getItem("slot_muted") === "1";
} catch {}

function ensure(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

// --- iOS: promover la sesión de audio a "playback" ------------------------
// En iOS, el audio de la Web Audio API se trata como "ambiente" y lo silencia
// el INTERRUPTOR DE SILENCIO físico del iPhone, aunque el contexto esté activo.
// Truco estándar: reproducir un <audio> con contenido silencioso en el primer
// gesto. Al sonar un elemento multimedia, iOS promueve la sesión a "playback",
// y a partir de ahí la Web Audio suena aunque el switch esté en silencio (y
// respeta los botones de volumen). El WAV es silencio puro: no se oye nada.
function wavSilencioso(): string {
  const sr = 8000, n = 1600; // 0.2s mono 8-bit
  const buf = new ArrayBuffer(44 + n);
  const dv = new DataView(buf);
  const escribir = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
  };
  escribir(0, "RIFF"); dv.setUint32(4, 36 + n, true); escribir(8, "WAVE");
  escribir(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr, true);
  dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
  escribir(36, "data"); dv.setUint32(40, n, true);
  for (let i = 0; i < n; i++) dv.setUint8(44 + i, 128); // 128 = silencio en 8-bit
  let bin = "";
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return "data:audio/wav;base64," + btoa(bin);
}

let mediaEl: HTMLAudioElement | null = null;
function promoverSesion(): void {
  if (typeof document === "undefined") return;
  if (!mediaEl) {
    mediaEl = document.createElement("audio");
    mediaEl.src = wavSilencioso();
    mediaEl.loop = true;
    mediaEl.setAttribute("playsinline", "");
    mediaEl.setAttribute("aria-hidden", "true");
  }
  // Debe llamarse dentro de un gesto; el contenido es silencio, no se oye.
  mediaEl.play().catch(() => {});
}

// Desbloqueo global: el contexto puede quedar suspendido si el giro nace de un
// timer (auto-spin) o si el navegador lo suspendió (móvil/iOS). Cualquier gesto
// del usuario lo reactiva (y promueve la sesión iOS), así los sonidos que
// llegan *después* del giro (premio, giros gratis) tienen contexto vivo.
let listenersPuestos = false;
function instalarDesbloqueo(): void {
  if (listenersPuestos || typeof window === "undefined") return;
  listenersPuestos = true;
  const reactivar = () => {
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    if (!muted) promoverSesion();
  };
  for (const ev of ["pointerdown", "touchend", "keydown"]) {
    window.addEventListener(ev, reactivar, { passive: true });
  }
}

/**
 * Ejecuta `fn` con el contexto GARANTIZADO en estado "running" y le pasa un
 * `t0` (tiempo de arranque) coherente con ese estado. Clave del arreglo: si el
 * contexto está suspendido, `currentTime` no avanza; agendar notas ahí las deja
 * "en el pasado" cuando reanuda y se descartan (silencio). Por eso, si está
 * suspendido, reanudamos y recién en el `.then` — con el `currentTime` ya
 * fresco — agendamos.
 */
function withAudio(fn: (c: AudioContext, t0: number) => void): void {
  const c = ensure();
  if (!c || muted) return;
  if (c.state === "suspended") {
    c.resume()
      .then(() => {
        if (!muted && c.state === "running") fn(c, c.currentTime + 0.02);
      })
      .catch(() => {});
  } else {
    fn(c, c.currentTime);
  }
}

/** Llamar en el primer gesto (click Girar) para habilitar el audio. */
export function unlockAudio(): void {
  const c = ensure();
  instalarDesbloqueo();
  if (!muted) promoverSesion();
  // Desbloqueo iOS del propio AudioContext: arrancar un buffer mudo DENTRO del
  // gesto. Sin esto, iOS puede dejar el contexto sin sonar hasta el próximo
  // toque.
  if (c && master) {
    try {
      const src = c.createBufferSource();
      src.buffer = c.createBuffer(1, 1, c.sampleRate);
      src.connect(master);
      src.start(0);
    } catch {}
  }
}
export function setMuted(m: boolean): void {
  muted = m;
  try {
    localStorage.setItem("slot_muted", m ? "1" : "0");
  } catch {}
}
export function isMuted(): boolean {
  return muted;
}

const semis = (base: number, s: number) => base * Math.pow(2, s / 12);

function note(freq: number, at: number, dur: number, wave: OscillatorType, vol = 0.3) {
  if (!ctx || !master) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = wave;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0007, at + dur);
  o.connect(g);
  g.connect(master);
  o.start(at);
  o.stop(at + dur + 0.03);
}

const DEFAULT: SoundProfile = { base: 329.63, scale: [0, 2, 4, 7, 9], wave: "triangle" };

export class SlotSound {
  private p: SoundProfile;
  constructor(profile?: SoundProfile) {
    this.p = profile ?? DEFAULT;
  }

  /** Whoosh de arranque del giro (ruido filtrado descendente). */
  spin(): void {
    withAudio((c, t0) => {
      if (!master) return;
      const dur = 0.34;
      const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = c.createBufferSource();
      src.buffer = buf;
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 1.1;
      bp.frequency.setValueAtTime(1300, t0);
      bp.frequency.exponentialRampToValueAtTime(380, t0 + dur);
      const g = c.createGain();
      g.gain.value = 0.16;
      src.connect(bp);
      bp.connect(g);
      g.connect(master);
      src.start(t0);
    });
  }

  /** Golpe seco de la parada de cada rodillo. */
  reelStop(i: number): void {
    withAudio((_c, t0) => {
      const f = semis(this.p.base, this.p.scale[i % this.p.scale.length]) / 2;
      note(f, t0, 0.09, "triangle", 0.22);
      note(f / 2, t0, 0.12, "sine", 0.14);
    });
  }

  /** Jingle ascendente de premio. level 1..3 = más largo/brillante. */
  win(level: number): void {
    withAudio((_c, t0) => {
      const seq = this.p.scale.concat([12, 14]).slice(0, 3 + level);
      const step = 0.085;
      seq.forEach((s, i) => note(semis(this.p.base, s), t0 + i * step, 0.17, this.p.wave, 0.26));
      note(semis(this.p.base, 12), t0 + seq.length * step, 0.45, this.p.wave, 0.2);
    });
  }

  /** Fanfarria de giros gratis. */
  freeSpins(): void {
    withAudio((_c, t0) => {
      const motif = [0, 7, 12, 7, 12, 16, 19, 24];
      motif.forEach((s, i) => note(semis(this.p.base, s), t0 + i * 0.1, 0.24, this.p.wave, 0.28));
    });
  }
}
