import React from 'react';
import { PaletteColor, Reference, Rule } from '../../types';
import { FAMILIES, Family } from '../../utils/families';

/* ---------- Color: contraste entre colores de la paleta ---------- */
const lum = (hex: string) => {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
};
export const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const FALLBACK = ['#111111', '#EDEDEF'];

/** Fondo y tinta para un espécimen: el color más intenso de la paleta y el de mayor contraste con él. */
export function specimenColors(palette: PaletteColor[]): { bg: string; ink: string } {
  const hexes = palette.length ? palette.map(c => c.hex) : FALLBACK;
  const chroma = (h: string) => {
    const n = parseInt(h.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return Math.max(r, g, b) - Math.min(r, g, b);
  };
  const bg = [...hexes].sort((a, b) => chroma(b) - chroma(a))[0];
  const ink = [...hexes, '#0B0B0D', '#F4F4F0'].filter(h => h !== bg).sort((a, b) => contrast(b, bg) - contrast(a, bg))[0];
  return { bg, ink };
}

/** Color más claro de la paleta (fondo de diagramas). */
const lightest = (palette: PaletteColor[]) => [...(palette.length ? palette.map(c => c.hex) : FALLBACK)].sort((a, b) => lum(b) - lum(a))[0];

/* ---------- Ejemplos visuales ---------- */
function TypeSpecimen({ text, palette }: { text: string; palette: PaletteColor[] }) {
  const { bg, ink } = specimenColors(palette);
  const size = text.length <= 6 ? 88 : text.length <= 10 ? 64 : 44;
  return (
    <div className="flex h-[200px] items-center justify-center overflow-hidden px-4" style={{ background: bg }} aria-hidden="true">
      <span
        className="block max-w-full text-center uppercase leading-[0.9]"
        style={{ fontFamily: 'var(--font-specimen)', fontSize: size, color: ink, letterSpacing: '-0.01em', transform: 'scaleY(1.25)' }}
      >
        {text}
      </span>
    </div>
  );
}

function EvidenceCrop({ refs }: { refs: Reference[] }) {
  if (!refs.length) return <div className="h-[200px] bg-raised" aria-hidden="true" />;
  return (
    <div className={`grid h-[200px] gap-0.5 bg-bg ${refs.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {refs.slice(0, 2).map(r => (
        <img key={r.id} src={r.image} alt={`Evidencia ${r.id}: ${r.name}`} className="h-full w-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
      ))}
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

/* ---------- Ficha ---------- */
interface RuleCardProps {
  rule: Rule;
  family: Family;
  palette: PaletteColor[];
  references: Reference[];
  /** Referencias de evidencia de los patrones de la regla (si la regla no trae las suyas). */
  fallbackRefIds: string[];
  specimenText: string;
  showWhy: boolean;
}

export function RuleCard({ rule, family, palette, references, fallbackRefIds, specimenText, showWhy }: RuleCardProps) {
  const byId = new Map(references.map(r => [r.id, r]));
  const kind = rule.example?.kind ?? 'evidence';
  const refIds = rule.example?.refIds?.length ? rule.example.refIds : rule.refIds.length ? rule.refIds : fallbackRefIds;
  const refs = refIds.map(id => byId.get(id)).filter(Boolean) as Reference[];
  const trace = [rule.patternIds.join(' '), rule.refIds.join(' ')].filter(Boolean).join(' · ');

  return (
    <article className="flex flex-col overflow-hidden rounded-card border border-line bg-bg">
      {kind === 'type' ? (
        <TypeSpecimen text={rule.example?.text || specimenText} palette={palette} />
      ) : kind === 'grid' ? (
        <GridDiagram cols={rule.example?.cols} rows={rule.example?.rows} palette={palette} />
      ) : (
        <EvidenceCrop refs={refs} />
      )}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <span className="font-mono text-xs" style={{ color: family.ink }}>
          {rule.code} · {family.label}
        </span>
        <h4 className="m-0 text-base font-semibold leading-[1.3] text-ink">{rule.title}</h4>
        {(rule.use?.length || rule.avoid?.length || (kind === 'grid' && rule.example?.cols)) && (
          <div className="flex flex-wrap gap-1.5">
            {rule.use?.length ? (
              <span className="inline-flex h-6 items-center rounded-tag bg-confirmed/10 px-2 text-xs text-confirmed-ink">Sí · {rule.use.join(', ')}</span>
            ) : null}
            {rule.avoid?.length ? (
              <span className="inline-flex h-6 items-center rounded-tag bg-discarded/10 px-2 text-xs text-discarded-ink">No · {rule.avoid.join(', ')}</span>
            ) : null}
            {kind === 'grid' && rule.example?.cols ? (
              <span className="inline-flex h-6 items-center rounded-tag bg-white/5 px-2 font-mono text-xs text-ink-2">
                retícula {rule.example.cols} × {rule.example.rows}
              </span>
            ) : null}
          </div>
        )}
        {showWhy && rule.detail && rule.detail !== rule.title && <p className="m-0 font-serif text-15 leading-normal text-ink-2">{rule.detail}</p>}
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
