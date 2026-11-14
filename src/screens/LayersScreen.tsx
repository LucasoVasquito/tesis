import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Layer, Pattern, Project } from '../types';
import { useShortcuts } from '../hooks/useAuditShortcuts';
import { useViewport } from '../hooks/useViewport';
import { corpusRefs, evidenceCount, isLayer } from '../utils/layers';
import { LAYER_QUESTION } from '../utils/layerQuestions';
import { logEvent } from '../utils/testLog';
import { ActionResult, SHEET_NAME, isSuggestion, piecesIn, place, rename } from '../pieces/model';
import { BarButton, BarSep, BottomBar } from '../components/shell/BottomBar';
import { ColorEditor, ColorsPanel } from '../components/ColorEditor';
import { PieceThumb } from './common';
import { RoleKey, useColors } from './colorContext';
import { Notify } from './types';

/**
 * 03 · CAPAS: un recorrido en primera persona. La cámara avanza por las tres capas (rueda, ↑ ↓, 1 · 2 · 3).
 * Geometría: perspectiva de 1000px; la capa i está en translate3d(0, −i·40px, −i·900px) y la cámara mueve
 * la pila con translate3d(0, d·40px, d·900px), donde d es la profundidad continua (0 a 2).
 *
 * Fluidez: d vive en una referencia y cada cuadro se escribe directo sobre los elementos (transform y opacidad),
 * sin pasar por React; la rueda empuja un objetivo y la cámara lo persigue con inercia.
 */

type Apply = (fn: (p: Project) => ActionResult, notice?: string | false) => ActionResult;

interface Props {
  project: Project;
  enabled: boolean;
  apply: Apply;
  onNext: () => void;
  onBlocked: (reason: string) => void;
  /** Informa en qué capa está mirando (para la línea de estado). */
  onLayer: (name: string) => void;
  notify: Notify;
  /** Color de una pieza en vivo mientras se arrastra el selector (no entra al historial). */
  onColorLive: (id: string, hex: string | null) => void;
  /** Al cerrar el editor de una pieza: una sola entrada en el historial. null = restaurar el detectado. */
  onColorCommit: (id: string, hex: string | null) => void;
  /** Lo mismo, para los tres colores de la interfaz. */
  onRoleLive: (key: RoleKey, hex: string | null) => void;
  onRoleCommit: (key: RoleKey, hex: string | null) => void;
  /** Pide ir a una capa (desde la barra lateral). */
  goLayer: { layer: Layer; n: number } | null;
}

const LAYERS: Layer[] = [1, 2, 3];
const SPACING_Z = 900;
const SPACING_Y = 40;
const DESKTOP_W = 640;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const layerVar = (l: Layer) => `var(--capa-${l})`;
const edgeVar = (l: Layer) => `var(--cc-l${l - 1}-edge)`;

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Opacidad según la distancia a la cámara: lo que ya pasaste se desvanece; lo de atrás se apaga. */
const fadeOf = (rel: number) => (rel < 0 ? clamp(1 + rel / 0.45, 0, 1) : Math.max(0.22, 1 - rel * 0.45));

export function LayersScreen({ project, enabled, apply, onNext, onBlocked, onLayer, notify, onColorLive, onColorCommit, onRoleLive, onRoleCommit, goLayer }: Props) {
  const viewport = useViewport();
  const mobile = viewport === 'mobile';
  const touchUi = viewport !== 'desktop';
  const colors = useColors();
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [colorFor, setColorFor] = useState<string | null>(null);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 1000, h: 600 });

  const sceneRef = useRef<HTMLDivElement>(null);
  const camRef = useRef<HTMLDivElement>(null);
  const planeRefs = useRef<(HTMLDivElement | null)[]>([null, null, null]);
  const frameRefs = useRef<(HTMLDivElement | null)[]>([]);
  const barRef = useRef<HTMLSpanElement>(null);

  const activeLayer = (active + 1) as Layer;
  useEffect(() => onLayer(SHEET_NAME[activeLayer]), [activeLayer]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // La primera vez que se entra: la rueda recorre la profundidad.
  useEffect(() => {
    if (mobile) return;
    try {
      if (localStorage.getItem('cc-capas-wheel-hint')) return;
      localStorage.setItem('cc-capas-wheel-hint', '1');
    } catch {
      /* sin almacenamiento: el aviso se repite */
    }
    notify('En esta etapa la rueda te lleva hacia adentro y hacia afuera.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- Cámara: se escribe directo sobre los elementos ---------- */
  const dRef = useRef(0);
  const target = useRef(0);
  const raf = useRef(0);
  const snap = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Dibuja la cámara en la profundidad d (0 a 2). Sin React: solo transform, opacidad y fondo. */
  const renderD = useCallback((d: number) => {
    const cam = camRef.current;
    if (cam) cam.style.transform = `translate3d(0, ${d * SPACING_Y}px, ${d * SPACING_Z}px)`;
    planeRefs.current.forEach((el, i) => {
      if (!el) return;
      const rel = i - d;
      const alpha = rel <= 0 ? 1 : 1 - Math.min(1, rel) * 0.2;
      const on = Math.abs(rel) < 0.5;
      el.style.opacity = String(fadeOf(rel));
      el.style.background = `color-mix(in oklab, var(--cc-surface) ${alpha * 100}%, transparent)`;
      el.style.pointerEvents = rel < -0.45 ? 'none' : 'auto';
      el.style.borderColor = `color-mix(in oklab, var(--capa-${i + 1}) ${on ? 70 : 30}%, transparent)`;
      el.style.cursor = on ? '' : 'pointer';
      el.dataset.active = on ? 'true' : 'false';
    });
    frameRefs.current.forEach((el, k) => {
      if (el) el.style.opacity = String(fadeOf(k / 3 - d));
    });
    if (barRef.current) barRef.current.style.height = `${(d / 2) * 100}%`;
    const a = clamp(Math.round(d), 0, 2);
    if (a !== activeRef.current) {
      activeRef.current = a;
      setActive(a);
    }
  }, []);

  // Se vuelve a dibujar después de cada render de React (no pisa lo que React no maneja).
  useLayoutEffect(() => {
    renderD(dRef.current);
  });

  /** La cámara persigue el objetivo con inercia, un cuadro a la vez. */
  const loop = useCallback(() => {
    if (raf.current) return;
    const step = () => {
      const diff = target.current - dRef.current;
      if (Math.abs(diff) < 0.0008) {
        dRef.current = target.current;
        renderD(dRef.current);
        raf.current = 0;
        return;
      }
      dRef.current += diff * 0.14;
      renderD(dRef.current);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, [renderD]);

  /** Lleva la cámara a una profundidad (entera o fraccionaria). */
  const moveTo = useCallback(
    (v: number) => {
      target.current = clamp(v, 0, 2);
      if (snap.current) clearTimeout(snap.current);
      if (reduced()) {
        dRef.current = target.current;
        renderD(dRef.current);
        return;
      }
      loop();
    },
    [loop, renderD],
  );
  const goTo = moveTo;

  /** Empuja el objetivo y, sin más movimiento, lo acomoda a la capa más cercana. */
  const scrub = useCallback(
    (delta: number) => {
      target.current = clamp(target.current + delta, 0, 2);
      if (reduced()) {
        dRef.current = target.current;
        renderD(dRef.current);
      } else loop();
      if (snap.current) clearTimeout(snap.current);
      snap.current = setTimeout(() => moveTo(Math.round(target.current)), 160);
    },
    [loop, moveTo, renderD],
  );

  useEffect(
    () => () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      if (snap.current) clearTimeout(snap.current);
    },
    [],
  );
  useEffect(() => {
    if (goLayer) goTo(goLayer.layer - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goLayer?.n]);

  // La rueda recorre la profundidad (deltaY · 0.0016).
  useEffect(() => {
    const el = sceneRef.current;
    if (!el || !enabled) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      scrub(clamp(dy, -120, 120) * 0.0016);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [enabled, scrub]);

  /* ---------- Piezas ---------- */
  const byLayer = useMemo(() => LAYERS.map(l => piecesIn(project, l)), [project]);
  const total = corpusRefs(project).length;
  const selected = selectedId ? project.patterns.find(x => x.id === selectedId && x.status !== 'discarded') ?? null : null;
  const coreEmpty = byLayer[0].length === 0;

  const moveToLayer = useCallback(
    (piece: Pattern, to: Layer) => {
      const from = piece.layer;
      if (!isLayer(from) || from === to) return;
      apply(p => place(p, piece.id, to), `Moviste «${piece.name}» de ${SHEET_NAME[from]} a ${SHEET_NAME[to]}.`);
    },
    [apply],
  );

  /* ---------- Arrastre entre capas, con zonas para soltar ---------- */
  type Ghost = { piece: Pattern; x: number; y: number; ox: number; oy: number; returning: boolean };
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [zone, setZone] = useState<Layer | null>(null);
  const [zonesUp, setZonesUp] = useState(false);
  const dragRef = useRef<null | { piece: Pattern; sx: number; sy: number; ox: number; oy: number; started: boolean; base: number; timer?: ReturnType<typeof setTimeout>; touch: boolean; cleanup: () => void }>(null);

  const targetAt = (x: number, y: number): Layer | null => {
    const z = (document.elementsFromPoint(x, y) as HTMLElement[]).find(el => el.dataset?.dropZone !== undefined);
    return z ? (Number(z.dataset.dropZone) as Layer) : null;
  };

  const finishDrag = (cancel: boolean, x: number, y: number) => {
    const cur = dragRef.current;
    if (!cur) return;
    cur.cleanup();
    if (cur.timer) clearTimeout(cur.timer);
    dragRef.current = null;
    const from = cur.piece.layer as Layer;
    const dest = cancel ? null : targetAt(x, y);
    setZone(null);
    setZonesUp(false);
    moveTo(cur.base);
    if (!cur.started) {
      setGhost(null);
      setSelectedId(id => (id === cur.piece.id ? null : cur.piece.id));
      setColorFor(null);
      return;
    }
    if (dest && dest !== from) {
      logEvent('drop', { piece: cur.piece.name, from, to: dest });
      setGhost(null);
      moveToLayer(cur.piece, dest);
    } else {
      logEvent('drop', { piece: cur.piece.name, from, to: null, cancelled: true });
      setGhost(g => (g ? { ...g, x: g.ox, y: g.oy, returning: true } : null));
      setTimeout(() => setGhost(null), 230);
    }
  };

  const startCardDrag = (e: React.PointerEvent, piece: Pattern) => {
    if (e.button !== 0 || dragRef.current) return;
    const touch = e.pointerType === 'touch';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const state = { piece, sx: e.clientX, sy: e.clientY, ox: rect.left + rect.width / 2, oy: rect.top + rect.height / 2, started: false, base: Math.round(dRef.current), touch, cleanup: () => {} } as NonNullable<typeof dragRef.current>;
    dragRef.current = state;
    const begin = (x: number, y: number) => {
      state.started = true;
      logEvent('drag_start', { piece: piece.name, from: piece.layer });
      if (touch) navigator.vibrate?.(10);
      setGhost({ piece, x, y, ox: state.ox, oy: state.oy, returning: false });
      requestAnimationFrame(() => setZonesUp(true));
    };
    // En táctil el arrastre empieza con una pulsación larga de 350 ms.
    if (touch) state.timer = setTimeout(() => begin(state.sx, state.sy), 350);
    let lastX = e.clientX;
    let lastY = e.clientY;
    const move = (ev: PointerEvent) => {
      lastX = ev.clientX;
      lastY = ev.clientY;
      if (!state.started) {
        const dist = Math.hypot(ev.clientX - state.sx, ev.clientY - state.sy);
        if (touch) {
          // Antes de los 350 ms, mover el dedo es deslizar (profundidad), no arrastrar.
          if (dist > 10) {
            if (state.timer) clearTimeout(state.timer);
            state.cleanup();
            dragRef.current = null;
          }
          return;
        }
        if (dist < 6) return;
        begin(ev.clientX, ev.clientY);
      }
      setGhost(g => (g ? { ...g, x: ev.clientX, y: ev.clientY, returning: false } : g));
      const z = targetAt(ev.clientX, ev.clientY);
      setZone(prev => {
        if (prev !== z) {
          const from = piece.layer as Layer;
          // Anticipo: la cámara se acerca un poco (0.15) hacia esa capa.
          moveTo(z && z !== from ? state.base + (z > from ? 0.15 : -0.15) : state.base);
        }
        return z;
      });
    };
    const up = (ev: PointerEvent) => finishDrag(false, ev.clientX || lastX, ev.clientY || lastY);
    const cancel = () => finishDrag(true, -1, -1);
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        finishDrag(true, -1, -1);
      }
    };
    state.cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key, true);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key, true);
  };

  // Deslizar en vertical (táctil): controla la profundidad, deltaY · 0.004.
  const swipe = useRef<null | { y: number }>(null);
  const onScenePointerDown = (e: React.PointerEvent) => {
    if (!mobile || e.pointerType !== 'touch') return;
    swipe.current = { y: e.clientY };
    const move = (ev: PointerEvent) => {
      if (dragRef.current?.started || !swipe.current) return;
      const dy = swipe.current.y - ev.clientY;
      swipe.current.y = ev.clientY;
      scrub(dy * 0.004);
    };
    const up = () => {
      swipe.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  /* ---------- Teclado ---------- */
  const numberKey = (l: Layer) => () => {
    if (selected) moveToLayer(selected, l);
    else goTo(l - 1);
  };
  const primary = coreEmpty
    ? { label: 'Ver sistema', blocked: 'Necesita al menos una pieza en Núcleo.', blockedLabel: 'Núcleo vacío', onClick: () => {}, onBlockedClick: onBlocked }
    : { label: 'Ver sistema', kbd: '⏎', onClick: onNext };
  useShortcuts(enabled, {
    arrowup: () => goTo(Math.round(dRef.current) - 1),
    arrowdown: () => goTo(Math.round(dRef.current) + 1),
    '1': numberKey(1),
    '2': numberKey(2),
    '3': numberKey(3),
    c: () => (selected?.category === 'color' ? setColorFor(selected.id) : false),
    f2: () => (selected ? setRenaming(selected.id) : false),
    escape: () => (selectedId ? setSelectedId(null) : false),
    enter: () => (primary.blocked ? primary.onBlockedClick?.(primary.blocked) : primary.onClick()),
  });

  const closeColor = (id: string, hex: string | null, discard = false) => {
    setColorFor(null);
    if (discard || hex === null) onColorLive(id, null);
    else onColorCommit(id, hex);
  };
  // Al cambiar de pieza se cierra el editor de color de la anterior.
  useEffect(() => {
    if (colorFor && selectedId !== colorFor) closeColor(colorFor, null, true);
    if (renaming && selectedId !== renaming) setRenaming(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  /* ---------- Dibujo ---------- */
  const planeW = mobile ? Math.max(260, size.w - 32) : DESKTOP_W;
  const scale = mobile ? Math.max(0.6, Math.min(1, (size.h - 150) / 440)) : Math.max(0.5, Math.min(1.2, (size.w - 500) / DESKTOP_W, (size.h - 184) / 440));
  const cols = mobile ? 2 : 3;

  const card = (x: Pattern, l: Layer) => {
    const sel = selectedId === x.id;
    const suggestion = isSuggestion(x);
    const isColor = x.category === 'color';
    return (
      <div
        key={x.id}
        data-piece={x.id}
        onPointerDown={e => startCardDrag(e, x)}
        className="group relative flex min-w-0 touch-none select-none flex-col gap-2 p-[5px]"
        style={{ cursor: 'grab', outline: sel ? `2px solid ${layerVar(l)}` : undefined, outlineOffset: 1, opacity: ghost?.piece.id === x.id ? 0.3 : 1 }}
      >
        <PieceThumb piece={x} project={project} className="aspect-[16/10] w-full bg-raised" onSwatch={isColor ? () => { setSelectedId(x.id); setColorFor(x.id); } : undefined} />
        <span className="truncate text-[15px] font-semibold leading-tight">{x.name}</span>
        <span className="truncate font-mono text-[11px] text-ink-2">
          {x.origin === 'user' ? 'TUYO' : suggestion ? 'DETECTADO · SUGERENCIA' : 'DETECTADO'} · {evidenceCount(x, project)}/{total}
        </span>
        {/* Tres puntos para enviarla directo a otra capa */}
        {!touchUi && (
          <span className="absolute right-2 top-2 hidden items-center gap-[6px] rounded-full bg-void/80 px-[6px] py-[5px] group-hover:flex" onPointerDown={e => e.stopPropagation()}>
            {LAYERS.map(t => (
              <button
                key={t}
                type="button"
                aria-label={`Enviar «${x.name}» a ${SHEET_NAME[t]}`}
                title={`Enviar a ${SHEET_NAME[t]}`}
                disabled={t === l}
                onClick={e => {
                  e.stopPropagation();
                  moveToLayer(x, t);
                }}
                className="size-3 rounded-full p-0 disabled:cursor-default disabled:opacity-30"
                style={{ background: t === l ? 'transparent' : layerVar(t), border: `1.5px solid ${layerVar(t)}`, boxShadow: `0 0 0 1px ${edgeVar(t)}` }}
              />
            ))}
          </span>
        )}
      </div>
    );
  };

  const plane = (i: number) => {
    const l = (i + 1) as Layer;
    const items = byLayer[i];
    const hot = zone === l && ghost && !ghost.returning;
    return (
      <div
        key={l}
        ref={el => {
          planeRefs.current[i] = el;
        }}
        data-layer-plane={i}
        onClick={() => (Math.round(dRef.current) !== i ? goTo(i) : undefined)}
        className={`layer-${l} group/plane absolute`}
        style={{
          left: -planeW / 2,
          top: 0,
          width: planeW,
          minHeight: 300,
          padding: 24,
          transform: `translate3d(0, ${-i * SPACING_Y}px, ${-i * SPACING_Z}px)`,
          borderStyle: 'solid',
          borderWidth: hot ? 2 : 1,
          boxShadow: `0 0 0 1px ${edgeVar(l)}`,
          willChange: 'opacity',
        }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="type-label flex items-center gap-2 text-[13px] tracking-[0.08em]" style={{ color: `var(--cc-l${l - 1}-ink)` }}>
            <span aria-hidden="true" className="layer-dot inline-block size-2 rounded-full" style={{ background: layerVar(l) }} />
            CAPA {l} · {SHEET_NAME[l].toUpperCase()}
          </span>
          <span className="font-mono text-[11px] text-ink-2">{items.length}</span>
        </div>
        <p className="m-0 mt-1 text-[14px]" style={{ color: 'var(--cc-text-muted)' }}>
          {LAYER_QUESTION[l]}
        </p>
        <div className="mb-4 mt-2" style={{ height: l === 1 ? 4 : 2, background: layerVar(l) }} />
        {items.length === 0 ? (
          <p className="m-0 border border-dashed border-line-strong p-6 text-center text-[13px] text-ink-2">Sin piezas. Mandá una desde otra capa o arrastrala hasta acá.</p>
        ) : (
          <div className="grid gap-3 group-data-[active=false]/plane:pointer-events-none" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {items.map(x => card(x, l))}
          </div>
        )}
      </div>
    );
  };

  /** Marcos guía: dan sensación de túnel al avanzar. */
  const frames = Array.from({ length: 10 }, (_, k) => {
    const onLayer = k % 3 === 0 ? ((k / 3 + 1) as Layer) : null;
    return (
      <div
        key={k}
        ref={el => {
          frameRefs.current[k] = el;
        }}
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{
          left: -planeW / 2,
          top: 0,
          width: planeW,
          height: 300,
          transform: `translate3d(0, ${-(k / 3) * SPACING_Y}px, ${-(k / 3) * SPACING_Z}px)`,
          border: `1px solid ${onLayer && onLayer <= 3 ? `color-mix(in oklab, ${layerVar(onLayer)} 40%, transparent)` : 'color-mix(in srgb, var(--cc-text) 6%, transparent)'}`,
        }}
      />
    );
  });

  const dropZones = (
    <div
      aria-hidden={!ghost}
      className={`${ghost ? 'pointer-events-auto' : 'pointer-events-none'} absolute z-40 flex ${mobile ? 'inset-x-0 bottom-0 flex-col gap-2 rounded-t-[16px] p-3 pb-[calc(12px+env(safe-area-inset-bottom))]' : 'inset-x-4 bottom-[104px] gap-3'}`}
      style={{ transform: zonesUp ? 'translateY(0)' : 'translateY(140%)', opacity: ghost ? 1 : 0, transition: 'transform 200ms var(--ease-camera), opacity 200ms', background: mobile ? 'var(--cc-surface)' : undefined }}
    >
      {LAYERS.map(l => {
        const here = ghost?.piece.layer === l;
        const hot = zone === l && !here;
        return (
          <div
            key={l}
            data-drop-zone={l}
            className={`layer-${l} flex min-w-0 flex-1 flex-col justify-center gap-[2px] rounded-[12px] px-4 py-3`}
            style={{
              minHeight: mobile ? 64 : 88,
              background: hot ? `color-mix(in oklab, ${layerVar(l)} 25%, var(--cc-surface))` : 'var(--cc-surface)',
              border: `${hot ? 2 : 1}px ${here ? 'dashed' : 'solid'} ${here ? 'color-mix(in srgb, var(--cc-text) 25%, transparent)' : layerVar(l)}`,
              boxShadow: `0 0 0 1px ${edgeVar(l)}`,
              opacity: here ? 0.55 : 1,
            }}
          >
            <span className="flex items-center gap-2 text-[14px] font-bold">
              <span aria-hidden="true" className="layer-dot size-2 rounded-full" style={{ background: layerVar(l) }} />
              {l} · {SHEET_NAME[l]}
              {here && <span className="ml-auto font-mono text-[11px] font-normal text-ink-2">Está acá</span>}
            </span>
            <span className="text-[12px]" style={{ color: 'var(--cc-text-muted)' }}>
              {LAYER_QUESTION[l]}
            </span>
          </div>
        );
      })}
    </div>
  );

  const pieceColor = selected && colorFor === selected.id ? colors.byPiece[selected.id] : null;

  return (
    <div className="relative h-full w-full overflow-hidden" data-layers-scene>
      <div
        ref={sceneRef}
        onPointerDown={onScenePointerDown}
        className="absolute inset-0 touch-none overflow-hidden"
        style={{ perspective: 1000, perspectiveOrigin: mobile ? '50% 0%' : 'calc(50% - 120px) 0%', cursor: touchUi ? undefined : 'ns-resize' }}
      >
        <div className="absolute" style={{ left: mobile ? '50%' : 'calc(50% - 120px)', top: mobile ? 56 : 64, transformStyle: 'preserve-3d', transform: `scale3d(${scale}, ${scale}, ${scale})`, transformOrigin: '0 0' }}>
          <div ref={camRef} style={{ transformStyle: 'preserve-3d', willChange: 'transform' }}>
            {frames}
            {[2, 1, 0].map(i => plane(i))}
          </div>
        </div>
      </div>

      {/* Chips de capa (móvil) o columna derecha: «Estás en» y los colores (escritorio y tablet) */}
      {mobile ? (
        <div className="absolute inset-x-0 top-0 z-20 flex gap-2 px-4 py-2" role="tablist" aria-label="Capas">
          {LAYERS.map(l => (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={active === l - 1}
              onClick={() => goTo(l - 1)}
              className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-full border px-2 text-[13px] font-semibold"
              style={{ borderColor: active === l - 1 ? layerVar(l) : 'var(--cc-line)', background: active === l - 1 ? `color-mix(in oklab, ${layerVar(l)} 20%, transparent)` : 'var(--cc-surface)' }}
            >
              <span aria-hidden="true" className="layer-dot size-2 rounded-full" style={{ background: layerVar(l), boxShadow: `0 0 0 1px ${edgeVar(l)}` }} />
              {l} · {SHEET_NAME[l]}
            </button>
          ))}
        </div>
      ) : (
        <div className="absolute right-6 top-6 z-20 flex max-h-[calc(100%-120px)] w-[220px] flex-col gap-3 overflow-y-auto">
          <aside className="flex flex-col gap-3 rounded-[12px] border border-line-mid p-3" style={{ background: 'var(--cc-surface)' }} aria-label="Estás en">
            <span className="font-mono text-[10px] tracking-[0.08em] text-ink-2">ESTÁS EN</span>
            <div className="relative flex gap-3">
              <div aria-hidden="true" className="relative w-[3px] shrink-0 rounded-full bg-white/10">
                <span ref={barRef} className="absolute left-0 top-0 w-full rounded-full bg-bone" style={{ minHeight: 6 }} />
              </div>
              <ul className="m-0 flex flex-1 list-none flex-col gap-1 p-0">
                {LAYERS.map(l => (
                  <li key={l}>
                    <button
                      type="button"
                      onClick={() => goTo(l - 1)}
                      aria-current={active === l - 1 ? 'true' : undefined}
                      className="flex w-full items-center gap-2 rounded-[8px] px-2 py-[7px] text-left text-[13px] hover:bg-white/5"
                      style={{ ...(active === l - 1 ? { background: `color-mix(in oklab, ${layerVar(l)} 20%, transparent)` } : {}), minHeight: touchUi ? 44 : undefined }}
                    >
                      <span aria-hidden="true" className="layer-dot size-2 shrink-0 rounded-full" style={{ background: layerVar(l), boxShadow: `0 0 0 1px ${edgeVar(l)}` }} />
                      <span className={`flex-1 ${active === l - 1 ? 'font-semibold text-ink' : 'text-ink-2'}`}>
                        {l} · {SHEET_NAME[l]}
                      </span>
                      <span className="font-mono text-[11px] text-ink-2">{byLayer[l - 1].length}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={active === 0} onClick={() => goTo(active - 1)} className="flex-1 rounded-[8px] border border-line-strong px-2 py-[6px] text-[12px] text-ink hover:bg-white/10 disabled:opacity-35" style={{ minHeight: touchUi ? 44 : undefined }}>
                ↑ Más cerca
              </button>
              <button type="button" disabled={active === 2} onClick={() => goTo(active + 1)} className="flex-1 rounded-[8px] border border-line-strong px-2 py-[6px] text-[12px] text-ink hover:bg-white/10 disabled:opacity-35" style={{ minHeight: touchUi ? 44 : undefined }}>
                ↓ Más lejos
              </button>
            </div>
            <p className="m-0 text-[11px] leading-snug text-ink-2">También con la rueda del mouse o las flechas.</p>
          </aside>
          <ColorsPanel onLive={onRoleLive} onCommit={onRoleCommit} />
        </div>
      )}

      {/* Colores en móvil: hoja inferior */}
      {mobile && rolesOpen && (
        <div className="fixed inset-0 z-[63]" onClick={() => setRolesOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="absolute inset-x-0 bottom-0 rounded-t-[16px] p-3 pb-[calc(16px+env(safe-area-inset-bottom))]" style={{ background: 'var(--cc-surface)' }} onClick={e => e.stopPropagation()}>
            <ColorsPanel mobile onLive={onRoleLive} onCommit={onRoleCommit} />
            <button type="button" onClick={() => setRolesOpen(false)} className="mt-2 min-h-[44px] w-full rounded-[10px] border border-line-strong text-[13px]">
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Editor de color de una pieza */}
      {colorFor && selected && selected.id === colorFor && pieceColor && (
        <ColorEditor
          key={colorFor}
          title={selected.name}
          start={pieceColor.hex}
          overridden={pieceColor.overridden}
          others={colors.detected}
          mobile={mobile}
          className={mobile ? '' : 'absolute left-6 top-6 z-30 w-[260px]'}
          onLive={hex => onColorLive(colorFor, hex)}
          onClose={hex => closeColor(colorFor, hex)}
          onRestore={() => {
            setColorFor(null);
            onColorCommit(colorFor, null);
          }}
        />
      )}

      {/* Renombrar la pieza elegida */}
      {renaming && selected && selected.id === renaming && (
        <form
          className={`absolute z-30 flex gap-2 rounded-[12px] border border-line-mid p-3 ${mobile ? 'inset-x-3 bottom-[84px]' : 'bottom-[110px] left-1/2 w-[420px] -translate-x-1/2'}`}
          style={{ background: 'var(--cc-surface)' }}
          onSubmit={e => {
            e.preventDefault();
            const v = (new FormData(e.currentTarget).get('name') as string) ?? '';
            setRenaming(null);
            if (v.trim() && v.trim() !== selected.name) apply(p => rename(p, selected.id, v), `Renombraste «${selected.name}» como «${v.trim()}».`);
          }}
        >
          <input
            name="name"
            aria-label="Nombre de la pieza"
            defaultValue={selected.name}
            autoFocus
            onKeyDown={e => e.key === 'Escape' && setRenaming(null)}
            className="min-w-0 flex-1 border-b-2 border-line-strong bg-transparent py-1 text-[15px] text-ink outline-none focus:border-bone"
            style={{ minHeight: touchUi ? 44 : undefined }}
          />
          <button type="submit" className="rounded-[8px] bg-bone px-4 text-[13px] font-bold text-void" style={{ minHeight: touchUi ? 44 : 36 }}>
            Guardar
          </button>
        </form>
      )}

      {/* Arrastre: la sombra de la pieza sigue al cursor y suben tres zonas para soltar */}
      {dropZones}
      {ghost && (
        <div
          className="pointer-events-none fixed z-[70] w-[200px]"
          style={{
            left: ghost.x,
            top: ghost.y,
            transform: 'translate(-50%, -50%) scale(0.6) rotate(2deg)',
            transition: ghost.returning ? 'left 220ms var(--ease-camera), top 220ms var(--ease-camera), opacity 220ms' : undefined,
            opacity: ghost.returning ? 0.4 : 0.95,
            boxShadow: '0 16px 40px rgba(0,0,0,.6)',
          }}
        >
          <PieceThumb piece={ghost.piece} project={project} className="aspect-[16/10] w-full" word={false} />
        </div>
      )}

      <BottomBar
        help="Rueda del mouse o ↑ ↓ para recorrer las capas. Clic en una pieza para elegirla; arrastrala para cambiarla de capa."
        actions={
          <>
            {mobile && <BarButton onClick={() => setRolesOpen(true)}>Colores</BarButton>}
            {selected && (
              <BarButton onClick={() => setRenaming(selected.id)}>
                Renombrar <kbd className="font-mono text-[11px] opacity-50">F2</kbd>
              </BarButton>
            )}
            {selected && selected.category === 'color' && (
              <BarButton onClick={() => setColorFor(selected.id)}>
                Color <kbd className="font-mono text-[11px] opacity-50">C</kbd>
              </BarButton>
            )}
            {selected && isLayer(selected.layer) && (
              <>
                {!mobile && <BarSep />}
                <span className="px-1 text-[12px] text-ink-2">Mover a</span>
                {LAYERS.map(l => (
                  <BarButton key={l} disabled={selected.layer === l} onClick={() => moveToLayer(selected, l)}>
                    <span aria-hidden="true" className="layer-dot size-2 rounded-full" style={{ background: layerVar(l), boxShadow: `0 0 0 1px ${edgeVar(l)}` }} />
                    {SHEET_NAME[l]}
                    <kbd className="font-mono text-[11px] opacity-50">{l}</kbd>
                  </BarButton>
                ))}
              </>
            )}
          </>
        }
        primary={primary}
      />
    </div>
  );
}
