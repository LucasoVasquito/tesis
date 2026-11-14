import { Layer, PieceType, Project } from '../types';
import { corpusRefs, evidenceCount } from './layers';
import { fullRule, oneLine, shortRule } from './layerRules';
import { LAYER_QUESTION } from './layerQuestions';
import { Palette, buildTheme, fmtOklch, oklchToHex, parseColor } from './derivePalette';
import { SHEET_NAME, piecesIn } from '../pieces/model';
import { loadPieceImage } from './pieceStore';
import { cropImage } from './parts';
import { compressImageString } from './imageCompressor';
import { pieceTypeInfo } from './probar';
import { downloadText } from './exportHelpers';

/** Exportar: PNG de la pieza aprobada, PDF del sistema y Prompt / JSON para otra IA. */

export const slug = (s: string) =>
  (s || 'marca')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'marca';

/** {proyecto}-{pieza}-{n}.png */
export const pngName = (project: Project, kind: PieceType, n: number) => `${slug(project.name || project.intent || '')}-${slug(pieceTypeInfo(kind).label)}-${n}.png`;

/** La imagen, con el lado mayor en `side` px, como PNG. */
export function resizeToPng(src: string, side = 2048): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const k = side / Math.max(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('No se pudo preparar la imagen.'));
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      try {
        resolve(canvas.toDataURL('image/png'));
      } catch {
        reject(new Error('El navegador no dejó leer la imagen.'));
      }
    };
    img.onerror = () => reject(new Error('No se pudo abrir la imagen.'));
    img.src = src;
  });
}

export function downloadUrl(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Descarga una pieza generada a 2048 px. */
export async function downloadPiecePng(project: Project, src: string, kind: PieceType, n: number): Promise<string> {
  const name = pngName(project, kind, n);
  downloadUrl(await resizeToPng(src, 2048), name);
  return name;
}

/** Piezas aprobadas: tipo, n.º de variante (1 o 2) e id. */
export function approvedPieces(project: Project): { kind: PieceType; variant: number; id: string }[] {
  const s = project.applications?.stack;
  if (!s) return [];
  return (Object.entries(s.approved) as [PieceType, string | undefined][])
    .filter(([, id]) => !!id)
    .map(([kind, id]) => ({ kind, id: id!, variant: Number(/_(\d+)$/.exec(id!)?.[1] ?? 0) + 1 }));
}

/** PNG de las piezas aprobadas (una descarga por pieza). Devuelve los nombres. */
export async function downloadApprovedPngs(project: Project): Promise<string[]> {
  const names: string[] = [];
  for (const a of approvedPieces(project)) {
    const src = await loadPieceImage(project.id, a.id);
    if (!src) continue;
    names.push(await downloadPiecePng(project, src, a.kind, a.variant));
  }
  return names;
}

/* ---------- JSON y prompt ---------- */

const LAYER_KEY: Record<Layer, 'nucleo' | 'soporte' | 'acento'> = { 1: 'nucleo', 2: 'soporte', 3: 'acento' };

export interface ExportJson {
  project: string;
  palette: { primary: string; secondary: string; accent: string };
  layers: Record<'nucleo' | 'soporte' | 'acento', { question: string; pieces: { name: string; type: string; value?: string; rule: string; evidence: string; source: 'tuyo' | 'detectado' }[] }>;
  approved: { kind: string; variant: number; file: string }[];
}

const hexOf = (c: string) => {
  const o = parseColor(c);
  return o ? oklchToHex(o) : c;
};

export function buildExportJson(project: Project, palette: Palette, pieceColor: (id: string) => string | undefined): ExportJson {
  const total = corpusRefs(project).length;
  const layer = (l: Layer) => ({
    question: LAYER_QUESTION[l],
    pieces: piecesIn(project, l).map(x => ({
      name: x.name,
      type: x.category === 'color' ? 'color' : x.category.replace(/_/g, ' '),
      ...(x.category === 'color' && pieceColor(x.id) ? { value: pieceColor(x.id)!.toUpperCase() } : {}),
      rule: l === 1 ? fullRule(x) : l === 2 ? shortRule(x) : oneLine(x),
      evidence: `${evidenceCount(x, project)}/${total}`,
      source: (x.origin === 'user' ? 'tuyo' : 'detectado') as 'tuyo' | 'detectado',
    })),
  });
  return {
    project: project.name || project.intent || 'Proyecto',
    palette: { primary: hexOf(palette.primary), secondary: hexOf(palette.secondary), accent: hexOf(palette.accent) },
    layers: { nucleo: layer(1), soporte: layer(2), acento: layer(3) },
    approved: approvedPieces(project).map(a => ({ kind: pieceTypeInfo(a.kind).label.toLowerCase(), variant: a.variant, file: pngName(project, a.kind, a.variant) })),
  };
}

/** Prompt en texto natural, generado a partir del JSON. */
export function buildExportPrompt(j: ExportJson): string {
  const list = (key: 'nucleo' | 'soporte' | 'acento') =>
    j.layers[key].pieces.map(p => `- ${p.name}${p.value ? ` (${p.value})` : ''}${p.rule ? `: ${p.rule}` : ''}`).join('\n') || '- (nada en esta capa)';
  return [
    `Diseñá para ${j.project}.`,
    '',
    `Obligatorio (Núcleo) · ${LAYER_QUESTION[1]}`,
    list('nucleo'),
    '',
    `Usá cuando acompañe (Soporte) · ${LAYER_QUESTION[2]}`,
    list('soporte'),
    '',
    `Usá con moderación (Acento) · ${LAYER_QUESTION[3]}`,
    list('acento'),
    '',
    `Paleta: primario ${j.palette.primary}, secundario ${j.palette.secondary}, acento ${j.palette.accent}.`,
    'No agregues elementos ajenos al sistema. Escribí cada palabra tal como se indica.',
  ].join('\n');
}

export function downloadJson(project: Project, j: ExportJson) {
  const name = `${slug(project.name || project.intent || '')}-sistema.json`;
  downloadText(JSON.stringify(j, null, 2), name, 'application/json');
  return name;
}
export function downloadPrompt(project: Project, text: string) {
  const name = `${slug(project.name || project.intent || '')}-prompt.txt`;
  downloadText(text, name, 'text/plain');
  return name;
}

/* ---------- PDF (impresión de una página A4 armada en el cliente) ---------- */

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

async function pieceImage(project: Project, x: ReturnType<typeof piecesIn>[number]): Promise<string> {
  const ref = project.references.find(r => r.id === (x.cover?.refId ?? x.evidence[0]));
  if (!ref) return '';
  try {
    if (x.cover?.crop && x.cover.refId === ref.id) return (await cropImage(ref.image, [x.cover.crop], 600))[0]?.image ?? '';
    return await compressImageString(ref.image, { maxWidth: 600, maxHeight: 600, quality: 0.8 });
  } catch {
    return ref.image;
  }
}

/**
 * PDF del sistema: abre una ventana con las páginas A4 y el diálogo de impresión («Guardar como PDF»).
 * Portada con el nombre y la paleta, la paleta con roles, una página por capa y las piezas aprobadas.
 */
export async function exportSystemPdf(project: Project, palette: Palette, pieceColor: (id: string) => string | undefined): Promise<string> {
  const win = window.open('', '_blank');
  if (!win) throw new Error('El navegador bloqueó la ventana. Permití las ventanas emergentes para exportar el PDF.');
  win.document.write('<title>Preparando PDF…</title><body style="font:16px sans-serif;padding:32px">Preparando el PDF…</body>');
  try {
    const theme = buildTheme(palette);
    const bg = theme['--cc-bg'];
    const text = theme['--cc-text'];
    const muted = theme['--cc-text-muted'];
    const name = project.name || project.intent || 'Sistema visual';
    const total = corpusRefs(project).length;
    const roles: [string, string][] = [
      ['Primario', palette.primary],
      ['Secundario', palette.secondary],
      ['Acento', palette.accent],
    ];
    const swatch = (c: string, big = false) => `<span style="display:inline-block;width:${big ? 56 : 28}px;height:${big ? 56 : 28}px;background:${c};border:1px solid ${muted}"></span>`;

    const layerPages: string[] = [];
    for (const l of [1, 2, 3] as Layer[]) {
      const items = piecesIn(project, l);
      const cards = await Promise.all(
        items.map(async x => {
          const img = await pieceImage(project, x);
          const hex = x.category === 'color' ? pieceColor(x.id) : undefined;
          const rule = l === 1 ? fullRule(x) : l === 2 ? shortRule(x) : oneLine(x);
          return `<div class="card">${img ? `<img src="${img}">` : ''}${hex ? `<div class="hex">${swatch(hex)} ${esc(hex.toUpperCase())}</div>` : ''}<b>${esc(x.name)}</b><p>${esc(rule)}</p><small>${evidenceCount(x, project)} de ${total} referencias</small></div>`;
        }),
      );
      layerPages.push(`<section class="page"><small>CAPA ${l} · ${SHEET_NAME[l].toUpperCase()}</small><h2>${esc(LAYER_QUESTION[l])}</h2><div class="grid">${cards.join('') || '<p>Sin piezas.</p>'}</div></section>`);
    }

    const approved = approvedPieces(project);
    const approvedCards = (
      await Promise.all(
        approved.map(async a => {
          const src = await loadPieceImage(project.id, a.id);
          if (!src) return '';
          const small = await compressImageString(src, { maxWidth: 900, maxHeight: 900, quality: 0.85 }).catch(() => src);
          return `<div class="card"><img src="${small}"><b>${esc(pieceTypeInfo(a.kind).label)} · variante ${a.variant}</b></div>`;
        }),
      )
    ).join('');

    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(name)} · sistema</title><style>
      @page { size: A4 portrait; margin: 0 }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact }
      body { margin: 0; font-family: Archivo, Arial, sans-serif; background: ${bg}; color: ${text} }
      .page { width: 210mm; height: 297mm; padding: 18mm; page-break-after: always; overflow: hidden; background: ${bg} }
      h1 { font-size: 54pt; line-height: .95; margin: 0 0 12mm; text-transform: uppercase; font-stretch: 70% }
      h2 { font-size: 20pt; margin: 4mm 0 8mm }
      small { color: ${muted}; letter-spacing: .06em; font-size: 8pt }
      .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm }
      .card img { width: 100%; aspect-ratio: 16/10; object-fit: cover; display: block; margin-bottom: 2mm }
      .card b { display: block; font-size: 10pt } .card p { margin: 1mm 0; font-size: 8pt; color: ${muted} }
      .hex { font: 8pt monospace; margin: -9mm 0 2mm 2mm; position: relative; background: ${bg}; display: inline-flex; gap: 6px; align-items: center; padding: 1mm }
      .roles { display: flex; flex-direction: column; gap: 6mm; margin-top: 10mm }
      .role { display: flex; gap: 6mm; align-items: center } .role b { font-size: 14pt } .role code { font: 9pt monospace; color: ${muted} }
    </style></head><body>
      <section class="page"><small>SISTEMA VISUAL · CAMALEÓN CORPUS</small><h1 style="margin-top:80mm">${esc(name)}</h1>
        <div style="display:flex;gap:4mm">${roles.map(([, c]) => swatch(c, true)).join('')}</div></section>
      <section class="page"><small>PALETA</small><h2>Tres colores, tres roles</h2><div class="roles">
        ${roles.map(([r, c]) => `<div class="role">${swatch(c, true)}<div><b>${r}</b><br><code>${esc(hexOf(c))} · ${esc(fmtOklch(parseColor(c) ?? [0, 0, 0]))}</code></div></div>`).join('')}
      </div></section>
      ${layerPages.join('')}
      ${approvedCards ? `<section class="page"><small>PIEZAS APROBADAS</small><h2>Aplicado</h2><div class="grid" style="grid-template-columns:repeat(2,1fr)">${approvedCards}</div></section>` : ''}
    </body></html>`;
    win.document.open();
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 700);
    return `${slug(name)}-sistema.pdf`;
  } catch (e) {
    win.close();
    throw e;
  }
}
