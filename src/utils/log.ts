import { FeedbackItem, LogItem, Project } from '../types';

export const FEEDBACK_TYPE_LABEL: Record<FeedbackItem['type'], string> = {
  designer_rule: 'Regla del diseñador',
  scope_refinement: 'Ajuste de alcance',
  reference_exclusion: 'Exclusión de referencia',
  pattern_rejection: 'Rechazo de patrón',
};

/** Bitácora completa: entradas del log más el feedback que no tenga entrada propia (proyectos anteriores). */
export function mergedLog(project: Project): LogItem[] {
  const log = project.log ?? [];
  const linked = new Set(log.map(l => l.feedbackId).filter(Boolean));
  const fromFeedback: LogItem[] = project.feedback
    .filter(f => !linked.has(f.id))
    .map(f => ({
      id: f.id,
      at: f.createdAt,
      kind: f.type === 'pattern_rejection' ? 'discard' : 'feedback',
      targetId: f.patternId || f.referenceId || 'proyecto',
      label: FEEDBACK_TYPE_LABEL[f.type],
      reason: f.comment,
      feedbackId: f.id,
    }));
  return [...log, ...fromFeedback].sort((a, b) => b.at.localeCompare(a.at));
}
