import React, { useState } from 'react';
import { PaletteColor, Reference, Rule } from '../../types';
import { FAMILIES, Family } from '../../utils/families';
import { contrast, guessStyle, Specimen } from './Specimen';
import { TextureSwatch } from './TextureSwatch';
import { RuleEvidence } from '../../utils/ruleEvidence';

const lum = (hex: string) => contrast(hex, '#000000');
const FALLBACK = ['#111111', '#EDEDEF'];

/** Color más claro de la paleta (fondo de diagramas). */
const lightest = (palette: PaletteColor[]) => [...(palette.length ? palette.map(c => c.hex) : FALLBACK)].sort((a, b) => lum(b) - lum(a))[0];

/* ---------- Ejemplos visuales ---------- */
function EvidenceCrop({ refs, approx }: { refs: Reference[]; approx?: boolean }) {
  return (
    <div className={`relative grid h-[200px] gap-0.5 bg-bg ${refs.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {refs.slice(0, 2).map(r => (
        <img
          key={r.id}
          src={r.image}
          alt={`${approx ? 'Referencia aproximada' : 'Evidencia'} ${r.id}: ${r.name}`}
          className={`h-full w-full object-cover ${approx ? 'opacity-85' : ''}`}
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      ))}
      {approx && (
        <span
          className="absolute bottom-2 left-2 rounded-[3px] border border-line-mid bg-raised px-1.5 py-0.5 font-mono text-xs text-ink-2"
          title="La app eligió estas referencias comparando el texto de la regla con tu corpus; no es trazabilidad de la IA."
        >
          ≈ aproximada · {refs.slice(0, 2).map(r => r.id).join(' ')}
        </span>
      )}
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
  /** Imágenes si la regla no trae las suyas: evidencia de sus patrones o una coincidencia con el corpus. */
  fallback: RuleEvidence;
  specimenText: string;
  showWhy: boolean;
  /** Posición de la ficha dentro de su familia: rota las combinaciones de color del espécimen. */
  index?: number;
  /** Tablero: foco en un patrón (la ficha se atenúa si no sale de él). */
  dim?: boolean;
  highlight?: boolean;
  onFocusPattern?: (patternId: string) => void;
  onHoverPatterns?: (ids: string[] | null) => void;
}

export function RuleCard({ rule, family, palette, references, fallback, specimenText, showWhy, index = 0, dim, highlight, onFocusPattern, onHoverPatterns }: RuleCardProps) {
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
  const trace = [rule.patternIds.join(' '), rule.refIds.join(' ')].filter(Boolean).join(' · ');
  // Una regla tipográfica sin espécimen propio (redactada antes de este cambio) muestra la tipografía real
  // del corpus: el recorte de su evidencia, en lugar de repetir el nombre de la marca.
  if (kind === 'type' && !rule.example?.text && refs.length) kind = 'evidence';

  return (
    <article
      className={`flex flex-col overflow-hidden rounded-card border bg-bg transition-[opacity,border-color] duration-180 ease-emergent ${
        highlight ? 'border-signal/70' : 'border-line'
      } ${dim ? 'opacity-35' : ''}`}
      onMouseEnter={() => onHoverPatterns?.(rule.patternIds)}
      onMouseLeave={() => onHoverPatterns?.(null)}
    >
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
        <EvidenceCrop refs={refs} approx={approx} />
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
        {trace &&
          (onFocusPattern && rule.patternIds.length ? (
            <span className="mt-auto flex flex-wrap items-center gap-1 font-mono text-xs text-signal-ink">
              ←
              {rule.patternIds.map(pid => (
                <button
                  key={pid}
                  type="button"
                  onClick={() => onFocusPattern(pid)}
                  className="rounded-[3px] px-1 hover:bg-signal/10"
                  title={`Ver todo lo que sale de ${pid}`}
                >
                  {pid}
                </button>
              ))}
              {rule.refIds.length ? <span className="text-ink-2">· {rule.refIds.join(' ')}</span> : null}
            </span>
          ) : (
            <span className="mt-auto font-mono text-xs text-signal-ink">← {trace}</span>
          ))}
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
