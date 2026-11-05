import { CropBox, Layer, LogKind, Pattern, Project } from '../types';
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
export const isSuggestion = (x: Pattern) => isLayer(x.layer) && !x.layerConfirmed;
export const unplacedPieces = (p: Project) => livePieces(p).filter(x => !isLayer(x.layer));

/** Piezas de una hoja: las de más evidencia primero. */
export function piecesIn(p: Project, l: Layer): Pattern[] {
  return livePieces(p)
    .filter(x => x.layer === l)
    .sort((a, b) => evidenceCount(b, p) - evidenceCount(a, p));
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
export const proposedLayer = (x: Pattern, p: Project, ranks = rankLayers(p)): Layer => (isLayer(x.aiSuggestedLayer) ? x.aiSuggestedLayer : ranks.get(x.id) ?? 3);

/* ---------- Acciones ---------- */

const touch = (p: Project, id: string, fn: (x: Pattern) => Pattern): Project => ({ ...p, patterns: p.patterns.map(x => (x.id === id ? fn(x) : x)) });
const find = (p: Project, id: string) => p.patterns.find(x => x.id === id);

/** ⏎ · Confirmar: la sugerencia queda fija (borde lleno). */
export function confirm(p: Project, ids: string[]): ActionResult {
  let project = p;
  const log: LogLine[] = [];
  for (const id of ids) {
    const x = find(project, id);
    if (!x || !isLayer(x.layer) || x.layerConfirmed) continue;
    project = touch(project, id, y => ({ ...y, layerConfirmed: true, status: 'confirmed' }));
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
    project: touch(p, id, y => ({ ...y, layer: l, layerConfirmed: true, status: 'confirmed' })),
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
    project: touch(p, id, y => ({ ...y, status: 'detected', layer: l, layerConfirmed: false })),
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
    layerConfirmed: false,
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
      const ev = prev.evidenceLocked ? prev.evidence : prev.origin === 'designer' ? [...new Set([...prev.evidence, ...evidence])] : evidence.length ? evidence : prev.evidence;
      updates.set(prev.id, {
        ...prev,
        description: prev.origin === 'designer' ? prev.description : d?.description || prev.description,
        evidence: ev,
        aiSuggestedLayer: aiLayer ?? prev.aiSuggestedLayer ?? null,
        cover: prev.cover ?? cover,
        // Una sugerencia sin confirmar sigue a la IA; lo confirmado no se toca.
        layer: prev.layerConfirmed ? prev.layer : aiLayer ?? prev.layer ?? null,
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
      origin: 'ai',
      layer: aiLayer,
      aiSuggestedLayer: aiLayer,
      layerConfirmed: false,
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
  project = { ...project, patterns: project.patterns.map(x => (x.status !== 'discarded' && !x.isGroup && !isLayer(x.layer) ? { ...x, layer: ranks.get(x.id) ?? 3, layerConfirmed: false } : x)) };
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
    if (!isLayer(x.layer) || !x.layerConfirmed) return null;
    const ev = proposedLayer(x, p, ranks);
    if (ev === x.layer) return null;
    return {
      key: `c:${x.id}:${x.layer}`,
      pieceId: x.id,
      text: `pusiste «${x.name}» en ${SHEET_NAME[x.layer]}, pero aparece en ${evidenceCount(x, p)} de ${total} referencias.`,
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
