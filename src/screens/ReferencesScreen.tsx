import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BoardBox, Project, Reference } from '../types';
import { useShortcuts } from '../hooks/useAuditShortcuts';
import { corpusRefs } from '../utils/layers';
import { MIN_REFS } from '../pieces/model';
import { AnalysisState } from '../pieces/analyze';
import { isAnalyzed } from '../utils/steps';
import { BarButton, BarSep, BottomBar } from '../components/shell/BottomBar';
import { MutateOptions } from './types';

/**
 * 01 · REFERENCIAS. Un lienzo infinito tipo Miro: fondo de puntos, cámara {x, y, z}, imágenes con posición y tamaño libres.
 * Rueda = zoom en el cursor · arrastrar el fondo = desplazar · arrastrar una imagen la mueve · las manijas la redimensionan.
 */

interface Cam {
  x: number;
  y: number;
  z: number;
}

const MIN_Z = 0.2;
const MAX_Z = 4;
const MIN_SIZE = 60;
const BASE_W = 240;
const BOTTOM_RESERVE = 130;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** La cámara de cada proyecto se recuerda mientras dure la sesión. */
const camCache = new Map<string, Cam>();

/** Proporción real de una imagen (ancho / alto). 0 si no se puede leer. */
function measure(src: string): Promise<number> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 0);
    img.onerror = () => resolve(0);
    img.src = src;
  });
}

interface Props {
  project: Project;
  enabled: boolean;
  mutate: (fn: (p: Project) => Project, o?: MutateOptions) => void;
  analysis: AnalysisState;
  onAnalyze: () => void;
  onCancelAnalysis: () => void;
  onRequestReanalyze: () => void;
  onAddFiles: (files: File[]) => void;
  onAddUrl: (url: string) => void;
  onOpenUpload: () => void;
  onDeleteRef: (id: string) => void;
  onNext: () => void;
  onBlocked: (reason: string) => void;
  onSubmitIntent: (intent: string) => void;
  briefBusy: boolean;
  /** Pide centrar el lienzo en una imagen (por ejemplo, la que no se pudo leer). */
  focus: { id: string; n: number } | null;
}

export function ReferencesScreen(props: Props) {
  const { project, mutate } = props;
  const refs = useMemo(() => corpusRefs(project), [project]);
  const analyzed = isAnalyzed(project);
  const busy = props.analysis.status === 'preparing' || props.analysis.status === 'reading';
  const missing = Math.max(0, MIN_REFS - refs.length);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [cam, setCam] = useState<Cam>(() => camCache.get(project.id) ?? { x: 0, y: 0, z: 1 });
  const camRef = useRef(cam);
  camRef.current = cam;
  useEffect(() => {
    camCache.set(project.id, cam);
  }, [cam, project.id]);

  const [selected, setSelected] = useState<string | null>(null);
  /** Orden en el frente: lo último seleccionado va arriba. */
  const [front, setFront] = useState<Record<string, number>>({});
  const frontCounter = useRef(1);
  /** Caja que se está arrastrando o redimensionando (se guarda al soltar). */
  const [live, setLive] = useState<{ id: string; box: BoardBox } | null>(null);
  const [unreadable, setUnreadable] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);

  // Tamaño del lienzo.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const boxOf = useCallback((r: Reference): BoardBox | null => (live && live.id === r.id ? live.box : r.board ?? null), [live]);

  /* ---------- Vista ---------- */
  const fit = useCallback(
    (list = refs, animate = false) => {
      const boxes = list.map(r => r.board).filter((b): b is BoardBox => !!b);
      if (!boxes.length || !size.w) return;
      const x0 = Math.min(...boxes.map(b => b.x));
      const y0 = Math.min(...boxes.map(b => b.y));
      const x1 = Math.max(...boxes.map(b => b.x + b.w));
      const y1 = Math.max(...boxes.map(b => b.y + b.h));
      const bw = Math.max(1, x1 - x0);
      const bh = Math.max(1, y1 - y0);
      const availW = Math.max(200, size.w - 120);
      const availH = Math.max(160, size.h - BOTTOM_RESERVE - 90);
      const z = clamp(Math.min(availW / bw, availH / bh), MIN_Z, 1.5);
      const next = { z, x: size.w / 2 - ((x0 + x1) / 2) * z, y: (size.h - BOTTOM_RESERVE + 40) / 2 - ((y0 + y1) / 2) * z };
      void animate;
      setCam(next);
    },
    [refs, size.w, size.h],
  );

  const zoomAt = useCallback((factor: number, px?: number, py?: number) => {
    setCam(c => {
      const z = clamp(c.z * factor, MIN_Z, MAX_Z);
      const mx = px ?? size.w / 2;
      const my = py ?? (size.h - BOTTOM_RESERVE) / 2 + 40;
      const wx = (mx - c.x) / c.z;
      const wy = (my - c.y) / c.z;
      return { z, x: mx - wx * z, y: my - wy * z };
    });
  }, [size.w, size.h]);

  // La rueda hace zoom en el cursor (listener no pasivo para poder frenar el scroll).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !props.enabled) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [props.enabled, zoomAt]);

  /* ---------- Ubicar lo que todavía no tiene lugar en el lienzo ---------- */
  const placing = useRef(false);
  useEffect(() => {
    const todo = refs.filter(r => !r.board);
    if (!todo.length || !size.w || placing.current) return;
    placing.current = true;
    (async () => {
      const ratios = await Promise.all(todo.map(r => (r.aspectRatio && r.aspectRatio > 0 ? Promise.resolve(r.aspectRatio) : measure(r.image))));
      const c = camRef.current;
      const centre = { x: (size.w / 2 - c.x) / c.z, y: ((size.h - BOTTOM_RESERVE) / 2 + 40 - c.y) / c.z };
      const w = BASE_W / Math.max(0.6, Math.min(1, c.z)) ** 0.5;
      const boxes = new Map<string, BoardBox>();
      const hs = ratios.map(r => w / (r || 4 / 3));
      if (todo.length >= 4) {
        const aspect = Math.max(0.8, size.w / Math.max(200, size.h - BOTTOM_RESERVE));
        const cols = Math.min(todo.length, Math.max(3, Math.ceil(Math.sqrt(todo.length * aspect * 1.1))));
        const gap = 24;
        const rows = Math.ceil(todo.length / cols);
        const rowH: number[] = Array.from({ length: rows }, (_, i) => Math.max(...hs.slice(i * cols, i * cols + cols)));
        const totalW = cols * w + (cols - 1) * gap;
        const totalH = rowH.reduce((a, b) => a + b, 0) + (rows - 1) * gap;
        let y = centre.y - totalH / 2;
        todo.forEach((r, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          if (col === 0 && row > 0) y += rowH[row - 1] + gap;
          boxes.set(r.id, { x: centre.x - totalW / 2 + col * (w + gap), y, w, h: hs[i] });
        });
      } else {
        todo.forEach((r, i) => boxes.set(r.id, { x: centre.x - w / 2 + i * 28, y: centre.y - hs[i] / 2 + i * 28, w, h: hs[i] }));
      }
      mutate(p => ({ ...p, references: p.references.map(r => (boxes.has(r.id) && !r.board ? { ...r, board: boxes.get(r.id)! } : r)) }), { undoable: false, silent: true });
      placing.current = false;
    })();
  }, [refs, size.w, size.h, mutate]);

  // Al entrar: ajustar la vista a todas las imágenes (si ya había una vista, se respeta).
  const fitted = useRef(camCache.has(project.id));
  useEffect(() => {
    if (fitted.current || !size.w) return;
    if (!refs.length) {
      fitted.current = true;
      return;
    }
    if (refs.every(r => r.board)) {
      fitted.current = true;
      fit();
    }
  }, [refs, size.w, fit]);

  // Centrar en una imagen (por ejemplo, la que no se pudo leer).
  useEffect(() => {
    if (!props.focus || !size.w) return;
    const r = refs.find(x => x.id === props.focus!.id);
    if (!r?.board) return;
    setSelected(r.id);
    const z = clamp(Math.min((size.w * 0.5) / r.board.w, ((size.h - BOTTOM_RESERVE) * 0.6) / r.board.h), MIN_Z, 1.5);
    setCam({ z, x: size.w / 2 - (r.board.x + r.board.w / 2) * z, y: (size.h - BOTTOM_RESERVE + 40) / 2 - (r.board.y + r.board.h / 2) * z });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.focus?.n]);

  /* ---------- Arrastre ---------- */
  type Drag =
    | { kind: 'pan'; sx: number; sy: number; cam: Cam; moved: boolean }
    | { kind: 'move'; id: string; sx: number; sy: number; box: BoardBox; moved: boolean }
    | { kind: 'resize'; id: string; corner: 'nw' | 'ne' | 'sw' | 'se'; sx: number; sy: number; box: BoardBox; moved: boolean };
  const drag = useRef<Drag | null>(null);

  const bringFront = (id: string) => setFront(f => ({ ...f, [id]: ++frontCounter.current }));

  const begin = (d: Drag) => {
    drag.current = d;
    const move = (e: PointerEvent) => {
      const cur = drag.current;
      if (!cur) return;
      const dx = e.clientX - cur.sx;
      const dy = e.clientY - cur.sy;
      if (!cur.moved && Math.hypot(dx, dy) < 3) return;
      cur.moved = true;
      const z = camRef.current.z;
      if (cur.kind === 'pan') setCam({ ...cur.cam, x: cur.cam.x + dx, y: cur.cam.y + dy });
      else if (cur.kind === 'move') setLive({ id: cur.id, box: { ...cur.box, x: cur.box.x + dx / z, y: cur.box.y + dy / z } });
      else {
        const b = cur.box;
        const ratio = b.w / b.h;
        const sx = cur.corner.includes('e') ? 1 : -1;
        const sy = cur.corner.includes('s') ? 1 : -1;
        let w = Math.max(MIN_SIZE, b.w + (sx * dx) / z);
        let h = Math.max(MIN_SIZE, b.h + (sy * dy) / z);
        if (!e.shiftKey) {
          // Se mantiene la proporción: manda el eje que más se movió.
          const byW = Math.abs(w - b.w) / b.w >= Math.abs(h - b.h) / b.h;
          if (byW) h = Math.max(MIN_SIZE, w / ratio);
          else w = Math.max(MIN_SIZE, h * ratio);
          if (w / ratio < MIN_SIZE) w = MIN_SIZE * ratio;
          if (h * ratio < MIN_SIZE) h = MIN_SIZE / ratio;
          if (w < MIN_SIZE) {
            w = MIN_SIZE;
            h = MIN_SIZE / ratio;
          }
        }
        // El borde opuesto queda fijo.
        const x = sx === 1 ? b.x : b.x + b.w - w;
        const y = sy === 1 ? b.y : b.y + b.h - h;
        setLive({ id: cur.id, box: { x, y, w, h } });
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      const cur = drag.current;
      drag.current = null;
      if (!cur) return;
      if (cur.kind === 'pan') {
        if (!cur.moved) setSelected(null);
        return;
      }
      setLive(l => {
        if (l && cur.moved) {
          const box = l.box;
          mutate(p => ({ ...p, references: p.references.map(r => (r.id === l.id ? { ...r, board: box } : r)) }), { silent: true });
        }
        return null;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const onBackgroundDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    begin({ kind: 'pan', sx: e.clientX, sy: e.clientY, cam: camRef.current, moved: false });
  };
  const onImageDown = (e: React.PointerEvent, r: Reference) => {
    if (e.button !== 0 || !r.board) return;
    e.stopPropagation();
    e.preventDefault();
    setSelected(r.id);
    bringFront(r.id);
    begin({ kind: 'move', id: r.id, sx: e.clientX, sy: e.clientY, box: r.board, moved: false });
  };
  const onHandleDown = (e: React.PointerEvent, r: Reference, corner: 'nw' | 'ne' | 'sw' | 'se') => {
    if (e.button !== 0 || !r.board) return;
    e.stopPropagation();
    e.preventDefault();
    begin({ kind: 'resize', id: r.id, corner, sx: e.clientX, sy: e.clientY, box: r.board, moved: false });
  };

  /* ---------- Cargar: archivos, URL y pegar ---------- */
  const urlFrom = (text: string) => {
    const t = text.trim().split(/\s+/)[0] ?? '';
    return /^https?:\/\/\S+$/i.test(t) ? t : null;
  };
  useEffect(() => {
    if (!props.enabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter(f => f.type.startsWith('image/'));
      if (files.length) {
        e.preventDefault();
        props.onAddFiles(files);
        return;
      }
      const url = urlFrom(e.clipboardData?.getData('text/plain') ?? '');
      if (url) {
        e.preventDefault();
        props.onAddUrl(url);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [props.enabled, props.onAddFiles, props.onAddUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files ?? []).filter(f => f.type.startsWith('image/'));
    if (files.length) return props.onAddFiles(files);
    const url = urlFrom(e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain'));
    if (url) props.onAddUrl(url);
  };

  /* ---------- Teclado ---------- */
  const primary = (() => {
    if (busy) return { label: 'Analizando…', blocked: 'El análisis está en curso.', blockedLabel: 'Analizando…', onClick: () => {}, onBlockedClick: props.onBlocked };
    if (analyzed) return { label: 'Seguir en Revisar', kbd: '⏎', onClick: props.onNext };
    if (missing > 0) {
      return {
        label: 'Analizar referencias',
        blocked: `Para analizar hacen falta al menos ${MIN_REFS} referencias: sumá ${missing} más (arrastrá imágenes al lienzo, pegá una URL o usá + Imagen).`,
        blockedLabel: `Faltan ${missing} ${missing === 1 ? 'referencia' : 'referencias'}`,
        onClick: () => {},
        onBlockedClick: props.onBlocked,
      };
    }
    return { label: 'Analizar referencias', kbd: '⏎', onClick: props.onAnalyze };
  })();

  useShortcuts(props.enabled, {
    delete: () => (selected ? (props.onDeleteRef(selected), setSelected(null)) : false),
    backspace: () => (selected ? (props.onDeleteRef(selected), setSelected(null)) : false),
    '+': () => zoomAt(1.25),
    '=': () => zoomAt(1.25),
    '-': () => zoomAt(0.8),
    '0': () => fit(),
    escape: () => (busy ? props.onCancelAnalysis() : selected ? setSelected(null) : false),
    enter: () => (primary.blocked ? primary.onBlockedClick?.(primary.blocked) : primary.onClick()),
  });

  /* ---------- Frase de intención (opcional) ---------- */
  const [intent, setIntent] = useState(project.intent ?? '');
  useEffect(() => setIntent(project.intent ?? ''), [project.id, project.intent]);
  const submitIntent = () => {
    const v = intent.trim();
    if (v && v !== project.intent) props.onSubmitIntent(v);
  };

  /* ---------- Dibujo ---------- */
  const dots = 24 * cam.z;
  const sorted = [...refs].filter(r => r.board || (live && live.id === r.id)).sort((a, b) => (front[a.id] ?? 0) - (front[b.id] ?? 0));

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        ref={wrapRef}
        data-canvas
        role="application"
        aria-label="Lienzo de referencias"
        onPointerDown={onBackgroundDown}
        onDragOver={e => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className="absolute inset-0 touch-none select-none"
        style={{
          cursor: drag.current?.kind === 'pan' ? 'grabbing' : 'grab',
          backgroundImage: 'radial-gradient(circle, rgba(242,239,232,.09) 1px, transparent 1.2px)',
          backgroundSize: `${dots}px ${dots}px`,
          backgroundPosition: `${cam.x}px ${cam.y}px`,
          outline: dragOver ? '2px dashed rgba(242,239,232,.5)' : undefined,
          outlineOffset: -8,
        }}
      >
        <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})` }}>
          {sorted.map(r => {
            const b = boxOf(r);
            if (!b) return null;
            const isSel = selected === r.id;
            const bad = r.broken || unreadable.has(r.id);
            const hs = 12 / cam.z;
            return (
              <div
                key={r.id}
                data-ref={r.id}
                onPointerDown={e => onImageDown(e, r)}
                className="absolute bg-raised"
                style={{
                  left: b.x,
                  top: b.y,
                  width: b.w,
                  height: b.h,
                  zIndex: front[r.id] ?? 0,
                  cursor: 'move',
                  outline: bad ? `${3 / cam.z}px solid oklch(0.7 0.16 25)` : isSel ? `${2 / cam.z}px solid #F2EFE8` : undefined,
                }}
              >
                <img
                  src={r.image}
                  alt={r.name}
                  draggable={false}
                  onError={() => setUnreadable(s => new Set(s).add(r.id))}
                  className="pointer-events-none size-full select-none object-cover"
                />
                {bad && (
                  <span className="pointer-events-none absolute left-0 top-0 bg-[oklch(0.7_0.16_25)] px-[6px] py-[2px] font-mono leading-none text-void" style={{ fontSize: Math.max(9, 11 / cam.z) }}>
                    NO SE PUDO LEER
                  </span>
                )}
                {isSel &&
                  (['nw', 'ne', 'sw', 'se'] as const).map(c => (
                    <span
                      key={c}
                      role="presentation"
                      onPointerDown={e => onHandleDown(e, r, c)}
                      className="absolute bg-bone"
                      style={{
                        width: hs,
                        height: hs,
                        left: c.includes('w') ? -hs / 2 : undefined,
                        right: c.includes('e') ? -hs / 2 : undefined,
                        top: c.includes('n') ? -hs / 2 : undefined,
                        bottom: c.includes('s') ? -hs / 2 : undefined,
                        cursor: c === 'nw' || c === 'se' ? 'nwse-resize' : 'nesw-resize',
                      }}
                    />
                  ))}
              </div>
            );
          })}
        </div>

        {!refs.length && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 pb-24 text-center">
            <span className="type-name text-[40px] text-ink-2">Soltá imágenes acá</span>
            <span className="max-w-[420px] text-[14px] text-ink-2">Arrastrá archivos desde el escritorio, pegá una URL o una imagen con Ctrl+V, o usá + Imagen. Para analizar hacen falta al menos {MIN_REFS}.</span>
          </div>
        )}
      </div>

      {/* Frase de intención: opcional, ayuda al agente a entender la marca */}
      <div className="absolute left-4 top-4 z-20 flex w-[min(360px,calc(100%-32px))] flex-col gap-1" onPointerDown={e => e.stopPropagation()}>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] tracking-[0.06em] text-ink-3">FRASE DE INTENCIÓN · OPCIONAL</span>
          <input
            value={intent}
            onChange={e => setIntent(e.target.value)}
            onBlur={submitIntent}
            onKeyDown={e => e.key === 'Enter' && (e.currentTarget.blur(), e.preventDefault())}
            placeholder="Ej: hamburguesería cruda, de barrio"
            className="rounded-[8px] border border-line-mid bg-bg/80 px-3 py-2 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-bone"
          />
        </label>
        {props.briefBusy && <span className="font-mono text-[11px] text-ink-2">El agente está redactando el brief…</span>}
      </div>

      <BottomBar
        help="Arrastrá imágenes al lienzo, pegá una URL o una imagen con Ctrl+V. La rueda acerca y aleja; arrastrá el fondo para moverte."
        actions={
          <>
            {analyzed && !busy && <BarButton onClick={props.onRequestReanalyze}>Volver a analizar</BarButton>}
            {busy && <BarButton onClick={props.onCancelAnalysis}>Cancelar análisis</BarButton>}
            {(analyzed || busy) && <BarSep />}
            <BarButton onClick={props.onOpenUpload}>+ Imagen</BarButton>
            <BarSep />
            <BarButton onClick={() => zoomAt(0.8)} ariaLabel="Alejar" title="Alejar (−)">
              −
            </BarButton>
            <BarButton onClick={() => zoomAt(1 / camRef.current.z)} title="Volver al 100%">
              <span className="min-w-[40px] text-center font-mono text-[12px]">{Math.round(cam.z * 100)}%</span>
            </BarButton>
            <BarButton onClick={() => zoomAt(1.25)} ariaLabel="Acercar" title="Acercar (+)">
              +
            </BarButton>
            <BarButton onClick={() => fit()} title="Ajustar la vista a todas las imágenes (0)">
              Ajustar
            </BarButton>
          </>
        }
        primary={primary}
      />
    </div>
  );
}
