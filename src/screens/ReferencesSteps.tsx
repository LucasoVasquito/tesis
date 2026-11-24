import React, { useEffect, useMemo, useState } from 'react';
import { Pattern, Project } from '../types';
import { evidenceCount } from '../utils/layers';
import { SHEET_NAME, proposedLayer, suggestions } from '../pieces/model';
import { AnalysisState } from '../pieces/analyze';
import { PieceThumb } from './common';
import { PieceModal } from './PieceRule';

/** Ya se mostró la revelación de este análisis (no se repite al volver al lienzo). */
const REVEAL_KEY = 'cc-reveal-seen';
const revealSeen = (at?: string) => {
  try {
    return !!at && sessionStorage.getItem(REVEAL_KEY) === at;
  } catch {
    return true;
  }
};
const markSeen = (at?: string) => {
  try {
    if (at) sessionStorage.setItem(REVEAL_KEY, at);
  } catch {
    /* sin almacenamiento: se vuelve a mostrar */
  }
};

/** Cuántos patrones se revelan en el panel; el resto se ve en Revisar. */
const SHOWN = 8;

/**
 * Panel del análisis, sobre el lienzo de Referencias (ya no es un paso aparte).
 * Mientras analiza: el progreso. Al terminar: «Encontré: …», los patrones de a uno, y el atajo a Revisar.
 * Se muestra una vez por análisis; la lista completa vive en Revisar.
 */
export function AnalysisPanel({
  project,
  analysis,
  onCancel,
  onRetry,
  onReview,
  top,
}: {
  project: Project;
  analysis: AnalysisState;
  onCancel: () => void;
  onRetry: () => void;
  onReview: () => void;
  /** Distancia desde arriba (debajo de la franja del título). */
  top: number;
}) {
  const busy = analysis.status === 'preparing' || analysis.status === 'reading';
  const at = project.lastAnalyzedAt;
  const [dismissed, setDismissed] = useState(() => revealSeen(at));
  // Un análisis nuevo vuelve a mostrar el panel.
  useEffect(() => setDismissed(revealSeen(at)), [at]);
  useEffect(() => {
    if (busy) setDismissed(false);
  }, [busy]);
  const close = () => {
    markSeen(at);
    setDismissed(true);
  };

  const found = useMemo(() => [...suggestions(project)].sort((a, b) => evidenceCount(b, project) - evidenceCount(a, project)), [project]);
  const [detail, setDetail] = useState<Pattern | null>(null);

  // Mientras lee: segundos transcurridos.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [busy]);

  const error = analysis.status === 'error';
  if (!busy && !error && (dismissed || !at)) return null;

  let body: React.ReactNode;
  if (busy) {
    const pct = analysis.status === 'preparing' ? analysis.done / Math.max(1, analysis.total) : Math.min(0.94, 1 - Math.exp(-(now - analysis.since) / 30000));
    const secs = analysis.status === 'reading' ? Math.round((now - analysis.since) / 1000) : 0;
    body = (
      <div className="flex flex-col gap-4" role="status" aria-live="polite">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="size-3 shrink-0 rounded-full motion-safe:animate-pulse" style={{ background: 'var(--cc-l0)' }} />
          <span className="text-[1.0625rem] font-semibold leading-snug">
            {analysis.status === 'preparing' ? `Preparando las imágenes · ${analysis.done} de ${analysis.total}` : secs < 8 ? 'Mirando tus referencias…' : secs < 20 ? 'Detectando tipografías y colores…' : 'Buscando lo que se repite…'}
          </span>
        </div>
        <div className="h-[3px] w-full overflow-hidden bg-white/10">
          <div className="h-full bg-bone transition-[width] duration-700" style={{ width: `${pct * 100}%` }} />
        </div>
        <p className="m-0 text-[0.875rem] leading-snug text-ink-2">Puede tardar entre 30 y 90 segundos. Mientras tanto podés seguir ordenando el lienzo.</p>
        <button type="button" onClick={onCancel} className="self-start text-[0.875rem] text-ink-2 underline underline-offset-4 hover:text-ink">
          Cancelar análisis
        </button>
      </div>
    );
  } else if (error) {
    body = (
      <div className="flex flex-col gap-3" role="alert">
        <span className="text-[1.0625rem] font-semibold">El análisis se cortó.</span>
        <p className="m-0 text-[0.875rem] leading-snug text-ink-2">{analysis.message} Tus referencias siguen acá.</p>
        <button type="button" onClick={onRetry} className="self-start text-[0.875rem] font-semibold text-ink underline underline-offset-4 hover:no-underline">
          Reintentar
        </button>
      </div>
    );
  } else {
    const rest = found.length - SHOWN;
    body = (
      <div className="flex min-h-0 flex-col gap-3">
        <span className="text-[1.0625rem] font-semibold">{found.length ? `Encontré ${found.length} ${found.length === 1 ? 'patrón' : 'patrones'}` : 'No encontré patrones nuevos'}</span>
        <ol className="m-0 flex min-h-0 list-none flex-col overflow-y-auto p-0">
          {found.slice(0, SHOWN).map((x, i) => (
            <li key={x.id} className="found-in border-t border-line" style={{ animationDelay: `${i * 320}ms` }}>
              <button type="button" onClick={() => setDetail(x)} className="group flex w-full items-center gap-3 py-2 text-left">
                <PieceThumb piece={x} project={project} className="aspect-[4/3] w-[52px] shrink-0 rounded-[3px]" word={false} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="line-clamp-2 text-[0.875rem] font-semibold leading-snug underline-offset-4 group-hover:underline">{x.name}</span>
                  <span className="type-data text-[0.75rem] text-ink-2">
                    en {evidenceCount(x, project)} · iría a {SHEET_NAME[proposedLayer(x, project)]}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
        {rest > 0 && <span className="found-in text-[0.875rem] text-ink-2" style={{ animationDelay: `${SHOWN * 320}ms` }}>y {rest} más, en Revisar.</span>}
        <div className="flex items-center justify-between gap-3 pt-1">
          <button type="button" onClick={close} className="text-[0.875rem] text-ink-2 underline underline-offset-4 hover:text-ink">
            Seguir ordenando
          </button>
          {found.length > 0 && (
            <button
              type="button"
              onClick={() => {
                close();
                onReview();
              }}
              className="inline-flex h-10 items-center rounded-full bg-bone px-5 text-[0.875rem] font-bold text-void hover:bg-[var(--cc-primary)] hover:text-[var(--cc-on-primary)]"
            >
              Revisar {found.length} →
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <aside
        aria-label="Análisis"
        className="absolute right-4 z-30 flex w-[min(380px,calc(100%-32px))] flex-col rounded-[6px] p-5 shadow-float lg:right-10"
        style={{ top, maxHeight: `calc(100% - ${top + 24}px)`, background: 'var(--cc-surface)' }}
        onPointerDown={e => e.stopPropagation()}
        onWheel={e => e.stopPropagation()}
      >
        {body}
      </aside>
      {detail && <PieceModal piece={project.patterns.find(p => p.id === detail.id) ?? detail} project={project} onClose={() => setDetail(null)} />}
    </>
  );
}
