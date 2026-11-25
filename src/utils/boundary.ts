import { SystemBoundary } from '../types';
import COPY from './boundaryCopy.json';

export interface BoundaryInfo {
  id: SystemBoundary;
  label: string;
  /** Descripción corta para la interfaz. */
  short: string;
  /** Cierre del prompt exportado (Exportar → Prompt / JSON). */
  exportPrompt: string;
  /** Línea de restricción para Probar (en inglés, igual que el resto de buildProbarPrompt). */
  probarLine: string;
  /** Contexto para las IA que redactan Reglas de uso y Estructura. */
  aiContext: string;
  /** Instrucción sobre con qué se llena el espacio al leer Estructura. */
  structureFillRule: string;
}

/** Los textos viven en boundaryCopy.json: los lee la app y también el servidor (un solo lugar para editarlos). */
const ORDER: SystemBoundary[] = ['closed', 'open_type', 'open'];
export const BOUNDARIES: BoundaryInfo[] = ORDER.map(id => ({ id, ...(COPY as Record<SystemBoundary, Omit<BoundaryInfo, 'id'>>)[id] }));

export const DEFAULT_BOUNDARY: SystemBoundary = 'closed';

export const boundaryInfo = (b?: SystemBoundary | null): BoundaryInfo =>
  BOUNDARIES.find(x => x.id === b) ?? BOUNDARIES[0];

const norm = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/**
 * Detecta si una regla escrita por el diseñador habla en realidad del límite del sistema
 * (qué puede entrar desde afuera) y propone a qué valor del selector conviene pasarla.
 * Devuelve null si es una regla normal de uso o de estructura.
 */
export function detectBoundaryRule(text: string): SystemBoundary | null {
  const t = norm(text).trim();
  if (!t) return null;

  const touchesBoundary =
    /\b(ajenos?|ajenas?|fuera del sistema|de afuera|extern[oa]s?|sistema cerrad[oa]|sistema abiert[oa]|nada de afuera)\b/.test(t) ||
    /\b(elementos?|recursos?|tipograf[ií]as?|fuentes?|letras?|colores?|im[aá]genes?)\s+(nuev[oa]s?|ajenos?|ajenas?|extern[oa]s?)\b/.test(t) ||
    /\b(nuev[oa]s?|ajenos?|ajenas?|extern[oa]s?)\s+(elementos?|recursos?|tipograf[ií]as?|fuentes?|letras?|colores?|im[aá]genes?)\b/.test(t) ||
    /\b(otras?\s+tipograf[ií]as?|otros?\s+estilos?\s+(tipograf|de letra)|letras?\s+de\s+otros?\s+estilos?)\b/.test(t) ||
    (/\bsistema\b/.test(t) && /\b(solo\s+(los\s+)?recursos|solo\s+lo\s+del\s+sistema|entra\s+lo\s+que\s+haga\s+falta|no\s+entra\s+nada)\b/.test(t));

  if (!touchesBoundary) return null;

  const mentionsType = /\b(tipograf[a-z]*|letras?|fuentes?)\b/.test(t);
  const forbidsAll =
    /\b(?:no\s+(?:agreg|sum|us|inclu|met|incorpor|permit)[a-z]*|nada\s+de\s+afuera|nada\s+ajeno|solo\s+(?:usar\s+|con\s+)?(?:los\s+)?recursos\s+del\s+sistema|solo\s+lo\s+del\s+sistema|sistema\s+cerrad[oa]|no\s+entra\s+nada)\b/.test(
      t,
    );

  // "Se pueden sumar tipografías..., nunca colores ni imágenes" o "...colores e imágenes nuevas, nunca" → open_type.
  const forbidsNonTypeOnly =
    mentionsType &&
    (/\b(nunca|no|jamas)\b[^.;]*\b(colores?|imagenes?|fotos?|ilustraciones?)\b/.test(t) ||
      /\b(colores?|imagenes?|fotos?|ilustraciones?)\b[^.;]*\b(nunca|jamas)\b/.test(t));

  if (forbidsNonTypeOnly) return 'open_type';
  if (forbidsAll) return 'closed';

  const allowsNewMedia =
    /\b(colores?|imagenes?|fotos?|ilustraciones?)\s+(nuev[oa]s?|ajenos?|ajenas?|extern[oa]s?|otr[oa]s?)\b/.test(t) ||
    /\b(cualquier\s+(recurso|elemento)|entra\s+lo\s+que\s+haga\s+falta)\b/.test(t);

  if (mentionsType && !allowsNewMedia) return 'open_type';

  return 'open';
}
