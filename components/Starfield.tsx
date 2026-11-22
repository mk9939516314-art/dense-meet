'use client';

import { useEffect, useRef } from 'react';

type Star = { x: number; y: number; r: number; p: number; v: number; d: number; c: string };

/** Quiet animated night sky used behind the landing page and the meeting. */
export default function Starfield({ density = 6500 }: { density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let stars: Star[] = [];
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      cv.width = Math.floor(w * dpr);
      cv.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(260, Math.round((w * h) / density));
      stars = Array.from({ length: n }, (_, i) => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.2 + 0.2,
        p: Math.random() * 6.28,
        v: Math.random() * 0.0012 + 0.0004,
        d: Math.random() * 0.05 + 0.01,
        c: i % 9 === 0 ? '#a9b6ff' : i % 13 === 0 ? '#9fefff' : '#ffffff',
      }));
    };

    const draw = (t: number) => {
      // ~30fps is plenty for a background and saves battery on phones
      if (t - last > 32 || reduce) {
        last = t;
        ctx.clearRect(0, 0, w, h);
        for (const s of stars) {
          if (!reduce) {
            s.x -= s.d * 0.25;
            if (s.x < -2) s.x = w + 2;
          }
          ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(s.p + t * s.v));
          ctx.fillStyle = s.c;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, 6.283);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    };

    resize();
    raf = requestAnimationFrame(draw);
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [density]);

  return <canvas ref={ref} className="starfield" aria-hidden="true" />;
}
