import { CropBox, Layer, Project, Reference } from '../types';
import { corpusRefs, isLayer } from './layers';
import { normalizeHex } from './palette';
import { livePieces, pieceWeight } from '../pieces/model';

/**
 * Color camaleón. Los colores de capa salen de la paleta del proyecto, para que la interfaz no compita
 * con el sistema y se camufle con él. Solo se conserva el tono (H): la luminosidad y la saturación son fijas,
 * así nunca grita, siempre contrasta sobre el fondo oscuro y no compite con las referencias.
 */

/** Antes del primer análisis: tres neutros cálidos. */
export const NEUTRAL_LAYER_COLORS: [string, string, string] = ['oklch(0.92 0.01 85)', 'oklch(0.78 0.01 85)', 'oklch(0.64 0.01 85)'];

/** Luminosidad y saturación fijas por capa (Núcleo, Soporte, Acento). */
const FIXED: [number, number][] = [
  [0.8, 0.09],
  [0.74, 0.07],
  [0.68, 0.06],
];

/** Dos tonos cuentan como distintos si están a más de 40° uno del otro. */
export const MIN_HUE_GAP = 40;

/* ---------- sRGB → OKLCH ---------- */

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

/** Devuelve [L, C, H(°)] de un color sRGB 0..255. */
export function rgbToOklch(r: number, g: number, b: number): [number, number, number] {
  const R = lin(r), G = lin(g), B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(a, bb);
  const H = ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
  return [L, C, H];
}

export function hexToOklch(hex: string): [number, number, number] | null {
  const h = normalizeHex(hex);
  if (!h) return null;
  const n = parseInt(h.slice(1), 16);
  return rgbToOklch((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

/** Distancia entre dos tonos, en grados (0..180). */
export const hueDistance = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/* ---------- Tonos de una imagen ---------- */

/** Un tono con su peso. */
export interface Hue {
  h: number;
  c: number;
  w: number;
}

const BINS = 24;
/** Por debajo de esta croma, un píxel es gris: no aporta tono. */
const MIN_CHROMA = 0.045;

const imageCache = new Map<string, Promise<Hue[]>>();

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Tonos dominantes de una imagen (o de un recorte), por pixeles. Si el navegador no deja leerla, no devuelve nada. */
export function sampleHues(key: string, src: string, crop?: CropBox): Promise<Hue[]> {
  const k = `${key}|${crop ? `${crop.x.toFixed(3)},${crop.y.toFixed(3)},${crop.w.toFixed(3)},${crop.h.toFixed(3)}` : ''}`;
  const hit = imageCache.get(k);
  if (hit) return hit;
  const job = (async () => {
    const img = await loadImage(src);
    if (!img || !img.naturalWidth) return [];
    const size = 48;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return [];
    const sx = crop ? crop.x * img.naturalWidth : 0;
    const sy = crop ? crop.y * img.naturalHeight : 0;
    const sw = crop ? Math.max(1, crop.w * img.naturalWidth) : img.naturalWidth;
    const sh = crop ? Math.max(1, crop.h * img.naturalHeight) : img.naturalHeight;
    let data: Uint8ClampedArray;
    try {
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
      data = ctx.getImageData(0, 0, size, size).data;
    } catch {
      return []; // imagen de otra web sin permiso de lectura
    }
    const sum = Array.from({ length: BINS }, () => ({ w: 0, x: 0, y: 0, c: 0 }));
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 200) continue;
      const [L, C, H] = rgbToOklch(data[i], data[i + 1], data[i + 2]);
      if (C < MIN_CHROMA || L < 0.18 || L > 0.97) continue;
      const bin = Math.floor((H / 360) * BINS) % BINS;
      const w = C;
      const rad = (H * Math.PI) / 180;
      sum[bin].w += w;
      sum[bin].x += Math.cos(rad) * w;
      sum[bin].y += Math.sin(rad) * w;
      sum[bin].c += C * w;
    }
    const total = sum.reduce((a, b) => a + b.w, 0);
    if (!total) return [];
    return sum
      .filter(b => b.w > 0)
      .map(b => ({ h: ((Math.atan2(b.y, b.x) * 180) / Math.PI + 360) % 360, c: b.c / b.w, w: b.w / total }))
      .sort((a, b) => b.w - a.w);
  })();
  imageCache.set(k, job);
  return job;
}

/** Tonos de una referencia: los del desglose si ya se leyeron los colores; si no, los de sus píxeles. */
async function refHues(r: Reference, crop?: CropBox): Promise<Hue[]> {
  const colors = r.breakdown?.colors ?? [];
  if (!crop && colors.length) {
    const hues: Hue[] = [];
    const weight = { predominant: 3, background: 2, accent: 1.5, detail: 1 } as Record<string, number>;
    for (const c of colors) {
      const o = hexToOklch(c.hex);
      if (!o || o[1] < MIN_CHROMA) continue;
      hues.push({ h: o[2], c: o[1], w: weight[c.role] ?? 1 });
    }
    const total = hues.reduce((a, b) => a + b.w, 0);
    if (total) return hues.map(x => ({ ...x, w: x.w / total }));
  }
  return sampleHues(r.id, r.image, crop);
}

/* ---------- Cálculo ---------- */

/** Junta tonos de muchas imágenes: los tonos vecinos (a menos de 20°) se suman; devuelve el ranking por peso. */
function rank(items: { hue: Hue; weight: number }[]): Hue[] {
  const groups: { h: number; c: number; w: number }[] = [];
  for (const { hue, weight } of [...items].sort((a, b) => b.hue.w * b.weight - a.hue.w * a.weight)) {
    const w = hue.w * weight;
    const g = groups.find(x => hueDistance(x.h, hue.h) < 20);
    if (g) {
      g.w += w;
    } else groups.push({ h: hue.h, c: hue.c, w });
  }
  return groups.sort((a, b) => b.w - a.w);
}

const fmt = (layerIndex: number, h: number) => `oklch(${FIXED[layerIndex][0]} ${FIXED[layerIndex][1]} ${h.toFixed(1)})`;

/**
 * Núcleo: el color con más peso entre las piezas de Núcleo (si no tienen color, el dominante del corpus).
 * Soporte y Acento: el siguiente color cuyo tono esté a más de 40° de los ya elegidos.
 * Si hay menos de 3 tonos distintos, completa con los neutros.
 */
export async function computeLayerColors(p: Project): Promise<[string, string, string] | null> {
  const pieces = livePieces(p).filter(x => isLayer(x.layer));
  if (!pieces.length) return null;
  const byId = new Map(p.references.map(r => [r.id, r]));

  // Tonos de cada capa: la portada (recortada) y algunas referencias de cada pieza, ponderadas por peso.
  const perLayer: Record<Layer, { hue: Hue; weight: number }[]> = { 1: [], 2: [], 3: [] };
  for (const x of pieces) {
    const w = pieceWeight(x) || 1;
    const cover = x.cover && byId.get(x.cover.refId);
    if (cover) for (const hue of await refHues(cover, x.cover!.crop)) perLayer[x.layer as Layer].push({ hue, weight: w * 2 });
    for (const id of x.evidence.slice(0, 4)) {
      const r = byId.get(id);
      if (r) for (const hue of await refHues(r)) perLayer[x.layer as Layer].push({ hue, weight: w });
    }
  }

  // Color dominante del corpus: hasta 30 referencias repartidas, cada una pesa lo mismo.
  const refs = corpusRefs(p);
  const step = Math.max(1, Math.ceil(refs.length / 30));
  const corpus: { hue: Hue; weight: number }[] = [];
  for (let i = 0; i < refs.length; i += step) for (const hue of await refHues(refs[i])) corpus.push({ hue, weight: 1 });

  const ordered: Hue[] = [...rank(perLayer[1]), ...rank(perLayer[2]), ...rank(perLayer[3]), ...rank(corpus)];
  const chosen: number[] = [];
  for (const cand of ordered) {
    if (chosen.length >= 3) break;
    if (chosen.every(h => hueDistance(h, cand.h) > MIN_HUE_GAP)) chosen.push(cand.h);
  }
  if (!chosen.length) return null; // corpus sin color: se queda con los neutros
  return [0, 1, 2].map(i => (chosen[i] !== undefined ? fmt(i, chosen[i]) : NEUTRAL_LAYER_COLORS[i])) as [string, string, string];
}

/** Aplica los colores de capa a la interfaz (--capa-1..3); el cambio se anima ~800 ms por CSS. */
export function applyLayerColors(colors?: [string, string, string] | null) {
  const root = document.documentElement;
  ([1, 2, 3] as const).forEach((n, i) => {
    if (colors) root.style.setProperty(`--capa-${n}`, colors[i]);
    else root.style.removeProperty(`--capa-${n}`);
  });
}
