import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { IconButton } from '../ui';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface DockPanelProps {
  open: boolean;
  title: string;
  meta?: React.ReactNode;
  /** Ancho en escritorio: 380px por defecto, 420px en Auditoría. */
  width?: number;
  onClose: () => void;
  /** Contenido fijo arriba del cuerpo (p. ej. navegación entre patrones). */
  toolbar?: React.ReactNode;
  /** Cuando cambia, el cuerpo vuelve arriba (p. ej. al pasar de un patrón a otro). */
  scrollKey?: string;
  children: React.ReactNode;
}

/**
 * Panel acoplable único. En escritorio es un <aside role="complementary"> a la derecha;
 * en mobile y tablet es una hoja inferior al 70% de la altura, con role="dialog" y foco atrapado.
 */
export function DockPanel({ open, title, meta, width = 380, onClose, toolbar, scrollKey, children }: DockPanelProps) {
  const isDesktop = useIsDesktop();
  const titleId = useId();
  const sheetRef = useFocusTrap<HTMLDivElement>(open && !isDesktop, onClose);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [scrollKey]);

  // En escritorio, Esc cierra el panel salvo que otro control ya haya usado la tecla.
  useEffect(() => {
    if (!open || !isDesktop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (document.querySelector('[data-overlay-open="true"]')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, isDesktop, onClose]);

  if (!open) return null;

  const header = (
    <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-3">
      <div className="flex min-w-0 flex-col">
        {meta && <span className="font-mono text-xs text-ink-2">{meta}</span>}
        <h2 id={titleId} className="m-0 truncate text-15 font-medium text-ink">
          {title}
        </h2>
      </div>
      <IconButton label="Cerrar panel" size="sm" onClick={onClose}>
        <X className="size-4 stroke-[1.5]" />
      </IconButton>
    </div>
  );

  if (isDesktop) {
    return (
      <aside
        role="complementary"
        aria-labelledby={titleId}
        className="flex h-full shrink-0 flex-col border-l border-line bg-surface motion-safe:animate-[em-fade-in_180ms_var(--ease-emergent)]"
        style={{ width }}
      >
        {header}
        {toolbar && <div className="shrink-0 border-b border-line px-5 py-3">{toolbar}</div>}
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </aside>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end" data-overlay-open="true">
      <button type="button" aria-label="Cerrar panel" tabIndex={-1} className="absolute inset-0 cursor-default bg-black/60" onClick={onClose} />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex h-[70vh] flex-col rounded-t-card border-t border-line-mid bg-surface shadow-float motion-safe:animate-[em-rise_180ms_var(--ease-emergent)]"
      >
        <span aria-hidden="true" className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong" />
        {header}
        {toolbar && <div className="shrink-0 border-b border-line px-5 py-3">{toolbar}</div>}
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
