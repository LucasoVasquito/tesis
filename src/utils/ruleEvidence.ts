import { PartKind, PatternCategory, Project, Reference, Rule, RuleField, VisualSystem } from '../types';
import { referenceText, stems } from './pillars';
import { RULE_FIELDS } from './rules';

/** Categorías de patrón que corresponden a cada familia de reglas. */
const FIELD_CATEGORIES: Record<RuleField, PatternCategory[]> = {
  typographyRules: ['typography', 'flyer_poster', 'logo_identity'],
  textureRules: ['texture', 'packaging', 'photography_treatment'],
  compositionRules: ['composition', 'geometry', 'graphic_elements', 'flyer_poster'],
};

/** Partes del corpus (recortes) que sirven como ejemplo de cada familia. */
const FIELD_PARTS: Record<RuleField, PartKind[]> = {
  typographyRules: ['typography', 'logo'],
  textureRules: ['texture', 'graphic', 'illustration'],
  compositionRules: [],
};

export interface RuleEvidence {
  ids: string[];
  /** true si no es trazabilidad de la regla sino una elección de la app. */
  approx: boolean;
}

const overlap = (a: Set<string>, b: Set<string>) => {
  let n = 0;
  a.forEach(x => b.has(x) && n++);
  return n;
};

/**
 * Una imagen por ficha de regla, repartida en todo el sistema para no repetir:
 * 1. la evidencia de los patrones de la regla (trazabilidad real);
 * 2. partes recortadas del corpus que coinciden con la familia y el texto de la regla;
 * 3. referencias cuyo desglose coincide con el texto de la regla;
 * 4. la evidencia de los patrones del sistema de la misma familia.
 * Cada imagen se usa una sola vez mientras haya otras disponibles.
 */
export function allocateRuleEvidence(system: VisualSystem, project: Project): Record<string, RuleEvidence> {
  const refs = new Map(project.references.map(r => [r.id, r]));
  const sysPatterns = project.patterns.filter(p => system.patternIds.includes(p.id));
  const sysRefIds = new Set(sysPatterns.flatMap(p => p.evidence).filter(id => refs.has(id)));
  // Partes de las referencias del sistema (o de todo el corpus si el sistema no tiene evidencia).
  const parts = project.references.filter(r => r.parentId && (!sysRefIds.size || sysRefIds.has(r.parentId) || sysRefIds.has(r.id)));
  const pool = project.references.filter(r => !r.parentId && (!sysRefIds.size || sysRefIds.has(r.id)));

  const used = new Map<string, number>();
  // Las imágenes propias de una regla ya están "usadas".
  for (const { field } of RULE_FIELDS) for (const r of system[field] ?? []) for (const id of r.example?.refIds?.length ? r.example.refIds : r.refIds) used.set(id, (used.get(id) ?? 0) + 1);

  /** Primera imagen sin usar de la lista; con `reuse`, la menos usada si ya están todas. */
  const take = (ids: string[], reuse = false): string | null => {
    const valid = ids.filter(id => refs.has(id));
    if (!valid.length) return null;
    const id = valid.find(x => !used.has(x)) ?? (reuse ? [...valid].sort((a, b) => (used.get(a) ?? 0) - (used.get(b) ?? 0))[0] : null);
    if (id) used.set(id, (used.get(id) ?? 0) + 1);
    return id;
  };
  const byText = (list: Reference[], words: Set<string>) =>
    list
      .map(r => ({ id: r.id, score: overlap(words, stems(referenceText(r))) }))
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(c => c.id);

  const out: Record<string, RuleEvidence> = {};
  for (const { field } of RULE_FIELDS) {
    const familyIds = sysPatterns.filter(p => FIELD_CATEGORIES[field].includes(p.category)).flatMap(p => p.evidence);
    for (const rule of system[field] ?? []) {
      if ((rule.example?.refIds?.length ?? 0) || rule.refIds.length) continue;
      const words = stems(`${rule.title} ${rule.detail}`);
      const own = rule.patternIds.flatMap(pid => project.patterns.find(p => p.id === pid)?.evidence ?? []);
      const familyParts = parts.filter(r => r.partKind && FIELD_PARTS[field].includes(r.partKind));
      const ownId = own.length ? take(own) ?? take(own, true) : null;
      if (ownId) {
        out[rule.code] = { ids: [ownId], approx: false };
        continue;
      }
      const id =
        take(byText(familyParts, words)) ??
        take(familyParts.map(r => r.id)) ??
        take(byText(pool, words)) ??
        take(familyIds) ??
        take(pool.map(r => r.id)) ??
        take([...familyParts.map(r => r.id), ...familyIds, ...pool.map(r => r.id)], true);
      out[rule.code] = { ids: id ? [id] : [], approx: true };
    }
  }
  return out;
}

const EMPTY: RuleEvidence = { ids: [], approx: true };
export const evidenceFor = (map: Record<string, RuleEvidence>, rule: Rule) => map[rule.code] ?? EMPTY;
