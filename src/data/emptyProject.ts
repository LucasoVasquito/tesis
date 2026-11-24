import { Project } from '../types';
import { SCHEMA } from '../utils/project';

/** Proyecto vacío: arranca en 0 · Brief, con todo en blanco. */
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
    schema: SCHEMA,
    intent: '',
    brief: '',
    fragments: [],
    view: 'side',
    moment: 'brief',
  };
}
