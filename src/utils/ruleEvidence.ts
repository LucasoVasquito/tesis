import { PatternCategory, Project, Rule, RuleField, VisualSystem } from '../types';
import { referenceText, stems } from './pillars';

/** Categorías de patrón que corresponden a cada familia de reglas. */
const FIELD_CATEGORIES: Record<RuleField, PatternCategory[]> = {
  typographyRules: ['typography', 'flyer_poster', 'logo_identity'],
  textureRules: ['texture', 'packaging', 'photography_treatment'],
  compositionRules: ['composition', 'geometry', 'graphic_elements', 'flyer_poster'],
};

export interface RuleEvidence {
  ids: string[];
  /** true si no es trazabilidad de la regla sino una coincidencia que buscó la app. */
  approx: boolean;
}

/**
 * Imágenes para la ficha de una regla:
 * 1. la evidencia de los patrones de la regla (trazabilidad real);
 * 2. si no tiene, referencias del sistema cuyo desglose coincide con el texto de la regla;
 * 3. si no hay coincidencia, la evidencia de los patrones del sistema de la misma familia.
 * `index` rota la elección para que fichas vecinas no repitan imagen.
 */
export function ruleEvidence(rule: Rule, field: RuleField, system: VisualSystem, project: Project, index = 0): RuleEvidence {
  const refIds = new Set(project.references.map(r => r.id));
  const own = rule.patternIds.flatMap(pid => project.patterns.find(p => p.id === pid)?.evidence ?? []).filter(id => refIds.has(id));
  if (own.length) return { ids: own, approx: false };

  const sysPatterns = project.patterns.filter(p => system.patternIds.includes(p.id));
  const familyIds = new Set(sysPatterns.filter(p => FIELD_CATEGORIES[field].includes(p.category)).flatMap(p => p.evidence));
  const pool = project.references.filter(r => sysPatterns.some(p => p.evidence.includes(r.id)));
  const candidates = pool.length ? pool : project.references;

  const words = stems(`${rule.title} ${rule.detail}`);
  const scored = candidates
    .map(r => {
      const rs = stems(referenceText(r));
      let n = 0;
      words.forEach(w => rs.has(w) && n++);
      return { id: r.id, score: n + (familyIds.has(r.id) ? 0.5 : 0) };
    })
    .filter(c => c.score >= 1)
    .sort((a, b) => b.score - a.score);
  const rotate = (ids: string[]) => (ids.length > 2 ? [...ids.slice(index % ids.length), ...ids.slice(0, index % ids.length)] : ids);
  if (scored.length) return { ids: rotate(scored.slice(0, 4).map(c => c.id)).slice(0, 2), approx: true };

  const family = [...familyIds].filter(id => refIds.has(id));
  if (family.length) return { ids: rotate(family).slice(0, 2), approx: true };
  return { ids: [], approx: true };
}
