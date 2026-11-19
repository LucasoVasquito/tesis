import { Pattern, Project } from '../types';

/**
 * Piezas duplicadas: dos piezas vivas con el mismo título y en la misma capa (o con la misma capa sugerida) son una sola.
 * Se fusionan en una con la suma de sus referencias. Queda la que escribió el usuario, o la confirmada, o la primera.
 * Es idempotente y no toca lo descartado ni los grupos.
 */
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const rank = (x: Pattern) => (x.origin === 'user' ? 2 : 0) + (x.confirmed ? 1 : 0);

export function dedupePieces(p: Project): { project: Project; merged: number } {
  const groups = new Map<string, Pattern[]>();
  for (const x of p.patterns) {
    if (x.status === 'discarded' || x.isGroup) continue;
    const key = `${x.layer ?? x.agentSuggestedLayer ?? 0}|${norm(x.name)}`;
    groups.set(key, [...(groups.get(key) ?? []), x]);
  }
  const gone = new Map<string, string>(); // id fusionado → id que queda
  const keepers = new Map<string, Pattern>();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const keep = [...list].sort((a, b) => rank(b) - rank(a))[0];
    const rest = list.filter(x => x !== keep);
    keepers.set(keep.id, {
      ...keep,
      evidence: [...new Set(list.flatMap(x => x.evidence))],
      description: keep.description || rest.find(x => x.description)?.description || '',
      fragmentIds: [...new Set(list.flatMap(x => x.fragmentIds ?? []))],
      cover: keep.cover ?? rest.find(x => x.cover)?.cover,
      evidenceLocked: true,
    });
    rest.forEach(x => gone.set(x.id, keep.id));
  }
  if (!gone.size) return { project: p, merged: 0 };
  return {
    merged: gone.size,
    project: {
      ...p,
      patterns: p.patterns.filter(x => !gone.has(x.id)).map(x => keepers.get(x.id) ?? x),
      fragments: p.fragments?.map(f => (f.groupId && gone.has(f.groupId) ? { ...f, groupId: gone.get(f.groupId) } : f)),
    },
  };
}
