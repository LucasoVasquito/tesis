import React, { useId } from 'react';
import { X } from 'lucide-react';
import { Reference } from '../types';
import { IconButton } from './ui';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface LightboxModalProps {
  reference: Reference | null;
  onClose: () => void;
}

/** Imagen a pantalla completa. Esc o clic afuera cierran. */
export function LightboxModal({ reference, onClose }: LightboxModalProps) {
  const titleId = useId();
  const ref = useFocusTrap<HTMLDivElement>(!!reference, onClose);
  if (!reference) return null;
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-overlay-open="true"
      className="fixed inset-0 z-50 flex flex-col bg-black/90 motion-safe:animate-[em-fade-in_180ms_var(--ease-emergent)]"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-col">
          <span className="font-mono text-xs text-ink-2">{reference.id}</span>
          <h2 id={titleId} className="m-0 truncate text-15 font-medium text-ink">
            {reference.name}
          </h2>
        </div>
        <IconButton label="Cerrar" onClick={onClose}>
          <X className="size-4 stroke-[1.5]" />
        </IconButton>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
        <img src={reference.image} alt={reference.name} className="max-h-full max-w-full rounded-card object-contain" referrerPolicy="no-referrer" />
      </div>
      {reference.notes && <p className="m-0 mx-auto max-w-[640px] px-4 pb-6 text-center font-serif text-15 text-ink-2">{reference.notes}</p>}
    </div>
  );
}
