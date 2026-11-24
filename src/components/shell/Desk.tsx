import React, { createContext, useContext, useEffect, useState } from 'react';
import { useShortcuts } from '../../hooks/useAuditShortcuts';
import { useViewport } from '../../hooks/useViewport';

/** Dirección del último cambio de subpaso: lo nuevo entra desde la derecha al avanzar y desde la izquierda al volver. */
export type DeskDir = 'fwd' | 'back';
export const DeskContext = createContext<{ dir: DeskDir; enabled: boolean }>({ dir: 'fwd', enabled: true });

export interface Shelf {
  id: string;
  /** Nombre en la pestaña vertical ("Colores", "Capas", "Ayuda"). */
  label: string;
  side: 'left' | 'right';
  content: React.ReactNode;
}

/**
 * La mesa (v6): en el centro, solo el subpaso. Los estantes quedan cerrados en los bordes como pestañas verticales
 * de 40 px; al abrir uno (360 px) se superpone y la mesa se atenúa al 40 %. Uno por vez; Esc o tocar la mesa lo cierra.
 * En móvil, las pestañas van arriba a la derecha y el estante sube como hoja desde abajo.
 */
export function Desk({
  stepKey,
  width = 'form',
  shelves = [],
  children,
  scroll = true,
}: {
  /** Cambia con el subpaso: dispara la transición. */
  stepKey: string;
  /** form ≈ 720 px; wide ≈ 1240 px; full = todo el ancho. */
  width?: 'form' | 'wide' | 'full';
  shelves?: Shelf[];
  children: React.ReactNode;
  /** La mesa se desplaza sola (false: el contenido maneja su propio alto, p. ej. un lienzo). */
  scroll?: boolean;
}) {
  const { dir, enabled } = useContext(DeskContext);
  const mobile = useViewport() === 'mobile';
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => setOpen(null), [stepKey]);
  useShortcuts(enabled, { escape: () => (open ? setOpen(null) : false) });

  const shelf = shelves.find(s => s.id === open) ?? null;
  const left = shelves.filter(s => s.side === 'left');
  const right = shelves.filter(s => s.side === 'right');
  const maxW = width === 'form' ? 'max-w-[720px]' : width === 'wide' ? 'max-w-[1240px]' : 'max-w-none';

  const tab = (s: Shelf) => (
    <button
      key={s.id}
      type="button"
      onClick={() => setOpen(o => (o === s.id ? null : s.id))}
      aria-expanded={open === s.id}
      aria-controls={`shelf-${s.id}`}
      className={
        mobile
          ? 'h-9 rounded-[4px] bg-ink/10 px-3 text-[0.875rem] font-medium text-ink-2 hover:text-ink'
          : 'flex w-10 items-center justify-center rounded-[4px] py-4 text-[0.8125rem] font-semibold tracking-[0.04em] text-ink-2 transition-colors duration-150 hover:bg-ink/10 hover:text-ink'
      }
      style={mobile ? undefined : { writingMode: 'vertical-rl', transform: s.side === 'left' ? 'rotate(180deg)' : undefined, background: open === s.id ? 'var(--cc-surface)' : undefined }}
    >
      {s.label}
    </button>
  );

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* La mesa */}
      <div className={`h-full w-full ${scroll ? 'overflow-y-auto' : 'overflow-hidden'} transition-opacity duration-200`} style={{ opacity: shelf ? 0.4 : 1 }} onPointerDown={() => shelf && setOpen(null)}>
        <div key={stepKey} className={`desk-in desk-${dir} mx-auto h-full w-full ${maxW} ${mobile ? 'px-4 pb-28 pt-6' : scroll ? 'px-14 py-10' : 'px-14'}`}>
          {children}
        </div>
      </div>

      {/* Pestañas de los estantes */}
      {mobile ? (
        shelves.length > 0 && <div className="absolute right-3 top-2 z-20 flex gap-2">{shelves.map(tab)}</div>
      ) : (
        <>
          {left.length > 0 && <div className="absolute left-1 top-6 z-20 flex flex-col gap-2">{left.map(tab)}</div>}
          {right.length > 0 && <div className="absolute right-1 top-6 z-20 flex flex-col gap-2">{right.map(tab)}</div>}
        </>
      )}

      {/* Estante abierto: se superpone a la mesa */}
      {shelf && (
        <aside
          id={`shelf-${shelf.id}`}
          aria-label={shelf.label}
          className={
            mobile
              ? 'absolute inset-x-0 bottom-0 z-30 max-h-[75%] overflow-y-auto rounded-t-[4px] p-4 pb-[calc(16px+env(safe-area-inset-bottom))]'
              : `absolute bottom-0 top-0 z-30 w-[360px] overflow-y-auto p-6 ${shelf.side === 'left' ? 'left-11' : 'right-11'}`
          }
          style={{ background: 'color-mix(in srgb, var(--cc-bg) 85%, transparent)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', boxShadow: '0 20px 60px rgba(0,0,0,0.45)' }}
        >
          <div className="mb-4 flex items-center justify-between">
            <span className="type-label text-[0.75rem] text-ink-2">{shelf.label}</span>
            <button type="button" onClick={() => setOpen(null)} className="text-[0.875rem] text-ink-2 underline underline-offset-4 hover:text-ink">
              Cerrar <kbd className="opacity-75">Esc</kbd>
            </button>
          </div>
          {shelf.content}
        </aside>
      )}
    </div>
  );
}

/** Título de la mesa: la pregunta del subpaso (Display). */
export function DeskQuestion({ children, kicker }: { children: React.ReactNode; kicker?: React.ReactNode }) {
  return (
    <header className="mb-8 flex flex-col gap-2">
      {kicker && <span className="type-data text-[0.875rem] text-ink-2">{kicker}</span>}
      <h1 data-headline className="type-stage m-0" style={{ fontSize: 'clamp(40px, 5vw, 72px)', lineHeight: 0.95 }}>
        {children}
      </h1>
    </header>
  );
}
