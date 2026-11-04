import { CropBox, PartKind, Reference } from '../types';
import { FAMILIES, Family } from './families';

export const PART_KINDS: { kind: PartKind; label: string; family: Family }[] = [
  { kind: 'typography', label: 'Tipografía', family: FAMILIES.typography },
  { kind: 'logo', label: 'Logo', family: FAMILIES.identity },
  { kind: 'mascot', label: 'Mascota', family: FAMILIES.identity },
  { kind: 'illustration', label: 'Ilustración', family: FAMILIES.identity },
  { kind: 'photo', label: 'Foto', family: FAMILIES.image },
  { kind: 'texture', label: 'Textura', family: FAMILIES.matter },
  { kind: 'graphic', label: 'Recurso gráfico', family: FAMILIES.composition },
  { kind: 'other', label: 'Otra', family: FAMILIES.image },
];

export const partKindInfo = (k?: PartKind) => PART_KINDS.find(p => p.kind === k) ?? PART_KINDS[PART_KINDS.length - 1];

/** Parte propuesta (por la IA o marcada a mano) antes de sumarse al moodboard. */
export interface PartProposal {
  key: string;
  kind: PartKind;
  label: string;
  description?: string;
  box: CropBox;
  source: 'ai' | 'manual';
  selected: boolean;
}

/** Estado de la separación en partes de una referencia, mientras el diseñador la revisa. */
export type PartDraft = { status: 'loading' } | { status: 'error'; message: string } | { status: 'review'; proposals: PartProposal[] };

export const isPart = (r: Reference) => !!r.parentId;
export const partsOf = (refs: Reference[], parentId: string) => refs.filter(r => r.parentId === parentId);
/** Referencias completas (sin partes): son las que cuentan para el mínimo del corpus. */
export const wholeReferences = (refs: Reference[]) => refs.filter(r => !r.parentId);

/** Recorte mínimo (fracción del lado) para que una parte se lea. */
const MIN_SIDE = 0.04;

export function clampBox(b: CropBox): CropBox | null {
  const x = Math.min(1, Math.max(0, b.x));
  const y = Math.min(1, Math.max(0, b.y));
  const w = Math.min(1 - x, Math.max(0, b.w));
  const h = Math.min(1 - y, Math.max(0, b.h));
  return w >= MIN_SIDE && h >= MIN_SIDE ? { x, y, w, h } : null;
}

/** IDs de partes: ref_07a, ref_07b… sin chocar con las existentes. */
export function nextPartIds(parentId: string, existing: Reference[], count: number): string[] {
  const used = new Set(existing.map(r => r.id));
  const ids: string[] = [];
  for (let i = 0; ids.length < count && i < 26 * 27; i++) {
    const suffix = i < 26 ? String.fromCharCode(97 + i) : String.fromCharCode(97 + Math.floor(i / 26) - 1) + String.fromCharCode(97 + (i % 26));
    const id = `${parentId}${suffix}`;
    if (!used.has(id)) ids.push(id);
  }
  return ids;
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la imagen original.'));
    img.src = src;
  });

/**
 * Recorta zonas de una imagen en el navegador (sin generar nada nuevo).
 * Devuelve data URLs JPEG livianas y la proporción real de cada recorte.
 */
export async function cropImage(src: string, boxes: CropBox[], maxSide = 720): Promise<{ image: string; aspectRatio: number }[]> {
  const img = await loadImage(src);
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  return boxes.map(b => {
    const sw = Math.max(1, Math.round(b.w * W));
    const sh = Math.max(1, Math.round(b.h * H));
    const k = Math.min(1, maxSide / Math.max(sw, sh));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sw * k));
    canvas.height = Math.max(1, Math.round(sh * k));
    const ctx = canvas.getContext('2d')!;
    // Fondo neutro para PNG con transparencia (logos).
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, Math.round(b.x * W), Math.round(b.y * H), sw, sh, 0, 0, canvas.width, canvas.height);
    let image: string;
    try {
      image = canvas.toDataURL('image/jpeg', 0.86);
    } catch {
      throw new Error('La imagen viene de una web que no permite recortarla. Descargala y subila como archivo.');
    }
    return { image, aspectRatio: sw / sh };
  });
}

/** Proporción (ancho / alto) con la que se muestra la imagen de una ficha. */
export function imageRatio(r: Reference): number {
  if (r.aspectRatio) return Math.min(2.2, Math.max(0.55, r.aspectRatio));
  return 0.8;
}

export const PART_CARD_W = 200;

const META_H = 76;
const GAP = 20;
const cardBox = (r: Reference) => {
  const w = r.width || 260;
  return { x: r.position.x, y: r.position.y, w, h: w / imageRatio(r) + META_H };
};
const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w + GAP && b.x < a.x + a.w + GAP && a.y < b.y + b.h + GAP && b.y < a.y + a.h + GAP;

/**
 * Ubica las partes nuevas en una columna junto a la original, en el primer lugar libre:
 * a la derecha, a la izquierda y cada vez más lejos; si no hay, debajo de todo.
 */
export function placeParts(parent: Reference, existing: Reference[], ratios: number[]): { x: number; y: number }[] {
  const heights = ratios.map(r => PART_CARD_W / Math.min(2.2, Math.max(0.55, r)) + META_H);
  const colH = heights.reduce((a, h) => a + h, 0) + GAP * (heights.length - 1);
  const p = cardBox(parent);
  const others = existing.map(cardBox);
  const free = (x: number, y: number) => !others.some(o => overlaps({ x, y, w: PART_CARD_W, h: colH }, o));
  const column = (x: number, y: number) => {
    let cy = y;
    return heights.map(h => {
      const pos = { x: Math.round(x), y: Math.round(cy) };
      cy += h + GAP;
      return pos;
    });
  };
  for (let step = 0; step < 8; step++) {
    const right = p.x + p.w + 40 + step * (PART_CARD_W + 40);
    const left = p.x - 40 - PART_CARD_W - step * (PART_CARD_W + 40);
    for (const x of [right, left]) for (const dy of [0, -colH / 2 + p.h / 2, p.h + GAP]) if (free(x, p.y + dy)) return column(x, p.y + dy);
  }
  const bottom = Math.max(...others.map(o => o.y + o.h), p.y + p.h) + 60;
  return column(p.x, bottom);
}
