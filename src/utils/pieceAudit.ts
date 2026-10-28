import { PaletteColor } from '../types';
import { deltaE, hexToLab } from './palette';

/** Resultado de la auditoría de una pieza generada. */
export interface PieceAudit {
  textRead: string;
  textOk: boolean;
  textIssue: string;
  rules: { code: string; title: string; verdict: 'cumple' | 'parcial' | 'no_cumple'; reason: string }[];
  quality: string;
  fixes: string[];
  palette: PaletteCheck;
  at: string;
}

export interface ExtractedColor {
  hex: string;
  share: number;
}

export interface PaletteCheck {
  /** Colores principales de la pieza. */
  colors: ExtractedColor[];
  /** Colores del sistema: si aparecen y con qué color de la pieza. */
  system: { hex: string; name: string; found: boolean; match?: string }[];
  /** Colores con presencia que no son del sistema. */
  outside: ExtractedColor[];
}

const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

/**
 * Colores principales de una imagen: se muestrea a 96×96, se agrupan los píxeles por cercanía perceptual (Lab)
 * y se devuelven los grupos con más del 3 % de la superficie.
 */
export function extractColors(src: string, max = 8): Promise<ExtractedColor[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 96;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        // 1 · cubetas de 4 bits por canal
        const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
        let total = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 128) continue;
          const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
          const bk = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
          bk.r += data[i];
          bk.g += data[i + 1];
          bk.b += data[i + 2];
          bk.n++;
          buckets.set(key, bk);
          total++;
        }
        // 2 · fusión de cubetas cercanas (ΔE < 12), de la más grande a la más chica
        const sorted = [...buckets.values()].sort((a, b) => b.n - a.n);
        const groups: { r: number; g: number; b: number; n: number; lab: [number, number, number] }[] = [];
        for (const bk of sorted) {
          const hex = toHex(bk.r / bk.n, bk.g / bk.n, bk.b / bk.n);
          const lab = hexToLab(hex);
          const g = groups.find(x => deltaE(x.lab, lab) < 12);
          if (g) {
            g.r += bk.r;
            g.g += bk.g;
            g.b += bk.b;
            g.n += bk.n;
          } else groups.push({ ...bk, lab });
        }
        resolve(
          groups
            .map(g => ({ hex: toHex(g.r / g.n, g.g / g.n, g.b / g.n), share: g.n / Math.max(total, 1) }))
            .filter(c => c.share >= 0.03)
            .sort((a, b) => b.share - a.share)
            .slice(0, max),
        );
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    img.src = src;
  });
}

/** Compara los colores de la pieza con la paleta del sistema. */
export function checkPalette(colors: ExtractedColor[], palette: PaletteColor[]): PaletteCheck {
  const near = (a: string, b: string) => deltaE(hexToLab(a), hexToLab(b));
  const system = palette.map(p => {
    const best = colors.map(c => ({ c, d: near(c.hex, p.hex) })).sort((a, b) => a.d - b.d)[0];
    const found = !!best && best.d < 18;
    return { hex: p.hex, name: p.name, found, match: found ? best.c.hex : undefined };
  });
  const outside = colors.filter(c => c.share >= 0.08 && palette.every(p => near(c.hex, p.hex) >= 22));
  return { colors, system, outside };
}
