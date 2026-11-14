import { useState } from 'react';
import { BarButton } from '../components/shell/BottomBar';
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

interface ExportActionsProps {
  project: Project;
  onNotice: (text: string) => void;
  paletteMissing: number;
  paletteBusy: boolean;
  onCompletePalette: () => void;
}

/**
 * Exportar desde 04 SISTEMA: lineamientos, prompt e imagen de la página. Van en la barra inferior.
 * La capa define el peso de cada pieza en las tres.
 */
export function ExportActions({ project, onNotice, paletteMissing, paletteBusy, onCompletePalette }: ExportActionsProps) {
  const [busy, setBusy] = useState(false);
  const name = fileSlug(project.name || project.intent || '');
  const unaudited = project.patterns.filter(x => x.status !== 'discarded' && !x.isGroup && x.layer != null && !x.confirmed).length;

  const exportGuidelines = () => {
    downloadText(stackGuidelinesMarkdown(project), `${name}_lineamientos.md`, 'text/markdown');
    onNotice(unaudited ? `Lineamientos descargados · ${unaudited} sugerencias quedan marcadas` : 'Lineamientos descargados');
  };
  const exportPrompt = async () => {
    const text = buildStackPrompt(project);
    downloadText(text, `${name}_prompt.txt`, 'text/plain');
    try {
      await navigator.clipboard.writeText(text);
      onNotice('Prompt descargado y copiado · el Núcleo va primero');
    } catch {
      onNotice('Prompt descargado · el Núcleo va primero');
    }
  };
  const exportImage = async () => {
    const node = document.getElementById('front-page');
    if (!node) return;
    setBusy(true);
    try {
      const fontEmbedCSS = await embeddedFontCSS();
      const url = await toPng(node, { pixelRatio: 2, cacheBust: false, ...(fontEmbedCSS ? { fontEmbedCSS } : {}) });
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

  return (
    <>
      <BarButton onClick={exportGuidelines}>Lineamientos</BarButton>
      <BarButton onClick={exportPrompt}>Prompt</BarButton>
      <BarButton onClick={exportImage} disabled={busy}>
        {busy ? 'Exportando…' : 'Imagen'}
      </BarButton>
      {paletteMissing > 0 && (
        <BarButton onClick={onCompletePalette} disabled={paletteBusy}>
          {paletteBusy ? 'Leyendo colores…' : `Completar paleta · ${paletteMissing}`}
        </BarButton>
      )}
    </>
  );
}
