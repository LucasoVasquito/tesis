import React, { useRef, useState } from 'react';
import { CropBox, FragmentType, Layer, Reference } from '../types';
import { useShortcuts } from '../hooks/useAuditShortcuts';
import { FRAGMENT_TYPES, layerInfo, layerTag } from '../utils/layers';
import { clampBox } from '../utils/parts';
import { Crop } from './Crop';
import { FragmentProposal, stepLayer } from './actions';
import type { Shortcut } from '../components/shell/ShortcutBar';

export type BreakdownState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'review'; proposals: FragmentProposal[] };

interface BreakdownProps {
  reference: Reference;
  /** Posición en el corpus ("01/24"). */
  position: string;
  state: BreakdownState;
  onChange: (proposals: FragmentProposal[]) => void;
  onAccept: (proposals: FragmentProposal[]) => void;
  onCancel: () => void;
  onRetry: () => void;
}

const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
/** Lámina que se ve: la elegida o, si no se tocó, la propuesta. */
const shownLayer = (x: FragmentProposal) => (x.layer !== undefined ? x.layer : x.aiLayer);

export const BREAKDOWN_SHORTCUTS: Shortcut[] = [
  { keys: '←→', label: 'Fragmento' },
  { keys: '↑↓', label: 'Lámina' },
  { keys: 'X', label: 'Descartar' },
  { keys: '⏎', label: 'Aceptar' },
  { keys: 'ESC', label: 'Cancelar' },
];

/**
 * Desglose (D): la IA propone recortes con una lámina sugerida y el diseñador los corrige.
 * Arrastrar sobre la imagen marca un recorte nuevo a mano.
 */
export function Breakdown({ reference, position, state, onChange, onAccept, onCancel, onRetry }: BreakdownProps) {
  const proposals = state.status === 'review' ? state.proposals : [];
  const [index, setIndex] = useState(0);
  const cur = proposals[Math.min(index, proposals.length - 1)];

  const update = (key: string, patch: Partial<FragmentProposal>) => onChange(proposals.map(x => (x.key === key ? { ...x, ...patch } : x)));

  useShortcuts(true, {
    arrowleft: () => proposals.length && setIndex(i => (i - 1 + proposals.length) % proposals.length),
    arrowright: () => proposals.length && setIndex(i => (i + 1) % proposals.length),
    arrowup: () => cur && update(cur.key, { layer: stepLayer(shownLayer(cur), 1) }),
    arrowdown: () => cur && update(cur.key, { layer: stepLayer(shownLayer(cur), -1) }),
    x: () => {
      if (!cur) return false;
      onChange(proposals.filter(x => x.key !== cur.key));
      setIndex(i => Math.max(0, Math.min(i, proposals.length - 2)));
    },
    enter: () => (state.status === 'review' && proposals.length ? onAccept(proposals) : state.status === 'error' ? onRetry() : false),
    escape: () => onCancel(),
  });

  /* Dibujo a mano */
  const wrapRef = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<CropBox | null>(null);
  const toNorm = (e: React.PointerEvent) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const boxFrom = (a: { x: number; y: number }, b: { x: number; y: number }): CropBox => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-void" role="region" aria-label={`Desglose de ${reference.name}`}>
      <div className="flex items-center justify-end px-5 pt-4 font-mono text-[11px] font-medium text-ink-2">
        <span className="text-core">D</span>&nbsp;· DESGLOSANDO REF {position}
      </div>
      <div className="flex min-h-0 flex-1 gap-8 px-10 pb-4 pt-2">
        {/* Imagen con los recortes */}
        <div className="flex min-w-0 flex-1 items-start justify-center">
          <div
            ref={wrapRef}
            className={`relative inline-block select-none ${state.status === 'review' ? 'cursor-crosshair touch-none' : ''}`}
            onPointerDown={e => {
              if (state.status !== 'review' || e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
              e.preventDefault();
              start.current = toNorm(e);
              wrapRef.current?.setPointerCapture(e.pointerId);
            }}
            onPointerMove={e => start.current && setDraft(boxFrom(start.current, toNorm(e)))}
            onPointerUp={e => {
              if (!start.current) return;
              const b = clampBox(boxFrom(start.current, toNorm(e)));
              start.current = null;
              setDraft(null);
              if (!b) return;
              const key = `m${Date.now().toString(36)}`;
              onChange([...proposals, { key, box: b, type: 'other', label: 'Recorte a mano', aiLayer: null, layer: null, source: 'manual' }]);
              setIndex(proposals.length);
            }}
          >
            <img
              src={reference.image}
              alt={reference.name}
              draggable={false}
              className="block max-h-[calc(100vh-260px)] max-w-full"
              style={{ filter: 'grayscale(.3) brightness(.75)' }}
              referrerPolicy="no-referrer"
            />
            {proposals.map((x, i) => {
              const l = shownLayer(x);
              const decided = x.layer !== undefined;
              return (
                <button
                  key={x.key}
                  type="button"
                  tabIndex={-1}
                  aria-label={`${x.label} · ${l ? layerTag(l) : 'sin lámina'}`}
                  onClick={() => setIndex(i)}
                  className={`absolute ${l ? layerInfo(l).className : ''}`}
                  style={{
                    left: pct(x.box.x),
                    top: pct(x.box.y),
                    width: pct(x.box.w),
                    height: pct(x.box.h),
                    border: `${i === index ? 3 : 2}px ${decided || x.source === 'manual' ? 'solid' : 'dashed'} var(--layer-color, rgba(242,239,232,.6))`,
                    background: i === index ? 'color-mix(in oklab, var(--layer-color, #F2EFE8) 14%, transparent)' : undefined,
                  }}
                />
              );
            })}
            {draft && <span aria-hidden="true" className="pointer-events-none absolute border-2 border-dashed border-bone" style={{ left: pct(draft.x), top: pct(draft.y), width: pct(draft.w), height: pct(draft.h) }} />}
            {state.status === 'loading' && (
              <div className="absolute inset-0 flex items-center justify-center bg-void/60">
                <span className="type-label bg-accent px-3 py-2 text-[13px] text-bone">LA IA PROPONE RECORTES…</span>
              </div>
            )}
          </div>
        </div>

        {/* Fragmentos */}
        <div className="flex w-[380px] shrink-0 flex-col gap-3 overflow-y-auto pr-1">
          <span className="type-name text-[28px]">{reference.name}</span>
          {state.status === 'error' && (
            <div role="alert" className="flex flex-col gap-3 border-2 border-discarded p-3">
              <span className="text-[14px]">{state.message}</span>
              <span className="type-label text-[12px] text-ink-2">⏎ · REINTENTAR · O MARCÁ RECORTES A MANO ARRASTRANDO SOBRE LA IMAGEN</span>
            </div>
          )}
          {state.status === 'review' && proposals.length === 0 && (
            <span className="text-[14px] text-ink-2">Sin recortes. Arrastrá sobre la imagen para marcar uno.</span>
          )}
          {proposals.map((x, i) => {
            const l = shownLayer(x);
            const on = i === index;
            const decided = x.layer !== undefined;
            return (
              <div
                key={x.key}
                onClick={() => setIndex(i)}
                className={`flex items-center gap-3 p-2 ${l ? layerInfo(l).className : ''}`}
                style={{ outline: on ? '3px solid var(--layer-color, var(--color-bone))' : undefined, outlineOffset: -3 }}
              >
                <Crop image={reference.image} crop={x.box} sourceRatio={reference.aspectRatio} alt={x.label} className="max-h-[62px] w-[78px] shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <input
                    aria-label="Nombre del fragmento"
                    value={x.label}
                    onChange={e => update(x.key, { label: e.target.value })}
                    onFocus={() => setIndex(i)}
                    className="type-name w-full bg-transparent text-[20px] leading-none text-ink outline-none focus:underline focus:decoration-core"
                  />
                  <div className="flex items-center gap-2">
                    {l ? (
                      <span className={`layer-tag ${decided ? '' : 'opacity-80'}`} style={decided ? undefined : { background: 'transparent', color: 'var(--color-ink)', boxShadow: 'inset 0 0 0 2px var(--layer-color)' }}>
                        {decided ? layerTag(l) : `PROPUESTA ${layerTag(l)}`}
                      </span>
                    ) : (
                      <span className="type-label text-[12px] text-ink-3">SIN LÁMINA</span>
                    )}
                    <select
                      aria-label="Tipo de fragmento"
                      value={x.type}
                      onChange={e => update(x.key, { type: e.target.value as FragmentType })}
                      onFocus={() => setIndex(i)}
                      className="type-label bg-void text-[11px] text-ink-2 outline-none"
                    >
                      {FRAGMENT_TYPES.map(t => (
                        <option key={t.type} value={t.type}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
          {state.status === 'review' && proposals.some(x => x.layer === undefined && x.aiLayer) && (
            <span className="type-label text-[11px] text-core">⏎ ACEPTA LAS LÁMINAS PROPUESTAS QUE NO MOVISTE</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Convierte la respuesta de /api/segment-reference en propuestas. */
export function proposalsFromParts(parts: any[]): FragmentProposal[] {
  const types = new Set(FRAGMENT_TYPES.map(t => t.type));
  return parts.map((x, i) => ({
    key: `ai${i}`,
    box: x.box,
    type: types.has(x.kind) ? (x.kind as FragmentType) : x.kind === 'logo' ? 'logo' : 'other',
    label: String(x.label || 'Fragmento'),
    description: x.description,
    aiLayer: [1, 2, 3].includes(Number(x.layer)) ? (Number(x.layer) as Layer) : null,
    source: 'ai' as const,
  }));
}
