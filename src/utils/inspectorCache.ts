/**
 * Caché en localStorage de los desgloses individuales (inspector de referencia).
 * La clave incluye el proyecto: el mismo ID (ref_01) puede existir en varios proyectos.
 */
import { ReferenceBreakdown } from '../types';

const CACHE_PREFIX = 'emergent_ref_breakdown_v2_';
const keyFor = (projectId: string, refId: string) => `${CACHE_PREFIX}${projectId}_${refId}`;

export function getCachedBreakdown(projectId: string, refId: string): ReferenceBreakdown | null {
  try {
    const raw = localStorage.getItem(keyFor(projectId, refId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.data ?? null;
  } catch (err) {
    console.warn('Error leyendo el caché del desglose:', refId, err);
    return null;
  }
}

export function setCachedBreakdown(projectId: string, refId: string, data: ReferenceBreakdown): void {
  try {
    localStorage.setItem(keyFor(projectId, refId), JSON.stringify({ data, cachedAt: new Date().toISOString() }));
  } catch (err) {
    console.warn('Error guardando el caché del desglose:', refId, err);
  }
}

export function clearCachedBreakdown(projectId: string, refId: string): void {
  try {
    localStorage.removeItem(keyFor(projectId, refId));
  } catch {
    /* noop */
  }
}

export function clearBreakdownCache(): void {
  try {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(CACHE_PREFIX) || key.startsWith('emergent_ref_breakdown_v1_')) localStorage.removeItem(key);
    });
  } catch (err) {
    console.warn('Error limpiando el caché de desgloses:', err);
  }
}

/** Borra los desgloses en caché de un proyecto. */
export function clearProjectBreakdowns(projectId: string): void {
  try {
    const prefix = `${CACHE_PREFIX}${projectId}_`;
    Object.keys(localStorage).forEach(key => key.startsWith(prefix) && localStorage.removeItem(key));
  } catch {
    /* noop */
  }
}
