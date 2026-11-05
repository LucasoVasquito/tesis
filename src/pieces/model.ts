import { CropBox, Layer, LayerPosition, LogKind, Pattern, PatternGroup, Project, Reference } from '../types';
import { corpusRefs, evidenceCount, isLayer, layerInfo } from '../utils/layers';

/**
 * Piezas: cualquier elemento del sistema (tipografía, textura, color, personaje, composición).
 * Internamente son `Pattern`. Una pieza en una hoja sin confirmar es una SUGERENCIA (borde punteado).
 * Fuera del sistema = status 'discarded', y se puede recuperar.
 *
 * La IA propone primero y el diseñador corrige: ninguna sugerencia se confirma sola.
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
  /** Aviso breve para la franja de abajo. */
  message?: string;
}

/** Mínimo de referencias para analizar. */
export const MIN_REFS = 6;

export const SHEET_NAME: Record<Layer, string> = { 1: 'Núcleo', 2: 'Soporte', 3: 'Acento' };
export const sheetLabel = (l: Layer) => `CAPA ${l} · ${SHEET_NAME[l].toUpperCase()}`;

/* ---------- Lectura ---------- */

/** Piezas del sistema (dentro de una hoja o esperando una). */
export const livePieces = (p: Project) => p.patterns.filter(x => x.status !== 'discarded' && !x.isGroup);
/** Fuera del sistema: recuperables. */
export const outPieces = (p: Project) => p.patterns.filter(x => x.status === 'discarded' && !x.isGroup);
/** Sugerencia: la ubicó el agente y el usuario todavía no la confirmó. Lo del usuario nunca es sugerencia. */
export const isSuggestion = (x: { layer?: Layer | null; origin?: 'agent' | 'user'; confirmed?: boolean }) => isLayer(x.layer) && x.origin !== 'user' && !x.confirmed;
export const unplacedPieces = (p: Project) => livePieces(p).filter(x => !isLayer(x.layer));

/* ---------- Peso: el usuario sobre el agente ---------- */

/** Peso de la capa: Núcleo 3, Soporte 2, Acento 1. */
export const LAYER_WEIGHT: Record<Layer, number> = { 1: 3, 2: 2, 3: 1 };

/** Peso del origen: USUARIO 2 · AGENTE confirmado 1.5 · AGENTE sin confirmar (sugerencia) 1. */
export function originWeight(x: { origin?: 'agent' | 'user'; confirmed?: boolean }): number {
  if (x.origin === 'user') return 2;
  return x.confirmed ? 1.5 : 1;
}

/** peso = pesoCapa × pesoOrigen. Sin capa no pesa. */
export function pieceWeight(x: { layer?: Layer | null; origin?: 'agent' | 'user'; confirmed?: boolean }): number {
  return isLayer(x.layer) ? LAYER_WEIGHT[x.layer] * originWeight(x) : 0;
}

/** Por peso (lo del usuario primero) y, a igual peso, por evidencia. Si el usuario ordenó a mano (rank), manda ese orden. */
export const byWeight = (p: Project) => (a: Pattern, b: Pattern) =>
  (a.rank !== undefined && b.rank !== undefined ? a.rank - b.rank : 0) || pieceWeight(b) - pieceWeight(a) || evidenceCount(b, p) - evidenceCount(a, p);

/** Piezas de una capa, ordenadas por peso: lo del usuario primero. */
export function piecesIn(p: Project, l: Layer): Pattern[] {
  return livePieces(p)
    .filter(x => x.layer === l)
    .sort(byWeight(p));
}

/** "14 de 39 referencias" */
export const evidenceText = (x: Pattern, p: Project) => {
  const n = evidenceCount(x, p);
  return `${n} de ${corpusRefs(p).length} ${n === 1 ? 'referencia' : 'referencias'}`;
};

/**
 * Hoja que sugiere la evidencia, por ranking: el 20 % con más evidencia va al Núcleo (al menos una pieza),
 * el 45 % siguiente al Soporte y el resto al Acento. Se usa cuando la IA no dijo nada.
 */
export function rankLayers(p: Project): Map<string, Layer> {
  const ranked = livePieces(p)
    .map(x => ({ id: x.id, n: evidenceCount(x, p) }))
    .sort((a, b) => b.n - a.n);
  const core = Math.max(1, Math.round(ranked.length * 0.2));
  const support = Math.round(ranked.length * 0.45);
  return new Map(ranked.map((x, i) => [x.id, (i < core ? 1 : i < core + support ? 2 : 3) as Layer]));
}

/** Hoja que propone la IA (o, si no propuso, la evidencia). */
export const proposedLayer = (x: Pattern, p: Project, ranks = rankLayers(p)): Layer => (isLayer(x.agentSuggestedLayer) ? x.agentSuggestedLayer : ranks.get(x.id) ?? 3);

/* ---------- Acciones ---------- */

const touch = (p: Project, id: string, fn: (x: Pattern) => Pattern): Project => ({ ...p, patterns: p.patterns.map(x => (x.id === id ? fn(x) : x)) });
const find = (p: Project, id: string) => p.patterns.find(x => x.id === id);

/** ⏎ · Confirmar: la sugerencia queda fija (borde lleno). */
export function confirm(p: Project, ids: string[]): ActionResult {
  let project = p;
  const log: LogLine[] = [];
  for (const id of ids) {
    const x = find(project, id);
    if (!x || !isLayer(x.layer) || x.confirmed) continue;
    project = touch(project, id, y => ({ ...y, confirmed: true, status: 'confirmed' }));
    log.push({ kind: 'confirm', targetId: id, label: `${x.name} confirmada en ${SHEET_NAME[x.layer]}` });
  }
  return { project, log, message: log.length === 1 ? log[0].label : log.length ? `${log.length} piezas confirmadas` : undefined };
}

/** Confirmar todas las sugerencias de una hoja. */
export const confirmSheet = (p: Project, l: Layer) => confirm(p, piecesIn(p, l).filter(isSuggestion).map(x => x.id));

/** Ubica una pieza en una hoja. Es una decisión del diseñador: queda confirmada. */
export function place(p: Project, id: string, l: Layer): ActionResult {
  const x = find(p, id);
  if (!x) return { project: p, log: [] };
  const from = isLayer(x.layer) ? SHEET_NAME[x.layer] : 'sin capa';
  return {
    project: touch(p, id, y => ({ ...y, layer: l, origin: 'user', confirmed: true, status: 'confirmed' })),
    log: [{ kind: 'layer', targetId: id, label: `${x.name} → ${SHEET_NAME[l]}`, reason: x.layer === l ? undefined : `Estaba en ${from}` }],
    message: `${x.name} → ${SHEET_NAME[l]}`,
  };
}

/** ↑ / ↓ · Subir o bajar de hoja (↑ hacia el Núcleo). */
export function move(p: Project, id: string, dir: 1 | -1): ActionResult & { to?: Layer } {
  const x = find(p, id);
  if (!x) return { project: p, log: [] };
  const from = isLayer(x.layer) ? x.layer : 3;
  const to = Math.min(3, Math.max(1, from - dir)) as Layer;
  if (isLayer(x.layer) && to === x.layer) return { project: p, log: [], message: dir === 1 ? 'Ya está en el Núcleo' : 'Ya está en el Acento: para sacarla, X' };
  return { ...place(p, id, to), to };
}

/** X · Sacar del sistema. Va a "Fuera del sistema" y se puede recuperar. */
export function takeOut(p: Project, id: string): ActionResult {
  const x = find(p, id);
  if (!x) return { project: p, log: [] };
  return {
    project: touch(p, id, y => ({ ...y, status: 'discarded' })),
    log: [{ kind: 'discard', targetId: id, label: `${x.name} fuera del sistema` }],
    message: `${x.name} fuera del sistema · se puede recuperar`,
  };
}

/** Recuperar una pieza de "Fuera del sistema": vuelve a su hoja como sugerencia. */
export function restore(p: Project, id: string): ActionResult {
  const x = find(p, id);
  if (!x) return { project: p, log: [] };
  const l = isLayer(x.layer) ? x.layer : proposedLayer(x, p);
  return {
    project: touch(p, id, y => ({ ...y, status: 'detected', layer: l, confirmed: false })),
    log: [{ kind: 'restore', targetId: id, label: `${x.name} vuelve al sistema` }],
    message: `${x.name} vuelve a ${SHEET_NAME[l]} como sugerencia`,
  };
}

/** Unir: las piezas se juntan en la primera (evidencia sumada). */
export function merge(p: Project, ids: string[]): ActionResult {
  const [keepId, ...rest] = ids;
  const keep = find(p, keepId);
  const others = rest.map(id => find(p, id)).filter((x): x is Pattern => !!x);
  if (!keep || !others.length) return { project: p, log: [] };
  const evidence = [...new Set([keep.evidence, ...others.map(o => o.evidence)].flat())];
  const gone = new Set(others.map(o => o.id));
  return {
    project: { ...p, patterns: p.patterns.filter(x => !gone.has(x.id)).map(x => (x.id === keepId ? { ...x, evidence, evidenceLocked: true } : x)) },
    log: [{ kind: 'pattern_edit', targetId: keepId, label: `Unidas · ${[keep, ...others].map(x => x.name).join(' + ')}`, reason: `${evidence.length} referencias` }],
    message: `Unidas en «${keep.name}»`,
  };
}

export function rename(p: Project, id: string, name: string): ActionResult {
  const x = find(p, id);
  const clean = name.trim();
  if (!x || !clean || clean === x.name) return { project: p, log: [] };
  return { project: touch(p, id, y => ({ ...y, name: clean })), log: [{ kind: 'pattern_edit', targetId: id, label: `«${x.name}» → «${clean}»` }], message: `Renombrada · ${clean}` };
}

/** Recortar de nuevo: nueva imagen de la pieza. */
export function setCover(p: Project, id: string, refId: string, crop?: CropBox): ActionResult {
  const x = find(p, id);
  if (!x) return { project: p, log: [] };
  return {
    project: touch(p, id, y => ({ ...y, cover: { refId, crop }, evidence: y.evidence.includes(refId) ? y.evidence : [...y.evidence, refId] })),
    log: [{ kind: 'pattern_edit', targetId: id, label: `Nuevo recorte · ${x.name}`, reason: `de ${refId}` }],
    message: `Recorte actualizado · ${x.name}`,
  };
}

export interface SplitPart {
  name: string;
  description?: string;
  evidence: string[];
  cover?: { refId: string; crop?: CropBox };
}

/** Separar: la pieza se reemplaza por las partes que propuso la IA (en la misma capa, como sugerencias). */
export function applySplit(p: Project, id: string, parts: SplitPart[]): ActionResult {
  const x = find(p, id);
  if (!x || parts.length < 2) return { project: p, log: [] };
  const used = new Set(p.patterns.map(y => y.id));
  const ids = parts.map((_, i) => {
    let k = 1;
    let candidate = `${id}_${String.fromCharCode(97 + i)}`;
    while (used.has(candidate)) candidate = `${id}_${String.fromCharCode(97 + i)}${k++}`;
    used.add(candidate);
    return candidate;
  });
  const fresh: Pattern[] = parts.map((part, i) => ({
    ...x,
    id: ids[i],
    name: part.name,
    description: part.description ?? x.description,
    evidence: part.evidence,
    cover: part.cover,
    confirmed: false,
    status: 'detected',
    evidenceLocked: false,
  }));
  return {
    project: { ...p, patterns: p.patterns.flatMap(y => (y.id === id ? fresh : [y])) },
    log: [{ kind: 'pattern_edit', targetId: id, label: `Separada · ${x.name}`, reason: parts.map(q => q.name).join(' · ') }],
    message: `«${x.name}» separada en ${parts.length}`,
  };
}

/* ---------- Análisis ---------- */

const toCrop = (b: any): CropBox | undefined => {
  if (!Array.isArray(b) || b.length !== 4) return undefined;
  const [y0, x0, y1, x1] = b.map((n: any) => Math.min(1000, Math.max(0, Number(n))) / 1000);
  if ([y0, x0, y1, x1].some(n => !Number.isFinite(n))) return undefined;
  const c = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
  return c.w >= 0.05 && c.h >= 0.05 ? c : undefined;
};

/** Portada que devuelve la IA ({ refId, box_2d }) validada contra las referencias. */
export function coverFrom(d: any, known: Set<string>): Pattern['cover'] {
  const refId = String(d?.cover?.refId || '');
  if (!known.has(refId)) return undefined;
  return { refId, crop: toCrop(d?.cover?.box_2d) };
}

/**
 * Fusiona el análisis con el proyecto. Las piezas nuevas llegan ya ubicadas como sugerencias.
 * Lo confirmado por el diseñador conserva su hoja; lo que sacó del sistema sigue afuera.
 */
export function mergeAnalysis(p: Project, detected: any[]): { project: Project; added: number; updated: number } {
  const known = new Set(p.references.map(r => r.id));
  const clean = (ids: any): string[] => (Array.isArray(ids) ? [...new Set(ids.map(String).filter((id: string) => known.has(id)))] : []);
  const byId = new Map(p.patterns.map(x => [x.id, x]));
  const byName = new Map(p.patterns.map(x => [x.name.toLowerCase(), x]));
  const updates = new Map<string, Pattern>();
  const fresh: Pattern[] = [];
  const used = new Set(p.patterns.map(x => x.id));
  let added = 0;

  for (const d of detected) {
    const evidence = clean(d?.evidence);
    const aiLayer = isLayer(Number(d?.suggestedLayer)) ? (Number(d.suggestedLayer) as Layer) : null;
    const cover = coverFrom(d, known);
    const prev = byId.get(String(d?.id)) ?? byName.get(String(d?.name || '').toLowerCase());
    if (prev && !updates.has(prev.id)) {
      const ev = prev.evidenceLocked ? prev.evidence : prev.origin === 'user' ? [...new Set([...prev.evidence, ...evidence])] : evidence.length ? evidence : prev.evidence;
      updates.set(prev.id, {
        ...prev,
        description: prev.origin === 'user' ? prev.description : d?.description || prev.description,
        evidence: ev,
        agentSuggestedLayer: aiLayer ?? prev.agentSuggestedLayer ?? null,
        cover: prev.cover ?? cover,
        // Una sugerencia sin confirmar sigue a la IA; lo confirmado no se toca.
        layer: prev.confirmed || prev.origin === 'user' ? prev.layer : aiLayer ?? prev.layer ?? null,
        systemHypothesis: prev.systemHypothesis || d?.systemHypothesis,
      });
      continue;
    }
    if (!evidence.length) continue;
    let id = String(d?.id || 'pat');
    for (let i = 1; used.has(id); i++) id = `pat_a${String(i).padStart(2, '0')}`;
    used.add(id);
    added++;
    fresh.push({
      id,
      name: String(d?.name || 'Pieza'),
      category: d?.category || 'composition',
      description: String(d?.description || ''),
      evidence,
      confidence: typeof d?.confidence === 'number' ? d.confidence : 0.5,
      status: 'detected',
      relatedObservations: Array.isArray(d?.relatedObservations) ? d.relatedObservations : [],
      systemHypothesis: d?.systemHypothesis,
      trend: 'new',
      origin: 'agent',
      layer: aiLayer,
      agentSuggestedLayer: aiLayer,
      confirmed: false,
      audited: false,
      revealed: true,
      cover,
    });
  }

  let project: Project = {
    ...p,
    status: 'analyzed',
    lastAnalyzedAt: new Date().toISOString(),
    patterns: [...p.patterns.map(x => updates.get(x.id) ?? x), ...fresh],
    references: p.references.map(r => (r.isNew ? { ...r, isNew: false } : r)),
  };
  // Lo que la IA no ubicó se ubica por evidencia, siempre como sugerencia.
  const ranks = rankLayers(project);
  project = { ...project, patterns: project.patterns.map(x => (x.status !== 'discarded' && !x.isGroup && !isLayer(x.layer) ? { ...x, layer: ranks.get(x.id) ?? 3, confirmed: false } : x)) };
  project = assignAgentRefs(project);
  return { project, added, updated: updates.size };
}

/* ---------- El agente notó ---------- */

export interface Notice {
  key: string;
  pieceId: string;
  text: string;
  /** Acción opcional: ubicar la pieza en la hoja que sugiere la evidencia. */
  action?: { label: string; layer: Layer };
}

/**
 * Avisos de la IA (de a uno). Nunca bloquean: son información.
 * - Una pieza que el diseñador ubicó en contra de la evidencia.
 * - Una pieza repetida que quedó sin capa.
 */
export function notices(p: Project, selectedId: string | null): Notice[] {
  const ranks = rankLayers(p);
  const total = corpusRefs(p).length;
  const out: Notice[] = [];
  const live = livePieces(p);
  const contradiction = (x: Pattern): Notice | null => {
    if (!isLayer(x.layer) || !(x.confirmed || x.origin === 'user')) return null;
    const ev = proposedLayer(x, p, ranks);
    if (ev === x.layer) return null;
    return {
      key: `c:${x.id}:${x.layer}`,
      pieceId: x.id,
      text: `ubicaste «${x.name}» en ${SHEET_NAME[x.layer]}, pero aparece en ${evidenceCount(x, p)} de ${total} referencias.`,
      action: { label: `MOVER A ${SHEET_NAME[ev].toUpperCase()}`, layer: ev },
    };
  };
  const sel = selectedId ? live.find(x => x.id === selectedId) : undefined;
  if (sel) {
    const c = contradiction(sel);
    if (c) out.push(c);
  }
  for (const x of unplacedPieces(p).sort((a, b) => evidenceCount(b, p) - evidenceCount(a, p))) {
    const n = evidenceCount(x, p);
    if (n < 2) continue;
    out.push({ key: `u:${x.id}`, pieceId: x.id, text: `«${x.name}» se repite en ${n} referencias y no tiene capa.`, action: { label: 'UBICAR', layer: proposedLayer(x, p, ranks) } });
  }
  for (const x of live) {
    if (x.id === sel?.id) continue;
    const c = contradiction(x);
    if (c) out.push(c);
  }
  return out;
}

/* ---------- Referencias en capas ---------- */

/** Referencias ubicadas en una capa. */
export const refsIn = (p: Project, l: Layer): Reference[] => corpusRefs(p).filter(r => r.layer === l);
/** Referencias que todavía no están en ninguna capa (panel de la derecha). */
export const panelRefs = (p: Project): Reference[] => corpusRefs(p).filter(r => !isLayer(r.layer));

const touchRef = (p: Project, id: string, fn: (r: Reference) => Reference): Project => ({ ...p, references: p.references.map(r => (r.id === id ? fn(r) : r)) });
const findRef = (p: Project, id: string) => p.references.find(r => r.id === id);

/** Lugar libre para una referencia nueva: en cascada, para que no se tapen entre sí. */
function cascade(p: Project, l: Layer): LayerPosition {
  const n = refsIn(p, l).filter(r => r.origin === 'user').length;
  return { x: 0.04 + (n % 7) * 0.05, y: 0.12 + (n % 5) * 0.06, w: 0.16, h: 0.24 };
}

/** El usuario ubica una referencia en una capa (arrastre o 1/2/3). Lleva borde lleno y la etiqueta USUARIO. */
export function placeRef(p: Project, id: string, l: Layer, position?: LayerPosition): ActionResult {
  const r = findRef(p, id);
  if (!r) return { project: p, log: [] };
  const from = isLayer(r.layer) ? SHEET_NAME[r.layer] : 'el panel';
  return {
    project: touchRef(p, id, x => ({ ...x, layer: l, origin: 'user', confirmed: true, position: position ?? (x.layer === l && x.position ? x.position : cascade(p, l)) })),
    log: [{ kind: 'layer', targetId: id, label: `${r.name} → ${SHEET_NAME[l]}`, reason: r.layer === l ? undefined : `Estaba en ${from}` }],
    message: `${r.name} → ${SHEET_NAME[l]}`,
  };
}

/** Devolver una referencia al panel. */
export function returnRef(p: Project, id: string): ActionResult {
  const r = findRef(p, id);
  if (!r || !isLayer(r.layer)) return { project: p, log: [] };
  return {
    project: touchRef(p, id, x => ({ ...x, layer: null, origin: undefined, confirmed: undefined, position: undefined })),
    log: [{ kind: 'layer', targetId: id, label: `${r.name} vuelve al panel` }],
    message: `${r.name} vuelve al panel`,
  };
}

/** ↑ / ↓ de una referencia ya ubicada (↑ hacia el Núcleo). */
export function moveRefLayer(p: Project, id: string, dir: 1 | -1): ActionResult & { to?: Layer } {
  const r = findRef(p, id);
  if (!r || !isLayer(r.layer)) return { project: p, log: [] };
  const to = Math.min(3, Math.max(1, r.layer - dir)) as Layer;
  if (to === r.layer) return { project: p, log: [], message: dir === 1 ? 'Ya está en el Núcleo' : 'Ya está en el Acento: para sacarla, X' };
  return { ...placeRef(p, id, to), to };
}

/** Mover o redimensionar dentro de la capa. No deja registro: es un gesto continuo. */
export function setRefPosition(p: Project, id: string, position: LayerPosition): ActionResult {
  return { project: touchRef(p, id, x => ({ ...x, position })), log: [] };
}

/** Confirmar la ubicación que propuso el agente para una referencia. */
export function confirmRef(p: Project, id: string): ActionResult {
  const r = findRef(p, id);
  if (!r || !isSuggestion(r)) return { project: p, log: [] };
  return { project: touchRef(p, id, x => ({ ...x, confirmed: true })), log: [{ kind: 'confirm', targetId: id, label: `${r.name} confirmada en ${SHEET_NAME[r.layer as Layer]}` }], message: `${r.name} confirmada` };
}

/**
 * El agente ubica las referencias que quedaron en el panel: cada una va a la capa de la pieza más pesada que la cita
 * (si ninguna, al Acento). Nunca toca lo que ubicó el usuario. Son sugerencias hasta que el usuario las confirma.
 */
export function assignAgentRefs(p: Project): Project {
  const pieces = livePieces(p).filter(x => isLayer(x.layer));
  const best = new Map<string, Layer>();
  const weight = new Map<string, number>();
  for (const x of pieces) {
    const w = pieceWeight(x);
    for (const id of x.evidence) {
      if (w > (weight.get(id) ?? 0)) {
        weight.set(id, w);
        best.set(id, x.layer as Layer);
      }
    }
  }
  return {
    ...p,
    references: p.references.map(r => {
      if (r.parentId || isLayer(r.layer)) return r;
      const l = best.get(r.id) ?? 3;
      return { ...r, layer: l, origin: 'agent', confirmed: false, agentSuggestedLayer: l, position: undefined };
    }),
  };
}

/* ---------- Patrones (grupos con nombre dentro de una capa) ---------- */

export const groupsIn = (p: Project, l: Layer): PatternGroup[] => (p.patternGroups ?? []).filter(g => g.layer === l && g.memberIds.length);

/** Referencias que sostienen un conjunto de piezas y referencias. */
function evidenceOf(p: Project, ids: string[]): string[] {
  const out = new Set<string>();
  for (const id of ids) {
    const piece = find(p, id);
    if (piece) piece.evidence.forEach(e => out.add(e));
    else if (findRef(p, id)) out.add(id);
  }
  return [...out];
}

/** G · Crear patrón con la selección. Lo crea el usuario: lleva USUARIO y su propio peso. */
export function createGroup(p: Project, memberIds: string[], layer: Layer, name?: string): ActionResult & { groupId?: string } {
  const ids = [...new Set(memberIds)].filter(id => find(p, id) || findRef(p, id));
  if (ids.length < 2) return { project: p, log: [], message: 'Elegí al menos dos elementos de la capa (⇧ + clic)' };
  const used = new Set((p.patternGroups ?? []).map(g => g.id));
  let n = (p.patternGroups ?? []).length + 1;
  while (used.has(`grp_${n}`)) n++;
  const id = `grp_${n}`;
  const group: PatternGroup = { id, name: name?.trim() || `Patrón ${n}`, memberIds: ids, layer, origin: 'user', evidence: evidenceOf(p, ids) };
  // Cada elemento pertenece a un solo patrón.
  const others = (p.patternGroups ?? []).map(g => ({ ...g, memberIds: g.memberIds.filter(m => !ids.includes(m)) })).filter(g => g.memberIds.length);
  return {
    project: { ...p, patternGroups: [...others, group] },
    log: [{ kind: 'pattern_add', targetId: id, label: `Patrón creado · ${group.name}`, reason: `${ids.length} elementos en ${SHEET_NAME[layer]}` }],
    message: `Patrón creado · ${group.name}`,
    groupId: id,
  };
}

export function renameGroup(p: Project, id: string, name: string): ActionResult {
  const g = (p.patternGroups ?? []).find(x => x.id === id);
  const clean = name.trim();
  if (!g || !clean || clean === g.name) return { project: p, log: [] };
  return {
    project: { ...p, patternGroups: p.patternGroups!.map(x => (x.id === id ? { ...x, name: clean } : x)) },
    log: [{ kind: 'pattern_edit', targetId: id, label: `Patrón «${g.name}» → «${clean}»` }],
    message: `Patrón renombrado · ${clean}`,
  };
}

export function ungroup(p: Project, id: string): ActionResult {
  const g = (p.patternGroups ?? []).find(x => x.id === id);
  if (!g) return { project: p, log: [] };
  return {
    project: { ...p, patternGroups: p.patternGroups!.filter(x => x.id !== id) },
    log: [{ kind: 'pattern_edit', targetId: id, label: `Patrón desagrupado · ${g.name}` }],
    message: `Patrón desagrupado · ${g.name}`,
  };
}

/** Mover un patrón entero a otra capa. */
export function moveGroup(p: Project, id: string, l: Layer): ActionResult {
  const g = (p.patternGroups ?? []).find(x => x.id === id);
  if (!g || g.layer === l) return { project: p, log: [] };
  let project: Project = p;
  for (const m of g.memberIds) {
    if (find(project, m)) project = place(project, m, l).project;
    else if (findRef(project, m)) project = placeRef(project, m, l).project;
  }
  project = { ...project, patternGroups: project.patternGroups!.map(x => (x.id === id ? { ...x, layer: l } : x)) };
  return {
    project,
    log: [{ kind: 'layer', targetId: id, label: `Patrón «${g.name}» → ${SHEET_NAME[l]}`, reason: `Estaba en ${g.layer ? SHEET_NAME[g.layer] : 'sin capa'}` }],
    message: `Patrón «${g.name}» → ${SHEET_NAME[l]}`,
  };
}

/* ---------- Prioridad dentro de la capa y desglose ---------- */

/**
 * Arrastrar una pieza a otro lugar de su capa: de izquierda a derecha, de más a menos importante.
 * `beforeId` null = al final. Es una decisión del usuario: la pieza pasa a ser suya (pesa más).
 */
export function reorderPiece(p: Project, id: string, beforeId: string | null): ActionResult {
  const x = find(p, id);
  if (!x || !isLayer(x.layer)) return { project: p, log: [] };
  const order = piecesIn(p, x.layer).map(y => y.id).filter(i => i !== id);
  const at = beforeId ? order.indexOf(beforeId) : -1;
  order.splice(at === -1 ? order.length : at, 0, id);
  const rank = new Map(order.map((i, n) => [i, n]));
  const same = piecesIn(p, x.layer).map(y => y.id).join() === order.join();
  if (same) return { project: p, log: [] };
  return {
    project: {
      ...p,
      patterns: p.patterns.map(y => (rank.has(y.id) ? { ...y, rank: rank.get(y.id), ...(y.id === id ? { origin: 'user' as const, confirmed: true, status: 'confirmed' as const } : {}) } : y)),
    },
    log: [{ kind: 'layer', targetId: id, label: `${x.name}: prioridad ${rank.get(id)! + 1} en ${SHEET_NAME[x.layer]}` }],
    message: `${x.name} → lugar ${rank.get(id)! + 1} en ${SHEET_NAME[x.layer]}`,
  };
}

/**
 * Desglosar una referencia: cada parte (por ejemplo, solo el rostro de un personaje) pasa a ser una referencia suelta,
 * en la misma capa y junto a la original, para que el usuario las junte como quiera y arme sus propios grupos y patrones.
 */
export function addRefParts(p: Project, refId: string, parts: { id: string; name: string; image: string; aspectRatio?: number }[]): ActionResult {
  const r = findRef(p, refId);
  if (!r || !isLayer(r.layer) || !parts.length) return { project: p, log: [] };
  const base = r.position ?? { x: 0.05, y: 0.1, w: 0.16, h: 0.24 };
  const w = Math.min(0.16, base.w);
  const h = Math.min(0.24, base.h);
  const fresh: Reference[] = parts.map((part, i) => ({
    id: part.id,
    name: part.name,
    image: part.image,
    aspectRatio: part.aspectRatio,
    createdAt: new Date().toISOString(),
    layer: r.layer,
    origin: 'user',
    confirmed: true,
    position: { x: Math.min(1 - w, Math.max(0, base.x + base.w + 0.02 + i * (w + 0.01))), y: Math.min(1 - h, base.y), w, h },
  }));
  return {
    project: { ...p, references: [...p.references, ...fresh] },
    log: [{ kind: 'layer', targetId: refId, label: `Desglose de ${r.name}`, reason: fresh.map(x => x.name).join(' · ') }],
    message: `${r.name} desglosada en ${fresh.length} recortes: juntalos con ⇧ + clic y G`,
  };
}
