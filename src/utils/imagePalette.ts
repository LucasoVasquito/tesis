import { deltaE, hexToLab } from './palette';

export interface ImageColor {
  hex: string;
  /** Proporción de la imagen que ocupa (0..1, suman 1). */
  share: number;
}

const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

/**
 * Desglosa la paleta de una imagen, en el navegador (sin costo): agrupa los píxeles por color, junta los colores
 * parecidos (ΔE < 14) y devuelve los más presentes con su proporción.
 */
export async function paletteFromImage(src: string, max = 6): Promise<ImageColor[]> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('No se pudo abrir la imagen.'));
    el.src = src;
  });
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('No se pudo leer la imagen.');
  let data: Uint8ClampedArray;
  try {
    ctx.drawImage(img, 0, 0, size, size);
    data = ctx.getImageData(0, 0, size, size).data;
  } catch {
    throw new Error('La imagen viene de una web que no permite leer sus colores. Descargala y subila como archivo.');
  }

  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const b = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    b.n++;
    b.r += data[i];
    b.g += data[i + 1];
    b.b += data[i + 2];
    buckets.set(key, b);
    total++;
  }
  if (!total) throw new Error('La imagen no tiene colores para leer.');

  const clusters: { hex: string; lab: [number, number, number]; n: number }[] = [];
  for (const b of [...buckets.values()].sort((a, c) => c.n - a.n)) {
    const hex = toHex(b.r / b.n, b.g / b.n, b.b / b.n);
    const lab = hexToLab(hex);
    const near = clusters.find(c => deltaE(c.lab, lab) < 14);
    if (near) near.n += b.n;
    else clusters.push({ hex, lab, n: b.n });
  }
  const top = clusters.sort((a, b) => b.n - a.n).slice(0, max);
  const sum = top.reduce((a, c) => a + c.n, 0) || 1;
  return top.map(c => ({ hex: c.hex, share: c.n / sum }));
}
