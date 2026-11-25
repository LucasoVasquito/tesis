import React, { useEffect, useId } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { CropBox, Reference } from '../types';
import { IconButton } from './ui';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface LightboxModalProps {
  reference: Reference | null;
  onClose: () => void;
  /** Zona a marcar sobre la imagen (normalizada 0..1): lo que interesa de la referencia. */
  highlight?: CropBox | null;
  /** Qué se marca («Marcos de alambre…»): va en el título. */
  caption?: string;
  /** Recorrer una serie (← →). */
  onPrev?: () => void;
  onNext?: () => void;
  /** «3 de 9». */
  position?: string;
}

/** Imagen a pantalla completa. Esc o clic afuera cierran; ← → recorren la serie si la hay. */
export function LightboxModal({ reference, onClose, highlight, caption, onPrev, onNext, position }: LightboxModalProps) {
  const titleId = useId();
  const ref = useFocusTrap<HTMLDivElement>(!!reference, onClose);
  useEffect(() => {
    if (!reference) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && onPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === 'ArrowRight' && onNext) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reference, onPrev, onNext]);
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
          <span className="font-mono text-[0.875rem] text-ink-2">
            {reference.id}
            {position ? ` · ${position}` : ''}
          </span>
          <h2 id={titleId} className="m-0 truncate text-15 font-medium text-ink">
            {caption ? `${caption} · ${reference.name}` : reference.name}
          </h2>
        </div>
        <IconButton label="Cerrar" onClick={onClose}>
          <X className="size-4 stroke-[1.5]" />
        </IconButton>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
        {onPrev && (
          <span className="absolute left-4 top-1/2 z-10 -translate-y-1/2">
            <IconButton label="Anterior (←)" onClick={onPrev}>
              <ChevronLeft className="size-5 stroke-[1.5]" />
            </IconButton>
          </span>
        )}
        {/* La caja se ajusta a la imagen, así la zona marcada cae justo encima de lo que muestra. */}
        <div className="relative inline-flex max-h-full max-w-full overflow-hidden rounded-card">
          <img src={reference.image} alt={reference.name} className="block max-h-[calc(100vh-9rem)] max-w-full object-contain" referrerPolicy="no-referrer" />
          {highlight && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute rounded-[2px]"
              style={{
                left: `${highlight.x * 100}%`,
                top: `${highlight.y * 100}%`,
                width: `${highlight.w * 100}%`,
                height: `${highlight.h * 100}%`,
                // Oscurece lo de afuera y deja la zona limpia con un borde claro.
                boxShadow: '0 0 0 2px #fff, 0 0 0 9999px rgba(0,0,0,.55)',
              }}
            />
          )}
        </div>
        {onNext && (
          <span className="absolute right-4 top-1/2 z-10 -translate-y-1/2">
            <IconButton label="Siguiente (→)" onClick={onNext}>
              <ChevronRight className="size-5 stroke-[1.5]" />
            </IconButton>
          </span>
        )}
      </div>
      {reference.notes && <p className="m-0 mx-auto max-w-[640px] px-4 pb-6 text-center font-serif text-15 text-ink-2">{reference.notes}</p>}
    </div>
  );
}
