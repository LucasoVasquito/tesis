import React, { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import { Reference } from '../../types';
import { IconButton, ReferenceCard, Tone, zoomLevelFor } from '../ui';
import { imageRatio, partKindInfo } from '../../utils/parts';

export interface CanvasHandle {
  /** Encuadra y enfoca una ficha (reemplaza scrollIntoView). */
  focusReference: (id: string, opts?: { focus?: boolean }) => void;
  fitAll: () => void;
  fitTo: (ids: string[]) => void;
  /** Centro visible del lienzo en coordenadas del lienzo (para pegar imágenes). */
  getViewCenter: () => { x: number; y: number };
}

export interface CanvasHighlight {
  ids: string[];
  /** Etiqueta del nodo al que convergen las líneas de evidencia (ID del patrón). */
  label?: string;
  /** Opacidad del resto de las fichas. */
  dimOthers: number;
}

interface ReferenceCanvasProps {
  references: Reference[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove?: (id: string, pos: { x: number; y: number }) => void;
  onResize?: (id: string, width: number) => void;
  onDropFiles?: (files: File[], at: { x: number; y: number }) => void;
  highlight?: CanvasHighlight | null;
  /** Ficha "en lectura" durante la inducción. */
  readingId?: string | null;
  /** Atenuación general (inducción) cuando no hay highlight. */
  dimAll?: number;
  analysisFor?: (ref: Reference) => { tone: Tone; label: string } | null;
  locked?: boolean;
  toolbarStart?: React.ReactNode;
  emptyState?: React.ReactNode;
  ref?: React.Ref<CanvasHandle>;
}

const MIN_SCALE = 0.2;
const MAX_SCALE = 3;
const DEFAULT_W = 260;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const cardW = (r: Reference) => r.width || DEFAULT_W;
const imageH = (r: Reference) => cardW(r) / imageRatio(r);
const META_H = 76;

export function ReferenceCanvas({
  references,
  selectedId,
  onSelect,
  onMove,
  onResize,
  onDropFiles,
  highlight,
  readingId,
  dimAll,
  analysisFor,
  locked,
  toolbarStart,
  emptyState,
  ref,
}: ReferenceCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [t, setT] = useState({ x: 0, y: 0, scale: 1 });
  const tRef = useRef(t);
  tRef.current = t;
  const [animate, setAnimate] = useState(false);
  const [interacting, setInteracting] = useState<null | 'pan' | 'drag' | 'resize'>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const gesture = useRef<{
    kind: 'pan' | 'card' | 'resize';
    id?: string;
    startX: number;
    startY: number;
    origin: { x: number; y: number };
    width?: number;
    moved: boolean;
  } | null>(null);

  const zoom = zoomLevelFor(t.scale);
  const cardH = (r: Reference) => imageH(r) + (zoom === 'far' ? 0 : META_H);

  /* ---------- Encuadre ---------- */
  const frame = useCallback(
    (rect: { minX: number; minY: number; maxX: number; maxY: number }, pad = 96, maxScale = 1.1) => {
      const el = containerRef.current;
      if (!el) return;
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      const w = Math.max(rect.maxX - rect.minX, 1) + pad * 2;
      const h = Math.max(rect.maxY - rect.minY, 1) + pad * 2;
      const scale = clamp(Math.min(width / w, height / h), 0.3, maxScale);
      const cx = (rect.minX + rect.maxX) / 2;
      const cy = (rect.minY + rect.maxY) / 2;
      setAnimate(true);
      setT({ x: width / 2 - cx * scale, y: height / 2 - cy * scale, scale });
    },
    [],
  );

  const bounds = useCallback(
    (refs: Reference[]) => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      refs.forEach(r => {
        minX = Math.min(minX, r.position.x);
        minY = Math.min(minY, r.position.y);
        maxX = Math.max(maxX, r.position.x + cardW(r));
        maxY = Math.max(maxY, r.position.y + imageH(r) + META_H);
      });
      return { minX, minY, maxX, maxY };
    },
    [],
  );

  const fitAll = useCallback(() => {
    if (references.length) frame(bounds(references));
  }, [references, frame, bounds]);

  const fitTo = useCallback(
    (ids: string[]) => {
      const refs = references.filter(r => ids.includes(r.id));
      if (!refs.length) return;
      const b = bounds(refs);
      frame({ ...b, minY: b.minY - 96 }, 120, 1.1);
    },
    [references, frame, bounds],
  );

  const focusReference = useCallback(
    (id: string, opts?: { focus?: boolean }) => {
      const r = references.find(x => x.id === id);
      const el = containerRef.current;
      if (!r || !el) return;
      const { width, height } = el.getBoundingClientRect();
      const scale = Math.max(tRef.current.scale, 0.6);
      const cx = r.position.x + cardW(r) / 2;
      const cy = r.position.y + imageH(r) / 2;
      setAnimate(true);
      setT({ x: width / 2 - cx * scale, y: height / 2 - cy * scale, scale });
      if (opts?.focus !== false) {
        requestAnimationFrame(() => document.getElementById(`ref-card-${id}`)?.focus({ preventScroll: true }));
      }
    },
    [references],
  );

  useImperativeHandle(
    ref,
    () => ({
      focusReference,
      fitAll,
      fitTo,
      getViewCenter: () => {
        const el = containerRef.current;
        const { x, y, scale } = tRef.current;
        if (!el) return { x: 200, y: 200 };
        const { width, height } = el.getBoundingClientRect();
        return { x: (width / 2 - x) / scale, y: (height / 2 - y) / scale };
      },
    }),
    [focusReference, fitAll, fitTo],
  );

  // Encuadre inicial.
  const didInitialFit = useRef(false);
  useLayoutEffect(() => {
    if (didInitialFit.current || references.length === 0) return;
    didInitialFit.current = true;
    if (highlight?.ids.length) fitTo(highlight.ids);
    else fitAll();
    setAnimate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [references.length]);

  // Encuadre automático sobre la evidencia activa.
  const highlightKey = highlight?.ids.join('|') ?? '';
  useEffect(() => {
    if (!highlightKey || !didInitialFit.current) return;
    fitTo(highlightKey.split('|'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightKey]);

  /* ---------- Zoom ---------- */
  const zoomAt = useCallback((factor: number, px?: number, py?: number) => {
    const el = containerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const mx = px ?? width / 2;
    const my = py ?? height / 2;
    setT(prev => {
      const scale = clamp(prev.scale * factor, MIN_SCALE, MAX_SCALE);
      return { x: mx - (mx - prev.x) * (scale / prev.scale), y: my - (my - prev.y) * (scale / prev.scale), scale };
    });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setAnimate(false);
      const rect = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
        const factor = Math.exp(-clamp(e.deltaY, -60, 60) * 0.004);
        zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top);
      } else {
        setT(prev => ({ ...prev, x: prev.x - e.deltaX }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  /* ---------- Gestos (puntero) ---------- */
  const toCanvas = (clientX: number, clientY: number) => {
    const rect = containerRef.current!.getBoundingClientRect();
    const { x, y, scale } = tRef.current;
    return { x: (clientX - rect.left - x) / scale, y: (clientY - rect.top - y) / scale };
  };

  const onBackgroundPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    if ((e.target as HTMLElement).closest('[data-card], [data-toolbar]')) return;
    setAnimate(false);
    gesture.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, origin: { x: t.x, y: t.y }, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onCardPointerDown = (e: React.PointerEvent, r: Reference) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setAnimate(false);
    gesture.current = { kind: 'card', id: r.id, startX: e.clientX, startY: e.clientY, origin: { ...r.position }, moved: false };
    containerRef.current?.setPointerCapture(e.pointerId);
  };

  const onResizePointerDown = (e: React.PointerEvent, r: Reference) => {
    e.stopPropagation();
    e.preventDefault();
    gesture.current = { kind: 'resize', id: r.id, startX: e.clientX, startY: e.clientY, origin: { ...r.position }, width: cardW(r), moved: false };
    containerRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (!g.moved && Math.hypot(dx, dy) < 4) return;
    if (!g.moved) {
      g.moved = true;
      setInteracting(g.kind === 'pan' ? 'pan' : g.kind === 'resize' ? 'resize' : 'drag');
    }
    if (g.kind === 'pan') {
      setT(prev => ({ ...prev, x: g.origin.x + dx, y: g.origin.y + dy }));
    } else if (g.kind === 'card' && g.id && onMove && !locked) {
      const s = tRef.current.scale;
      onMove(g.id, { x: Math.round(g.origin.x + dx / s), y: Math.round(g.origin.y + dy / s) });
    } else if (g.kind === 'resize' && g.id && onResize && !locked) {
      const s = tRef.current.scale;
      onResize(g.id, Math.round(clamp((g.width ?? DEFAULT_W) + dx / s, 140, 800)));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    setInteracting(null);
    if (!g) return;
    try {
      containerRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    if (!g.moved) {
      if (g.kind === 'card' && g.id) onSelect(g.id);
      else if (g.kind === 'pan') onSelect(null);
    }
  };

  /* ---------- Teclado en fichas ---------- */
  const onCardKeyDown = (e: React.KeyboardEvent, r: Reference) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(r.id);
      return;
    }
    const step = e.shiftKey ? 16 : 8;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (delta[e.key] && onMove && !locked) {
      e.preventDefault();
      const [dx, dy] = delta[e.key];
      onMove(r.id, { x: r.position.x + dx, y: r.position.y + dy });
    }
    if ((e.key === '+' || e.key === '-') && onResize && !locked) {
      e.preventDefault();
      onResize(r.id, clamp(cardW(r) + (e.key === '+' ? 20 : -20), 140, 800));
    }
  };

  // Al recorrer con Tab, pasear el lienzo hasta la ficha si quedó fuera de vista.
  const ensureVisible = (r: Reference) => {
    const el = containerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const { x, y, scale } = tRef.current;
    const sx = r.position.x * scale + x;
    const sy = r.position.y * scale + y;
    const sw = cardW(r) * scale;
    const sh = cardH(r) * scale;
    if (sx < 0 || sy < 56 || sx + sw > width || sy + sh > height) focusReference(r.id, { focus: false });
  };

  /* ---------- Archivos ---------- */
  const onDragOver = (e: React.DragEvent) => {
    if (!onDropFiles || !Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    setIsDragOver(true);
  };
  const onDrop = (e: React.DragEvent) => {
    if (!onDropFiles) return;
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) onDropFiles(files, toCanvas(e.clientX, e.clientY));
  };

  /* ---------- Evidencia: líneas al nodo del patrón ---------- */
  const evidence = useMemo(() => {
    if (!highlight?.label || !highlight.ids.length) return null;
    const refs = references.filter(r => highlight.ids.includes(r.id));
    if (!refs.length) return null;
    const centers = refs.map(r => ({ id: r.id, x: r.position.x + cardW(r) / 2, y: r.position.y + imageH(r) / 2 }));
    const minY = Math.min(...refs.map(r => r.position.y));
    const node = { x: centers.reduce((a, c) => a + c.x, 0) / centers.length, y: minY - 72 };
    return { centers, node };
  }, [highlight, references]);

  /* ---------- Partes: línea punteada desde la original ---------- */
  const partLinks = useMemo(() => {
    const byId = new Map(references.map(r => [r.id, r]));
    return references
      .filter(r => r.parentId && byId.has(r.parentId))
      .map(r => {
        const parent = byId.get(r.parentId!)!;
        const pc = parent.position.x + cardW(parent) / 2;
        const toRight = r.position.x + cardW(r) / 2 >= pc;
        // Desde el borde de la original más cercano hasta el borde de la parte.
        const x1 = toRight ? parent.position.x + cardW(parent) : parent.position.x;
        const y1 = parent.position.y + Math.min(imageH(parent) - 16, Math.max(16, r.position.y + imageH(r) / 2 - parent.position.y));
        const x2 = toRight ? r.position.x : r.position.x + cardW(r);
        const y2 = r.position.y + imageH(r) / 2;
        return { id: r.id, x1, y1, x2, y2, color: partKindInfo(r.partKind).family.color };
      });
  }, [references]);

  const highlightSet = new Set(highlight?.ids ?? []);
  const transition = animate ? 'transform 240ms var(--ease-emergent)' : 'none';

  return (
    <div
      ref={containerRef}
      className={`dot-grid relative h-full w-full touch-none overflow-hidden ${interacting ? 'select-none' : ''} ${
        interacting === 'pan' ? 'cursor-grabbing' : 'cursor-grab'
      }`}
      style={{ backgroundPosition: `${t.x}px ${t.y}px`, backgroundSize: `${24 * t.scale}px ${24 * t.scale}px` }}
      onPointerDown={onBackgroundPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDragOver={onDragOver}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={onDrop}
    >
      {/* Barra flotante */}
      <div
        data-toolbar
        className="absolute left-4 top-4 z-20 flex flex-wrap items-center gap-2 rounded-card border border-line-mid bg-raised p-1 shadow-float"
      >
        {toolbarStart}
        <div className="flex items-center" role="group" aria-label="Zoom">
          <IconButton label="Alejar" size="sm" bare onClick={() => { setAnimate(true); zoomAt(1 / 1.2); }}>
            <Minus className="size-4 stroke-[1.5]" />
          </IconButton>
          <span className="w-12 text-center font-mono text-xs text-ink-2" aria-live="polite">
            <span className="sr-only">Zoom </span>
            {Math.round(t.scale * 100)}%
          </span>
          <IconButton label="Acercar" size="sm" bare onClick={() => { setAnimate(true); zoomAt(1.2); }}>
            <Plus className="size-4 stroke-[1.5]" />
          </IconButton>
          <button type="button" className="btn btn-ghost btn-sm" onClick={fitAll} disabled={!references.length}>
            <Maximize aria-hidden="true" />
            Ajustar
          </button>
        </div>
      </div>

      {/* Capa transformada */}
      <div
        className="pointer-events-none absolute left-0 top-0 origin-top-left"
        style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})`, transition }}
      >
        {partLinks.length > 0 && (
          <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden="true">
            {partLinks.map(l => (
              <g key={l.id} opacity={highlight || readingId ? 0.35 : 0.8}>
                <path
                  d={`M ${l.x1} ${l.y1} C ${(l.x1 + l.x2) / 2} ${l.y1}, ${(l.x1 + l.x2) / 2} ${l.y2}, ${l.x2} ${l.y2}`}
                  fill="none"
                  stroke={l.color}
                  strokeWidth={1.25}
                  strokeDasharray="4 4"
                  vectorEffect="non-scaling-stroke"
                />
                <circle cx={l.x1} cy={l.y1} r={3} fill={l.color} />
              </g>
            ))}
          </svg>
        )}
        {evidence && (
          <>
            <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden="true">
              {evidence.centers.map(c => (
                <line
                  key={c.id}
                  x1={c.x}
                  y1={c.y}
                  x2={evidence.node.x}
                  y2={evidence.node.y}
                  stroke="rgba(255,255,255,.18)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
            <span
              className="absolute z-10 whitespace-nowrap rounded-full border border-signal/70 bg-raised px-3 py-0.5 font-mono text-xs text-ink"
              style={{ left: evidence.node.x, top: evidence.node.y, transform: `translate(-50%, -50%) scale(${1 / t.scale})` }}
            >
              {highlight?.label}
            </span>
          </>
        )}

        {references.map(r => {
          const isEv = highlightSet.has(r.id) || r.id === readingId;
          const opacity = highlight
            ? highlightSet.has(r.id) ? 1 : highlight.dimOthers
            : readingId
              ? r.id === readingId ? 1 : dimAll ?? 1
              : dimAll ?? 1;
          const selected = r.id === selectedId;
          return (
            <div
              key={r.id}
              id={`ref-card-${r.id}`}
              data-card
              role="button"
              tabIndex={0}
              aria-label={`${r.name} (${r.id})${isEv && highlight ? ', evidencia del patrón activo' : ''}`}
              aria-pressed={selected}
              onPointerDown={e => onCardPointerDown(e, r)}
              onKeyDown={e => onCardKeyDown(e, r)}
              onFocus={e => {
                if (e.currentTarget.matches(':focus-visible')) ensureVisible(r);
              }}
              className="group pointer-events-auto absolute rounded-card outline-offset-4 transition-opacity duration-180 ease-emergent"
              style={{ transform: `translate(${r.position.x}px, ${r.position.y}px)`, opacity, zIndex: selected || isEv ? 2 : 1 }}
            >
              <ReferenceCard
                reference={r}
                zoom={zoom}
                width={cardW(r)}
                selected={selected}
                evidence={isEv}
                analysis={analysisFor?.(r) ?? null}
              />
              {onResize && !locked && zoom !== 'far' && (
                <span
                  aria-hidden="true"
                  onPointerDown={e => onResizePointerDown(e, r)}
                  className="absolute -bottom-1 -right-1 size-4 cursor-se-resize rounded-br-card border-b-2 border-r-2 border-line-strong opacity-0 transition-opacity duration-120 group-hover:opacity-100"
                />
              )}
            </div>
          );
        })}
      </div>

      {references.length === 0 && emptyState && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="pointer-events-auto w-full max-w-sm" data-toolbar>
            {emptyState}
          </div>
        </div>
      )}

      {isDragOver && (
        <div className="pointer-events-none absolute inset-4 z-30 flex items-center justify-center rounded-card border border-dashed border-ink/40 bg-bg/80">
          <span className="text-15 font-medium text-ink">Soltá las imágenes para sumarlas al corpus</span>
        </div>
      )}
    </div>
  );
}
