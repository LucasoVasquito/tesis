import { Moment, Project } from '../types';
import { SHEET_NAME, livePieces, outPieces, piecesIn, suggestions } from '../pieces/model';
import { approvedCount, isAnalyzed, stepLabel } from './steps';
import { corpusRefs } from './layers';

/** Tandas con variantes generadas en Probar. */
const roundCount = (p: Project) => (p.applications?.stack?.rounds ?? []).filter(r => r.pieces.length > 0).length;
/** ¿Ya hay variantes de la pieza que se está probando? (lo anterior a «Probar otra pieza» no cuenta) */
const hasRounds = (p: Project) => roundCount(p) > (p.probarBase?.rounds ?? 0);
/** ¿Ya se aprobó la pieza que se está probando? */
const hasApproved = (p: Project) => Object.values(p.applications?.stack?.approved ?? {}).some(id => !!id && !(p.probarBase?.approved ?? []).includes(id));

/**
 * La mesa despejada (v6): cada etapa se divide en subpasos; cada subpaso responde una sola pregunta
 * y tiene una sola acción principal. Las etapas que todavía no se dividieron tienen un único subpaso (sin riel).
 */

export interface Substep {
  id: string;
  /** Nombre corto en el riel y en las migas. */
  label: string;
  /** La pregunta: título de la mesa. */
  question: string;
}

export const SUBSTEPS: Record<Moment, Substep[]> = {
  brief: [
    { id: 'nombre', label: 'Nombre', question: '¿Cómo se llama?' },
    { id: 'frase', label: 'Frase', question: '¿Qué es, en una frase?' },
    { id: 'objetivo', label: 'Objetivo', question: '¿Qué querés lograr?' },
    { id: 'resumen', label: 'Resumen', question: '¿Está bien así?' },
  ],
  // Una sola pantalla: el lienzo. Se suelta, se ordena y se agrupa ahí; el análisis aparece encima, en un panel.
  referencias: [{ id: 'lienzo', label: 'Referencias', question: 'Tus referencias' }],
  revisar: [
    { id: 'sugerencias', label: 'Sugerencias', question: 'Sugerencia' },
    { id: 'decidido', label: 'Piezas revisadas', question: 'Piezas revisadas' },
  ],
  // Capas queda como el recorrido en profundidad (una sola pantalla, sin subpasos).
  capas: [{ id: 'capas', label: 'Capas', question: 'Capas' }],
  sistema: [
    { id: 'paleta', label: 'Paleta', question: 'Paleta' },
    { id: 'tipografia', label: 'Tipografía', question: 'Tipografía' },
    { id: 'primario', label: 'Primario', question: 'Primario' },
    { id: 'secundario', label: 'Secundario', question: 'Secundario' },
    { id: 'acento', label: 'Acento', question: 'Acento' },
    { id: 'reglas', label: 'Reglas', question: 'Reglas' },
    { id: 'exportar', label: 'Exportar', question: 'Exportar' },
  ],
  probar: [
    { id: 'pieza', label: 'Pieza', question: '¿Qué querés probar?' },
    { id: 'pedido', label: 'Pedido', question: '¿Qué dice y qué pedís?' },
    { id: 'comparar', label: 'Comparar', question: 'Compará' },
    { id: 'listo', label: 'Listo', question: 'Listo' },
  ],
  // Una sola pantalla: la bitácora de lo que hicieron otras IA u otros diseñadores.
  resultados: [{ id: 'resultados', label: 'Resultados', question: 'Resultados' }],
};

export const substepCount = (m: Moment) => SUBSTEPS[m].length;
export const clampSub = (m: Moment, i: number) => Math.max(0, Math.min(substepCount(m) - 1, Number.isInteger(i) ? i : 0));
/** Subpaso guardado de una etapa (memoria de lugar). */
export const savedSub = (p: Project, m: Moment) => clampSub(m, p.substep?.[m] ?? 0);

/** ¿Está hecho el subpaso? */
export function subDone(p: Project, m: Moment, i: number): boolean {
  if (m === 'brief') {
    if (i === 0) return !!p.name.trim();
    if (i === 1) return !!p.intent?.trim();
    if (i === 2) return !!p.objective.trim();
    return !!(p.name.trim() && p.intent?.trim() && p.objective.trim());
  }
  if (m === 'revisar') {
    if (i === 0) return isAnalyzed(p) && suggestions(p).length === 0;
    return !!p.done?.includes('revisar');
  }
  if (m === 'referencias') return isAnalyzed(p);
  if (m === 'probar') return i === 2 ? hasRounds(p) : i === 3 ? hasApproved(p) : !!p.subVisited?.probar?.includes(i);
  // Las demás: un subpaso está hecho cuando ya se pasó por él.
  return !!p.subVisited?.[m]?.includes(i);
}

/** Por qué no se puede entrar a un subpaso (null si se puede). */
export function subBlocked(p: Project, m: Moment, i: number): string | null {
  if (m === 'revisar' && i === 0 && isAnalyzed(p) && suggestions(p).length === 0) return 'Ya revisaste todas las sugerencias.';
  if (m === 'probar' && i === 2 && !hasRounds(p)) return 'Generá variantes primero.';
  if (m === 'probar' && i === 3 && !hasApproved(p)) return 'Aprobá una variante primero.';
  return null;
}

/** Resumen de una línea de un subpaso hecho (al pasar el mouse por el riel). */
export function subSummary(p: Project, m: Moment, i: number): string {
  if (m === 'brief') return [p.name.trim(), p.intent?.trim(), p.objective.trim()][Math.min(i, 2)]?.slice(0, 80) || '';
  if (m === 'revisar') {
    const accepted = livePieces(p).filter(x => !suggestions(p).includes(x)).length;
    return `${accepted} aceptadas · ${outPieces(p).length} descartadas`;
  }
  if (m === 'referencias') return i === 0 ? `${corpusRefs(p).length} imágenes` : `${livePieces(p).length} patrones`;
  if (m === 'probar' && i === 3) return `${approvedCount(p)} aprobadas`;
  if (m === 'sistema' && i >= 2 && i <= 4) {
    const l = (i - 1) as 1 | 2 | 3;
    const n = piecesIn(p, l).length;
    return `${SHEET_NAME[l]} · ${n} ${n === 1 ? 'pieza' : 'piezas'}`;
  }
  return '';
}

/** Migas: «Capas › Secundario» (sin subpaso si la etapa tiene uno solo). */
export const crumbs = (m: Moment, i: number) => (substepCount(m) > 1 ? `${stepLabel(m)} › ${SUBSTEPS[m][clampSub(m, i)].label}` : stepLabel(m));
