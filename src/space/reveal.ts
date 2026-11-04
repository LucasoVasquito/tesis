import { Pattern, Project } from '../types';
import { cropImage } from '../utils/parts';
import { corpusRefs, isLayer } from '../utils/layers';
import { compressImageString, compressReferences } from '../utils/imageCompressor';
import { LogLine } from './actions';

/** Patrones que el diseñador definió y la IA tiene que buscar en el corpus (los grupos sin nombre no). */
export const designerStackPatterns = (p: Project) => p.patterns.filter(x => x.origin === 'designer' && !x.isGroup && x.status !== 'discarded');

/** Hace falta recorrer el corpus: nunca se hizo, hay referencias nuevas o patrones propios que la IA no vio. */
export function needsReveal(p: Project): boolean {
  if (corpusRefs(p).length < 3) return false;
  if (!p.lastAnalyzedAt) return true;
  if (corpusRefs(p).some(r => r.isNew)) return true;
  return designerStackPatterns(p).some(x => x.aiSuggestedLayer == null);
}

/** Cuerpo del pedido a /api/analyze-references con la pila como contexto. */
export async function buildRevealBody(p: Project) {
  const refs = await compressReferences(corpusRefs(p), { maxWidth: 1024, maxHeight: 1024, quality: 0.8 });
  const stack = designerStackPatterns(p);
  const stackPatterns = await Promise.all(
    stack.map(async x => {
      const frags = (p.fragments ?? []).filter(f => f.groupId === x.id || x.fragmentIds?.includes(f.id)).slice(0, 4);
      const withImages = await Promise.all(
        frags.map(async f => {
          const ref = p.references.find(r => r.id === f.refId);
          if (!ref) return { refId: f.refId, label: f.label, type: f.type };
          try {
            const [crop] = await cropImage(ref.image, [f.crop]);
            return { refId: f.refId, label: f.label, type: f.type, image: await compressImageString(crop.image, { maxWidth: 512, maxHeight: 512, quality: 0.8 }) };
          } catch {
            return { refId: f.refId, label: f.label, type: f.type };
          }
        }),
      );
      return { id: x.id, name: x.name, layer: x.layer ?? null, description: x.description, evidence: x.evidence, fragments: withImages };
    }),
  );
  const stackIds = new Set(stack.map(x => x.id));
  return {
    references: refs,
    projectName: p.name,
    objective: p.objective,
    description: p.brief || p.description,
    previousPatterns: p.patterns.filter(x => !x.isGroup),
    // Los patrones de la pila van aparte: la IA los busca y les suma evidencia.
    confirmedPatterns: p.patterns.filter(x => x.status === 'confirmed' && !stackIds.has(x.id) && !x.isGroup),
    discardedPatterns: p.patterns.filter(x => x.status === 'discarded'),
    feedback: p.feedback,
    designerGroups: [],
    stackPatterns,
  };
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x));

/**
 * Fusiona lo que encontró la IA con la pila del diseñador.
 * - Patrones del diseñador: suman evidencia (la de sus fragmentos se conserva) y la lámina que sugiere la IA.
 *   Si la evidencia cambió, quedan sin auditar: hay referencias que el diseñador todavía no miró.
 * - Lo confirmado conserva lámina y auditoría; lo descartado sigue descartado.
 * - Lo nuevo llega como revelado ("NO LO MARCASTE"): sin lámina y sin auditar.
 */
export function mergeRevealed(p: Project, detected: any[]): { project: Project; log: LogLine[]; revealed: number; strengthened: number } {
  const known = new Set(p.references.map(r => r.id));
  const clean = (ids: any) => (Array.isArray(ids) ? ids.map(String).filter((id: string) => known.has(id)) : []);
  const byId = new Map(p.patterns.map(x => [x.id, x]));
  const byName = new Map(p.patterns.map(x => [x.name.toLowerCase(), x]));
  const touched = new Set<string>();
  const log: LogLine[] = [];
  let revealed = 0;
  let strengthened = 0;
  const fresh: Pattern[] = [];
  const updates = new Map<string, Pattern>();
  const layerOf = (d: any) => (isLayer(Number(d?.suggestedLayer)) ? (Number(d.suggestedLayer) as 1 | 2 | 3) : null);

  for (const d of detected) {
    const prev = byId.get(String(d?.id)) ?? byName.get(String(d?.name || '').toLowerCase());
    const evidence = clean(d?.evidence);
    const aiLayer = layerOf(d);
    if (prev && !touched.has(prev.id)) {
      touched.add(prev.id);
      if (prev.status === 'discarded') continue;
      if (prev.origin === 'designer') {
        const own = (p.fragments ?? []).filter(f => f.groupId === prev.id || prev.fragmentIds?.includes(f.id)).map(f => f.refId);
        const merged = [...new Set([...own, ...prev.evidence, ...evidence])];
        const changed = !sameSet(merged, prev.evidence);
        if (changed) strengthened++;
        updates.set(prev.id, {
          ...prev,
          evidence: merged,
          aiSuggestedLayer: aiLayer ?? prev.aiSuggestedLayer ?? null,
          audited: changed ? false : prev.audited,
          trend: merged.length > prev.evidence.length ? 'strengthened' : 'stable',
          relatedObservations: prev.relatedObservations?.length ? prev.relatedObservations : Array.isArray(d?.relatedObservations) ? d.relatedObservations : [],
          systemHypothesis: prev.systemHypothesis || d?.systemHypothesis,
        });
        if (changed) log.push({ kind: 'induce', targetId: prev.id, label: `Evidencia · ${prev.name}`, reason: `${merged.length} referencias (antes ${prev.evidence.length})` });
      } else {
        const ev = prev.evidenceLocked ? prev.evidence : evidence.length ? evidence : prev.evidence;
        updates.set(prev.id, {
          ...prev,
          description: d?.description || prev.description,
          evidence: ev,
          aiSuggestedLayer: aiLayer ?? prev.aiSuggestedLayer ?? null,
          audited: sameSet(ev, prev.evidence) ? prev.audited : false,
          confidence: typeof d?.confidence === 'number' ? d.confidence : prev.confidence,
        });
      }
      continue;
    }
    if (d?.designerPattern) continue; // dice ser de la pila pero no coincide con ninguno: no se inventa.
    if (!evidence.length) continue;
    const id = uniqueId(p, fresh, String(d?.id || 'pat'));
    revealed++;
    fresh.push({
      id,
      name: String(d?.name || 'Patrón'),
      category: d?.category || 'composition',
      description: String(d?.description || ''),
      evidence,
      confidence: typeof d?.confidence === 'number' ? d.confidence : 0.5,
      status: 'detected',
      relatedObservations: Array.isArray(d?.relatedObservations) ? d.relatedObservations : [],
      systemHypothesis: d?.systemHypothesis,
      trend: 'new',
      origin: 'ai',
      layer: null,
      aiSuggestedLayer: aiLayer,
      audited: false,
      revealed: true,
      fragmentIds: [],
    });
    log.push({ kind: 'induce', targetId: id, label: `Revelado · ${d?.name}`, reason: `${evidence.length} referencias · no lo marcaste` });
  }

  return {
    project: {
      ...p,
      status: 'analyzed',
      lastAnalyzedAt: new Date().toISOString(),
      patterns: [...p.patterns.map(x => updates.get(x.id) ?? x), ...fresh],
      references: p.references.map(r => (r.isNew ? { ...r, isNew: false } : r)),
    },
    log,
    revealed,
    strengthened,
  };
}

function uniqueId(p: Project, fresh: Pattern[], base: string): string {
  const used = new Set([...p.patterns.map(x => x.id), ...fresh.map(x => x.id)]);
  if (!used.has(base)) return base;
  for (let i = 1; i < 999; i++) {
    const id = `pat_r${String(i).padStart(2, '0')}`;
    if (!used.has(id)) return id;
  }
  return `pat_${Date.now().toString(36)}`;
}
