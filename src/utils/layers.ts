import { Fragment, FragmentType, Layer, PartKind, Pattern, Project } from '../types';

export interface LayerInfo {
  id: Layer;
  num: '01' | '02' | '03';
  name: string;
  /** Qué hace la lámina en el sistema. */
  role: string;
  /** Clase CSS que define --layer-color / --layer-ink. */
  className: 'layer-1' | 'layer-2' | 'layer-3';
}

export const LAYERS: LayerInfo[] = [
  { id: 1, num: '01', name: 'Núcleo', role: 'Define el sistema', className: 'layer-1' },
  { id: 2, num: '02', name: 'Soporte', role: 'Lo acompaña', className: 'layer-2' },
  { id: 3, num: '03', name: 'Acento', role: 'Aparece poco y da carácter', className: 'layer-3' },
];

export const layerInfo = (l: Layer) => LAYERS[l - 1];
/** "01 NÚCLEO" */
export const layerTag = (l: Layer) => `${layerInfo(l).num} ${layerInfo(l).name.toUpperCase()}`;
export const isLayer = (v: unknown): v is Layer => v === 1 || v === 2 || v === 3;

/** Referencias que forman el corpus (sin las partes recortadas de versiones anteriores). */
export const corpusRefs = (p: Project) => p.references.filter(r => !r.parentId);

/**
 * Lámina que sostiene la evidencia: en cuántas referencias del corpus aparece.
 * Es el criterio del espejo cuando la IA no propuso una lámina.
 * Umbrales: en 1 de cada 4 referencias o más → núcleo; en 1 de cada 10 o más → soporte; si no, acento.
 */
export const EVIDENCE_CORE = 0.25;
export const EVIDENCE_SUPPORT = 0.1;

export function evidenceLayer(count: number, total: number): Layer | null {
  if (!total || !count) return null;
  const share = count / total;
  if (share >= EVIDENCE_CORE) return 1;
  if (share >= EVIDENCE_SUPPORT) return 2;
  return 3;
}

/** Evidencia de un patrón contada solo sobre el corpus (las partes viejas cuentan como su imagen de origen). */
export function evidenceCount(pattern: Pattern, p: Project): number {
  const byId = new Map(p.references.map(r => [r.id, r]));
  const ids = new Set(pattern.evidence.map(id => byId.get(id)?.parentId ?? id).filter(id => byId.has(id)));
  return ids.size;
}

/** "14/24 refs" */
export const evidenceLabel = (pattern: Pattern, p: Project) => `${evidenceCount(pattern, p)}/${corpusRefs(p).length} refs`;

/** Lámina sugerida: la que propuso la IA o, si no hay, la que marca la evidencia. */
export const suggestedLayer = (pattern: Pattern, p: Project): Layer | null =>
  pattern.aiSuggestedLayer ?? evidenceLayer(evidenceCount(pattern, p), corpusRefs(p).length);

/** Patrones que viven en la pila (los descartados quedan afuera). */
export const stackPatterns = (p: Project) => p.patterns.filter(x => x.status !== 'discarded');

/** Contradicción entre la lámina del diseñador y la evidencia (para el espejo). */
export function mirrorConflict(pattern: Pattern, p: Project): { chosen: Layer; evidence: Layer; count: number; total: number } | null {
  if (!isLayer(pattern.layer)) return null;
  const evidence = suggestedLayer(pattern, p);
  if (!evidence || evidence === pattern.layer) return null;
  return { chosen: pattern.layer, evidence, count: evidenceCount(pattern, p), total: corpusRefs(p).length };
}

/* ---------- Fragmentos ---------- */

export const FRAGMENT_TYPES: { type: FragmentType; label: string }[] = [
  { type: 'texture', label: 'Textura' },
  { type: 'typography', label: 'Tipografía' },
  { type: 'color', label: 'Color' },
  { type: 'shape', label: 'Forma' },
  { type: 'logo', label: 'Sello o logo' },
  { type: 'mascot', label: 'Mascota' },
  { type: 'illustration', label: 'Ilustración' },
  { type: 'photo', label: 'Foto' },
  { type: 'graphic', label: 'Recurso gráfico' },
  { type: 'other', label: 'Otro' },
];

export const fragmentTypeLabel = (t: FragmentType) => FRAGMENT_TYPES.find(x => x.type === t)?.label ?? 'Otro';

const PART_TO_FRAGMENT: Record<PartKind, FragmentType> = {
  typography: 'typography',
  logo: 'logo',
  mascot: 'mascot',
  illustration: 'illustration',
  photo: 'photo',
  texture: 'texture',
  graphic: 'graphic',
  other: 'other',
};
export const fragmentTypeFromPart = (k?: PartKind): FragmentType => (k ? PART_TO_FRAGMENT[k] ?? 'other' : 'other');

export const fragmentsOf = (p: Project, refId: string): Fragment[] => (p.fragments ?? []).filter(f => f.refId === refId);
