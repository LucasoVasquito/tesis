import { normalizeSystemRules } from './rules';
import { FeedbackItem, Fragment, LogItem, LogKind, Pattern, Project, Reference } from '../types';
import { fragmentTypeFromPart, isLayer } from './layers';
import { rankLayers } from '../pieces/model';

/** Esquema actual: 2 = pila de láminas; 3 = sin partes como referencias; 4 = piezas (sugerencia / confirmada); 5 = moodboard en capas (origen USUARIO / AGENTE). */
export const SCHEMA = 5;

let seq = 0;
/** ID único y ordenable por tiempo. */
export const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(seq++ % 1296).toString(36).padStart(2, '0')}`;

/**
 * Esquema 5: el origen pasa a USUARIO / AGENTE y la ubicación se llama `confirmed`.
 * Lo que estaba ubicado conserva su estado: lo que escribió el diseñador queda como 'user';
 * lo demás, como 'agent', con `confirmed` según su estado actual. Es idempotente.
 */
function renameLegacyKeys(raw: any): any {
  const origin = (o: unknown): 'agent' | 'user' => (o === 'designer' || o === 'user' ? 'user' : 'agent');
  const patterns = Array.isArray(raw?.patterns)
    ? raw.patterns.map((x: any) => {
        const { layerConfirmed, aiSuggestedLayer, ...rest } = x ?? {};
        return {
          ...rest,
          origin: origin(x?.origin),
          confirmed: typeof x?.confirmed === 'boolean' ? x.confirmed : layerConfirmed,
          agentSuggestedLayer: x?.agentSuggestedLayer ?? aiSuggestedLayer,
        };
      })
    : raw?.patterns;
  const fragments = Array.isArray(raw?.fragments)
    ? raw.fragments.map((f: any) => {
        const { aiSuggestedLayer, ...rest } = f ?? {};
        return { ...rest, origin: origin(f?.origin), agentSuggestedLayer: f?.agentSuggestedLayer ?? aiSuggestedLayer };
      })
    : raw?.fragments;
  return { ...raw, patterns, fragments };
}

/** Normaliza un proyecto guardado (versiones anteriores o datos incompletos). */
export function migrateProject(input: any): Project {
  const raw = renameLegacyKeys(input);
  const p: Project = {
    id: raw?.id || uid('proj'),
    name: typeof raw?.name === 'string' ? raw.name : '',
    objective: typeof raw?.objective === 'string' ? raw.objective : '',
    description: typeof raw?.description === 'string' ? raw.description : '',
    status: raw?.status || 'draft',
    createdAt: raw?.createdAt || new Date().toISOString(),
    lastAnalyzedAt: raw?.lastAnalyzedAt,
    uiStage: raw?.uiStage,
    references: Array.isArray(raw?.references) ? raw.references : [],
    patterns: Array.isArray(raw?.patterns) ? raw.patterns : [],
    systems: Array.isArray(raw?.systems) ? raw.systems.map((s: any) => normalizeSystemRules({ ...s, isSynthesizing: false })) : [],
    feedback: Array.isArray(raw?.feedback) ? raw.feedback : [],
    suggestedSystems: Array.isArray(raw?.suggestedSystems) ? raw.suggestedSystems : [],
    log: Array.isArray(raw?.log) ? raw.log : [],
    groups: Array.isArray(raw?.groups) ? raw.groups : [],
    lastBackupAt: typeof raw?.lastBackupAt === 'string' ? raw.lastBackupAt : undefined,
    applications: raw?.applications && typeof raw.applications === 'object' ? raw.applications : {},
  };
  if (p.status === 'analyzing' || p.status === 'updating') p.status = p.patterns.length ? 'analyzed' : 'draft';
  return migrateToPieces(migrateToStack(p, raw), raw);
}

/**
 * Pasa un proyecto a la pila de láminas.
 * - Las partes recortadas (referencias con parentId) pasan a ser fragmentos de su imagen de origen.
 *   Después dejan de ser referencias: la evidencia que las citaba pasa a su imagen de origen.
 * - Los patrones confirmados entran a la pila sin lámina: el diseñador nunca eligió una.
 *   Mientras la IA no proponga una lámina, la sugerencia sale de la evidencia (suggestedLayer).
 *   ⏎ acepta la sugerencia. Cuentan como auditados.
 * - Los pendientes de la IA llegan como revelados ("NO LO MARCASTE"), sin lámina ni auditoría.
 * - La frase de intención sale del nombre; el brief junta objetivo y descripción.
 */
export function migrateToStack(p: Project, raw: any): Project {

  let fragments: Fragment[] = Array.isArray(raw?.fragments) ? raw.fragments.filter((f: any) => f?.id && f?.refId && f?.crop) : [];
  const fresh = (raw?.schema ?? 0) < 4;

  if (fresh) {
    const known = new Set(fragments.map(f => f.id));
    p.references
      .filter(r => r.parentId && r.crop && !known.has(`frag_${r.id}`))
      .forEach(r =>
        fragments.push({
          id: `frag_${r.id}`,
          refId: r.parentId!,
          crop: r.crop!,
          type: fragmentTypeFromPart(r.partKind),
          label: r.name,
          description: r.notes,
          layer: null,
          z: 0,
          origin: 'user',
          createdAt: r.createdAt,
        }),
      );
  }

  const patterns: Pattern[] = p.patterns.map(pt => {
    const base: Pattern = {
      ...pt,
      layer: isLayer(pt.layer) ? pt.layer : null,
      agentSuggestedLayer: isLayer(pt.agentSuggestedLayer) ? pt.agentSuggestedLayer : null,
      audited: typeof pt.audited === 'boolean' ? pt.audited : pt.status === 'confirmed' || pt.origin === 'user',
      revealed: typeof pt.revealed === 'boolean' ? pt.revealed : pt.origin !== 'user' && pt.status === 'detected' && !pt.designerGroup,
      fragmentIds: Array.isArray(pt.fragmentIds) ? pt.fragmentIds : [],
    };
    if (fresh && pt.status !== 'discarded') {
      // Las partes que eran evidencia del patrón pasan a ser sus fragmentos.
      const partFrags = pt.evidence.filter(id => p.references.some(r => r.id === id && r.parentId)).map(id => `frag_${id}`);
      base.fragmentIds = [...new Set([...(base.fragmentIds ?? []), ...partFrags.filter(id => fragments.some(f => f.id === id))])];
    }
    return base;
  });

  if (fresh) {
    // Cada fragmento queda en el primer patrón que lo reclama.
    fragments = fragments.map(f => {
      if (f.groupId) return f;
      const owner = patterns.find(pt => pt.fragmentIds?.includes(f.id));
      return owner ? { ...f, groupId: owner.id } : f;
    });
  }

  // Las partes ya son fragmentos (se dibujan recortando su imagen de origen): dejan de ser referencias.
  // La evidencia que citaba una parte pasa a citar la imagen de la que salió.
  const parentOf = new Map(p.references.filter(r => r.parentId).map(r => [r.id, r.parentId!]));
  const toWhole = (ids: string[]) => [...new Set(ids.map(id => parentOf.get(id) ?? id))];
  const references = parentOf.size ? p.references.filter(r => !r.parentId) : p.references;
  const cleanPatterns = parentOf.size ? patterns.map(pt => ({ ...pt, evidence: toWhole(pt.evidence) })) : patterns;
  const systems = parentOf.size ? p.systems.map(s => ({ ...s, referenceIds: toWhole(s.referenceIds) })) : p.systems;

  return {
    ...p,
    references,
    systems,
    schema: SCHEMA,
    // La intención es una frase: el nombre del proyecto; el objetivo y la descripción pasan al brief.
    intent: typeof raw?.intent === 'string' ? raw.intent : p.name,
    brief: typeof raw?.brief === 'string' ? raw.brief : [p.objective, p.description].filter(x => x.trim()).join('\n\n'),
    fragments: fragments.map(f => ({ ...f, layer: isLayer(f.layer) ? f.layer : null, z: Number.isFinite(f.z) ? f.z : 0 })),
    patterns: cleanPatterns,
    view: raw?.view === 'front' ? 'front' : 'side',
  };
}

export function makeLog(kind: LogKind, targetId: string, label: string, reason?: string, feedbackId?: string): LogItem {
  return { id: uid('log'), at: new Date().toISOString(), kind, targetId, label, reason, feedbackId };
}

export function makeFeedback(fb: Omit<FeedbackItem, 'id' | 'createdAt'>): FeedbackItem {
  return { ...fb, id: uid('fb'), createdAt: new Date().toISOString() };
}

export const withLog = (p: Project, ...items: LogItem[]): Project => ({ ...p, log: [...(p.log ?? []), ...items] });

/* ---------- Referencias ---------- */

/** Próximos IDs secuenciales ref_XX, sin chocar con los existentes (aunque se hayan borrado algunos). */
export function nextReferenceIds(existing: Reference[], count: number): string[] {
  const used = new Set(existing.map(r => r.id));
  const max = existing.reduce((m, r) => {
    const n = /^ref_(\d+)$/.exec(r.id);
    return n ? Math.max(m, parseInt(n[1], 10)) : m;
  }, 0);
  const ids: string[] = [];
  let n = max;
  while (ids.length < count) {
    n++;
    const id = `ref_${String(n).padStart(2, '0')}`;
    if (!used.has(id)) ids.push(id);
  }
  return ids;
}

const readAsDataURL = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const MAX_SIDE = 1600;

/**
 * Lee la imagen y mide su proporción real. Las que pasan de MAX_SIDE se reducen y recomprimen:
 * el proyecto vive en localStorage (~5 MB) y una captura PNG sin reducir lo llena con pocas imágenes.
 */
async function prepareImage(file: File): Promise<{ url: string; ratio: number }> {
  const original = await readAsDataURL(file);
  const img = await new Promise<HTMLImageElement | null>(resolve => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => resolve(null);
    el.src = original;
  });
  if (!img || !img.naturalWidth || !img.naturalHeight) return { url: original, ratio: 0 };
  const ratio = img.naturalWidth / img.naturalHeight;
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return { url: original, ratio };
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
  const compact = canvas.toDataURL('image/webp', 0.9);
  return { url: compact.startsWith('data:image/webp') && compact.length < original.length ? compact : original, ratio };
}

export function cleanFileName(name: string) {
  return name.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ').trim();
}

/**
 * Convierte archivos de imagen en referencias nuevas.
 * `at` ubica las fichas alrededor de un punto del lienzo; si no se pasa, van a la grilla.
 */
export async function filesToReferences(
  files: File[],
  existing: Reference[],
  opts: { tags?: string[]; notes?: string; at?: { x: number; y: number } } = {},
): Promise<Reference[]> {
  const images = files.filter(f => f.type.startsWith('image/'));
  if (images.length === 0) return [];
  const ids = nextReferenceIds(existing, images.length);
  const prepared = await Promise.all(images.map(prepareImage));
  const urls = prepared.map(p => p.url);
  const ratios = prepared.map(p => p.ratio);
  return images.map((file, i) => {
    const base = cleanFileName(file.name);
    const isGeneric = !base || base === 'image' || base.startsWith('blob');
    return {
      id: ids[i],
      name: isGeneric ? `Referencia ${ids[i].replace('ref_', '')}` : base,
      image: urls[i],
      aspectRatio: ratios[i] || undefined,
      createdAt: new Date().toISOString(),
      tags: opts.tags,
      notes: opts.notes,
      isNew: true,
    };
  });
}

/** Hora corta para la bitácora (hh:mm) y fecha si no es de hoy. */
export function formatLogTime(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const hm = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (d.toDateString() === today.toDateString()) return hm;
  return `${d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })} ${hm}`;
}

/**
 * Fusiona los patrones de una nueva inducción con las decisiones previas del diseñador.
 * Lo confirmado o descartado conserva su ID, estado y notas; nunca se pierde aunque la IA no lo repita.
 */
export function mergeInducedPatterns(previous: Pattern[], detected: any[]): { merged: Pattern[]; newCount: number } {
  const confirmed = previous.filter(x => x.status === 'confirmed');
  const discarded = previous.filter(x => x.status === 'discarded');
  const sameAs = (a: Pattern, b: any) => a.id === b.id || a.name.toLowerCase() === String(b?.name || '').toLowerCase();
  let newCount = 0;
  const merged: Pattern[] = detected.map((d: any) => {
    const c = confirmed.find(x => sameAs(x, d));
    // Lo escrito o ajustado a mano por el diseñador manda sobre lo que diga la IA.
    // La lámina sugerida por la IA se actualiza; lo decidido por el diseñador (lámina, auditoría, fragmentos) se conserva.
    const aiLayer = isLayer(d?.suggestedLayer) ? d.suggestedLayer : undefined;
    const keep = (c: Pattern) => ({
      layer: c.layer ?? null,
      agentSuggestedLayer: aiLayer ?? c.agentSuggestedLayer ?? null,
      audited: c.audited,
      revealed: c.revealed,
      fragmentIds: c.fragmentIds,
      isGroup: c.isGroup,
    });
    if (c?.origin === 'user') return { ...c, trend: 'stable' as const, agentSuggestedLayer: aiLayer ?? c.agentSuggestedLayer ?? null };
    if (c) return { ...d, ...keep(c), id: c.id, status: 'confirmed' as const, origin: c.origin, assignedSystemId: c.assignedSystemId, designerNotes: c.designerNotes, trend: 'strengthened' as const, ...(c.evidenceLocked ? { evidence: c.evidence, evidenceLocked: true } : {}) };
    const x = discarded.find(y => sameAs(y, d));
    if (x) return { ...d, ...keep(x), id: x.id, status: 'discarded' as const, discardReason: x.discardReason, designerNotes: x.designerNotes, trend: 'stable' as const };
    newCount++;
    return {
      ...d,
      evidence: Array.isArray(d.evidence) ? d.evidence : [],
      relatedObservations: Array.isArray(d.relatedObservations) ? d.relatedObservations : [],
      status: 'detected' as const,
      trend: d.trend || 'new',
      origin: 'agent' as const,
      layer: null,
      agentSuggestedLayer: aiLayer ?? null,
      audited: false,
      // Si responde a un grupo del diseñador, no es un revelado: él ya lo había marcado.
      revealed: !d.designerGroupId,
      fragmentIds: [],
    };
  });
  confirmed.forEach(c => !merged.some(m => m.id === c.id) && merged.unshift(c.origin === 'user' ? c : { ...c, trend: 'weakened' }));
  discarded.forEach(d => !merged.some(m => m.id === d.id) && merged.push(d));
  return { merged, newCount };
}

/**
 * Pasa la pila a piezas (esquema 4).
 * - Grupos y fragmentos sueltos pasan a ser piezas; la imagen de la pieza es el recorte de su fragmento.
 * - Lo que ya estaba en una hoja la conserva, confirmada (lo decidió el diseñador).
 * - Lo demás entra en la hoja que sugiere la IA o la evidencia, como sugerencia: nunca se arranca vacío.
 * - Los momentos viejos (armar, revelar, girar) pasan a moodboard y sistema (subir y ordenar se unieron).
 */
export function migrateToPieces(p: Project, raw: any): Project {
  const moment = (): Project['moment'] => {
    const m = raw?.moment;
    if (m === 'moodboard' || m === 'sistema' || m === 'probar') return m;
    if (m === 'subir' || m === 'ordenar') return 'moodboard';
    if (raw?.view === 'front' || m === 'girar') return 'sistema';
    return 'moodboard';
  };
  if ((raw?.schema ?? 0) >= 4) return { ...p, schema: SCHEMA, moment: moment() };

  const frags = p.fragments ?? [];
  const live = new Set(p.patterns.filter(x => x.status !== 'discarded').map(x => x.id));
  const claimed = new Set(p.patterns.filter(x => live.has(x.id)).flatMap(x => x.fragmentIds ?? []));
  const fragsOf = (x: Pattern) => frags.filter(f => f.groupId === x.id || x.fragmentIds?.includes(f.id));

  let patterns: Pattern[] = p.patterns.map(x => {
    const own = fragsOf(x);
    const placed = isLayer(x.layer);
    return {
      ...x,
      isGroup: false,
      cover: x.cover ?? (own[0] ? { refId: own[0].refId, crop: own[0].crop } : undefined),
      evidence: [...new Set([...x.evidence, ...own.map(f => f.refId)])],
      // Antes, ubicar en una lámina era una decisión del diseñador.
      confirmed: x.confirmed ?? (placed && (x.origin === 'user' || x.status === 'confirmed')),
      status: x.status === 'discarded' ? 'discarded' : x.status,
    };
  });

  // Fragmentos sueltos: cada uno es una pieza.
  const used = new Set(patterns.map(x => x.id));
  frags
    .filter(f => !claimed.has(f.id) && !(f.groupId && live.has(f.groupId)))
    .forEach(f => {
      let id = `pat_f_${f.id.replace(/^frag_/, '')}`;
      for (let i = 1; used.has(id); i++) id = `pat_f${i}_${f.id}`;
      used.add(id);
      patterns.push({
        id,
        name: f.label,
        category: 'composition',
        description: f.description ?? '',
        evidence: [f.refId],
        confidence: 1,
        status: isLayer(f.layer) ? 'confirmed' : 'detected',
        relatedObservations: [],
        origin: f.origin === 'user' ? 'user' : 'agent',
        layer: isLayer(f.layer) ? f.layer : null,
        agentSuggestedLayer: isLayer(f.agentSuggestedLayer) ? f.agentSuggestedLayer : null,
        confirmed: isLayer(f.layer),
        audited: true,
        revealed: false,
        cover: { refId: f.refId, crop: f.crop },
      });
    });

  // Lo que no tiene hoja entra como sugerencia.
  const draft: Project = { ...p, patterns };
  const ranks = rankLayers(draft);
  patterns = patterns.map(x =>
    x.status === 'discarded' || isLayer(x.layer) ? x : { ...x, layer: isLayer(x.agentSuggestedLayer) ? x.agentSuggestedLayer : ranks.get(x.id) ?? 3, confirmed: false },
  );

  // Los fragmentos ya son piezas (o la imagen de una): no se usan más.
  return { ...p, patterns, fragments: [], schema: SCHEMA, moment: moment() };
}
