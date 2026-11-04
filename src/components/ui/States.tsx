import React, { useId, useState } from 'react';
import { Button } from './Button';
import { ProgressTrack } from './ConfidenceBar';
import { StatusDot } from './StatusPill';

/* ---------- Vacío ---------- */
interface EmptyStateProps {
  meta?: string;
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ meta, title, body, action, className }: EmptyStateProps) {
  return (
    <div
      className={`flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-card border border-dashed border-line-strong p-6 text-center ${className ?? ''}`}
    >
      {meta && <span className="font-mono text-xs font-medium text-ink-2">{meta}</span>}
      <span className="text-15 font-medium text-ink">{title}</span>
      {body && <span className="max-w-[240px] text-13 text-ink-2">{body}</span>}
      {action}
    </div>
  );
}

/* ---------- Carga ---------- */
export interface LoadingStep {
  label: string;
  state: 'done' | 'current' | 'todo';
}

interface LoadingStateProps {
  meta: string;
  title: string;
  progress?: number; // 0..1
  steps?: LoadingStep[];
  note?: string;
  className?: string;
}

export function LoadingState({ meta, title, progress, steps, note, className }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex min-h-[220px] flex-col gap-4 rounded-card border border-line bg-surface p-5 ${className ?? ''}`}
    >
      <span className="font-mono text-xs font-medium text-ink-2">{meta}</span>
      <span className="text-15 font-medium text-ink">{title}</span>
      {typeof progress === 'number' && <ProgressTrack value={progress} label={meta} />}
      {steps && steps.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0 font-mono text-xs">
          {steps.map(s => (
            <li key={s.label} className={s.state === 'current' ? 'text-ink' : 'text-ink-2'}>
              {s.state === 'done' ? '✓' : s.state === 'current' ? '→' : '·'} {s.label}
              {s.state === 'todo' && <span className="sr-only"> (pendiente)</span>}
            </li>
          ))}
        </ul>
      )}
      {note && <span className="mt-auto text-xs text-ink-2">{note}</span>}
    </div>
  );
}

/* ---------- Error ---------- */
interface ErrorStateProps {
  code?: string;
  title: string;
  body?: React.ReactNode;
  detail?: string;
  onRetry?: () => void;
  retryLabel?: string;
  onDismiss?: () => void;
  className?: string;
}

export function ErrorState({ code = 'ERROR', title, body, detail, onRetry, retryLabel = 'Reintentar', onDismiss, className }: ErrorStateProps) {
  const [showDetail, setShowDetail] = useState(false);
  const detailId = useId();
  return (
    <div
      role="alert"
      className={`flex min-h-[220px] flex-col gap-3 rounded-card border border-discarded/35 bg-discarded/5 p-5 ${className ?? ''}`}
    >
      <span className="flex items-center gap-2 font-mono text-xs font-medium text-discarded-ink">
        <StatusDot tone="discarded" glow={false} />
        {code}
      </span>
      <span className="text-15 font-medium text-ink">{title}</span>
      {body && <span className="text-13 text-ink-2">{body}</span>}
      {showDetail && detail && (
        <pre id={detailId} className="m-0 max-h-40 overflow-auto whitespace-pre-wrap rounded-ctrl border border-line bg-bg p-3 font-mono text-xs text-ink-2">
          {detail}
        </pre>
      )}
      <div className="mt-auto flex flex-wrap gap-2">
        {onRetry && (
          <Button variant="primary" size="sm" onClick={onRetry}>
            {retryLabel}
          </Button>
        )}
        {detail && (
          <Button variant="ghost" size="sm" aria-expanded={showDetail} aria-controls={detailId} onClick={() => setShowDetail(v => !v)}>
            {showDetail ? 'Ocultar detalle' : 'Ver detalle'}
          </Button>
        )}
        {onDismiss && (
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Cerrar
          </Button>
        )}
      </div>
    </div>
  );
}
