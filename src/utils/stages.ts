import { Project, VisitableStage } from '../types';
import type { StageRailItem } from '../components/ui';

export const MIN_REFERENCES = 3;

export const STAGE_ORDER: VisitableStage[] = ['brief', 'corpus', 'audit', 'synthesis', 'application'];

export const STAGE_LABEL: Record<VisitableStage | 'induction', string> = {
  brief: 'Brief',
  corpus: 'Corpus',
  induction: 'Inducción',
  audit: 'Auditoría',
  synthesis: 'Síntesis',
  application: 'Aplicación',
};

export const isBriefComplete = (p: Project) => !!p.name.trim() && !!p.objective.trim();
const confirmedCount = (p: Project) => p.patterns.filter(x => x.status === 'confirmed').length;

/** Etapa que corresponde al estado del proyecto. */
export function deriveStage(p: Project): VisitableStage {
  if (!isBriefComplete(p)) return 'brief';
  if (p.patterns.length === 0) return 'corpus';
  if (p.patterns.some(x => x.status === 'detected')) return 'audit';
  return 'synthesis';
}

/** Requisito pendiente para entrar a una etapa, o null si ya se puede. */
export function stageRequirement(p: Project, stage: VisitableStage): string | null {
  switch (stage) {
    case 'brief':
      return null;
    case 'corpus':
      return isBriefComplete(p) ? null : 'Completá el nombre y el objetivo del brief';
    case 'audit':
      if (!isBriefComplete(p)) return 'Completá el brief';
      return p.patterns.length > 0 ? null : `Inducí patrones desde el corpus (mínimo ${MIN_REFERENCES} referencias)`;
    case 'synthesis':
      if (!isBriefComplete(p)) return 'Completá el brief';
      return confirmedCount(p) > 0 || p.systems.length > 0 ? null : 'Necesitás al menos 1 patrón confirmado';
    case 'application':
      if (!isBriefComplete(p)) return 'Completá el brief';
      return p.systems.length > 0 ? null : 'Creá o adoptá un sistema en Síntesis';
  }
}

export const canEnter = (p: Project, s: VisitableStage) => stageRequirement(p, s) === null;

/** Etapa inicial al abrir un proyecto: la guardada, si sigue siendo válida; si no, la derivada. */
export function initialStage(p: Project): VisitableStage {
  if (p.uiStage && canEnter(p, p.uiStage)) return p.uiStage;
  return deriveStage(p);
}

/** Ítems del riel de etapas. */
export function railItems(p: Project, current: VisitableStage, inducing: boolean): StageRailItem[] {
  const idx = (s: VisitableStage) => STAGE_ORDER.indexOf(s);
  const cur = idx(current);
  const item = (s: VisitableStage, num: string): StageRailItem => {
    const req = stageRequirement(p, s);
    let state: StageRailItem['state'];
    if (s === current) state = 'current';
    else if (req) state = 'locked';
    else state = idx(s) < cur ? 'done' : 'available';
    // La inducción no es una etapa: es la transición de Corpus a Auditoría y se ve en Corpus mientras corre.
    const label = inducing && s === 'corpus' ? 'Induciendo…' : STAGE_LABEL[s];
    return { id: s, num, label, state, requirement: req ?? undefined };
  };
  return [item('brief', '01'), item('corpus', '02'), item('audit', '03'), item('synthesis', '04'), item('application', '05')];
}
