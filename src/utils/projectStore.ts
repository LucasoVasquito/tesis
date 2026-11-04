import { Project } from '../types';

/**
 * Proyectos guardados en IndexedDB (cientos de MB). localStorage tiene ~5 MB y un proyecto
 * con 40 referencias ya no entra. La primera vez se migra lo que había en localStorage.
 */
const DB_NAME = 'tesis_projects';
const STORE = 'projects';
const META = 'meta';

/** Claves heredadas (cuando la app se llamaba Emergent). */
const LEGACY_LIST = 'emergent_projects_list_v5';
const LEGACY_ACTIVE = 'emergent_active_project_v5';

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
        req.result.createObjectStore(META);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return db().then(
    d =>
      new Promise((resolve, reject) => {
        const t = d.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => resolve(req ? (req.result as T) : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export interface StoredState {
  projects: Project[];
  activeId: string | null;
}

/** Lee los proyectos. Si IndexedDB está vacío, trae (una sola vez) los de localStorage. */
export async function loadStoredProjects(): Promise<StoredState> {
  const projects = (await run<Project[]>(STORE, 'readonly', s => s.getAll())) ?? [];
  const activeId = (await run<string>(META, 'readonly', s => s.get('active'))) ?? null;
  if (projects.length) return { projects, activeId };
  try {
    const raw = localStorage.getItem(LEGACY_LIST);
    if (raw) {
      const legacy = JSON.parse(raw);
      if (Array.isArray(legacy) && legacy.length) {
        const active = localStorage.getItem(LEGACY_ACTIVE);
        await saveProjects(legacy, active);
        localStorage.removeItem(LEGACY_LIST);
        localStorage.removeItem(LEGACY_ACTIVE);
        return { projects: legacy, activeId: active };
      }
    }
  } catch (e) {
    console.warn('No se pudieron migrar los proyectos de localStorage', e);
  }
  return { projects: [], activeId: null };
}

/**
 * Guarda los proyectos y borra los que ya no están. `changed` limita la escritura a los que
 * cambiaron (un proyecto con muchas imágenes pesa decenas de MB).
 */
export async function saveProjects(projects: Project[], activeId: string | null, changed?: Set<string>): Promise<void> {
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const t = d.transaction([STORE, META], 'readwrite');
    const s = t.objectStore(STORE);
    const keep = new Set(projects.map(p => p.id));
    const keysReq = s.getAllKeys();
    keysReq.onsuccess = () => {
      (keysReq.result as string[]).filter(k => !keep.has(k)).forEach(k => s.delete(k));
      projects.filter(p => !changed || changed.has(p.id)).forEach(p => s.put(p));
    };
    t.objectStore(META).put(activeId, 'active');
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
