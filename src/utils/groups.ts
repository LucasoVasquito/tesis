import { RefGroup, Reference } from '../types';
import { imageRatio } from './parts';

/** Colores de marco de grupo: tonos que no compiten con la señal (magenta) ni con los estados. */
export const GROUP_HUES = [150, 40, 255, 90, 200, 320];
export const groupColor = (g: Pick<RefGroup, 'color'>, alpha = 1) => `oklch(0.8 0.1 ${GROUP_HUES[g.color % GROUP_HUES.length]} / ${alpha})`;
export const groupInk = (g: Pick<RefGroup, 'color'>) => `oklch(0.86 0.08 ${GROUP_HUES[g.color % GROUP_HUES.length]})`;

export const groupOf = (groups: RefGroup[] | undefined, refId: string) => (groups ?? []).find(g => g.refIds.includes(refId));

function nextGroupId(groups: RefGroup[]) {
  const max = groups.reduce((m, g) => {
    const n = /^grp_(\d+)$/.exec(g.id);
    return n ? Math.max(m, parseInt(n[1], 10)) : m;
  }, 0);
  return `grp_${String(max + 1).padStart(2, '0')}`;
}

/** Saca referencias de sus grupos; los grupos que quedan vacíos desaparecen. */
export function withoutRefs(groups: RefGroup[], ids: Iterable<string>): RefGroup[] {
  const gone = new Set(ids);
  return groups.map(g => ({ ...g, refIds: g.refIds.filter(id => !gone.has(id)) })).filter(g => g.refIds.length > 0);
}

/** Crea un grupo nuevo con estas referencias (las saca de sus grupos anteriores). */
export function createGroup(groups: RefGroup[], refIds: string[], name?: string): { groups: RefGroup[]; group: RefGroup } {
  const rest = withoutRefs(groups, refIds);
  const used = new Set(groups.map(g => g.color));
  const color = Array.from({ length: GROUP_HUES.length }, (_, i) => i).find(i => !used.has(i)) ?? groups.length % GROUP_HUES.length;
  const id = nextGroupId(groups);
  const group: RefGroup = { id, name: name ?? `Grupo ${id.replace('grp_', '')}`, refIds: [...refIds], color, createdAt: new Date().toISOString() };
  return { groups: [...rest, group], group };
}

/** Suma una referencia a un grupo existente (la saca del anterior). */
export function addToGroup(groups: RefGroup[], refId: string, groupId: string): RefGroup[] {
  return withoutRefs(groups, [refId]).map(g => (g.id === groupId ? { ...g, refIds: [...g.refIds, refId] } : g));
}

/**
 * Soltar `dragId` sobre `targetId`: si el destino ya está en un grupo, se suma a ese grupo;
 * si no, se crea un grupo nuevo con las dos.
 */
export function dropOnto(groups: RefGroup[], dragId: string, targetId: string): { groups: RefGroup[]; groupId: string; created: boolean } {
  const target = groupOf(groups, targetId);
  if (target) {
    if (target.refIds.includes(dragId)) return { groups, groupId: target.id, created: false };
    return { groups: addToGroup(groups, dragId, target.id), groupId: target.id, created: false };
  }
  const { groups: next, group } = createGroup(groups, [targetId, dragId]);
  return { groups: next, groupId: group.id, created: true };
}

export type Rect = { x: number; y: number; w: number; h: number };
/** Rectángulo de una ficha en el lienzo (imagen + metadatos). */
export const refRect = (r: Reference): Rect => {
  const w = r.width || 260;
  return { x: r.position.x, y: r.position.y, w, h: w / imageRatio(r) + 76 };
};

/** Primer lugar libre junto a `anchor` para una ficha del tamaño de `card`: derecha, abajo, izquierda, arriba, cada vez más lejos. */
export function freeSpotNear(anchor: Rect, card: Rect, others: Rect[]) {
  const gap = 24;
  const hit = (x: number, y: number) =>
    others.some(o => x < o.x + o.w + gap && o.x < x + card.w + gap && y < o.y + o.h + gap && o.y < y + card.h + gap);
  for (let k = 0; k < 6; k++) {
    const far = k * (card.w + gap);
    const spots = [
      { x: anchor.x + anchor.w + gap + far, y: anchor.y },
      { x: anchor.x, y: anchor.y + anchor.h + gap + k * (card.h + gap) },
      { x: anchor.x - card.w - gap - far, y: anchor.y },
      { x: anchor.x, y: anchor.y - card.h - gap - k * (card.h + gap) },
    ];
    const free = spots.find(p => !hit(p.x, p.y));
    if (free) return { x: Math.round(free.x), y: Math.round(free.y) };
  }
  return { x: Math.round(anchor.x + anchor.w + gap), y: Math.round(anchor.y + 40) };
}
