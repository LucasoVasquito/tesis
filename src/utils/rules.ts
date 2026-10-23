import { Rule, RuleExample, RuleField, SpecimenStyle, VisualSystem } from '../types';

const STYLES: SpecimenStyle[] = ['stretched', 'hierarchy', 'glitch', 'italic', 'rounded', 'serif', 'wide', 'outline'];

export const RULE_FIELDS: { field: RuleField; prefix: string; label: string; exampleKind: RuleExample['kind'] }[] = [
  { field: 'typographyRules', prefix: 'T', label: 'Tipografía', exampleKind: 'type' },
  { field: 'textureRules', prefix: 'X', label: 'Textura', exampleKind: 'evidence' },
  { field: 'compositionRules', prefix: 'C', label: 'Composición', exampleKind: 'grid' },
];

/** Título corto (≤ 6 palabras) derivado de un texto largo: primera cláusula, sin punto final. */
export function deriveTitle(text: string): string {
  const clause = text.split(/[.;:—–]|,\s(?:y|o|que|para|con)\s/)[0].trim();
  const words = clause.split(/\s+/).filter(Boolean);
  const title = words.slice(0, 6).join(' ');
  return (title.charAt(0).toUpperCase() + title.slice(1)).replace(/[,.]+$/, '') + (words.length > 6 ? '…' : '');
}

const strings = (v: any) => (Array.isArray(v) ? v.map(String).map(s => s.trim()).filter(Boolean) : []);

/**
 * Normaliza reglas de cualquier versión: las de antes eran `string[]`
 * (con la trazabilidad aparte, en `legacySources`); ahora son `Rule[]`.
 */
export function normalizeRules(raw: any, prefix: string, kind: RuleExample['kind'], legacySources?: string[][]): Rule[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r: any, i: number): Rule | null => {
      if (typeof r === 'string') {
        const detail = r.trim();
        if (!detail) return null;
        return { code: `${prefix}${i + 1}`, title: deriveTitle(detail), detail, patternIds: legacySources?.[i] ?? [], refIds: [], example: { kind } };
      }
      if (!r || typeof r !== 'object') return null;
      const detail = String(r.detail ?? r.text ?? '').trim();
      const title = String(r.title ?? '').trim() || deriveTitle(detail);
      if (!title && !detail) return null;
      const ex = r.example && typeof r.example === 'object' ? r.example : {};
      return {
        code: String(r.code || `${prefix}${i + 1}`),
        title,
        detail,
        use: strings(r.use),
        avoid: strings(r.avoid),
        example: {
          kind: ex.kind === 'type' || ex.kind === 'evidence' || ex.kind === 'grid' ? ex.kind : kind,
          text: ex.text ? String(ex.text) : undefined,
          style: STYLES.includes(ex.style) ? ex.style : undefined,
          subtext: ex.subtext ? String(ex.subtext) : undefined,
          refIds: strings(ex.refIds),
          cols: Number(ex.cols) || undefined,
          rows: Number(ex.rows) || undefined,
        },
        patternIds: strings(r.patternIds),
        refIds: strings(r.refIds),
      };
    })
    .filter(Boolean) as Rule[];
}

/** Lleva un sistema guardado al esquema actual de reglas. */
export function normalizeSystemRules<T extends Partial<VisualSystem>>(s: T): T {
  const legacy = (s as any).sources ?? {};
  const out: any = { ...s };
  for (const { field, prefix, exampleKind } of RULE_FIELDS) {
    if ((s as any)[field] !== undefined) out[field] = normalizeRules((s as any)[field], prefix, exampleKind, legacy[field]);
  }
  // La trazabilidad de las reglas ahora vive en cada regla; en `sources` queda solo la de los pilares.
  if (out.sources) out.sources = { aestheticPillars: out.sources.aestheticPillars };
  return out;
}

/** Texto plano de una regla (para prompts y exportaciones). */
export const ruleText = (r: Rule) => (r.detail && r.detail !== r.title ? `${r.title}: ${r.detail}` : r.title);
