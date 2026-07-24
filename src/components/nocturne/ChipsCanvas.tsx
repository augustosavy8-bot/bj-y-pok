"use client";

import { useEffect, useRef } from "react";

// Fichas cayendo lento detrás del hero. Atmósfera, no protagonista:
// opacidad baja, se desvanecen antes del borde inferior. Respeta
// prefers-reduced-motion (dibuja un cuadro estático).
export function ChipsCanvas({ density = 0.45 }: { density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    type Chip = { x: number; y: number; r: number; vy: number; rot: number; vr: number; hue: number };
    let chips: Chip[] = [];

    function resize() {
      const parent = canvas!.parentElement;
      w = parent?.clientWidth ?? window.innerWidth;
      h = parent?.clientHeight ?? 400;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      canvas!.style.width = w + "px";
      canvas!.style.height = h + "px";
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round((w / 90) * density * 6);
      chips = Array.from({ length: n }, () => nueva(true));
    }

    function nueva(inicial: boolean): Chip {
      return {
        x: Math.random() * w,
        y: inicial ? Math.random() * h : -20,
        r: 8 + Math.random() * 14,
        vy: 0.15 + Math.random() * 0.35,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.01,
        hue: Math.random() < 0.5 ? 250 : 255,
      };
    }

    function dibujarChip(c: Chip) {
      const alpha = 0.16 + Math.min(0.2, c.r / 110);
      // Desvanecer cerca del borde inferior.
      const fade = c.y > h * 0.7 ? Math.max(0, 1 - (c.y - h * 0.7) / (h * 0.3)) : 1;
      ctx!.save();
      ctx!.translate(c.x, c.y);
      ctx!.rotate(c.rot);
      ctx!.globalAlpha = alpha * fade;
      ctx!.strokeStyle = `hsl(${c.hue} 45% 72%)`;
      ctx!.lineWidth = 1.4;
      ctx!.beginPath();
      ctx!.arc(0, 0, c.r, 0, Math.PI * 2);
      ctx!.stroke();
      ctx!.beginPath();
      ctx!.arc(0, 0, c.r * 0.6, 0, Math.PI * 2);
      ctx!.globalAlpha = alpha * fade * 0.6;
      ctx!.stroke();
      // Marcas del borde de la ficha.
      ctx!.globalAlpha = alpha * fade * 0.5;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx!.beginPath();
        ctx!.moveTo(Math.cos(a) * c.r, Math.sin(a) * c.r);
        ctx!.lineTo(Math.cos(a) * (c.r - 3.5), Math.sin(a) * (c.r - 3.5));
        ctx!.stroke();
      }
      ctx!.restore();
    }

    function frame() {
      ctx!.clearRect(0, 0, w, h);
      for (const c of chips) {
        c.y += c.vy;
        c.rot += c.vr;
        if (c.y - c.r > h) Object.assign(c, nueva(false));
        dibujarChip(c);
      }
      raf = requestAnimationFrame(frame);
    }

    resize();
    if (reduce) {
      chips.forEach(dibujarChip);
    } else {
      raf = requestAnimationFrame(frame);
    }
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [density]);

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />;
}
