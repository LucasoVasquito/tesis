import { useEffect } from 'react';
import { useViewport } from '../../hooks/useViewport';

export interface NoticeData {
  id: number;
  text: string;
  detail?: string;
  tone?: 'info' | 'error';
  action?: { label: string; run: () => void };
}

/**
 * Aviso flotante arriba a la derecha (top 68, right 24, 380px máx.). Texto, una acción opcional y una ✕.
 * Se va solo a los 5 segundos. No toca la barra inferior ni los botones de decisión.
 */
export function Notices({ notice, onClose }: { notice: NoticeData | null; onClose: () => void }) {
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [notice?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const mobile = useViewport() === 'mobile';
  if (!notice) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`no-print fixed z-[66] flex items-start gap-3 ${mobile ? 'inset-x-2 bottom-[calc(80px+env(safe-area-inset-bottom))] rounded-[4px] p-3' : 'bottom-14 left-10 max-w-[min(560px,calc(100vw-80px))]'}`}
      style={mobile ? { background: 'var(--cc-surface)' } : { textShadow: '0 0 14px var(--cc-bg), 0 0 4px var(--cc-bg)' }}
    >
      <span aria-hidden="true" className="mt-[6px] size-2 shrink-0 rounded-full" style={{ background: notice.tone === 'error' ? 'var(--cc-error)' : 'var(--cc-l0)' }} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[0.875rem] leading-snug text-ink">{notice.text}</span>
        {notice.detail && <span className="text-[0.875rem] leading-snug text-ink-2">{notice.detail}</span>}
        {notice.action && (
          <button
            type="button"
            onClick={() => {
              notice.action!.run();
              onClose();
            }}
            className="self-start text-[0.875rem] font-bold text-ink underline underline-offset-4 hover:no-underline" style={{ minHeight: mobile ? 44 : undefined }}
          >
            {notice.action.label}
          </button>
        )}
      </div>
      <button type="button" aria-label="Cerrar aviso" onClick={onClose} className="shrink-0 px-1 text-[1rem] leading-none text-ink-2 hover:text-ink" style={{ minWidth: mobile ? 44 : undefined, minHeight: mobile ? 44 : undefined }}>
        ✕
      </button>
    </div>
  );
}
