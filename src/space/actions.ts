import { CropBox, Fragment, FragmentType, Layer, LogKind, Pattern, PatternCategory, Project } from '../types';
import { isLayer, layerTag, suggestedLayer } from '../utils/layers';

/**
 * Acciones de la pila como funciones puras: reciben el proyecto y devuelven el nuevo,
 * más las entradas de bitácora que corresponden. La IA solo propone: ninguna acción
 * aplica una propuesta sin un gesto del diseñador (↑↓, 1/2/3, ⏎).
 */
export interface LogLine {
  kind: LogKind;
  targetId: string;
  label: string;
  reason?: string;
}
export interface ActionResult {
  project: Project;
  log: LogLine[];
  /** Resumen corto para la franja de avisos. */
  message?: string;
}

const now = () => new Date().toISOString();
const layerName = (l: Layer | null) => (l ? layerTag(l) : 'SIN LÁMINA');

/* ---------- Mover entre láminas ---------- */

/** Paso siguiente hacia el núcleo (dir = 1, ↑) o hacia el corpus (dir = -1, ↓). */
export function stepLayer(l: Layer | null, dir: 1 | -1): Layer | null {
  if (dir === 1) return l === null ? 3 : l === 1 ? 1 : ((l - 1) as Layer);
  return l === null ? null : l === 3 ? null : ((l + 1) as Layer);
}

/** Pone patrones y fragmentos en una lámina. Un fragmento agrupado arrastra a todo su grupo. */
export function setLayer(p: Project, ids: string[], layer: Layer | null): ActionResult {
  const patIds = new Set<string>();
  const fragIds = new Set<string>();
  const live = new Set(p.patterns.filter(x => x.status !== 'discarded').map(x => x.id));
  for (const id of ids) {
    const pat = p.patterns.find(x => x.id === id);
    if (pat) patIds.add(pat.id);
    const f = p.fragments?.find(x => x.id === id);
    if (f) {
      if (f.groupId && live.has(f.groupId)) patIds.add(f.groupId);
      else fragIds.add(f.id);
    }
  }
  // Todo lo de un grupo comparte prioridad: sus fragmentos se mueven con él.
  p.patterns.filter(x => patIds.has(x.id)).forEach(x => (x.fragmentIds ?? []).forEach(fid => fragIds.add(fid)));
  (p.fragments ?? []).filter(f => f.groupId && patIds.has(f.groupId)).forEach(f => fragIds.add(f.id));
  if (!patIds.size && !fragIds.size) return { project: p, log: [] };

  const log: LogLine[] = [];
  const patterns = p.patterns.map(x => {
    if (!patIds.has(x.id) || x.layer === layer) return x;
    log.push({ kind: 'layer', targetId: x.id, label: `${x.name} → ${layerName(layer)}`, reason: x.layer ? `Estaba en ${layerName(x.layer)}` : undefined });
    // Ubicar un patrón es confirmarlo: lo decide el diseñador.
    return { ...x, layer, status: layer && x.status === 'detected' ? ('confirmed' as const) : x.status };
  });
  const fragments = (p.fragments ?? []).map(f => {
    if (!fragIds.has(f.id) || f.layer === layer) return f;
    if (!f.groupId || !patIds.has(f.groupId)) log.push({ kind: 'layer', targetId: f.id, label: `${f.label} → ${layerName(layer)}` });
    return { ...f, layer };
  });
  return { project: { ...p, patterns, fragments }, log, message: log.length === 1 ? log[0].label : `${log.length} elementos → ${layerName(layer)}` };
}

/** Lámina actual de un patrón o fragmento. */
export function layerOf(p: Project, id: string): Layer | null | undefined {
  const pat = p.patterns.find(x => x.id === id);
  if (pat) return isLayer(pat.layer) ? pat.layer : null;
  const f = p.fragments?.find(x => x.id === id);
  if (f) {
    const g = f.groupId ? p.patterns.find(x => x.id === f.groupId && x.status !== 'discarded') : undefined;
    if (g) return isLayer(g.layer) ? g.layer : null;
    return isLayer(f.layer) ? f.layer : null;
  }
  return undefined;
}

/* ---------- Aceptar la propuesta de la IA (⏎) ---------- */

/** Lámina propuesta para un elemento: la de la IA o, en patrones, la de la evidencia. */
export function proposalFor(p: Project, id: string): Layer | null {
  const pat = p.patterns.find(x => x.id === id);
  if (pat) return suggestedLayer(pat, p);
  const f = p.fragments?.find(x => x.id === id);
  return f && isLayer(f.aiSuggestedLayer) ? f.aiSuggestedLayer : null;
}

/** Ubica cada elemento sin lámina en la que propone la IA. Lo que no tiene propuesta queda igual. */
export function acceptProposals(p: Project, ids: string[]): ActionResult {
  let project = p;
  const log: LogLine[] = [];
  for (const id of ids) {
    if (layerOf(project, id) !== null) continue;
    const l = proposalFor(project, id);
    if (!l) continue;
    const r = setLayer(project, [id], l);
    project = r.project;
    log.push(...r.log.map(x => ({ ...x, reason: 'Propuesta de la IA aceptada' })));
  }
  return { project, log, message: log.length ? (log.length === 1 ? `Aceptado · ${log[0].label}` : `${log.length} propuestas aceptadas`) : 'No hay propuestas para aceptar' };
}

/* ---------- Agrupar (G) y patrón (P) ---------- */

const nextPatternId = (p: Project) => {
  const used = p.patterns.map(x => Number(/^pat_u(\d+)$/.exec(x.id)?.[1] ?? 0));
  return `pat_u${String(Math.max(0, ...used) + 1).padStart(2, '0')}`;
};

/** Une fragmentos (y grupos) en un grupo con la misma prioridad. Toma la lámina del primero. */
export function groupFragments(p: Project, ids: string[]): ActionResult & { groupId?: string } {
  const frags = (p.fragments ?? []).filter(f => ids.includes(f.id));
  const groups = p.patterns.filter(x => ids.includes(x.id) && x.isGroup);
  const fromGroups = groups.flatMap(g => (p.fragments ?? []).filter(f => f.groupId === g.id || g.fragmentIds?.includes(f.id)));
  const all = [...new Map([...frags, ...fromGroups].map(f => [f.id, f])).values()];
  if (!all.length) return { project: p, log: [], message: 'Elegí fragmentos para agrupar' };
  const first = ids.map(id => layerOf(p, id)).find(l => l !== undefined) ?? null;
  const id = nextPatternId(p);
  const n = p.patterns.filter(x => x.isGroup).length + 1;
  const group: Pattern = {
    id,
    name: `Grupo ${n}`,
    category: categoryFor(all.map(f => f.type)),
    description: '',
    evidence: [...new Set(all.map(f => f.refId))],
    confidence: 1,
    status: 'confirmed',
    relatedObservations: [],
    origin: 'designer',
    isGroup: true,
    fragmentIds: all.map(f => f.id),
    layer: first,
    aiSuggestedLayer: null,
    audited: true,
    revealed: false,
    evidenceLocked: true,
  };
  const removed = new Set(groups.map(g => g.id));
  const fragIds = new Set(all.map(f => f.id));
  return {
    groupId: id,
    project: {
      ...p,
      patterns: [...p.patterns.filter(x => !removed.has(x.id)), group],
      fragments: (p.fragments ?? []).map(f => (fragIds.has(f.id) ? { ...f, groupId: id, layer: first } : f)),
    },
    log: [{ kind: 'group', targetId: id, label: `Grupo · ${all.map(f => f.label).join(' + ')}`, reason: `En ${layerName(first)}` }],
    message: `Grupo de ${all.length} · P para hacerlo patrón`,
  };
}

/** Convierte un grupo en patrón con nombre. La IA lo va a usar como definición para buscarlo en el corpus. */
export function groupToPattern(p: Project, groupId: string, name: string): ActionResult {
  const g = p.patterns.find(x => x.id === groupId);
  const clean = name.trim();
  if (!g || !clean) return { project: p, log: [] };
  const frags = (p.fragments ?? []).filter(f => f.groupId === g.id || g.fragmentIds?.includes(f.id));
  const description = frags.map(f => f.description || f.label).filter(Boolean).join(' · ');
  return {
    project: { ...p, patterns: p.patterns.map(x => (x.id === groupId ? { ...x, name: clean, isGroup: false, description: x.description || description, trend: 'new' as const } : x)) },
    log: [{ kind: 'pattern_add', targetId: groupId, label: `Patrón · ${clean}`, reason: `${frags.length} fragmentos · ${layerName(isLayer(g.layer) ? g.layer : null)}` }],
    message: `Patrón «${clean}» · la IA lo va a buscar en el corpus al revelar`,
  };
}

/** Deshace un grupo: los fragmentos quedan sueltos en la misma lámina. */
export function ungroup(p: Project, groupId: string): ActionResult {
  const g = p.patterns.find(x => x.id === groupId);
  if (!g) return { project: p, log: [] };
  return {
    project: {
      ...p,
      patterns: p.patterns.filter(x => x.id !== groupId),
      fragments: (p.fragments ?? []).map(f => (f.groupId === groupId ? { ...f, groupId: undefined, layer: isLayer(g.layer) ? g.layer : f.layer } : f)),
    },
    log: [{ kind: 'group', targetId: groupId, label: `Grupo desarmado · ${g.name}` }],
    message: `Grupo desarmado · ${g.name}`,
  };
}

/* ---------- Descartar (X) ---------- */

export function discard(p: Project, id: string): ActionResult {
  const f = p.fragments?.find(x => x.id === id);
  if (f) {
    return {
      project: {
        ...p,
        fragments: (p.fragments ?? []).filter(x => x.id !== id),
        patterns: p.patterns.map(x => (x.fragmentIds?.includes(id) ? { ...x, fragmentIds: x.fragmentIds.filter(y => y !== id) } : x)),
      },
      log: [{ kind: 'discard', targetId: id, label: `Fragmento descartado · ${f.label}` }],
      message: `Fragmento descartado · ${f.label}`,
    };
  }
  const pat = p.patterns.find(x => x.id === id);
  if (!pat) return { project: p, log: [] };
  if (pat.isGroup) return ungroup(p, id);
  return {
    project: {
      ...p,
      patterns: p.patterns.map(x => (x.id === id ? { ...x, status: 'discarded' as const, layer: null } : x)),
      fragments: (p.fragments ?? []).map(x => (x.groupId === id ? { ...x, groupId: undefined } : x)),
    },
    log: [{ kind: 'discard', targetId: id, label: `Descartado · ${pat.name}`, reason: pat.revealed ? 'Revelado por la IA, descartado por el diseñador' : undefined }],
    message: `Descartado · ${pat.name}`,
  };
}

/* ---------- Desglose (D) ---------- */

export interface FragmentProposal {
  key: string;
  box: CropBox;
  type: FragmentType;
  label: string;
  description?: string;
  /** Lámina que propone la IA. */
  aiLayer: Layer | null;
  /** Lámina que eligió el diseñador en el desglose (undefined = no tocó). */
  layer?: Layer | null;
  source: 'ai' | 'manual';
}

/**
 * Suma los fragmentos del desglose. ⏎ es aceptar la propuesta: lo que el diseñador
 * no movió toma la lámina que sugirió la IA (y queda registrado como aceptado).
 */
export function addFragments(p: Project, refId: string, proposals: FragmentProposal[]): ActionResult & { ids: string[] } {
  const used = new Set((p.fragments ?? []).map(f => f.id));
  const ids: string[] = [];
  for (let i = 0; ids.length < proposals.length && i < 26 * 27; i++) {
    const suffix = i < 26 ? String.fromCharCode(97 + i) : String.fromCharCode(96 + Math.floor(i / 26)) + String.fromCharCode(97 + (i % 26));
    const id = `frag_${refId}${suffix}`;
    if (!used.has(id)) ids.push(id);
  }
  const at = now();
  const fragments: Fragment[] = proposals.map((x, i) => ({
    id: ids[i],
    refId,
    crop: x.box,
    type: x.type,
    label: x.label.trim() || 'Fragmento',
    description: x.description,
    layer: x.layer !== undefined ? x.layer : x.aiLayer,
    aiSuggestedLayer: x.aiLayer,
    z: 0,
    origin: x.source === 'manual' || x.layer !== undefined ? 'designer' : 'ai',
    createdAt: at,
  }));
  const accepted = proposals.filter(x => x.layer === undefined && x.aiLayer).length;
  return {
    ids,
    project: { ...p, fragments: [...(p.fragments ?? []), ...fragments] },
    log: [
      {
        kind: 'split',
        targetId: refId,
        label: `${refId} desglosada en ${fragments.length} ${fragments.length === 1 ? 'fragmento' : 'fragmentos'}`,
        reason: fragments.map(f => `${f.label} (${layerName(f.layer)})`).join(' · ') + (accepted ? ` · ${accepted} con la lámina que propuso la IA` : ''),
      },
    ],
    message: `${fragments.length} ${fragments.length === 1 ? 'fragmento' : 'fragmentos'} de ${refId}`,
  };
}

/* ---------- Categoría de un patrón según sus fragmentos ---------- */

const TYPE_CATEGORY: Record<FragmentType, PatternCategory> = {
  texture: 'texture',
  typography: 'typography',
  color: 'color',
  shape: 'geometry',
  logo: 'logo_identity',
  mascot: 'mascot_illustration',
  illustration: 'mascot_illustration',
  photo: 'photography_treatment',
  graphic: 'graphic_elements',
  other: 'composition',
};

export function categoryFor(types: FragmentType[]): PatternCategory {
  const count = new Map<PatternCategory, number>();
  types.forEach(t => count.set(TYPE_CATEGORY[t] ?? 'composition', (count.get(TYPE_CATEGORY[t] ?? 'composition') ?? 0) + 1));
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'composition';
}

/* ---------- Auditoría (A) ---------- */

export function markAudited(p: Project, id: string): ActionResult {
  const pat = p.patterns.find(x => x.id === id);
  if (!pat) return { project: p, log: [] };
  return {
    project: { ...p, patterns: p.patterns.map(x => (x.id === id ? { ...x, audited: true } : x)) },
    log: [{ kind: 'confirm', targetId: id, label: `Auditado · ${pat.name}`, reason: `${pat.evidence.length} referencias revisadas` }],
    message: `Auditado · ${pat.name}`,
  };
}

/** El diseñador saca una referencia de la evidencia: la reinducción ya no la pisa. */
export function removeEvidence(p: Project, id: string, refId: string): ActionResult {
  const pat = p.patterns.find(x => x.id === id);
  if (!pat || !pat.evidence.includes(refId)) return { project: p, log: [] };
  return {
    project: { ...p, patterns: p.patterns.map(x => (x.id === id ? { ...x, evidence: x.evidence.filter(e => e !== refId), evidenceLocked: true } : x)) },
    log: [{ kind: 'pattern_edit', targetId: id, label: `${refId} no es evidencia de ${pat.name}` }],
    message: `${refId} fuera de la evidencia de ${pat.name}`,
  };
}
