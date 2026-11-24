import React, { createContext, useContext, useState } from 'react';
import { createPortal } from 'react-dom';
import { useViewport } from '../../hooks/useViewport';

export interface Primary {
  label: string;
  /** Tecla que lo activa (se muestra como ⏎). */
  kbd?: string;
  onClick: () => void;
  /** Si está, el botón se ve deshabilitado pero al hacer clic explica el motivo. */
  blocked?: string;
  /** Texto corto que reemplaza a la etiqueta mientras está bloqueado ("Primario vacío"). */
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
      className={`inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-[4px] px-3 text-[0.875rem] font-medium transition-colors duration-120 disabled:cursor-not-allowed disabled:opacity-75 ${active ? 'bg-bone text-void' : 'text-ink-2 underline-offset-4 hover:text-ink hover:underline'}`}
    >
      {children}
    </button>
  );
}

export const BarSep = () => <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-line-mid" />;

/** Ranuras de la barra de acción fija (las pone App): herramientas a la izquierda, acción principal a la derecha. */
export interface ActionBarSlots {
  actions: HTMLElement | null;
  primary: HTMLElement | null;
}
export const ActionBarContext = createContext<ActionBarSlots>({ actions: null, primary: null });

/**
 * Barra de acción de la etapa.
 * Escritorio y tablet: va dentro de la barra fija de App (72 px, ancho completo, debajo del escenario):
 *   a la izquierda el estado y las herramientas, a la derecha `extra` (p. ej. Exportar) y la acción principal.
 * Móvil: pegada abajo a todo el ancho (con el área segura), el primario y un «⋯» con las acciones secundarias.
 */
export function BottomBar({ help, actions, primary, extra }: { help?: string; actions?: React.ReactNode; primary?: Primary; /** Junto a la acción principal (Exportar). */ extra?: React.ReactNode }) {
  const viewport = useViewport();
  const mobile = viewport === 'mobile';
  const [more, setMore] = useState(false);
  const slots = useContext(ActionBarContext);

  const primaryBtn = primary && (
    <button
      type="button"
      data-primary
      aria-disabled={primary.blocked ? true : undefined}
      onClick={() => (primary.blocked ? primary.onBlockedClick?.(primary.blocked) : primary.onClick())}
      className={`group/primary inline-flex items-center justify-center gap-3 whitespace-nowrap rounded-full px-[22px] text-[0.875rem] font-bold transition-colors duration-150 ${mobile ? 'h-12 flex-1' : viewport === 'tablet' ? 'h-12' : 'h-[46px]'} ${primary.blocked ? 'cursor-not-allowed bg-white/10 text-ink-3' : 'bg-bone text-void hover:bg-[var(--cc-primary)] hover:text-[var(--cc-on-primary)]'}`}
    >
      {primary.blocked ? primary.blockedLabel ?? primary.label : primary.label}
      {primary.kbd && !primary.blocked && !mobile && <kbd className="text-[0.875rem] font-medium opacity-75">{primary.kbd}</kbd>}
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
              className="absolute inset-x-0 bottom-0 flex flex-wrap gap-2 rounded-t-[4px] border-t border-line-mid p-4 pb-[calc(16px+env(safe-area-inset-bottom))] [&_button]:min-h-[44px]"
              style={{ background: 'var(--cc-surface)' }}
            >
              {actions}
            </div>
          </div>
        )}
        <div className="no-print absolute inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-line-mid px-3 pb-[calc(8px+env(safe-area-inset-bottom))] pt-2" style={{ background: 'var(--cc-surface)' }}>
          {primaryBtn}
          {actions && (
            <button type="button" aria-label="Más acciones" aria-haspopup="dialog" onClick={() => setMore(true)} className="flex size-12 shrink-0 items-center justify-center rounded-[4px] bg-ink/10 text-[1.25rem] text-ink">
              ⋯
            </button>
          )}
        </div>
      </>
    );
  }

  // Escritorio y tablet: a la barra fija.
  return (
    <>
      {slots.actions &&
        (actions || help) &&
        createPortal(
          <div role="toolbar" aria-label="Herramientas de la etapa" className={`flex min-w-0 items-center gap-1 ${viewport === 'tablet' ? '[&_button]:min-h-[44px]' : ''}`}>
            {actions}
            {help && !actions && <span className="truncate text-[0.875rem] text-ink-2">{help}</span>}
          </div>,
          slots.actions,
        )}
      {slots.primary &&
        (primary || extra) &&
        createPortal(
          <div className="flex items-center gap-3">
            {extra}
            {primaryBtn}
          </div>,
          slots.primary,
        )}
    </>
  );
}
