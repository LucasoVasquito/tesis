import { PieceType, Project, Rule } from '../types';
import { RULE_FIELDS } from './rules';

export type NodeKind = 'ref' | 'pattern' | 'pillar' | 'rule' | 'piece';

export interface TraceNode {
  id: string;
  kind: NodeKind;
  label: string;
  /** Código corto (ref_01, pat_02, T1…). */
  code: string;
  systemId?: string;
  refId?: string;
  patternCategory?: string;
  pieceId?: string;
  pieceType?: PieceType;
  /** Puntaje de verificación de una pieza ("3/4"). */
  score?: string;
  parentRef?: string;
}

export type EdgeKind = 'evidence' | 'pillar' | 'rule' | 'crop' | 'verified' | 'partial';

export interface TraceEdge {
  from: string;
  to: string;
  kind: EdgeKind;
}

export interface TraceGraph {
  nodes: TraceNode[];
  edges: TraceEdge[];
  /** Nodos por sistema (pilares y reglas) para dibujar los bloques. */
  systems: { id: string; name: string; pillars: string[]; rules: string[]; pieces: string[] }[];
}

const PIECE_LABEL: Record<PieceType, string> = {
  logo: 'Logotipo',
  facade: 'Fachada',
  packaging: 'Packaging',
  poster: 'Afiche',
  post: 'Post',
  story: 'Story',
  web: 'Web',
  other: 'Pieza',
};

/** Cadena completa del proyecto: referencias → patrones confirmados → pilares y reglas → piezas aprobadas. */
export function buildTraceGraph(project: Project): TraceGraph {
  const nodes: TraceNode[] = [];
  const edges: TraceEdge[] = [];
  const refIds = new Set(project.references.map(r => r.id));
  const confirmed = project.patterns.filter(p => p.status === 'confirmed');
  const patIds = new Set(confirmed.map(p => p.id));

  // Solo las referencias que llegan a algo (evidencia de un patrón confirmado o recorte de una regla).
  const usedRefs = new Set<string>();
  confirmed.forEach(p => p.evidence.forEach(id => refIds.has(id) && usedRefs.add(id)));
  project.systems.forEach(s => RULE_FIELDS.forEach(({ field }) => (s[field] ?? []).forEach(r => (r.example?.refIds ?? []).forEach(id => refIds.has(id) && usedRefs.add(id)))));

  project.references
    .filter(r => usedRefs.has(r.id))
    .forEach(r => nodes.push({ id: `ref:${r.id}`, kind: 'ref', code: r.id, label: r.name, refId: r.id, parentRef: r.parentId }));

  confirmed.forEach(p => {
    nodes.push({ id: `pat:${p.id}`, kind: 'pattern', code: p.id, label: p.name, patternCategory: p.category });
    p.evidence.filter(id => usedRefs.has(id)).forEach(id => edges.push({ from: `ref:${id}`, to: `pat:${p.id}`, kind: 'evidence' }));
  });

  const systems: TraceGraph['systems'] = [];
  for (const s of project.systems) {
    const block = { id: s.id, name: s.name, pillars: [] as string[], rules: [] as string[], pieces: [] as string[] };
    (s.aestheticPillars ?? []).forEach((pillar, i) => {
      const id = `pil:${s.id}:${i}`;
      nodes.push({ id, kind: 'pillar', code: `P${i + 1}`, label: pillar, systemId: s.id });
      block.pillars.push(id);
      (s.sources?.aestheticPillars?.[i] ?? []).filter(pid => patIds.has(pid)).forEach(pid => edges.push({ from: `pat:${pid}`, to: id, kind: 'pillar' }));
    });
    const rules: Rule[] = RULE_FIELDS.flatMap(({ field }) => s[field] ?? []);
    rules.forEach(r => {
      const id = `rule:${s.id}:${r.code}`;
      nodes.push({ id, kind: 'rule', code: r.code, label: r.title.endsWith('…') && r.detail ? r.detail : r.title, systemId: s.id });
      block.rules.push(id);
      r.patternIds.filter(pid => patIds.has(pid)).forEach(pid => edges.push({ from: `pat:${pid}`, to: id, kind: 'rule' }));
      (r.example?.refIds ?? []).filter(rid => usedRefs.has(rid)).forEach(rid => edges.push({ from: `ref:${rid}`, to: id, kind: 'crop' }));
    });
    // Piezas aprobadas y las reglas que cumplen según su verificación.
    const session = project.applications?.[s.id];
    Object.entries(session?.approved ?? {}).forEach(([type, pieceId]) => {
      if (!pieceId) return;
      const id = `piece:${s.id}:${pieceId}`;
      const audit = session?.audits?.[pieceId];
      const got = audit?.rules.reduce((n, r) => n + (r.verdict === 'cumple' ? 1 : r.verdict === 'parcial' ? 0.5 : 0), 0);
      nodes.push({
        id,
        kind: 'piece',
        code: PIECE_LABEL[type as PieceType] ?? 'Pieza',
        label: PIECE_LABEL[type as PieceType] ?? 'Pieza',
        systemId: s.id,
        pieceId,
        pieceType: type as PieceType,
        score: audit?.rules.length ? `${String(got).replace('.', ',')}/${audit.rules.length}` : undefined,
      });
      block.pieces.push(id);
      audit?.rules.forEach(v => {
        if (v.verdict === 'no_cumple') return;
        if (rules.some(r => r.code === v.code)) edges.push({ from: `rule:${s.id}:${v.code}`, to: id, kind: v.verdict === 'cumple' ? 'verified' : 'partial' });
      });
    });
    systems.push(block);
  }
  return { nodes, edges, systems };
}

/** Linaje de un nodo: todo lo que lo sostiene (hacia atrás) y todo lo que sostiene (hacia adelante). */
export function lineage(graph: TraceGraph, id: string): { nodes: Set<string>; edges: Set<TraceEdge> } {
  const nodes = new Set<string>([id]);
  const edges = new Set<TraceEdge>();
  const walk = (start: string, dir: 'up' | 'down') => {
    const queue = [start];
    const seen = new Set<string>([start]);
    while (queue.length) {
      const cur = queue.shift()!;
      for (const e of graph.edges) {
        const next = dir === 'up' ? (e.to === cur ? e.from : null) : e.from === cur ? e.to : null;
        if (!next) continue;
        edges.add(e);
        nodes.add(next);
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
  };
  walk(id, 'up');
  walk(id, 'down');
  return { nodes, edges };
}
