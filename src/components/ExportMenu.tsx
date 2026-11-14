import { useEffect, useMemo, useRef, useState } from 'react';
import { Project } from '../types';
import { BarButton } from './shell/BottomBar';
import { Modal } from './shell/Modal';
import { useColors } from '../screens/colorContext';
import { Notify } from '../screens/types';
import { approvedPieces, buildExportJson, buildExportPrompt, downloadApprovedPngs, downloadJson, downloadPrompt, exportSystemPdf } from '../utils/exportKit';
import { logEvent } from '../utils/testLog';

/**
 * Botón «Exportar» de la barra inferior (Sistema y Probar): PNG de la pieza aprobada, PDF del sistema
 * y Prompt / JSON para otra IA. Toda exportación avisa «Se descargó {archivo}».
 */
export function ExportMenu({ project, notify, mobile }: { project: Project; notify: Notify; mobile?: boolean }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState(false);
  const [tab, setTab] = useState<'json' | 'prompt'>('json');
  const [busy, setBusy] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const approved = approvedPieces(project);
  const pieceColor = (id: string) => colors.byPiece[id]?.hex;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const json = useMemo(() => (modal ? buildExportJson(project, colors.palette, pieceColor) : null), [modal, project, colors]); // eslint-disable-line react-hooks/exhaustive-deps
  const jsonText = json ? JSON.stringify(json, null, 2) : '';
  const promptText = json ? buildExportPrompt(json) : '';

  const png = async () => {
    setOpen(false);
    setBusy('png');
    logEvent('export', { type: 'png' });
    try {
      const names = await downloadApprovedPngs(project);
      notify(names.length ? `Se descargó ${names.join(', ')}` : 'No se pudo leer la imagen de la pieza aprobada.', names.length ? {} : { tone: 'error' });
    } catch (e: any) {
      notify('No se pudo exportar el PNG.', { tone: 'error', detail: e?.message });
    } finally {
      setBusy(null);
    }
  };
  const pdf = async () => {
    setOpen(false);
    setBusy('pdf');
    logEvent('export', { type: 'pdf' });
    try {
      const name = await exportSystemPdf(project, colors.palette, pieceColor);
      notify(`Se abrió la impresión: elegí «Guardar como PDF» (${name}).`);
    } catch (e: any) {
      notify('No se pudo armar el PDF.', { tone: 'error', detail: e?.message });
    } finally {
      setBusy(null);
    }
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify('Se copió al portapapeles.');
    } catch {
      notify('No se pudo copiar: descargalo.', { tone: 'error' });
    }
  };

  const item = 'flex min-h-[44px] w-full flex-col items-start gap-[2px] rounded-[8px] px-3 py-2 text-left hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <div ref={wrap} className="relative">
      <BarButton active={open} onClick={() => setOpen(o => !o)} ariaLabel="Exportar">
        {busy ? 'Exportando…' : 'Exportar'} <span aria-hidden="true">▴</span>
      </BarButton>
      {open && (
        <div role="menu" aria-label="Exportar" className={`absolute z-40 flex w-[280px] flex-col gap-1 rounded-[12px] border border-line-mid p-2 shadow-[0_8px_32px_rgba(0,0,0,.5)] ${mobile ? 'bottom-full left-0 mb-3' : 'bottom-full left-0 mb-3'}`} style={{ background: 'var(--cc-surface)' }}>
          <button role="menuitem" type="button" className={item} onClick={png} disabled={!approved.length}>
            <span className="text-[13px] font-semibold">PNG de la pieza aprobada</span>
            <span className="text-[11px] text-ink-2">{approved.length ? '2048 px, lado mayor' : 'Aprobá una variante en Probar'}</span>
          </button>
          <button role="menuitem" type="button" className={item} onClick={pdf}>
            <span className="text-[13px] font-semibold">PDF del sistema</span>
            <span className="text-[11px] text-ink-2">A4 vertical: portada, paleta, capas y piezas aprobadas</span>
          </button>
          <button
            role="menuitem"
            type="button"
            className={item}
            onClick={() => {
              setOpen(false);
              setModal(true);
              logEvent('export', { type: 'prompt-json' });
            }}
          >
            <span className="text-[13px] font-semibold">Prompt / JSON para otra IA</span>
            <span className="text-[11px] text-ink-2">Copiar o descargar</span>
          </button>
        </div>
      )}

      <Modal open={modal} title="Prompt / JSON para otra IA" meta="Exportar" width={640} onClose={() => setModal(false)}>
        <div className="flex flex-col gap-3 p-5">
          <div role="tablist" className="flex gap-1">
            {(['json', 'prompt'] as const).map(t => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`btn btn-sm px-3 ${tab === t ? 'btn-secondary' : 'btn-ghost'}`} style={{ minHeight: 44 }}>
                {t === 'json' ? 'JSON' : 'Prompt'}
              </button>
            ))}
          </div>
          <pre className="m-0 max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-[8px] border border-line p-3 font-mono text-[12px] leading-[1.5] text-ink-2">{tab === 'json' ? jsonText : promptText}</pre>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded-[8px] bg-bone px-4 py-2 text-[13px] font-bold text-void" style={{ minHeight: 44 }} onClick={() => copy(tab === 'json' ? jsonText : promptText)}>
              Copiar
            </button>
            <button
              type="button"
              className="rounded-[8px] border border-line-strong px-4 py-2 text-[13px] font-medium text-ink hover:bg-white/10"
              style={{ minHeight: 44 }}
              onClick={() => {
                const name = tab === 'json' ? downloadJson(project, json!) : downloadPrompt(project, promptText);
                notify(`Se descargó ${name}`);
              }}
            >
              Descargar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
