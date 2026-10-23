import React from 'react';
import { Reference } from '../../types';
import { useDominantColor } from '../../utils/dominantColor';
import { StatusDot, Tone } from './StatusPill';

export type ZoomLevel = 'far' | 'mid' | 'near';

/** Umbrales del zoom semántico. */
export function zoomLevelFor(scale: number): ZoomLevel {
  if (scale < 0.5) return 'far';
  if (scale > 1.2) return 'near';
  return 'mid';
}

export function shortRefId(id: string) {
  const m = /(\d+)$/.exec(id);
  return m ? m[1] : id.slice(-3);
}

interface ReferenceCardProps {
  reference: Reference;
  zoom: ZoomLevel;
  width?: number;
  selected?: boolean;
  evidence?: boolean;
  /** Punto de estado de análisis (p. ej. nueva / incluida en la inducción). */
  analysis?: { tone: Tone; label: string } | null;
  className?: string;
  style?: React.CSSProperties;
}

export function ReferenceCard({ reference: ref, zoom, width, selected, evidence, analysis, className, style }: ReferenceCardProps) {
  const dominant = useDominantColor(ref, zoom === 'far');
  const border = selected
    ? 'border-ink'
    : evidence
      ? 'border-signal/70'
      : 'border-line';
  const palette = (ref.breakdown?.colors ?? []).slice(0, 5).map(c => c.hex);

  return (
    <article
      className={`flex flex-col overflow-hidden rounded-card border bg-surface shadow-card transition-[border-color] duration-120 ease-emergent ${border} ${className ?? ''}`}
      style={{ width, ...style }}
    >
      {zoom === 'far' ? (
        <div className="flex aspect-[4/5] items-end p-2" style={{ background: dominant }}>
          <span className="rounded-[3px] bg-[rgba(237,237,239,.85)] px-[5px] py-px font-mono text-xs font-medium text-bg">
            {shortRefId(ref.id)}
          </span>
        </div>
      ) : (
        <>
          <img
            src={ref.image}
            alt={ref.name}
            className="block aspect-[4/5] w-full bg-raised object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
            draggable={false}
          />
          <div className="flex flex-col gap-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-medium text-ink-2">{ref.id}</span>
              {analysis && (
                <span className="flex items-center gap-2" title={analysis.label}>
                  <span className="sr-only">{analysis.label}</span>
                  <StatusDot tone={analysis.tone} />
                </span>
              )}
            </div>
            <span className="text-13 font-medium leading-[1.35] text-ink">{ref.name}</span>
            {zoom === 'near' && (
              <>
                {ref.notes && <p className="m-0 font-serif text-sm leading-[1.45] text-ink-2">{ref.notes}</p>}
                {palette.length > 0 && (
                  <div className="flex gap-1" aria-label="Paleta de la referencia">
                    {palette.map((c, i) => (
                      <span key={`${c}-${i}`} title={c} className="h-[14px] flex-1 rounded-[2px]" style={{ background: c }} />
                    ))}
                  </div>
                )}
                {ref.tags && ref.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {ref.tags.map((t, i) => (
                      <span key={`${t}-${i}`} className="rounded-full border border-line-mid px-2 text-xs text-ink-2">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </article>
  );
}
