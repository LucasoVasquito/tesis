import { Pattern, Project, Reference } from '../types';
import { corpusRefs } from './layers';
import { livePieces } from '../pieces/model';

/** Cuántas referencias se miran para leer la estructura (cada una viaja como imagen). */
export const STRUCTURE_MAX_REFS = 12;

/**
 * Referencias para leer la estructura: primero las que sostienen más piezas ubicadas
 * (pesa el doble si la pieza está en el Primario), después el resto del corpus.
 */
export function structureRefs(p: Project): Reference[] {
  const weight = new Map<string, number>();
  for (const x of livePieces(p)) {
    if (!x.layer) continue;
    for (const id of x.evidence) weight.set(id, (weight.get(id) ?? 0) + (x.layer === 1 ? 2 : 1));
  }
  return corpusRefs(p)
    .filter(r => r.image)
    .map((r, i) => ({ r, i, w: weight.get(r.id) ?? 0 }))
    .sort((a, b) => b.w - a.w || a.i - b.i)
    .slice(0, STRUCTURE_MAX_REFS)
    .map(x => x.r);
}

/** Firma: si cambian las referencias, las piezas ubicadas, el límite o las reglas del usuario, la estructura se vuelve a leer. */
export const structureSig = (p: Project) =>
  [
    `b:${p.boundary ?? 'closed'}`,
    ...(p.structureSheet?.userRules ?? []).map(r => `s:${r}`),
    ...(p.systemSheet?.userRules ?? []).map(r => `u:${r}`),
    ...livePieces(p)
      .filter(x => x.layer)
      .map(x => `${x.id}:${x.layer}:${x.name}`)
      .sort(),
    ...structureRefs(p)
      .map(r => `${r.id}:${r.image.length}`)
      .sort(),
  ].join('|');

/* ---------- ¿De qué lado es una regla? (aviso, nunca se mueve sola) ---------- */

const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Palabras de los nombres que no identifican un elemento: aparecen en cualquier pieza. */
const GENERIC = new Set(['tipografia', 'tipografica', 'estilo', 'efecto', 'estructura', 'elementos', 'elemento', 'composicion', 'color', 'colores', 'tratamiento', 'recurso', 'sistema', 'grafico', 'grafica', 'de', 'del', 'con', 'sin', 'para', 'los', 'las', 'una', 'uso']);
/** Hablan de la pieza entera: espacio, escala, niveles, ubicación. */
const STRUCTURAL = /\b(plano|bordes?|margen(es)?|perimetro|centro|centrad|esquinas?|laterales?|aire|vaci[oa]|saturad|densidad|denso|a sangre|escala|tamanos?|niveles?|jerarquia|columnas?|reticula|grilla|alinead|superpuest|se lee primero)/;

/** Raíces de los nombres de las piezas ubicadas («Marcos de alambre» → marco, alamb…). */
function pieceStems(p: Project): string[] {
  const stems = new Set<string>();
  for (const x of livePieces(p)) {
    if (!x.layer) continue;
    for (const w of norm(x.name).split(/[^a-z0-9]+/)) if (w.length >= 4 && !GENERIC.has(w)) stems.add(w.slice(0, 5));
  }
  return [...stems];
}
const namesPiece = (p: Project, text: string) => {
  const words = norm(text).split(/[^a-z0-9]+/).filter(w => w.length >= 4);
  return pieceStems(p).some(s => words.some(w => w.startsWith(s)));
};

/** Piezas ubicadas que nombra un texto (por las raíces de su nombre), la que más coincide primero. */
export function piecesNamedIn(p: Project, text: string): Pattern[] {
  const words = norm(text).split(/[^a-z0-9]+/).filter(w => w.length >= 4);
  return livePieces(p)
    .filter(x => x.layer)
    .map(x => {
      const stems = [...new Set(norm(x.name).split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !GENERIC.has(w)).map(w => w.slice(0, 5)))];
      return { x, hits: stems.filter(s => words.some(w => w.startsWith(s))).length };
    })
    .filter(r => r.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .map(r => r.x);
}

/** Regla escrita en Reglas que parece de Estructura: habla de la pieza entera y no nombra ningún elemento. */
export const looksStructural = (p: Project, text: string) => STRUCTURAL.test(norm(text)) && !namesPiece(p, text);
/** Regla escrita en Estructura que parece de uso: nombra un elemento y no dice nada de la pieza entera. */
export const looksUsage = (p: Project, text: string) => namesPiece(p, text) && !STRUCTURAL.test(norm(text));

/** Todas las reglas de estructura, las del diseñador primero. */
export const structureRules = (p: Project): { text: string; source: 'usuario' | 'agente'; refIds: string[] }[] => [
  ...(p.structureSheet?.userRules ?? []).map(text => ({ text, source: 'usuario' as const, refIds: [] as string[] })),
  ...(p.structureSheet?.rules ?? []).map(r => ({ text: r.text, source: 'agente' as const, refIds: r.refIds })),
].filter(r => r.text.trim());
