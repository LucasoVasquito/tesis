import { useEffect } from 'react';

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
  if (!notice) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="no-print fixed right-6 top-[68px] z-[55] flex w-[380px] max-w-[calc(100vw-48px)] items-start gap-3 rounded-[12px] border border-line-mid p-3 shadow-[0_8px_32px_rgba(0,0,0,.5)]"
      style={{ background: 'var(--cc-surface)', borderColor: notice.tone === 'error' ? 'var(--cc-error)' : undefined }}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="text-[13px] leading-snug text-ink">{notice.text}</span>
        {notice.detail && <span className="text-[12px] leading-snug text-ink-2">{notice.detail}</span>}
        {notice.action && (
          <button
            type="button"
            onClick={() => {
              notice.action!.run();
              onClose();
            }}
            className="self-start rounded-[6px] bg-bone px-3 py-1 text-[12px] font-bold text-void hover:bg-white"
          >
            {notice.action.label}
          </button>
        )}
      </div>
      <button type="button" aria-label="Cerrar aviso" onClick={onClose} className="shrink-0 px-1 text-[16px] leading-none text-ink-2 hover:text-ink">
        ✕
      </button>
    </div>
  );
}
