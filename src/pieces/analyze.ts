import { Pattern, Project } from '../types';
import { corpusRefs } from '../utils/layers';
import { cropImage } from '../utils/parts';
import { compressImageString } from '../utils/imageCompressor';
import { SplitPart, coverFrom, livePieces } from './model';

export type AnalysisState =
  | { status: 'idle' }
  | { status: 'preparing'; done: number; total: number }
  | { status: 'reading'; total: number; since: number }
  | { status: 'error'; message: string; detail?: string };

/** ¿La imagen se puede abrir? Una imagen dañada no se manda al agente. */
export function canOpen(src: string): Promise<boolean> {
  return new Promise(resolve => {
    if (!src) return resolve(false);
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

/**
 * Pedido de análisis: todas las referencias en una sola llamada. La IA devuelve las piezas ya juntadas,
 * con su evidencia, una hoja sugerida y un recorte de ejemplo. `onProgress` informa la preparación
 * (comprimir cada imagen), que es la parte que se puede medir.
 */
export async function buildAnalysisBody(p: Project, onProgress: (done: number, total: number) => void, signal?: AbortSignal) {
  const refs = corpusRefs(p);
  const references = [];
  /** Imágenes que no se pudieron leer: se saltean y se avisa. */
  const skipped: string[] = [];
  for (let i = 0; i < refs.length; i++) {
    if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError');
    onProgress(i, refs.length);
    const r = refs[i];
    if (!(await canOpen(r.image))) {
      skipped.push(r.id);
      continue;
    }
    references.push({ id: r.id, name: r.name, notes: r.notes, image: await compressImageString(r.image, { maxWidth: 1024, maxHeight: 1024, quality: 0.8 }) });
  }
  onProgress(refs.length, refs.length);

  // Las piezas del diseñador se mandan como definición (con su recorte): la IA las busca en todas las referencias.
  const own = livePieces(p).filter(x => x.origin === 'user');
  const stackPatterns = await Promise.all(
    own.map(async x => {
      const ref = x.cover ? p.references.find(r => r.id === x.cover!.refId) : undefined;
      let image: string | undefined;
      if (ref) {
        try {
          image = x.cover?.crop ? (await cropImage(ref.image, [x.cover.crop]))[0].image : ref.image;
          image = await compressImageString(image, { maxWidth: 512, maxHeight: 512, quality: 0.8 });
        } catch {
          image = undefined;
        }
      }
      return { id: x.id, name: x.name, layer: x.layer ?? null, description: x.description, evidence: x.evidence, fragments: ref ? [{ refId: ref.id, label: x.name, type: x.category, image }] : [] };
    }),
  );
  const ownIds = new Set(own.map(x => x.id));
  return {
    skipped,
    references,
    projectName: p.name,
    objective: p.objective,
    // La frase acompaña al objetivo como contexto (el brief y la descripción se unificaron en el objetivo).
    description: p.intent || '',
    previousPatterns: p.patterns,
    confirmedPatterns: p.patterns.filter(x => x.confirmed && !ownIds.has(x.id)),
    discardedPatterns: p.patterns.filter(x => x.status === 'discarded'),
    feedback: p.feedback,
    designerGroups: [],
    stackPatterns,
  };
}

/** Mensaje simple para un error de análisis; el detalle técnico va aparte. */
export function friendlyError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes('gemini_api_key')) return 'Falta la clave del servicio de análisis (GEMINI_API_KEY) en el archivo .env del servidor.';
  if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('npm run server')) return 'No se pudo conectar con el servidor. ¿Está abierto iniciar.bat?';
  if (m.includes('quota') || m.includes('429')) return 'El análisis está saturado o se acabó la cuota. Probá de nuevo en un rato.';
  return 'No se pudo analizar. Revisá la conexión con el servidor.';
}

/** Pide a la IA cómo separar una pieza (solo propone). */
export async function requestSplit(p: Project, piece: Pattern): Promise<SplitPart[]> {
  const refs = piece.evidence.map(id => p.references.find(r => r.id === id)).filter((r): r is NonNullable<typeof r> => !!r).slice(0, 12);
  const references = await Promise.all(refs.map(async r => ({ id: r.id, image: await compressImageString(r.image, { maxWidth: 768, maxHeight: 768, quality: 0.8 }) })));
  const res = await fetch('/api/split-piece', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ piece: { name: piece.name, description: piece.description }, references }),
  });
  const text = await res.text();
  let result: any;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(text.trim().startsWith('<') ? 'El servidor corre una versión anterior: reiniciá iniciar.bat.' : `HTTP ${res.status}`);
  }
  if (!res.ok || !result.success) throw new Error(result.details || result.error || 'Error');
  const known = new Set(refs.map(r => r.id));
  const parts: SplitPart[] = (result.data?.pieces ?? [])
    .map((d: any) => ({
      name: String(d?.name || 'Parte'),
      description: d?.description ? String(d.description) : undefined,
      evidence: Array.isArray(d?.evidence) ? [...new Set(d.evidence.map(String).filter((id: string) => known.has(id)))] : [],
      cover: coverFrom(d, known),
    }))
    .filter((x: SplitPart) => x.evidence.length);
  if (parts.length < 2) throw new Error('No se encontró una división clara para esta pieza.');
  return parts as SplitPart[];
}
