'use client';

import { useEffect, useRef } from 'react';

type Star = { x: number; y: number; r: number; p: number; v: number; vx: number; vy: number; c: string };
type Shoot = { x: number; y: number; vx: number; vy: number; life: number };

/** Night sky behind the landing page and the meeting. Stars drift slowly at different depths and an occasional one streaks past. */
export default function Starfield({ density = 6500 }: { density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let stars: Star[] = [];
    let shoots: Shoot[] = [];
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;
    let nextShoot = 3000;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      cv.width = Math.floor(w * dpr);
      cv.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(300, Math.round((w * h) / density));
      stars = Array.from({ length: n }, (_, i) => {
        const depth = Math.random(); // 0 far, 1 near
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          r: 0.25 + depth * 1.3,
          p: Math.random() * 6.28,
          v: Math.random() * 0.0015 + 0.0005,
          vx: -(4 + depth * 16), // px per second
          vy: 1.5 + depth * 5,
          c: i % 9 === 0 ? '#ffd9c9' : i % 13 === 0 ? '#bff5dd' : '#ffffff',
        };
      });
    };

    const draw = (t: number) => {
      const dt = last ? Math.min(0.1, (t - last) / 1000) : 0.016;
      if (t - last > 30 || reduce) {
        last = t;
        ctx.clearRect(0, 0, w, h);
        for (const s of stars) {
          if (!reduce) {
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            if (s.x < -3) s.x = w + 3;
            if (s.y > h + 3) s.y = -3;
          }
          ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(s.p + t * s.v));
          ctx.fillStyle = s.c;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, 6.283);
          ctx.fill();
        }
        if (!reduce) {
          if (t > nextShoot) {
            nextShoot = t + 5000 + Math.random() * 7000;
            shoots.push({ x: Math.random() * w * 0.8 + w * 0.2, y: Math.random() * h * 0.4, vx: -(380 + Math.random() * 220), vy: 170 + Math.random() * 120, life: 1 });
          }
          shoots = shoots.filter((s) => s.life > 0);
          for (const s of shoots) {
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.life -= dt * 1.4;
            const g = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 0.12, s.y - s.vy * 0.12);
            g.addColorStop(0, `rgba(255,255,255,${Math.max(0, s.life)})`);
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.globalAlpha = 1;
            ctx.strokeStyle = g;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(s.x - s.vx * 0.12, s.y - s.vy * 0.12);
            ctx.stroke();
          }
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
