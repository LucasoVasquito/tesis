import { Project } from '../types';
import { restoreBackup } from './backup';

export const DEMO_ID = 'proj_demo_badder';
/** El ejemplo actual (Badder) y el anterior (Badder Hamburguesería): quien ya había abierto el anterior pasa al nuevo. */
export const EXAMPLE_ID = 'proj_1795292408137';
export const OLD_EXAMPLE_ID = 'proj_mvss64wg00';

/**
 * El ejemplo se abre desde el principio, en el primer paso del Brief: quien lo mira lo recorre hacia adelante
 * (todo está hecho y marcado ✓) y puede volver atrás cuando quiera. Para abrirlo en otra pantalla, cambiá `moment`.
 */
export const asExample = (p: Project): Project => ({ ...p, example: true, moment: 'brief', substep: { ...(p.substep ?? {}), brief: 0 } });
export const demoRequested = () => {
  try {
    return new URLSearchParams(location.search).get('demo') === 'badder';
  } catch {
    return false;
  }
};

/** Proyecto de ejemplo Badder para testeo: 11 referencias reales, sin analizar, igual para todos. */
export async function buildDemo(backupText: string): Promise<Project> {
  const { project } = await restoreBackup(backupText, []);
  const refs = project.references.filter(r => !r.parentId).slice(0, 11).map(r => ({ ...r, board: undefined, breakdown: undefined, broken: undefined, layer: null, origin: undefined, confirmed: undefined, position: undefined, isNew: true }));
  return {
    ...project,
    id: DEMO_ID,
    example: true,
    moment: 'referencias',
    references: refs,
    patterns: [],
    patternGroups: undefined,
    systems: [],
    suggestedSystems: [],
    fragments: [],
    log: [],
    feedback: [],
    applications: {},
    status: 'draft',
    lastAnalyzedAt: undefined,
    layerColors: undefined,
    reached: 0,
    done: undefined,
    visited: undefined,
    stale: undefined,
    reviewTotal: undefined,
  };
}
