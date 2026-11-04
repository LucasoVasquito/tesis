import { Fragment, Pattern, Project, Reference } from '../types';
import { corpusRefs, isLayer } from '../utils/layers';
import { Stop } from './geometry';

/** Lo que se puede elegir con ← / → dentro de una parada. */
export type SceneItem =
  | { kind: 'pattern'; id: string; pattern: Pattern; fragments: Fragment[] }
  | { kind: 'fragment'; id: string; fragment: Fragment }
  | { kind: 'ref'; id: string; ref: Reference };

const byZ = (a: { z: number }, b: { z: number }) => a.z - b.z;

/** Patrones y grupos vivos (los descartados quedan fuera de la pila). */
const livePatterns = (p: Project) => p.patterns.filter(x => x.status !== 'discarded');

function patternItem(p: Project, pattern: Pattern): SceneItem {
  const ids = new Set(pattern.fragmentIds ?? []);
  return { kind: 'pattern', id: pattern.id, pattern, fragments: (p.fragments ?? []).filter(f => ids.has(f.id) || f.groupId === pattern.id) };
}

/** Fragmentos sueltos: los que no forman parte de un grupo o patrón vivo. */
function looseFragments(p: Project): Fragment[] {
  const live = new Set(livePatterns(p).map(x => x.id));
  const claimed = new Set(livePatterns(p).flatMap(x => x.fragmentIds ?? []));
  return (p.fragments ?? []).filter(f => !claimed.has(f.id) && !(f.groupId && live.has(f.groupId)));
}

/**
 * Contenido de cada parada, en el orden en que lo recorren ← / →.
 * - Láminas: patrones y grupos de esa lámina, después los fragmentos sueltos.
 * - Corpus: lo que todavía no tiene lámina (patrones sin ubicar y fragmentos sueltos), después las referencias.
 *   Los revelados sin ubicar viven aparte (bloque "NO LO MARCASTE").
 */
export function stopItems(p: Project, stop: Stop): SceneItem[] {
  if (isLayer(stop)) {
    const pats = livePatterns(p).filter(x => x.layer === stop).map(x => patternItem(p, x));
    const frags = looseFragments(p)
      .filter(f => f.layer === stop)
      .sort(byZ)
      .map(f => ({ kind: 'fragment' as const, id: f.id, fragment: f }));
    return [...pats, ...frags];
  }
  const unplaced = livePatterns(p)
    .filter(x => !isLayer(x.layer) && !(x.revealed && x.status === 'detected'))
    .map(x => patternItem(p, x));
  const frags = looseFragments(p)
    .filter(f => !isLayer(f.layer))
    .map(f => ({ kind: 'fragment' as const, id: f.id, fragment: f }));
  const refs = corpusRefs(p).map(r => ({ kind: 'ref' as const, id: r.id, ref: r }));
  return [...unplaced, ...frags, ...refs];
}

/** Revelados que esperan lámina: la IA los encontró y el diseñador todavía no decidió. */
export const pendingRevealed = (p: Project) => livePatterns(p).filter(x => x.revealed && x.status === 'detected' && !isLayer(x.layer));

/** En qué parada está un elemento (para seguirlo cuando cambia de lámina). */
export function stopOf(p: Project, id: string): Stop | null {
  const pat = p.patterns.find(x => x.id === id);
  if (pat) return isLayer(pat.layer) ? pat.layer : 'corpus';
  const frag = p.fragments?.find(f => f.id === id);
  if (frag) return isLayer(frag.layer) ? frag.layer : 'corpus';
  if (p.references.some(r => r.id === id)) return 'corpus';
  return null;
}

/** Imagen representativa de un patrón: su primer fragmento o su primera evidencia. */
export function patternCover(p: Project, item: Extract<SceneItem, { kind: 'pattern' }>): { image: string; crop?: Fragment['crop']; ratio?: number; alt: string } | null {
  const f = item.fragments[0];
  if (f) {
    const ref = p.references.find(r => r.id === f.refId);
    if (ref) return { image: ref.image, crop: f.crop, ratio: ref.aspectRatio, alt: f.label };
  }
  const refId = item.pattern.evidence.find(id => p.references.some(r => r.id === id));
  const ref = refId ? p.references.find(r => r.id === refId) : undefined;
  // Las partes viejas ya guardan su imagen recortada: se usan enteras.
  return ref ? { image: ref.image, ratio: ref.aspectRatio, alt: ref.name } : null;
}
