import { Pattern, Project, Reference } from '../types';
import { ColorPiece, DetectedColor, hexToOklch, LayerNo } from './derivePalette';
import { ImageColor, paletteFromImage } from './imagePalette';
import { corpusRefs, evidenceCount, isLayer } from './layers';
import { HEX_IN_TEXT, normalizeHex } from './palette';
import { livePieces } from '../pieces/model';

/**
 * Detección de colores del proyecto, en el navegador (sin costo):
 * - de los píxeles de cada referencia del usuario (pesan x2 en derivePalette);
 * - de lo que infirió el sistema (desglose de color de las referencias, hex citados en piezas de color).
 * Los grises y casi blancos / negros pesan poco: una hamburguesa sobre fondo blanco no es una marca blanca.
 */

const cache = new Map<string, Promise<ImageColor[]>>();

/** Colores de una referencia (cacheado por id + largo de la imagen). */
export function refColors(r: Reference): Promise<ImageColor[]> {
  const key = `${r.id}:${r.image.length}`;
  let job = cache.get(key);
  if (!job) {
    job = paletteFromImage(r.image, 5).catch(() => []);
    cache.set(key, job);
  }
  return job;
}

/** Peso de un color según cuán cromático es. */
export const chromaWeight = (hex: string) => {
  const o = hexToOklch(hex);
  return !o ? 0 : o[1] < 0.04 ? 0.15 : 1;
};

export type RefColorMap = Map<string, ImageColor[]>;

export async function detectColors(p: Project): Promise<{ detected: DetectedColor[]; byRef: RefColorMap }> {
  const refs = corpusRefs(p).slice(0, 40);
  const byRef: RefColorMap = new Map();
  await Promise.all(refs.map(async r => byRef.set(r.id, await refColors(r))));
  const detected: DetectedColor[] = [];
  for (const [, colors] of byRef) for (const c of colors) detected.push({ hex: c.hex, weight: c.share * chromaWeight(c.hex), source: 'user' });
  // Lo que infirió el sistema.
  for (const r of p.references) {
    for (const c of r.breakdown?.colors ?? []) {
      const hex = normalizeHex(c.hex);
      if (hex) detected.push({ hex, weight: (parseFloat(c.percentage ?? '') / 100 || 0.1) * chromaWeight(hex), source: 'agent' });
    }
  }
  for (const x of livePieces(p).filter(x => x.category === 'color' && x.origin !== 'user')) {
    for (const raw of x.description?.match(HEX_IN_TEXT) ?? []) {
      const hex = normalizeHex(raw);
      if (hex) detected.push({ hex, weight: 0.3 * chromaWeight(hex), source: 'agent' });
    }
  }
  return { detected, byRef };
}

/** Color de una pieza de color: el hex de su descripción o el más presente en sus referencias. */
export function pieceBaseColor(x: Pattern, byRef: RefColorMap): string | null {
  for (const raw of x.description?.match(HEX_IN_TEXT) ?? []) {
    const hex = normalizeHex(raw);
    if (hex) return hex;
  }
  const sums = new Map<string, number>();
  const ids = x.cover?.refId ? [x.cover.refId, ...x.evidence] : x.evidence;
  for (const id of ids) for (const c of byRef.get(id) ?? []) sums.set(c.hex, (sums.get(c.hex) ?? 0) + c.share * chromaWeight(c.hex));
  return [...sums.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Las piezas de color en capas, con su frecuencia, para derivePalette. */
export function colorPieces(p: Project, byRef: RefColorMap): ColorPiece[] {
  return livePieces(p)
    .filter(x => x.category === 'color' && isLayer(x.layer))
    .map(x => ({ id: x.id, layer: x.layer as LayerNo, hex: pieceBaseColor(x, byRef), frequency: evidenceCount(x, p) }));
}
