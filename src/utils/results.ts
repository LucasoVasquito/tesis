import { Project, Verdict } from '../types';

export const VERDICT_LABEL: Record<Verdict, string> = { worked: 'Funcionó', failed: 'Falló', ignored: 'La ignoró' };

/** Cuántas veces una pieza funcionó, falló o fue ignorada en los resultados importados. */
export function tally(project: Project, pieceId: string) {
  const t = { worked: 0, failed: 0, ignored: 0, total: 0 };
  for (const r of project.results ?? []) {
    const v = r.verdicts[pieceId];
    if (v) {
      t[v]++;
      t.total++;
    }
  }
  return t;
}

/** «funcionó 2 · falló 1 (de 3 pruebas)» o null si todavía no se evaluó. */
export function tallyText(project: Project, pieceId: string): string | null {
  const t = tally(project, pieceId);
  if (!t.total) return null;
  return [t.worked && `funcionó ${t.worked}`, t.failed && `falló ${t.failed}`, t.ignored && `ignorada ${t.ignored}`].filter(Boolean).join(' · ') + ` (de ${t.total} ${t.total === 1 ? 'prueba' : 'pruebas'})`;
}

/**
 * Cuánto ajustan las pruebas el peso de una pieza: de 0.5 (falló siempre) a 1.5 (funcionó siempre).
 * Que la IA la ignore no cuenta a favor ni en contra: no dice nada de la pieza, solo de la IA.
 */
export function resultFactor(project: Project, pieceId: string): number {
  const t = tally(project, pieceId);
  const judged = t.worked + t.failed;
  if (!judged) return 1;
  return 1 + 0.5 * ((t.worked - t.failed) / judged);
}

export interface Proposal {
  pieceId: string;
  kind: 'lower' | 'raise' | 'out';
  text: string;
}

/** Cambios que sugieren las pruebas. Con menos de 2 pruebas no se propone nada: una sola no alcanza. */
export function proposalFor(project: Project, pieceId: string): Proposal | null {
  const x = project.patterns.find(p => p.id === pieceId);
  if (!x || x.status === 'discarded' || !x.layer) return null;
  const t = tally(project, pieceId);
  const judged = t.worked + t.failed;
  if (judged < 2) return null;
  if (t.failed / judged >= 0.67) {
    return x.layer === 3
      ? { pieceId, kind: 'out', text: `Falló en ${t.failed} de ${judged} pruebas y ya está en el Acento.` }
      : { pieceId, kind: 'lower', text: `Falló en ${t.failed} de ${judged} pruebas.` };
  }
  if (t.worked / judged >= 0.67 && x.layer > 1) return { pieceId, kind: 'raise', text: `Funcionó en ${t.worked} de ${judged} pruebas.` };
  return null;
}

/** Lo que se le cuenta a la IA en el próximo análisis: qué funcionó, qué falló y los epígrafes del diseñador. */
export function resultsForAnalysis(project: Project) {
  const results = project.results ?? [];
  if (!results.length) return undefined;
  const pieces = project.patterns
    .filter(p => results.some(r => r.verdicts[p.id]))
    .map(p => {
      const t = tally(project, p.id);
      return { id: p.id, name: p.name, worked: t.worked, failed: t.failed, ignored: t.ignored };
    });
  const captions = results.filter(r => r.caption?.trim()).map(r => ({ ai: r.ai, caption: r.caption!.trim() }));
  if (!pieces.length && !captions.length) return undefined;
  return { tests: results.length, pieces, captions };
}
