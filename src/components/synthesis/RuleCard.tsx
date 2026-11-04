import React, { useEffect, useState } from 'react';
import { CropBox, PaletteColor, Reference, Rule } from '../../types';
import { cropImage } from '../../utils/parts';
import { FAMILIES, Family } from '../../utils/families';
import { contrast, guessStyle, Specimen } from './Specimen';
import { TextureSwatch } from './TextureSwatch';
import { RuleEvidence } from '../../utils/ruleEvidence';

const lum = (hex: string) => contrast(hex, '#000000');
const FALLBACK = ['#111111', '#EDEDEF'];

/** Color más claro de la paleta (fondo de diagramas). */
const lightest = (palette: PaletteColor[]) => [...(palette.length ? palette.map(c => c.hex) : FALLBACK)].sort((a, b) => lum(b) - lum(a))[0];

/* ---------- Ejemplos visuales ---------- */
const cropCache = new Map<string, string>();

/** Recorte de una referencia (se dibuja una vez en el navegador y queda en memoria). */
function useCrop(ref: Reference, crop?: CropBox) {
  const key = crop ? `${ref.id}|${crop.x.toFixed(3)},${crop.y.toFixed(3)},${crop.w.toFixed(3)},${crop.h.toFixed(3)}` : '';
  const [url, setUrl] = useState<string | null>(key ? cropCache.get(key) ?? null : null);
  useEffect(() => {
    if (!crop || cropCache.has(key)) {
      setUrl(key ? cropCache.get(key) ?? null : null);
      return;
    }
    let alive = true;
    cropImage(ref.image, [crop], 900)
      .then(([c]) => {
        cropCache.set(key, c.image);
        if (alive) setUrl(c.image);
      })
      .catch(() => alive && setUrl(null));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return url;
}

/** Una imagen por ficha: el recorte que eligió Gemini, una parte del corpus o la referencia entera. */
function EvidenceCrop({ reference: r, crop, note, approx }: { reference: Reference; crop?: CropBox; note?: string; approx?: boolean }) {
  const cropped = useCrop(r, crop);
  const src = crop ? cropped : r.image;
  const label = crop ? `recorte · ${r.id}` : approx ? `≈ aproximada · ${r.id}` : r.parentId ? `parte · ${r.id}` : r.id;
  return (
    <div className="relative h-[200px] bg-bg">
      {src ? (
        <img
          src={src}
          alt={`${note || r.name} (${r.id})`}
          className={`h-full w-full ${r.parentId && !crop ? 'object-contain' : 'object-cover'} ${approx && !crop ? 'opacity-85' : ''}`}
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      ) : (
        <div className="h-full w-full animate-pulse bg-raised" aria-hidden="true" />
      )}
      <span
        className="absolute bottom-2 left-2 max-w-[calc(100%-16px)] truncate rounded-[3px] border border-line-mid bg-raised px-1.5 py-0.5 font-mono text-xs text-ink-2"
        title={
          crop
            ? `Recorte elegido por Gemini${note ? `: ${note}` : ''}`
            : approx
              ? 'La app eligió esta referencia comparando el texto de la regla con tu corpus; no es trazabilidad de la IA.'
              : undefined
        }
      >
        {label}
      </span>
    </div>
  );
}

/** Diagrama de retícula: módulos en el perímetro con la paleta del corpus y el centro libre. */
export function GridDiagram({ cols = 4, rows = 4, palette, height = 200 }: { cols?: number; rows?: number; palette: PaletteColor[]; height?: number }) {
  const c = Math.min(6, Math.max(2, cols));
  const r = Math.min(6, Math.max(2, rows));
  const bg = lightest(palette);
  const fills = (palette.length ? palette.map(p => p.hex) : FALLBACK).filter(h => h !== bg);
  const fill = (i: number) => fills[i % Math.max(fills.length, 1)] ?? '#111111';
  const ink = contrast('#111111', bg) > contrast('#F4F4F0', bg) ? '#111111' : '#F4F4F0';
  const cells: React.CSSProperties[] =
    c >= 3 && r >= 3
      ? [
          { gridColumn: '1 / -1', gridRow: '1', background: fill(0) },
          { gridColumn: '1', gridRow: `2 / ${r}`, background: fill(1) },
          { gridColumn: `2 / ${c}`, gridRow: `2 / ${r}`, border: `1.5px dashed ${ink}` },
          { gridColumn: `${c}`, gridRow: `2 / ${r}`, background: fill(2) },
          { gridColumn: `1 / ${Math.ceil(c / 2) + 1}`, gridRow: `${r}`, background: fill(0) },
          { gridColumn: `${Math.ceil(c / 2) + 1} / -1`, gridRow: `${r}`, background: fill(3) },
        ]
      : Array.from({ length: c * r }, (_, i) => ({ background: i % 2 ? fill(i) : 'transparent', border: i % 2 ? undefined : `1px dashed ${ink}` }));
  return (
    <div
      className="grid gap-1 p-3"
      style={{ height, background: bg, gridTemplateColumns: `repeat(${c}, 1fr)`, gridTemplateRows: `repeat(${r}, 1fr)` }}
      role="img"
      aria-label={`Retícula de ${c} por ${r}: módulos en el perímetro, centro libre`}
    >
      {cells.map((style, i) => (
        <div key={i} style={style} />
      ))}
    </div>
  );
}

/** Franja de imágenes extra de la evidencia, para que la ficha no dependa de un único ejemplo. */
function ExtraThumbs({ refs }: { refs: Reference[] }) {
  if (!refs.length) return null;
  return (
    <div className="grid gap-px bg-line" style={{ gridTemplateColumns: `repeat(${refs.length}, 1fr)` }}>
      {refs.map(r => (
        <div key={r.id} className="relative h-16 bg-bg" title={r.id}>
          <img src={r.image} alt={`${r.name} (${r.id})`} className="h-full w-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
          <span className="absolute bottom-1 left-1 rounded-[3px] bg-raised px-1 font-mono text-[10px] leading-4 text-ink-2">{r.id}</span>
        </div>
      ))}
    </div>
  );
}

/** Limpia las listas Sí/No: el modelo a veces repite una palabra hasta el infinito. */
function cleanTags(items?: string[]): string[] {
  const out: string[] = [];
  for (const raw of items ?? []) {
    const words = String(raw).split(/\s+/).filter(Boolean);
    const collapsed = words.filter((w, i) => i === 0 || w.toLowerCase() !== words[i - 1].toLowerCase());
    const text = collapsed.join(' ').slice(0, 48).trim();
    if (text && !out.some(o => o.toLowerCase() === text.toLowerCase())) out.push(text);
  }
  return out.slice(0, 4);
}

/* ---------- Ficha ---------- */
interface RuleCardProps {
  rule: Rule;
  family: Family;
  palette: PaletteColor[];
  references: Reference[];
  /** Imágenes si la regla no trae las suyas: evidencia de sus patrones o una coincidencia con el corpus. */
  fallback: RuleEvidence;
  specimenText: string;
  showWhy: boolean;
  /** Posición de la ficha dentro de su familia: rota las combinaciones de color del espécimen. */
  index?: number;
}

export function RuleCard({ rule, family, palette, references, fallback, specimenText, showWhy, index = 0 }: RuleCardProps) {
  const [open, setOpen] = useState(false);
  const byId = new Map(references.map(r => [r.id, r]));
  let kind = rule.example?.kind ?? 'evidence';
  const ownIds = rule.example?.refIds?.length ? rule.example.refIds : rule.refIds;
  const refIds = ownIds.length ? ownIds : fallback.ids;
  const approx = !ownIds.length && fallback.approx;
  const refs = refIds.map(id => byId.get(id)).filter(Boolean) as Reference[];
  // Reglas redactadas como texto corrido: el título es el comienzo truncado del detalle. Se muestra la frase entera.
  const truncated = rule.title.endsWith('…') && rule.detail.startsWith(rule.title.slice(0, -1).trim());
  const title = truncated ? rule.detail : rule.title;
  const use = cleanTags(rule.use);
  const avoid = cleanTags(rule.avoid);
  const trace = [rule.patternIds.join(' '), rule.refIds.join(' ')].filter(Boolean).join(' · ');
  // Una regla tipográfica sin espécimen propio (redactada antes de este cambio) muestra la tipografía real
  // del corpus: el recorte de su evidencia, en lugar de repetir el nombre de la marca.
  if (kind === 'type' && !rule.example?.text && refs.length) kind = 'evidence';

  return (
    <article className="flex flex-col overflow-hidden rounded-card border border-line bg-bg">
      {kind === 'type' ? (
        <Specimen
          text={rule.example?.text || specimenText}
          subtext={rule.example?.subtext}
          style={rule.example?.style ?? guessStyle(`${rule.title} ${rule.detail}`, index)}
          palette={palette}
          index={index}
        />
      ) : kind === 'grid' ? (
        <GridDiagram cols={rule.example?.cols} rows={rule.example?.rows} palette={palette} />
      ) : refs.length ? (
        <div>
          <EvidenceCrop reference={refs[0]} crop={ownIds.length ? rule.example?.crop : undefined} note={rule.example?.cropNote} approx={approx} />
          <ExtraThumbs refs={refs.slice(1, 4)} />
        </div>
      ) : family.id === 'typography' ? (
        <Specimen text={specimenText} style={guessStyle(`${rule.title} ${rule.detail}`, index)} palette={palette} index={index} />
      ) : family.id === 'composition' ? (
        <GridDiagram palette={palette} />
      ) : (
        <TextureSwatch text={`${rule.title} ${rule.detail}`} palette={palette} index={index} />
      )}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <span className="font-mono text-xs" style={{ color: family.ink }}>
          {rule.code} · {family.label}
        </span>
        <h4 className="m-0 text-base font-semibold leading-[1.3] text-ink">{title}</h4>
        {(use.length || avoid.length || (kind === 'grid' && rule.example?.cols)) && (
          <div className="flex flex-wrap gap-1.5">
            {use.length ? (
              <span className="inline-flex min-h-6 items-center rounded-tag bg-confirmed/10 px-2 py-0.5 text-xs text-confirmed-ink">Sí · {use.join(', ')}</span>
            ) : null}
            {avoid.length ? (
              <span className="inline-flex min-h-6 items-center rounded-tag bg-discarded/10 px-2 py-0.5 text-xs text-discarded-ink">No · {avoid.join(', ')}</span>
            ) : null}
            {kind === 'grid' && rule.example?.cols ? (
              <span className="inline-flex h-6 items-center rounded-tag bg-white/5 px-2 font-mono text-xs text-ink-2">
                retícula {rule.example.cols} × {rule.example.rows}
              </span>
            ) : null}
          </div>
        )}
        {!truncated && rule.detail && rule.detail !== rule.title && (
          <div className="flex flex-col items-start gap-1">
            <p className={`m-0 font-serif text-15 leading-normal text-ink-2 ${showWhy || open ? '' : 'line-clamp-3'}`}>{rule.detail}</p>
            {!showWhy && rule.detail.length > 150 && (
              <button type="button" className="text-xs text-ink underline-offset-2 hover:underline" aria-expanded={open} onClick={() => setOpen(o => !o)}>
                {open ? 'Ver menos' : 'Ver más'}
              </button>
            )}
          </div>
        )}
        {trace && <span className="mt-auto font-mono text-xs text-signal-ink">← {trace}</span>}
      </div>
    </article>
  );
}

/** Tarjeta de color para la pestaña Color. */
export function ColorCard({ c }: { c: PaletteColor }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-card border border-line bg-bg">
      <div className="h-24" style={{ background: c.hex }} />
      <div className="flex flex-col gap-1 p-3">
        <span className="font-mono text-xs font-medium text-ink">{c.hex.toUpperCase()}</span>
        <span className="text-13 font-medium text-ink">{c.name}</span>
        <span className="text-xs text-ink-2">
          {c.role}
          {c.share ? ` · ${Math.round(c.share * 100)}%` : ''}
        </span>
        {c.source && <span className="font-mono text-xs text-signal-ink">← {c.source}</span>}
      </div>
    </div>
  );
}

export const RULE_FAMILY = { typographyRules: FAMILIES.typography, textureRules: FAMILIES.matter, compositionRules: FAMILIES.composition } as const;
