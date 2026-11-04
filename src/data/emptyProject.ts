import { Project } from '../types';

/** Proyecto vacío: nombre y objetivo en blanco para que arranque en la Etapa 1 (Brief). */
export function createEmptyProject(): Project {
  return {
    id: `proj_${Date.now()}`,
    name: '',
    objective: '',
    description: '',
    status: 'draft',
    createdAt: new Date().toISOString(),
    feedback: [],
    systems: [],
    patterns: [],
    references: [],
    suggestedSystems: [],
    log: [],
  };
}
