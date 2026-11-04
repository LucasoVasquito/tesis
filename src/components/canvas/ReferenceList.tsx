import React from 'react';
import { Reference } from '../../types';
import { ReferenceCard, Tone } from '../ui';
import { CanvasHighlight } from './ReferenceCanvas';

interface ReferenceListProps {
  references: Reference[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  highlight?: CanvasHighlight | null;
  readingId?: string | null;
  dimAll?: number;
  analysisFor?: (ref: Reference) => { tone: Tone; label: string } | null;
  emptyState?: React.ReactNode;
  header?: React.ReactNode;
}

/** Modo Lista del corpus: grilla de fichas (2 columnas en mobile). */
export function ReferenceList({ references, selectedId, onSelect, highlight, readingId, dimAll, analysisFor, emptyState, header }: ReferenceListProps) {
  const ids = new Set(highlight?.ids ?? []);
  // En auditoría, la evidencia va primero.
  const ordered = highlight ? [...references].sort((a, b) => Number(ids.has(b.id)) - Number(ids.has(a.id))) : references;
  return (
    <div className="h-full overflow-y-auto">
      {header}
      <div className="p-4 pt-[72px] lg:p-6 lg:pt-[72px]">
        {references.length === 0 ? (
          <div className="mx-auto max-w-sm">{emptyState}</div>
        ) : (
          <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] lg:gap-4">
            {ordered.map(r => {
              const isEv = ids.has(r.id) || r.id === readingId;
              const opacity = highlight ? (ids.has(r.id) ? 1 : highlight.dimOthers) : readingId ? (r.id === readingId ? 1 : dimAll ?? 1) : dimAll ?? 1;
              return (
                <li key={r.id} className="transition-opacity duration-180 ease-emergent" style={{ opacity }}>
                  <button
                    type="button"
                    id={`ref-card-${r.id}`}
                    onClick={() => onSelect(r.id)}
                    aria-pressed={r.id === selectedId}
                    aria-label={`${r.name} (${r.id})${isEv && highlight ? ', evidencia del patrón activo' : ''}`}
                    className="block w-full rounded-card text-left"
                  >
                    <ReferenceCard reference={r} zoom="mid" selected={r.id === selectedId} evidence={isEv} analysis={analysisFor?.(r) ?? null} className="w-full" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
