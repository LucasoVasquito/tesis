import React, { useId } from 'react';
import { X } from 'lucide-react';
import { IconButton } from '../ui';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface ModalProps {
  open: boolean;
  title: string;
  meta?: React.ReactNode;
  onClose: () => void;
  width?: number;
  children: React.ReactNode;
}

/** Diálogo modal con foco atrapado; Esc o clic afuera cierran. */
export function Modal({ open, title, meta, onClose, width = 520, children }: ModalProps) {
  const titleId = useId();
  const ref = useFocusTrap<HTMLDivElement>(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" data-overlay-open="true">
      <button type="button" tabIndex={-1} aria-label="Cerrar" className="absolute inset-0 cursor-default bg-black/70" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-card border border-line-mid bg-surface shadow-float motion-safe:animate-[em-rise_180ms_var(--ease-emergent)] sm:rounded-card"
        style={{ maxWidth: width }}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-3">
          <div className="flex min-w-0 flex-col">
            {meta && <span className="font-mono text-xs text-ink-2">{meta}</span>}
            <h2 id={titleId} className="m-0 truncate text-15 font-medium text-ink">
              {title}
            </h2>
          </div>
          <IconButton label="Cerrar" size="sm" onClick={onClose}>
            <X className="size-4 stroke-[1.5]" />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
