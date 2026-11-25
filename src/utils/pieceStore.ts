/**
 * Imágenes de las piezas generadas, guardadas en IndexedDB (no entran en localStorage: pesan varios MB).
 * La clave es `${projectId}/${pieceId}`; el proyecto guarda solo los datos de cada pieza.
 */
const DB_NAME = 'emergent_pieces';
const STORE = 'images';

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return db().then(
    d =>
      new Promise((resolve, reject) => {
        const t = d.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        t.oncomplete = () => resolve(req ? (req.result as T) : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

const key = (projectId: string, pieceId: string) => `${projectId}/${pieceId}`;

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

/**
 * Pasa la imagen a WebP (hasta 2048 px de lado) si así pesa menos. Las piezas generadas y los resultados importados
 * llegan en PNG o JPEG de varios MB; en WebP pesan una fracción y se ven igual. GIF y SVG se dejan como están.
 */
async function shrinkImage(blob: Blob): Promise<Blob> {
  if (!/^image\/(png|jpeg|bmp)$/.test(blob.type)) return blob;
  try {
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bmp.width * k));
    canvas.height = Math.max(1, Math.round(bmp.height * k));
    canvas.getContext('2d')?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const out = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.9));
    return out && out.type === 'image/webp' && out.size < blob.size ? out : blob;
  } catch {
    return blob;
  }
}

/** Guarda la imagen de una pieza (data URL, blob: o http). */
export async function savePieceImage(projectId: string, pieceId: string, src: string): Promise<void> {
  try {
    const blob = await shrinkImage(await dataUrlToBlob(src));
    await tx('readwrite', s => s.put(blob, key(projectId, pieceId)));
  } catch (e) {
    console.warn('No se pudo guardar la imagen de la pieza', pieceId, e);
  }
}

const urlCache = new Map<string, string>();

/** URL para mostrar la imagen guardada (object URL, en caché). null si no está. */
export async function loadPieceImage(projectId: string, pieceId: string): Promise<string | null> {
  const k = key(projectId, pieceId);
  const cached = urlCache.get(k);
  if (cached) return cached;
  try {
    const blob = await tx<Blob>('readonly', s => s.get(k));
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urlCache.set(k, url);
    return url;
  } catch {
    return null;
  }
}

/** Cualquier URL de imagen → data URL (para mandarla al servidor). */
export async function toDataUrl(src: string): Promise<string> {
  if (src.startsWith('data:')) return src;
  const blob = await (await fetch(src)).blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Borra las imágenes de un proyecto (al eliminarlo). */
export async function deleteProjectPieces(projectId: string): Promise<void> {
  try {
    await tx('readwrite', s => s.delete(IDBKeyRange.bound(`${projectId}/`, `${projectId}/￿`)));
    for (const k of [...urlCache.keys()]) if (k.startsWith(`${projectId}/`)) urlCache.delete(k);
  } catch (e) {
    console.warn('No se pudieron borrar las imágenes del proyecto', e);
  }
}

/** Todas las imágenes de piezas de un proyecto, como data URLs (para el respaldo). */
export async function exportProjectPieces(projectId: string): Promise<Record<string, string>> {
  const d = await db();
  const entries: [string, Blob][] = await new Promise((resolve, reject) => {
    const out: [string, Blob][] = [];
    const t = d.transaction(STORE, 'readonly');
    const req = t.objectStore(STORE).openCursor(IDBKeyRange.bound(`${projectId}/`, `${projectId}/￿`));
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return resolve(out);
      out.push([String(cur.key).slice(projectId.length + 1), cur.value as Blob]);
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
  const result: Record<string, string> = {};
  for (const [id, blob] of entries) result[id] = await blobToDataUrl(blob);
  return result;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
