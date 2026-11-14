import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Layer, Pattern, Project } from '../types';
import { useShortcuts } from '../hooks/useAuditShortcuts';
import { corpusRefs, evidenceCount, isLayer } from '../utils/layers';
import { ActionResult, SHEET_NAME, isSuggestion, piecesIn, place } from '../pieces/model';
import { BarButton, BarSep, BottomBar } from '../components/shell/BottomBar';
import { PieceThumb } from './common';

/**
 * 03 · CAPAS: un recorrido en primera persona. La cámara avanza por las tres capas (rueda, ↑ ↓, 1 · 2 · 3).
 * Geometría: perspectiva de 1000px; la capa i está en translate3d(0, −i·40px, −i·900px) y la cámara mueve
 * la pila con translate3d(0, d·40px, d·900px), donde d es la profundidad continua (0 a 2).
 * Vista secundaria, General: la pila isométrica.
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
}

const LAYERS: Layer[] = [1, 2, 3];
const SPACING_Z = 900;
const SPACING_Y = 40;
const PLANE_W = 640;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const layerVar = (l: Layer) => `var(--capa-${l})`;
const PLANE_BG = 'oklch(0.225 0.012 40)';

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Opacidad según la distancia a la cámara: lo que ya pasaste se desvanece; lo de atrás se apaga. */
const fadeOf = (rel: number) => (rel < 0 ? clamp(1 + rel / 0.45, 0, 1) : Math.max(0.22, 1 - rel * 0.45));

export function LayersScreen({ project, enabled, apply, onNext, onBlocked, onLayer }: Props) {
  const [view, setView] = useState<'recorrido' | 'general'>('recorrido');
  const [d, setD] = useState(0);
  const dRef = useRef(0);
  const target = useRef(0);
  const raf = useRef(0);
  const snap = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 1000, h: 600 });
  const sceneRef = useRef<HTMLDivElement>(null);
  const planeRefs = useRef<(HTMLDivElement | null)[]>([null, null, null]);

  const active = clamp(Math.round(d), 0, 2);
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

  /* ---------- Movimiento de la cámara ---------- */
  const tick = useCallback(() => {
    const diff = target.current - dRef.current;
    if (Math.abs(diff) < 0.002) {
      dRef.current = target.current;
      setD(target.current);
      raf.current = 0;
      return;
    }
    dRef.current += diff * 0.1;
    setD(dRef.current);
    raf.current = requestAnimationFrame(tick);
  }, []);

  const goTo = useCallback(
    (i: number) => {
      target.current = clamp(i, 0, 2);
      if (snap.current) clearTimeout(snap.current);
      if (reduced()) {
        dRef.current = target.current;
        setD(target.current);
        return;
      }
      if (!raf.current) raf.current = requestAnimationFrame(tick);
    },
    [tick],
  );
  useEffect(
    () => () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      if (snap.current) clearTimeout(snap.current);
    },
    [],
  );

  // La rueda mueve la profundidad de forma continua y, a los 180 ms sin rueda, se acomoda a la capa más cercana.
  useEffect(() => {
    const el = sceneRef.current;
    if (!el || !enabled || view !== 'recorrido') return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (raf.current) {
        cancelAnimationFrame(raf.current);
        raf.current = 0;
      }
      const next = clamp(dRef.current + e.deltaY * 0.0016, 0, 2);
      dRef.current = next;
      target.current = next;
      setD(next);
      if (snap.current) clearTimeout(snap.current);
      snap.current = setTimeout(() => goTo(Math.round(dRef.current)), 180);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [enabled, view, goTo]);

  /* ---------- Piezas ---------- */
  const byLayer = useMemo(() => LAYERS.map(l => piecesIn(project, l)), [project]);
  const total = corpusRefs(project).length;
  const selected = selectedId ? project.patterns.find(x => x.id === selectedId && x.status !== 'discarded') ?? null : null;
  const coreEmpty = byLayer[0].length === 0;

  const moveTo = useCallback(
    (piece: Pattern, to: Layer) => {
      const from = piece.layer;
      if (!isLayer(from) || from === to) return;
      apply(p => place(p, piece.id, to), `Moviste «${piece.name}» de ${SHEET_NAME[from]} a ${SHEET_NAME[to]}.`);
    },
    [apply],
  );

  /* ---------- Arrastre entre capas ---------- */
  const [drag, setDrag] = useState<null | { piece: Pattern; x: number; y: number; zone: 'up' | 'down' | null }>(null);
  const dragRef = useRef<null | { piece: Pattern; sx: number; sy: number; started: boolean }>(null);

  const zoneFor = (y: number, from: number): 'up' | 'down' | null => {
    const rect = planeRefs.current[from]?.getBoundingClientRect();
    if (!rect) return null;
    if (y < rect.top - 6 && from < 2) return 'up';
    if (y > rect.bottom + 10 && from > 0) return 'down';
    return null;
  };

  const startCardDrag = (e: React.PointerEvent, piece: Pattern) => {
    if (e.button !== 0 || view !== 'recorrido') return;
    dragRef.current = { piece, sx: e.clientX, sy: e.clientY, started: false };
    const from = (piece.layer as Layer) - 1;
    const move = (ev: PointerEvent) => {
      const cur = dragRef.current;
      if (!cur) return;
      if (!cur.started && Math.hypot(ev.clientX - cur.sx, ev.clientY - cur.sy) < 6) return;
      cur.started = true;
      setDrag({ piece, x: ev.clientX, y: ev.clientY, zone: zoneFor(ev.clientY, from) });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      const cur = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!cur) return;
      if (!cur.started) {
        setSelectedId(id => (id === piece.id ? null : piece.id));
        return;
      }
      // Soltar sobre otra capa, o arriba / abajo de la capa activa: arriba = una más lejos, abajo = una más cerca.
      let dest: number | null = null;
      const hit = document.elementsFromPoint(ev.clientX, ev.clientY).find(el => (el as HTMLElement).dataset?.layerPlane !== undefined) as HTMLElement | undefined;
      if (hit) {
        const idx = Number(hit.dataset.layerPlane);
        if (idx !== from) dest = idx;
      }
      if (dest === null) {
        const z = zoneFor(ev.clientY, from);
        if (z === 'up') dest = from + 1;
        else if (z === 'down') dest = from - 1;
      }
      if (dest !== null && dest >= 0 && dest <= 2 && dest !== from) moveTo(piece, (dest + 1) as Layer);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  /* ---------- Teclado ---------- */
  const numberKey = (l: Layer) => () => {
    if (selected) moveTo(selected, l);
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
    escape: () => (selectedId ? setSelectedId(null) : false),
    enter: () => (primary.blocked ? primary.onBlockedClick?.(primary.blocked) : primary.onClick()),
  });

  /* ---------- Dibujo ---------- */
  const scale = Math.max(0.5, Math.min(1.2, (size.w - 500) / PLANE_W, (size.h - 184) / 440));

  const card = (x: Pattern, l: Layer) => {
    const sel = selectedId === x.id;
    const suggestion = isSuggestion(x);
    return (
      <div
        key={x.id}
        data-piece={x.id}
        onPointerDown={e => startCardDrag(e, x)}
        onClick={view === 'general' ? () => setSelectedId(id => (id === x.id ? null : x.id)) : undefined}
        className="group relative flex min-w-0 touch-none select-none flex-col gap-2 p-[5px]"
        style={{ cursor: view === 'recorrido' ? 'grab' : 'pointer', outline: sel ? `2px solid ${layerVar(l)}` : undefined, outlineOffset: 1, opacity: drag?.piece.id === x.id ? 0.35 : 1 }}
      >
        <PieceThumb piece={x} project={project} className="aspect-[16/10] w-full bg-raised" />
        <span className="truncate text-[15px] font-semibold leading-tight">{x.name}</span>
        <span className="truncate font-mono text-[11px] text-ink-2">
          {x.origin === 'user' ? 'USUARIO' : suggestion ? 'AGENTE · SUGERENCIA' : 'AGENTE'} · {evidenceCount(x, project)}/{total}
        </span>
        {/* Tres puntos para enviarla directo a otra capa */}
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
                moveTo(x, t);
              }}
              className="size-3 rounded-full p-0 disabled:cursor-default disabled:opacity-30"
              style={{ background: t === l ? 'transparent' : layerVar(t), border: `1.5px solid ${layerVar(t)}` }}
            />
          ))}
        </span>
      </div>
    );
  };

  const plane = (i: number) => {
    const l = (i + 1) as Layer;
    const items = byLayer[i];
    const rel = i - d;
    const isActive = i === active;
    const general = view === 'general';
    const opacity = general ? 1 : fadeOf(rel);
    const blur = general ? 0 : rel > 0 ? rel * 2.2 : 0;
    const alpha = general || rel <= 0 ? 1 : 1 - Math.min(1, rel) * 0.2;
    return (
      <div
        key={l}
        ref={el => {
          planeRefs.current[i] = el;
        }}
        data-layer-plane={i}
        onClick={() => (!general && !isActive ? goTo(i) : general ? goTo(i) : undefined)}
        className="absolute"
        style={{
          left: -PLANE_W / 2,
          top: 0,
          width: PLANE_W,
          minHeight: 300,
          padding: 24,
          transform: general ? `translate3d(0, 0, ${(2 - i) * 150}px)` : `translate3d(0, ${-i * SPACING_Y}px, ${-i * SPACING_Z}px)`,
          opacity,
          filter: blur ? `blur(${blur}px)` : undefined,
          background: `color-mix(in oklab, ${PLANE_BG} ${alpha * 100}%, transparent)`,
          border: `1px solid color-mix(in oklab, ${layerVar(l)} ${isActive || general ? 55 : 30}%, transparent)`,
          pointerEvents: !general && rel < -0.45 ? 'none' : 'auto',
          cursor: !isActive && !general ? 'pointer' : undefined,
        }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="type-label text-[13px] tracking-[0.08em]" style={{ color: layerVar(l) }}>
            CAPA {l} · {SHEET_NAME[l].toUpperCase()}
          </span>
          <span className="font-mono text-[11px] text-ink-2">{items.length}</span>
        </div>
        <div className="mb-4 mt-2" style={{ height: l === 1 ? 4 : 2, background: layerVar(l) }} />
        {items.length === 0 ? (
          <p className="m-0 border border-dashed border-line-strong p-6 text-center text-[13px] text-ink-2">Sin piezas. Mandá una desde otra capa con 1 · 2 · 3 o arrastrándola hasta acá.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3" style={{ pointerEvents: isActive || general ? 'auto' : 'none' }}>
            {items.map(x => card(x, l))}
          </div>
        )}
      </div>
    );
  };

  /** Marcos guía: dan sensación de túnel al avanzar. */
  const frames = Array.from({ length: 10 }, (_, k) => {
    const rel = k / 3 - d;
    const onLayer = k % 3 === 0 ? ((k / 3 + 1) as Layer) : null;
    return (
      <div
        key={k}
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{
          left: -PLANE_W / 2,
          top: 0,
          width: PLANE_W,
          height: 300,
          transform: `translate3d(0, ${-(k / 3) * SPACING_Y}px, ${-(k / 3) * SPACING_Z}px)`,
          border: `1px solid ${onLayer && onLayer <= 3 ? `color-mix(in oklab, ${layerVar(onLayer)} 40%, transparent)` : 'rgba(242,239,232,.06)'}`,
          opacity: fadeOf(rel),
        }}
      />
    );
  });

  return (
    <div className="relative h-full w-full overflow-hidden" data-layers-scene>
      <div ref={sceneRef} className="absolute inset-0 overflow-hidden" style={{ perspective: view === 'recorrido' ? 1000 : 1600, perspectiveOrigin: view === 'recorrido' ? 'calc(50% - 120px) 0%' : 'calc(50% - 120px) 30%' }}>
        <div className="absolute" style={{ left: 'calc(50% - 120px)', top: view === 'recorrido' ? 64 : size.h * 0.22, transformStyle: 'preserve-3d', transform: `scale3d(${view === 'general' ? scale * 0.8 : scale}, ${view === 'general' ? scale * 0.8 : scale}, ${scale})`, transformOrigin: '0 0' }}>
          <div
            style={{
              transformStyle: 'preserve-3d',
              transform: view === 'recorrido' ? `translate3d(0, ${d * SPACING_Y}px, ${d * SPACING_Z}px)` : 'rotateX(58deg) rotateZ(-34deg)',
            }}
          >
            {view === 'recorrido' && frames}
            {[2, 1, 0].map(i => plane(i))}
          </div>
        </div>
      </div>

      {/* Tarjeta «Estás en» */}
      <aside className="absolute right-6 top-6 z-20 flex w-[220px] flex-col gap-3 rounded-[12px] border border-line-mid p-3" style={{ background: PLANE_BG }} aria-label="Estás en">
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-2">ESTÁS EN</span>
        <div className="relative flex gap-3">
          <div aria-hidden="true" className="relative w-[3px] shrink-0 rounded-full bg-white/10">
            <span className="absolute left-0 top-0 w-full rounded-full bg-bone" style={{ height: `${(d / 2) * 100}%`, minHeight: 6 }} />
          </div>
          <ul className="m-0 flex flex-1 list-none flex-col gap-1 p-0">
            {LAYERS.map(l => (
              <li key={l}>
                <button
                  type="button"
                  onClick={() => goTo(l - 1)}
                  aria-current={active === l - 1 ? 'true' : undefined}
                  className="flex w-full items-center gap-2 rounded-[8px] px-2 py-[7px] text-left text-[13px] hover:bg-white/5"
                  style={active === l - 1 ? { background: `color-mix(in oklab, ${layerVar(l)} 20%, transparent)` } : undefined}
                >
                  <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: layerVar(l) }} />
                  <span className={`flex-1 ${active === l - 1 ? 'font-semibold text-ink' : 'text-ink-2'}`}>{SHEET_NAME[l]}</span>
                  <span className="font-mono text-[11px] text-ink-2">{byLayer[l - 1].length}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={active === 0} onClick={() => goTo(active - 1)} className="flex-1 rounded-[8px] border border-line-strong px-2 py-[6px] text-[12px] text-ink hover:bg-white/10 disabled:opacity-35">
            ↑ Más cerca
          </button>
          <button type="button" disabled={active === 2} onClick={() => goTo(active + 1)} className="flex-1 rounded-[8px] border border-line-strong px-2 py-[6px] text-[12px] text-ink hover:bg-white/10 disabled:opacity-35">
            ↓ Más lejos
          </button>
        </div>
        <p className="m-0 text-[11px] leading-snug text-ink-2">También con la rueda del mouse o las flechas.</p>
      </aside>

      {/* Arrastre: la pieza sigue al mouse y las zonas dicen a qué capa va */}
      {drag && (
        <>
          <div className="pointer-events-none fixed z-[70] w-[130px] opacity-90 shadow-[0_8px_24px_rgba(0,0,0,.5)]" style={{ left: drag.x - 65, top: drag.y - 40 }}>
            <PieceThumb piece={drag.piece} project={project} className="aspect-[16/10] w-full" word={false} />
          </div>
          {drag.piece.layer && drag.piece.layer < 3 && (
            <div className="pointer-events-none absolute inset-x-0 top-3 z-[60] flex justify-center">
              <span className="rounded-full px-4 py-1 text-[12px] font-semibold text-void" style={{ background: layerVar((drag.piece.layer + 1) as Layer), outline: drag.zone === 'up' ? '3px solid #F2EFE8' : undefined }}>
                ↑ Soltá arriba para mandarla a {SHEET_NAME[(drag.piece.layer + 1) as Layer]}
              </span>
            </div>
          )}
          {drag.piece.layer && drag.piece.layer > 1 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-28 z-[60] flex justify-center">
              <span className="rounded-full px-4 py-1 text-[12px] font-semibold text-void" style={{ background: layerVar((drag.piece.layer - 1) as Layer), outline: drag.zone === 'down' ? '3px solid #F2EFE8' : undefined }}>
                ↓ Soltá abajo para mandarla a {SHEET_NAME[(drag.piece.layer - 1) as Layer]}
              </span>
            </div>
          )}
        </>
      )}

      <BottomBar
        help="Rueda del mouse o ↑ ↓ para recorrer las capas. Clic en una pieza para elegirla; arrastrala hacia arriba o abajo para cambiarla de capa."
        actions={
          <>
            <BarButton active={view === 'recorrido'} onClick={() => setView('recorrido')}>
              Recorrido
            </BarButton>
            <BarButton active={view === 'general'} onClick={() => setView('general')}>
              General
            </BarButton>
            {selected && isLayer(selected.layer) && (
              <>
                <BarSep />
                <span className="px-1 text-[12px] text-ink-2">Mover a</span>
                {LAYERS.map(l => (
                  <BarButton key={l} disabled={selected.layer === l} onClick={() => moveTo(selected, l)}>
                    <span aria-hidden="true" className="size-2 rounded-full" style={{ background: layerVar(l) }} />
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
