import React, { useEffect, useState } from 'react';
import { ApplicationSession, PieceType } from '../../types';
import { loadPieceImage } from '../../utils/pieceStore';

const LABEL: Record<PieceType, string> = {
  logo: 'Logotipo',
  facade: 'Fachada',
  packaging: 'Packaging',
  poster: 'Afiche',
  post: 'Post',
  story: 'Story',
  web: 'Web',
  other: 'Pieza',
};
const ORDER: PieceType[] = ['logo', 'facade', 'packaging', 'poster', 'post', 'story', 'web', 'other'];

/** Piezas aprobadas en la etapa Aplicación, para el manual. */
export function ApprovedPieces({ projectId, session }: { projectId: string; session?: ApplicationSession }) {
  const approved = ORDER.filter(t => session?.approved?.[t]).map(t => ({ type: t, id: session!.approved[t]! }));
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    Promise.all(approved.map(async a => [a.id, await loadPieceImage(projectId, a.id)] as const)).then(found => {
      if (alive) setUrls(Object.fromEntries(found.filter(([, u]) => u)) as Record<string, string>);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, approved.map(a => a.id).join('|')]);

  const total = session?.rounds.reduce((n, r) => n + r.pieces.length, 0) ?? 0;
  if (!approved.length) return null;
  return (
    <div className="flex flex-col gap-3">
      <span className="font-mono text-xs text-ink-2">
        {approved.length} {approved.length === 1 ? 'pieza aprobada' : 'piezas aprobadas'} de {total} generadas · verificación externa
      </span>
      <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3">
        {approved.map(a => {
          const audit = session?.audits?.[a.id];
          const score = audit?.rules.length
            ? `${String(audit.rules.reduce((n, r) => n + (r.verdict === 'cumple' ? 1 : r.verdict === 'parcial' ? 0.5 : 0), 0)).replace('.', ',')}/${audit.rules.length} reglas`
            : null;
          return (
            <li key={a.id} className="flex flex-col gap-1.5 print:break-inside-avoid">
              {urls[a.id] ? (
                <img src={urls[a.id]} alt={`${LABEL[a.type]} aprobado`} className="aspect-square w-full rounded-ctrl border border-line bg-bg object-contain" />
              ) : (
                <span className="block aspect-square w-full rounded-ctrl border border-dashed border-line-strong" />
              )}
              <span className="text-13 font-medium text-ink">{LABEL[a.type]}</span>
              {score && <span className="font-mono text-xs text-ink-2">auditoría · {score}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
