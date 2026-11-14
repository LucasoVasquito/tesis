import React from 'react';

export interface Primary {
  label: string;
  /** Tecla que lo activa (se muestra como ⏎). */
  kbd?: string;
  onClick: () => void;
  /** Si está, el botón se ve deshabilitado pero al hacer clic explica el motivo. */
  blocked?: string;
  /** Texto corto que reemplaza a la etiqueta mientras está bloqueado ("Núcleo vacío"). */
  blockedLabel?: string;
  onBlockedClick?: (reason: string) => void;
}

/** Botón secundario de la barra inferior. */
export function BarButton({ children, onClick, active, disabled, title, ariaLabel }: { children: React.ReactNode; onClick: () => void; active?: boolean; disabled?: boolean; title?: string; ariaLabel?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={`inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-[8px] px-3 text-[13px] font-medium transition-colors duration-120 disabled:cursor-not-allowed disabled:opacity-40 ${active ? 'bg-bone text-void' : 'text-ink-2 hover:bg-white/10 hover:text-ink'}`}
    >
      {children}
    </button>
  );
}

export const BarSep = () => <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-line-mid" />;

/**
 * Barra inferior flotante: solo las acciones de la etapa y, a la derecha, el botón primario.
 * Debajo de la escena, centrada, a 24px del borde. Encima, una línea de ayuda opcional.
 */
export function BottomBar({ help, actions, primary }: { help?: string; actions?: React.ReactNode; primary?: Primary }) {
  return (
    <div className="no-print pointer-events-none absolute inset-x-0 bottom-6 z-30 flex flex-col items-center gap-2 px-4">
      {help && <p className="pointer-events-none m-0 max-w-[640px] rounded-[8px] px-3 py-1 text-center text-[12px] leading-snug text-ink-2" style={{ background: 'oklch(0.165 0.012 40 / .8)' }}>{help}</p>}
      <div
        role="toolbar"
        aria-label="Acciones de la etapa"
        className="pointer-events-auto flex max-w-full items-center gap-1 rounded-[14px] border border-line-mid p-[6px] shadow-[0_8px_32px_rgba(0,0,0,.45)]"
        style={{ background: 'oklch(0.225 0.012 40)' }}
      >
        {actions && <div className="flex min-w-0 items-center gap-1 overflow-x-auto">{actions}</div>}
        {actions && primary && <BarSep />}
        {primary && (
          <button
            type="button"
            data-primary
            aria-disabled={primary.blocked ? true : undefined}
            onClick={() => (primary.blocked ? primary.onBlockedClick?.(primary.blocked) : primary.onClick())}
            className={`inline-flex h-10 items-center gap-3 whitespace-nowrap rounded-[10px] px-5 text-[14px] font-bold transition-colors duration-120 ${primary.blocked ? 'cursor-not-allowed bg-white/10 text-ink-3' : 'bg-bone text-void hover:bg-white'}`}
          >
            {primary.blocked ? primary.blockedLabel ?? primary.label : primary.label}
            {primary.kbd && !primary.blocked && <kbd className="font-mono text-[12px] font-medium opacity-60">{primary.kbd}</kbd>}
          </button>
        )}
      </div>
    </div>
  );
}
