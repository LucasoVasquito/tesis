import React, { useRef, useState } from 'react';
import { CropBox, PartKind } from '../../types';
import { clampBox, partKindInfo } from '../../utils/parts';

export interface PickerBox {
  key: string;
  box: CropBox;
  kind: PartKind;
  /** Número visible (1, 2, 3…) o ID corto de la parte. */
  badge: string;
  active: boolean;
  label: string;
}

interface PartsPickerProps {
  image: string;
  alt: string;
  boxes: PickerBox[];
  /** Si se pasa, arrastrar sobre la imagen marca una parte nueva. */
  onDraw?: (box: CropBox) => void;
  /** Clic en una caja (alternar en revisión, abrir la parte en lectura). */
  onBoxClick?: (key: string) => void;
  /** Imagen más baja (revisión: queda fija arriba mientras se recorre la lista). */
  compact?: boolean;
}

const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

/** Imagen de la referencia con las cajas de sus partes. En revisión permite dibujar cajas nuevas. */
export function PartsPicker({ image, alt, boxes, onDraw, onBoxClick, compact }: PartsPickerProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<CropBox | null>(null);

  const toNorm = (e: React.PointerEvent) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const boxFrom = (a: { x: number; y: number }, b: { x: number; y: number }): CropBox => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  });

  const onPointerDown = (e: React.PointerEvent) => {
    if (!onDraw || e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    start.current = toNorm(e);
    wrapRef.current?.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (start.current) setDraft(boxFrom(start.current, toNorm(e)));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!start.current) return;
    const b = clampBox(boxFrom(start.current, toNorm(e)));
    start.current = null;
    setDraft(null);
    if (b) onDraw?.(b);
  };

  return (
    <div className="flex justify-center bg-bg">
      <div
        ref={wrapRef}
        className={`relative inline-block select-none ${onDraw ? 'cursor-crosshair touch-none' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          start.current = null;
          setDraft(null);
        }}
      >
        <img src={image} alt={alt} draggable={false} className={`block max-w-full ${compact ? 'max-h-[260px]' : 'max-h-[340px]'}`} referrerPolicy="no-referrer" />
        {onDraw && <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-bg/35" />}
        {boxes.map(b => {
          const f = partKindInfo(b.kind).family;
          const style: React.CSSProperties = {
            left: pct(b.box.x),
            top: pct(b.box.y),
            width: pct(b.box.w),
            height: pct(b.box.h),
            borderColor: f.color,
          };
          const inner = (
            <span
              className="absolute left-0 top-0 -translate-y-px rounded-br-[3px] px-1 font-mono text-xs font-medium leading-[18px] text-bg"
              style={{ background: f.color }}
            >
              {b.badge}
            </span>
          );
          return onBoxClick ? (
            <button
              key={b.key}
              type="button"
              onClick={() => onBoxClick(b.key)}
              aria-pressed={onDraw ? b.active : undefined}
              aria-label={`${b.badge} · ${b.label}`}
              title={b.label}
              className={`absolute rounded-[3px] border-[1.5px] transition-[opacity,background-color] duration-120 hover:bg-white/10 ${
                b.active ? 'border-solid bg-white/5 opacity-100' : 'border-dashed opacity-55'
              }`}
              style={style}
            >
              {inner}
            </button>
          ) : (
            <span key={b.key} aria-hidden="true" className="pointer-events-none absolute rounded-[3px] border-[1.5px] border-dashed opacity-70" style={style}>
              {inner}
            </span>
          );
        })}
        {draft && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute rounded-[3px] border-[1.5px] border-dashed border-ink bg-white/10"
            style={{ left: pct(draft.x), top: pct(draft.y), width: pct(draft.w), height: pct(draft.h) }}
          />
        )}
      </div>
    </div>
  );
}
