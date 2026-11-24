import { Layer, Moment, Project } from '../types';
import { corpusRefs } from './layers';
import { SHEET_NAME, livePieces, outPieces, piecesIn, suggestions } from '../pieces/model';

/**
 * Las etapas: 0 Brief · 1 Referencias · 2 Revisar · 3 Capas · 4 Sistema · 5 Probar.
 * El índice en STEPS es el número que se muestra.
 * Acá vive todo lo que la barra lateral y la barra superior necesitan saber: qué está completo,
 * qué está bloqueado, qué quedó desactualizado y dónde estabas.
 */

export interface StepInfo {
  id: Moment;
  label: string;
  desc: string;
}

export const STEPS: StepInfo[] = [
  { id: 'brief', label: 'Brief', desc: 'Contá qué vas a diseñar' },
  { id: 'referencias', label: 'Referencias', desc: 'Juntá todo lo que te inspira' },
  { id: 'revisar', label: 'Revisar', desc: 'Decidí qué se sugiere' },
  { id: 'capas', label: 'Capas', desc: 'Ordená por importancia' },
  { id: 'sistema', label: 'Sistema', desc: 'Mirá el resultado' },
  { id: 'probar', label: 'Probar', desc: 'Aplicalo a una pieza' },
];

export const stepIndex = (id: Moment) => STEPS.findIndex(s => s.id === id);
export const stepLabel = (id: Moment) => STEPS[stepIndex(id)]?.label ?? '';

/** ¿Ya se analizó? Hay piezas del agente (o descartadas) o una fecha de análisis. */
export const isAnalyzed = (p: Project) => !!p.lastAnalyzedAt || livePieces(p).length > 0 || outPieces(p).length > 0;

/** ¿Hay brief? Alcanza con la frase o el objetivo. */
export const hasBrief = (p: Project) => !!(p.intent?.trim() || p.objective.trim());

/** Cuántas sugerencias faltan decidir, cuántas había y cuántas se revisaron. */
export function reviewProgress(p: Project) {
  const remaining = suggestions(p).length;
  const total = Math.max(p.reviewTotal ?? 0, remaining);
  return { remaining, total, reviewed: total - remaining };
}

/** Piezas aprobadas en Probar (una por tipo de pieza). */
export const approvedCount = (p: Project) => Object.values(p.applications?.stack?.approved ?? {}).filter(Boolean).length;

/** Por qué una etapa está bloqueada; null si se puede entrar. */
export function blockReason(p: Project, id: Moment): string | null {
  if (id === 'brief' || id === 'referencias') return null;
  if (!isAnalyzed(p)) return 'Se habilita al analizar';
  if ((id === 'sistema' || id === 'probar') && piecesIn(p, 1).length === 0) return 'Necesita al menos una pieza en Primario.';
  return null;
}

/** ¿Está completa? Referencias al analizar · Revisar sin sugerencias · Capas y Sistema al avanzar · Probar con una aprobada. */
export function isDone(p: Project, id: Moment): boolean {
  switch (id) {
    case 'brief':
      return hasBrief(p);
    case 'referencias':
      return isAnalyzed(p);
    case 'revisar':
      return isAnalyzed(p) && reviewProgress(p).remaining === 0;
    case 'capas':
    case 'sistema':
      return !!p.done?.includes(id);
    case 'probar':
      return approvedCount(p) > 0;
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Resumen de una etapa completa. */
export function summary(p: Project, id: Moment): string {
  switch (id) {
    case 'brief':
      return p.name.trim() || p.intent?.trim() || 'Completo';
    case 'referencias':
      return plural(corpusRefs(p).length, 'referencia', 'referencias');
    case 'revisar':
      return `${plural(livePieces(p).length, 'aceptada', 'aceptadas')} · ${plural(outPieces(p).length, 'descartada', 'descartadas')}`;
    case 'capas':
      return ([1, 2, 3] as Layer[]).map(l => `${SHEET_NAME[l]} ${piecesIn(p, l).length}`).join(' · ');
    case 'sistema':
      return 'Revisado';
    case 'probar':
      return plural(approvedCount(p), 'pieza aprobada', 'piezas aprobadas');
  }
}

export type RailState = 'current' | 'done' | 'pending' | 'blocked' | 'stale' | 'here';

export interface RailItem {
  id: Moment;
  label: string;
  num: number;
  state: RailState;
  /** Línea de estado (12px). */
  line: string;
  /** La línea va en mostaza. */
  warn?: boolean;
  /** Si está bloqueada, el motivo. */
  blocked: string | null;
}

/** Estado de cada ítem de la barra lateral. `current` es la etapa abierta. */
export function railItems(p: Project, current: Moment): RailItem[] {
  const cur = stepIndex(current);
  const reached = Math.max(p.reached ?? 0, cur);
  return STEPS.map((s, i) => {
    const blocked = blockReason(p, s.id);
    const base = { id: s.id, label: s.label, num: i, blocked };
    if (s.id === current) {
      const r = reviewProgress(p);
      const line = s.id === 'revisar' && r.total > 0 && r.remaining > 0 ? `${r.reviewed} de ${r.total} revisadas` : s.desc;
      return { ...base, state: 'current' as const, line };
    }
    if (blocked) return { ...base, state: 'blocked' as const, line: blocked };
    if (p.stale?.includes(s.id)) return { ...base, state: 'stale' as const, line: 'Cambiaste algo antes · revisalo', warn: true };
    if (i === reached && cur < reached) return { ...base, state: 'here' as const, line: 'Estabas acá', warn: true };
    if (isDone(p, s.id)) return { ...base, state: 'done' as const, line: summary(p, s.id) };
    if (s.id === 'revisar') {
      const r = reviewProgress(p);
      if (r.total > 0 && r.reviewed > 0) return { ...base, state: 'pending' as const, line: `${r.reviewed} de ${r.total} revisadas` };
    }
    return { ...base, state: 'pending' as const, line: s.desc };
  });
}

/** Línea de ubicación (centro de la barra superior). */
export function locationText(p: Project, current: Moment, detail?: string): string {
  const head = `Etapa ${stepIndex(current)} de ${STEPS.length - 1} · ${stepLabel(current)}`;
  switch (current) {
    case 'brief':
      return `${head} · ${hasBrief(p) ? p.name.trim() || 'sin nombre todavía' : 'antes de juntar referencias'}`;
    case 'referencias':
      return `${head} · ${plural(corpusRefs(p).length, 'referencia', 'referencias')} en el tablero`;
    case 'revisar': {
      const r = reviewProgress(p);
      return r.remaining ? `${head} · sugerencia ${r.reviewed + 1} de ${r.total}` : `${head} · todas revisadas`;
    }
    case 'capas':
      return `${head} · estás mirando ${detail ?? 'Primario'}`;
    case 'sistema':
      return `${head} · leyendo el resultado`;
    case 'probar':
      return `${head} · probando ${detail ?? 'logotipo'}`;
  }
}
