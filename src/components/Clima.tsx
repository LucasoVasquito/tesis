import React, { useEffect, useRef } from 'react';
import { ClimaState } from '../utils/clima';
import { hexToOklch, Oklch } from '../utils/derivePalette';

/**
 * Clima (v7): las luces de fondo de toda la app, fijas detrás de todo, más un grano encima.
 * Cada luz es un círculo con gradiente radial (equivale a un blur grande y rinde mejor).
 * Color, tamaño, posición y opacidad se acercan a lo pedido con suavizado exponencial (≈ `ease` ms),
 * interpolando el color en OKLCH. Hay una deriva lenta (±20 px en 20 s) y, mientras se analiza, las luces giran.
 * Con «reducir movimiento»: sin deriva ni giro, y los cambios son un fundido corto (300 ms).
 * Si el equipo va lento (< 40 fps durante 2 s), se apaga la deriva y queda quieto.
 */

type Live = { id: string; L: number; C: number; H: number; x: number; y: number; r: number; o: number; phase: number; gone?: boolean };

const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const lerpHue = (a: number, b: number, t: number) => {
  let d = ((b - a + 540) % 360) - 180;
  return (a + d * t + 360) % 360;
};

/** Grano: ruido fractal en mosaico (evita el banding de los gradientes; textura de papel impreso). */
const GRAIN = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 1 0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>',
)}")`;

export function Clima({ state, pulse, light }: { state: ClimaState; /** Cambia para dar un pulso corto (Revisar, al aceptar). */ pulse: number; /** Fondo claro: manchas con multiplicar. */ light?: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const els = useRef(new Map<string, HTMLDivElement>());
  const live = useRef<Live[]>([]);
  const target = useRef(state);
  target.current = state;
  const pulseAt = useRef(0);
  const slow = useRef(false);

  useEffect(() => {
    if (pulse) pulseAt.current = performance.now();
  }, [pulse]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let slowFor = 0;
    const t0 = last;

    const frame = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      // Rendimiento: si va lento durante 2 s, sin deriva.
      if (!slow.current) {
        slowFor = dt > 25 ? slowFor + dt : 0;
        if (slowFor > 2000) slow.current = true;
      }
      const rm = reduced();
      const st = target.current;
      const ease = rm ? 300 : st.ease;
      const k = 1 - Math.exp(-dt / (ease / 4));
      const W = window.innerWidth;
      const H = window.innerHeight;
      const vmax = Math.max(W, H);
      const time = (now - t0) / 1000;

      // Altas, bajas y objetivo de cada luz.
      const wanted = new Map(st.lights.map(l => [l.id, l]));
      for (const l of live.current) l.gone = !wanted.has(l.id);
      st.lights.forEach((l, idx) => {
        if (live.current.some(x => x.id === l.id)) return;
        const ok = hexToOklch(l.color) ?? ([0.5, 0, 0] as Oklch);
        // Una luz nueva aparece en su lugar, desde transparente (fundido ≈ 0.8 s).
        live.current.push({ id: l.id, L: ok[0], C: ok[1], H: ok[2], x: l.x, y: l.y, r: l.r * 0.7, o: 0, phase: idx * 1.7 + l.id.length });
      });

      const pulseK = pulseAt.current ? Math.max(0, 1 - (now - pulseAt.current) / 600) : 0;
      let moving = false;
      live.current.forEach((l, idx) => {
        const want = wanted.get(l.id);
        const ok = want ? hexToOklch(want.color) ?? [l.L, l.C, l.H] : [l.L, l.C, l.H];
        let tx = want?.x ?? l.x;
        let ty = want?.y ?? l.y;
        // Analizando: giran alrededor del centro y se acercan entre sí.
        if (st.swirl && !rm) {
          const a = time * 0.6 + idx * ((Math.PI * 2) / Math.max(1, live.current.length));
          tx = 0.5 + Math.cos(a) * 0.22;
          ty = 0.5 + Math.sin(a) * 0.2;
        }
        const to = { L: ok[0], C: ok[1], H: ok[2], x: tx, y: ty, r: want?.r ?? l.r, o: want ? want.o : 0 };
        const kk = st.swirl && !rm ? 1 - Math.exp(-dt / 400) : k;
        const before = l.o + l.x + l.y + l.r + l.L;
        l.L += (to.L - l.L) * kk;
        l.C += (to.C - l.C) * kk;
        l.H = lerpHue(l.H, to.H, kk);
        l.x += (to.x - l.x) * kk;
        l.y += (to.y - l.y) * kk;
        l.r += (to.r - l.r) * kk;
        l.o += (to.o - l.o) * kk;
        if (Math.abs(before - (l.o + l.x + l.y + l.r + l.L)) > 0.0005) moving = true;
      });
      live.current = live.current.filter(l => !(l.gone && l.o < 0.01));

      // Dibujo.
      const drift = st.drift && !rm && !slow.current;
      for (const l of live.current) {
        let el = els.current.get(l.id);
        if (!el && wrap.current) {
          el = document.createElement('div');
          el.className = 'clima-light';
          wrap.current.appendChild(el);
          els.current.set(l.id, el);
        }
        if (!el) continue;
        const dx = drift ? Math.sin((time / 20) * Math.PI * 2 + l.phase) * 20 : 0;
        const dy = drift ? Math.cos((time / 20) * Math.PI * 2 + l.phase * 1.3) * 20 : 0;
        const focusPulse = pulseK && l.id === st.lights.reduce((a, b) => (b.r > a.r ? b : a), st.lights[0])?.id ? 1 + 0.15 * pulseK : 1;
        const size = l.r * vmax * 2 * focusPulse;
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.style.transform = `translate3d(${l.x * W + dx - size / 2}px, ${l.y * H + dy - size / 2}px, 0)`;
        el.style.opacity = String(Math.max(0, Math.min(1, l.o)));
        el.style.background = `radial-gradient(closest-side, oklch(${l.L.toFixed(3)} ${l.C.toFixed(3)} ${l.H.toFixed(1)}) 0%, oklch(${l.L.toFixed(3)} ${l.C.toFixed(3)} ${l.H.toFixed(1)} / 0.45) 45%, transparent 100%)`;
      }
      for (const [id, el] of els.current) {
        if (!live.current.some(l => l.id === id)) {
          el.remove();
          els.current.delete(id);
        }
      }
      // Sin deriva, sin giro y quieto: se deja de dibujar hasta el próximo cambio.
      if (drift || st.swirl || moving || pulseK > 0) raf = requestAnimationFrame(frame);
      else raf = 0;
    };
    const kick = () => {
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    kickRef.current = kick;
    kick();
    window.addEventListener('resize', kick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', kick);
    };
  }, []);

  // Cada cambio de estado (o pulso) vuelve a despertar el dibujo.
  const kickRef = useRef<() => void>(() => {});
  useEffect(() => kickRef.current(), [state, pulse]);

  return (
    <div aria-hidden="true" className="clima no-print pointer-events-none fixed inset-0 z-0 overflow-hidden" data-light={light ? 'true' : undefined}>
      <div ref={wrap} className="absolute inset-0" />
      <div className="absolute inset-0" style={{ backgroundImage: GRAIN, mixBlendMode: 'overlay', opacity: 0.15 }} />
    </div>
  );
}

export default Clima;
void React;
