import { useEffect, useState } from 'react';
import { Reference } from '../types';

const FALLBACK = '#17171B';
const cache = new Map<string, string>();

/** Color predominante del desglose de IA, si existe. */
export function breakdownDominant(ref: Reference): string | null {
  const colors = ref.breakdown?.colors;
  if (!colors || colors.length === 0) return null;
  const predominant = colors.find(c => c.role === 'predominant') ?? colors[0];
  return predominant?.hex ?? null;
}

/** Promedio de la imagen (muestreada a 16×16). Falla en silencio si la imagen no permite CORS. */
function averageColor(src: string): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 16;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(FALLBACK);
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 128) continue;
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          n++;
        }
        if (!n) return resolve(FALLBACK);
        const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, '0');
        resolve(`#${hex(r)}${hex(g)}${hex(b)}`.toUpperCase());
      } catch {
        resolve(FALLBACK);
      }
    };
    img.onerror = () => resolve(FALLBACK);
    img.src = src;
  });
}

/**
 * Color dominante de una referencia: primero el del desglose,
 * si no hay, el promedio de la imagen. Solo se calcula cuando `enabled`.
 */
export function useDominantColor(ref: Reference, enabled: boolean): string {
  const fromBreakdown = breakdownDominant(ref);
  const key = ref.image.length > 200 ? `${ref.id}:${ref.image.length}:${ref.image.slice(-64)}` : ref.image;
  const [color, setColor] = useState<string>(fromBreakdown ?? cache.get(key) ?? FALLBACK);

  useEffect(() => {
    if (fromBreakdown) {
      setColor(fromBreakdown);
      return;
    }
    if (!enabled) return;
    const cached = cache.get(key);
    if (cached) {
      setColor(cached);
      return;
    }
    let alive = true;
    averageColor(ref.image).then(c => {
      cache.set(key, c);
      if (alive) setColor(c);
    });
    return () => {
      alive = false;
    };
  }, [fromBreakdown, enabled, key, ref.image]);

  return color;
}

/** Texto legible (negro o blanco) sobre un HEX dado. */
export function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#EDEDEF';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.55 ? '#0B0B0D' : '#EDEDEF';
}
