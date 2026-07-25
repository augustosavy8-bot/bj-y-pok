"use client";

import { useEffect, useRef } from "react";

// Fichas cayendo lento detrás del hero. Atmósfera, no protagonista: fichas con
// volumen (cara + canto + muescas + aro), opacidad baja y se desvanecen antes
// del borde inferior. El cursor sobre el hero las empuja apenas. Respeta
// prefers-reduced-motion (dibuja un cuadro estático).
const PALETA = [
  { cara: "#3b3468", canto: "#241f3c", borde: "#8f83c9" },
  { cara: "#262a60", canto: "#171a3d", borde: "#4c5397" },
  { cara: "#33363f", canto: "#1f2126", borde: "#75798c" },
  { cara: "#292b31", canto: "#191a1f", borde: "#595d6c" },
];

type Chip = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  t: number;
  rot: number;
  vr: number;
  a: number;
  p: (typeof PALETA)[number];
};

export function ChipsCanvas({ density = 0.45 }: { density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Densidad viva sin re-montar el canvas.
  const densidad = useRef(density);
  densidad.current = density;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let W = 0;
    let H = 0;
    let chips: Chip[] = [];
    const viento = { x: -9999, activo: false };

    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = canvas!.clientWidth;
      H = canvas!.clientHeight;
      canvas!.width = Math.max(1, Math.round(W * dpr));
      canvas!.height = Math.max(1, Math.round(H * dpr));
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      chips = [];
    }

    const target = () => Math.round(densidad.current * 26);

    function spawn(alturaAlAzar: boolean) {
      const r = 9 + Math.random() * 9;
      chips.push({
        x: 20 + Math.random() * Math.max(1, W - 40),
        y: alturaAlAzar ? Math.random() * H : -30 - Math.random() * 120,
        vx: (Math.random() - 0.5) * 0.25,
        vy: 0.35 + Math.random() * 0.75,
        r,
        t: r * 0.36,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.035,
        a: 0.16 + Math.random() * 0.2,
        p: PALETA[(Math.random() * PALETA.length) | 0],
      });
    }

    function dibujar(ch: Chip) {
      const cerca = 1 - Math.max(0, (ch.y - H * 0.62) / (H * 0.42));
      ctx!.save();
      ctx!.globalAlpha = Math.max(0, ch.a * Math.min(1, cerca));
      ctx!.translate(ch.x, ch.y);
      ctx!.scale(1, 0.6);
      // Canto (elipse desplazada hacia abajo).
      ctx!.beginPath();
      ctx!.arc(0, ch.t / 0.6, ch.r, 0, Math.PI * 2);
      ctx!.fillStyle = ch.p.canto;
      ctx!.fill();
      // Cara.
      ctx!.rotate(ch.rot);
      ctx!.beginPath();
      ctx!.arc(0, 0, ch.r, 0, Math.PI * 2);
      ctx!.fillStyle = ch.p.cara;
      ctx!.fill();
      // Muescas del borde.
      ctx!.strokeStyle = ch.p.borde;
      const lw = Math.max(1.6, ch.r * 0.2);
      ctx!.lineWidth = lw;
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        ctx!.beginPath();
        ctx!.arc(0, 0, ch.r - lw * 0.5, a - 0.19, a + 0.19);
        ctx!.stroke();
      }
      // Aro interior.
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.arc(0, 0, ch.r * 0.52, 0, Math.PI * 2);
      ctx!.stroke();
      ctx!.restore();
    }

    function step() {
      raf = requestAnimationFrame(step);
      if (!W || !H) return;
      ctx!.clearRect(0, 0, W, H);
      const tgt = target();
      while (chips.length < tgt) spawn(chips.length < tgt - 1);
      for (let i = chips.length - 1; i >= 0; i--) {
        const ch = chips[i];
        ch.y += ch.vy;
        ch.x += ch.vx;
        ch.rot += ch.vr;
        if (viento.activo) {
          const dx = ch.x - viento.x;
          const ad = Math.abs(dx);
          if (ad < 170) ch.vx += (dx > 0 ? 1 : -1) * (1 - ad / 170) * 0.02;
        }
        ch.vx *= 0.985;
        if (ch.y > H + 30 || chips.length > tgt + 4) {
          chips.splice(i, 1);
          continue;
        }
        dibujar(ch);
      }
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Empuje con el cursor: se lee sobre el contenedor del canvas (el hero).
    const parent = canvas.parentElement;
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      viento.x = e.clientX - rect.left;
      viento.activo = true;
    };
    const onLeave = () => {
      viento.activo = false;
    };
    parent?.addEventListener("pointermove", onMove);
    parent?.addEventListener("pointerleave", onLeave);

    if (reduce) {
      const n = target();
      for (let i = 0; i < n; i++) spawn(true);
      chips.forEach(dibujar);
    } else {
      raf = requestAnimationFrame(step);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      parent?.removeEventListener("pointermove", onMove);
      parent?.removeEventListener("pointerleave", onLeave);
    };
    // Solo se monta una vez; la densidad se lee viva desde el ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />;
}
