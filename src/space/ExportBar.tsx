import React, { forwardRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { Project } from '../types';
import { downloadText } from '../utils/exportHelpers';
import { buildStackPrompt, stackGuidelinesMarkdown } from '../utils/stackExport';

/**
 * CSS con las fuentes de la página incrustadas (Archivo y Geist Mono, latín).
 * html-to-image no puede leer la hoja de Google Fonts por ser de otro origen: se baja y se incrusta a mano.
 */
let fontCSS: Promise<string> | null = null;
function embeddedFontCSS(): Promise<string> {
  if (fontCSS) return fontCSS;
  fontCSS = (async () => {
    const link = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].find(l => l.href.includes('fonts.googleapis.com'));
    if (!link) return '';
    const css = await (await fetch(link.href)).text();
    const blocks = css.split('@font-face').slice(1).map(b => `@font-face${b.slice(0, b.indexOf('}') + 1)}`);
    const wanted = blocks.filter(b => /Archivo|Geist Mono/.test(b) && /U\+0000-00FF/i.test(b));
    const out = await Promise.all(
      wanted.map(async b => {
        const url = /url\((https:[^)]+)\)/.exec(b)?.[1];
        if (!url) return '';
        const blob = await (await fetch(url)).blob();
        const data = await new Promise<string>(res => {
          const r = new FileReader();
          r.onload = () => res(String(r.result));
          r.readAsDataURL(blob);
        });
        return b.replace(url, data);
      }),
    );
    return out.join('\n');
  })().catch(() => {
    fontCSS = null;
    return '';
  });
  return fontCSS;
}

const fileSlug = (s: string) =>
  (s || 'tesis')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'tesis';

interface ExportBarProps {
  project: Project;
  onGenerate: () => void;
  onNotice: (text: string) => void;
  paletteMissing: number;
  paletteBusy: boolean;
  onCompletePalette: () => void;
}

/**
 * Exportar desde la vista de frente: lineamientos, prompt de DALL·E e imagen de la página.
 * La lámina define el peso de cada patrón en las tres.
 */
export const ExportBar = forwardRef<HTMLDivElement, ExportBarProps>(function ExportBar({ project, onGenerate, onNotice, paletteMissing, paletteBusy, onCompletePalette }, ref) {
  const [busy, setBusy] = useState(false);
  const name = fileSlug(project.name || project.intent || '');
  const unaudited = project.patterns.filter(x => x.status !== 'discarded' && !x.isGroup && x.layer != null && !x.audited).length;

  const exportGuidelines = () => {
    downloadText(stackGuidelinesMarkdown(project), `${name}_lineamientos.md`, 'text/markdown');
    onNotice(unaudited ? `Lineamientos descargados · ${unaudited} sin auditar quedan marcados` : 'Lineamientos descargados');
  };
  const exportPrompt = async () => {
    const text = buildStackPrompt(project);
    downloadText(text, `${name}_prompt_dalle.txt`, 'text/plain');
    try {
      await navigator.clipboard.writeText(text);
      onNotice('Prompt de DALL·E descargado y copiado · el núcleo va primero');
    } catch {
      onNotice('Prompt de DALL·E descargado · el núcleo va primero');
    }
  };
  const exportImage = async () => {
    const node = document.getElementById('front-page');
    if (!node) return;
    setBusy(true);
    try {
      const fontEmbedCSS = await embeddedFontCSS();
      const url = await toPng(node, { pixelRatio: 2, cacheBust: false, backgroundColor: '#F2EFE8', ...(fontEmbedCSS ? { fontEmbedCSS } : {}) });
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name}_pagina.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      onNotice('Imagen de la página descargada');
    } catch (err: any) {
      onNotice(`No se pudo exportar la imagen: ${err?.message || err}`);
    } finally {
      setBusy(false);
    }
  };

  const btn = 'type-label px-2 py-[6px] text-left text-[11px] border-2 transition-colors duration-120';
  return (
    <div ref={ref} role="group" aria-label="Exportar" className="flex w-[150px] flex-col gap-2">
      <button type="button" onClick={exportGuidelines} className={`${btn} border-core bg-core text-void hover:bg-bone hover:border-bone`}>
        LINEAMIENTOS .MD
      </button>
      <button type="button" onClick={exportPrompt} className={`${btn} border-bone text-bone hover:bg-bone hover:text-void`}>
        PROMPT DALL·E
      </button>
      <button type="button" onClick={exportImage} disabled={busy} className={`${btn} border-bone text-bone hover:bg-bone hover:text-void disabled:opacity-60`}>
        {busy ? 'EXPORTANDO…' : 'IMAGEN .PNG'}
      </button>
      <button type="button" onClick={onGenerate} className={`${btn} mt-2 border-accent bg-accent text-bone hover:bg-bone hover:text-void hover:border-bone`}>
        GENERAR CON DALL·E
      </button>
      {paletteMissing > 0 && (
        <button type="button" onClick={onCompletePalette} disabled={paletteBusy} className={`${btn} mt-2 border-line-strong text-ink-2 hover:border-bone hover:text-ink disabled:opacity-60`}>
          {paletteBusy ? 'DESGLOSANDO COLORES…' : `COMPLETAR PALETA · ${paletteMissing} REFS`}
        </button>
      )}
      {unaudited > 0 && <span className="font-mono text-[11px] text-ink-2">{unaudited} sin auditar · quedan marcados al exportar</span>}
    </div>
  );
});
