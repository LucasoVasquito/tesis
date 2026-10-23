import React, { useEffect, useId, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';

interface FullViewProps {
  title: string;
  meta?: React.ReactNode;
  onBack: () => void;
  backLabel?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

/** Vista a pantalla completa (manual de lineamientos, verificación, acerca del método). Esc vuelve. */
export function FullView({ title, meta, onBack, backLabel = 'Volver', actions, children }: FullViewProps) {
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    headingRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, [onBack]);

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-overlay-open="true"
      className="fixed inset-0 z-40 flex flex-col bg-bg motion-safe:animate-[em-fade-in_240ms_var(--ease-emergent)] print:static print:bg-white"
    >
      <header className="no-print flex h-14 shrink-0 items-center gap-3 border-b border-line px-3 lg:px-4">
        <button type="button" className="btn btn-ghost px-2" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          {backLabel}
        </button>
        <span aria-hidden="true" className="h-4 w-px bg-line-mid" />
        <div className="flex min-w-0 flex-1 flex-col">
          {meta && <span className="truncate font-mono text-xs text-ink-2">{meta}</span>}
          <h1 id={titleId} ref={headingRef} tabIndex={-1} className="m-0 truncate text-sm font-medium text-ink outline-none">
            {title}
          </h1>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto print:overflow-visible">{children}</div>
    </section>
  );
}
