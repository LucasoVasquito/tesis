import React from 'react';
import { StatusDot, Tone } from '../ui';

export interface Toast {
  id: number;
  message: string;
  tone?: Tone;
  action?: { label: string; onClick: () => void };
}

interface ActionBarProps {
  /** Estado o ayuda de la izquierda ("8 referencias · 2 nuevas"). */
  status: React.ReactNode;
  /** Aviso secundario que no bloquea ("quedan 1 sin juzgar"). */
  notice?: React.ReactNode;
  toast?: Toast | null;
  onDismissToast?: () => void;
  /** Acciones secundarias (fantasma), a la izquierda del CTA. */
  secondary?: React.ReactNode;
  /** CTA primario: el único botón con relleno sólido de la etapa. */
  primary?: React.ReactNode;
}

/** Barra inferior: estado a la izquierda, CTA primario a la derecha. Región aria-live para toasts y progreso. */
export function ActionBar({ status, notice, toast, onDismissToast, secondary, primary }: ActionBarProps) {
  return (
    <footer className="no-print flex min-h-16 shrink-0 items-center justify-between gap-4 border-t border-line bg-bg px-4 py-3 lg:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3" aria-live="polite" aria-atomic="true">
        {toast ? (
          <div key={toast.id} className="flex min-w-0 items-center gap-3 motion-safe:animate-[em-rise_180ms_var(--ease-emergent)]">
            {toast.tone && <StatusDot tone={toast.tone} />}
            <span className="truncate text-13 text-ink">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className="btn btn-ghost btn-sm text-ink underline decoration-white/30 underline-offset-4"
                onClick={() => {
                  const run = toast.action?.onClick;
                  onDismissToast?.();
                  run?.();
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
            <span className="truncate font-mono text-xs text-ink-2">{status}</span>
            {notice && <span className="truncate text-xs text-pending-ink">{notice}</span>}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {secondary}
        {primary}
      </div>
    </footer>
  );
}
