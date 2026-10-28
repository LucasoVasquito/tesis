import { Project } from '../types';
import { exportProjectPieces, savePieceImage, toDataUrl } from './pieceStore';
import { migrateProject, uid } from './project';

/**
 * Respaldo completo de un proyecto en un solo archivo: el proyecto (referencias, partes, grupos,
 * patrones, sistemas, bitácora, todo lo generado en Aplicación) y las imágenes de las piezas,
 * que viven aparte en IndexedDB. Las referencias que vienen de una web se intentan incluir.
 */
export interface ProjectBackup {
  format: 'emergent-backup';
  version: 1;
  exportedAt: string;
  project: Project;
  pieceImages: Record<string, string>;
}

const slug = (s: string) =>
  (s || 'proyecto')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48) || 'proyecto';

export async function buildBackup(project: Project): Promise<{ backup: ProjectBackup; webMissing: number }> {
  let webMissing = 0;
  const references = await Promise.all(
    project.references.map(async r => {
      if (r.image.startsWith('data:')) return r;
      try {
        return { ...r, image: await toDataUrl(r.image) };
      } catch {
        webMissing++;
        return r; // la web no permite descargarla: queda el link
      }
    }),
  );
  const pieceImages = await exportProjectPieces(project.id);
  return {
    backup: { format: 'emergent-backup', version: 1, exportedAt: new Date().toISOString(), project: { ...project, references }, pieceImages },
    webMissing,
  };
}

export function downloadBackup(backup: ProjectBackup) {
  const date = backup.exportedAt.slice(0, 10);
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug(backup.project.name)}_respaldo_${date}.emergent.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Lee un respaldo (o un .json de proyecto de versiones anteriores) y lo prepara para sumarlo.
 * Si ya existe un proyecto con el mismo ID, el importado entra como copia con ID nuevo.
 */
export async function restoreBackup(text: string, existingIds: string[]): Promise<{ project: Project; pieces: number }> {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('El archivo no es un respaldo válido (no se pudo leer como JSON).');
  }
  const raw = data?.format === 'emergent-backup' ? data.project : data;
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.references) || !('objective' in raw)) {
    throw new Error('El archivo no tiene la estructura de un proyecto de Emergent.');
  }
  const project = migrateProject(raw);
  if (existingIds.includes(project.id)) {
    project.id = uid('proj');
    project.name = `${project.name || 'Proyecto'} (copia)`;
  }
  const images: Record<string, string> = data?.format === 'emergent-backup' && data.pieceImages ? data.pieceImages : {};
  await Promise.all(Object.entries(images).map(([pieceId, url]) => savePieceImage(project.id, pieceId, url)));
  return { project, pieces: Object.keys(images).length };
}
