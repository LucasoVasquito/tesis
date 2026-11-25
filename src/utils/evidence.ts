import { CropBox, Pattern, Project, Reference } from '../types';
import { livePieces } from '../pieces/model';
import { piecesNamedIn } from './structure';

/** El recorte de una referencia: lo que marcó la IA; si no, el de la portada o el de un fragmento de la pieza. */
export function cropFor(piece: Pattern, project: Project, refId: string): CropBox | undefined {
  const located = piece.evidenceCrops?.[refId];
  if (located) return located;
  if (located === null) return undefined;
  if (piece.cover?.refId === refId && piece.cover.crop) return piece.cover.crop;
  const frag = (project.fragments ?? []).find(f => f.refId === refId && ((piece.fragmentIds ?? []).includes(f.id) || f.groupId === piece.id));
  return frag?.crop;
}

/** Evidencia de una pieza: cada referencia con su recorte (sin recorte = entera). */
export const pieceEvidence = (piece: Pattern, project: Project): { ref: Reference; crop?: CropBox }[] =>
  piece.evidence
    .map(id => project.references.find(r => r.id === id))
    .filter((r): r is Reference => !!r && !!r.image)
    .map(ref => ({ ref, crop: cropFor(piece, project, ref.id) }));

/**
 * Piezas de las que habla una regla de uso: las que devolvió el agente (`names`) o, para las del diseñador,
 * las que nombra el texto (hasta dos).
 */
export function ruleTargets(project: Project, text: string, names?: string[]): Pattern[] {
  const placed = livePieces(project).filter(x => x.layer);
  const found = names?.length ? names.map(n => placed.find(x => x.name === n)).filter((x): x is Pattern => !!x) : [];
  return found.length ? found : piecesNamedIn(project, text).slice(0, 2);
}
