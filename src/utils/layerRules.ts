import { Fragment, Layer, Pattern, Project } from '../types';
import { isLayer } from './layers';
import { pieceWeight } from '../pieces/model';

/**
 * Lo que dice cada lámina. La lámina no es decorativa: define cuánto pesa un patrón en el resultado.
 * - Núcleo: regla completa, con ejemplos.
 * - Soporte: regla corta.
 * - Acento: una línea.
 */

const firstSentence = (t: string) => {
  const m = /^(.+?[.!?])(\s|$)/.exec(t.trim());
  return (m ? m[1] : t.trim()).trim();
};
const clip = (t: string, max: number) => (t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`);

/** Núcleo: la regla entera (hipótesis de sistema o descripción). */
export const fullRule = (p: Pattern) => (p.systemHypothesis?.trim() || p.description?.trim() || '').trim();
/** Soporte: la primera oración, corta. */
export const shortRule = (p: Pattern) => clip(firstSentence(p.description || p.systemHypothesis || ''), 110);
/** Acento: una línea. */
export const oneLine = (p: Pattern) => clip(firstSentence(p.description || p.systemHypothesis || '').split(/[;:—]/)[0], 64);

export const ruleFor = (p: Pattern, l: Layer) => (l === 1 ? fullRule(p) : l === 2 ? shortRule(p) : oneLine(p));

/** Lo que vive en cada lámina: patrones (y grupos) y fragmentos sueltos, en el orden de la pila. */
export function layerContents(p: Project, l: Layer): { patterns: Pattern[]; fragments: Fragment[] } {
  const live = p.patterns.filter(x => x.status !== 'discarded');
  const liveIds = new Set(live.map(x => x.id));
  const claimed = new Set(live.flatMap(x => x.fragmentIds ?? []));
  return {
    // El peso define el orden: lo del usuario primero.
    patterns: live.filter(x => x.layer === l).sort((a, b) => pieceWeight(b) - pieceWeight(a)),
    fragments: (p.fragments ?? []).filter(f => isLayer(f.layer) && f.layer === l && !claimed.has(f.id) && !(f.groupId && liveIds.has(f.groupId))),
  };
}

/** Patrones de la pila en orden de lámina: núcleo primero, después soporte y acento. */
export const stackOrder = (p: Project) => ([1, 2, 3] as Layer[]).flatMap(l => layerContents(p, l).patterns.map(x => ({ pattern: x, layer: l })));
