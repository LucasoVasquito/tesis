import React, { useState } from 'react';
import { useViewport } from '../../hooks/useViewport';

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
 * Escritorio y tablet: centrada sobre la escena, a 24px del borde, con una línea de ayuda encima.
 * Móvil: pegada abajo a todo el ancho (con el área segura), el primario y un «⋯» con las acciones secundarias.
 */
export function BottomBar({ help, actions, primary }: { help?: string; actions?: React.ReactNode; primary?: Primary }) {
  const viewport = useViewport();
  const mobile = viewport === 'mobile';
  const [more, setMore] = useState(false);

  const primaryBtn = primary && (
    <button
      type="button"
      data-primary
      aria-disabled={primary.blocked ? true : undefined}
      onClick={() => (primary.blocked ? primary.onBlockedClick?.(primary.blocked) : primary.onClick())}
      className={`inline-flex items-center justify-center gap-3 whitespace-nowrap rounded-[10px] px-5 text-[14px] font-bold transition-colors duration-120 ${mobile ? 'h-12 flex-1' : viewport === 'tablet' ? 'h-11' : 'h-10'} ${primary.blocked ? 'cursor-not-allowed bg-white/10 text-ink-3' : 'hover:brightness-110'}`}
      style={primary.blocked ? undefined : { background: 'var(--cc-primary)', color: 'var(--cc-on-primary)', boxShadow: '0 0 0 1px var(--cc-l0-edge)' }}
    >
      {primary.blocked ? primary.blockedLabel ?? primary.label : primary.label}
      {primary.kbd && !primary.blocked && !mobile && <kbd className="font-mono text-[12px] font-medium opacity-60">{primary.kbd}</kbd>}
    </button>
  );

  if (mobile) {
    return (
      <>
        {more && actions && (
          <div className="fixed inset-0 z-[62]" onClick={() => setMore(false)}>
            <div className="absolute inset-0 bg-black/50" />
            <div
              role="dialog"
              aria-label="Más acciones"
              onClick={e => e.stopPropagation()}
              className="absolute inset-x-0 bottom-0 flex flex-wrap gap-2 rounded-t-[16px] border-t border-line-mid p-4 pb-[calc(16px+env(safe-area-inset-bottom))] [&_button]:min-h-[44px]"
              style={{ background: 'var(--cc-surface)' }}
            >
              {actions}
            </div>
          </div>
        )}
        <div className="no-print absolute inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-line-mid px-3 pb-[calc(8px+env(safe-area-inset-bottom))] pt-2" style={{ background: 'var(--cc-surface)' }}>
          {primaryBtn}
          {actions && (
            <button type="button" aria-label="Más acciones" aria-haspopup="dialog" onClick={() => setMore(true)} className="flex size-12 shrink-0 items-center justify-center rounded-[10px] border border-line-strong text-[20px] text-ink">
              ⋯
            </button>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="no-print pointer-events-none absolute inset-x-0 bottom-6 z-30 flex flex-col items-center gap-2 px-4">
      {help && (
        <p className="pointer-events-none m-0 max-w-[640px] rounded-[8px] px-3 py-1 text-center text-[12px] leading-snug text-ink-2" style={{ background: 'color-mix(in srgb, var(--cc-bg) 80%, transparent)' }}>
          {help}
        </p>
      )}
      <div
        role="toolbar"
        aria-label="Acciones de la etapa"
        className="pointer-events-auto flex max-w-full items-center gap-1 rounded-[14px] border border-line-mid p-[6px] shadow-[0_8px_32px_rgba(0,0,0,.45)]"
        style={{ background: 'var(--cc-surface)' }}
      >
        {actions && <div className={`flex min-w-0 items-center gap-1 overflow-x-auto ${viewport === 'tablet' ? '[&_button]:min-h-[44px]' : ''}`}>{actions}</div>}
        {actions && primary && <BarSep />}
        {primaryBtn}
      </div>
    </div>
  );
}
