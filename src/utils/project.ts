import { normalizeSystemRules } from './rules';
import { FeedbackItem, LogItem, LogKind, Pattern, Project, Reference } from '../types';

let seq = 0;
/** ID único y ordenable por tiempo. */
export const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(seq++ % 1296).toString(36).padStart(2, '0')}`;

/** Normaliza un proyecto guardado (versiones anteriores o datos incompletos). */
export function migrateProject(raw: any): Project {
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
  return p;
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

const CARD_W = 260;
const GAP_X = 300;
const GAP_Y = 420;

/** Posición libre en una grilla para la referencia número `index` del corpus. */
export function gridPosition(index: number, origin = { x: 80, y: 80 }) {
  return { x: origin.x + (index % 4) * GAP_X, y: origin.y + Math.floor(index / 4) * GAP_Y };
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
      position: opts.at
        ? { x: Math.round(opts.at.x - CARD_W / 2 + (i % 3) * 40), y: Math.round(opts.at.y - 160 + Math.floor(i / 3) * 40 + (i % 3) * 16) }
        : gridPosition(existing.length + i),
      width: CARD_W,
      height: 340,
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
    if (c) return { ...d, id: c.id, status: 'confirmed' as const, assignedSystemId: c.assignedSystemId, designerNotes: c.designerNotes, trend: 'strengthened' as const };
    const x = discarded.find(y => sameAs(y, d));
    if (x) return { ...d, id: x.id, status: 'discarded' as const, discardReason: x.discardReason, designerNotes: x.designerNotes, trend: 'stable' as const };
    newCount++;
    return { ...d, evidence: Array.isArray(d.evidence) ? d.evidence : [], relatedObservations: Array.isArray(d.relatedObservations) ? d.relatedObservations : [], status: 'detected' as const, trend: d.trend || 'new' };
  });
  confirmed.forEach(c => !merged.some(m => m.id === c.id) && merged.unshift({ ...c, trend: 'weakened' }));
  discarded.forEach(d => !merged.some(m => m.id === d.id) && merged.push(d));
  return { merged, newCount };
}
