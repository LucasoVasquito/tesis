import { Pattern, Project, Reference, VisualSystem } from '../types';

export type PillarImageVia = 'chosen' | 'evidence' | 'match';

export interface PillarImage {
  ref: Reference;
  via: PillarImageVia;
  /** Patrones que sostienen el pilar (solo con evidencia real). */
  patternIds: string[];
  /** En una coincidencia por texto: el patrón con el que coincidió, si fue por patrón. */
  matchedPatternId?: string;
}

const STOP = new Set(
  'de del la las el los y o u en con sin para por a al un una unos unas su sus que como entre sobre lo se es son muy mas más ya tipo estilo'.split(' '),
);

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ');

/** Raíces de las palabras con significado (primeras 5 letras), para comparar "lumínico" con "luminosa". */
export function stems(text: string): Set<string> {
  return new Set(
    normalize(text)
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOP.has(w))
      .map(w => w.slice(0, 5)),
  );
}

const overlap = (a: Set<string>, b: Set<string>) => {
  let n = 0;
  a.forEach(x => b.has(x) && n++);
  return n;
};

const patternText = (p: Pattern) => `${p.name} ${p.description} ${(p.relatedObservations ?? []).join(' ')} ${p.systemHypothesis ?? ''}`;
export const referenceText = (r: Reference) => {
  const b = r.breakdown;
  return [
    r.name,
    r.notes,
    (r.tags ?? []).join(' '),
    b?.observableSummary,
    b?.typography?.familyStyle,
    b?.texture?.type,
    b?.texture?.description,
    b?.photoTreatment,
    (b?.graphicResources ?? []).join(' '),
    (b?.formsAndGeometry ?? []).join(' '),
  ]
    .filter(Boolean)
    .join(' ');
};

/**
 * Imagen de fondo para cada pilar de un sistema, en este orden:
 * 1. la referencia que eligió el diseñador;
 * 2. la evidencia de los patrones que sostienen el pilar (trazabilidad real);
 * 3. una coincidencia por texto con los patrones del sistema y, si no hay, con las referencias.
 * Intenta no repetir la misma imagen en dos pilares.
 */
export function pillarImages(system: VisualSystem, project: Project): (PillarImage | null)[] {
  const pillars = system.aestheticPillars ?? [];
  const refById = new Map(project.references.map(r => [r.id, r]));
  const patById = new Map(project.patterns.map(p => [p.id, p]));
  const sysPatterns = system.patternIds.map(id => patById.get(id)).filter(Boolean) as Pattern[];
  const sysRefIds = new Set(sysPatterns.flatMap(p => p.evidence).filter(id => refById.has(id)));
  const used = new Set<string>();

  const pickRef = (ids: string[]): Reference | undefined => {
    const valid = ids.filter(id => refById.has(id));
    const id = valid.find(x => !used.has(x)) ?? valid[0];
    return id ? refById.get(id) : undefined;
  };

  return pillars.map((pillar, i) => {
    // 1 · Elección del diseñador
    const chosen = system.sources?.pillarRefs?.[i];
    if (chosen && refById.has(chosen)) {
      used.add(chosen);
      const owner = sysPatterns.find(p => p.evidence.includes(chosen));
      return { ref: refById.get(chosen)!, via: 'chosen', patternIds: system.sources?.aestheticPillars?.[i] ?? [], matchedPatternId: owner?.id };
    }

    // 2 · Evidencia de los patrones que sostienen el pilar
    const pids = (system.sources?.aestheticPillars?.[i] ?? []).filter(id => patById.has(id));
    if (pids.length) {
      const ref = pickRef(pids.flatMap(id => patById.get(id)!.evidence));
      if (ref) {
        used.add(ref.id);
        return { ref, via: 'evidence', patternIds: pids };
      }
    }

    // 3 · Coincidencia por texto
    const words = stems(pillar);
    if (!words.size) return null;
    const candidates = (sysPatterns.length ? sysPatterns : project.patterns.filter(p => p.status === 'confirmed'))
      .map(p => ({ p, score: overlap(words, stems(patternText(p))) }))
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score);
    for (const c of candidates) {
      const ref = pickRef(c.p.evidence);
      if (ref) {
        used.add(ref.id);
        return { ref, via: 'match', patternIds: [], matchedPatternId: c.p.id };
      }
    }
    const pool = project.references.filter(r => !sysRefIds.size || sysRefIds.has(r.id));
    const byRef = (pool.length ? pool : project.references)
      .map(r => ({ r, score: overlap(words, stems(referenceText(r))) - (used.has(r.id) ? 0.5 : 0) }))
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score);
    if (byRef[0]) {
      used.add(byRef[0].r.id);
      return { ref: byRef[0].r, via: 'match', patternIds: [] };
    }
    return null;
  });
}

/** Referencias candidatas para elegir a mano: primero la evidencia del sistema, después el resto del corpus. */
export function pillarCandidates(system: VisualSystem, project: Project): Reference[] {
  const ids = new Set(system.patternIds.flatMap(id => project.patterns.find(p => p.id === id)?.evidence ?? []));
  const first = project.references.filter(r => ids.has(r.id));
  const rest = project.references.filter(r => !ids.has(r.id));
  return [...first, ...rest];
}
