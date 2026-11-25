import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Layer, Pattern, Project } from '../types';
import { useShortcuts } from '../hooks/useAuditShortcuts';
import { useViewport } from '../hooks/useViewport';
import { corpusRefs, evidenceCount, isLayer } from '../utils/layers';
import { LAYER_QUESTION } from '../utils/layerQuestions';
import { oneLine, shortRule } from '../utils/layerRules';
import { logEvent } from '../utils/testLog';
import { ActionResult, SHEET_NAME, evidenceText, isSuggestion, move, piecesIn, place, rename, takeOut } from '../pieces/model';
import { BarButton, BarSep, BottomBar } from '../components/shell/BottomBar';
import { ColorEditor, ColorsPanel } from '../components/ColorEditor';
import { PieceThumb } from './common';
import { PieceRule } from './PieceRule';
import { RoleKey, useColors } from './colorContext';
import { proposalFor, tallyText } from '../utils/results';
import { Notify } from './types';
import { useClima } from './climaContext';

/**
 * 03 · CAPAS: una capa por vez, a lo ancho del escenario.
 * Izquierda: «Estás en» (las tres capas) y el detalle de la pieza elegida. Centro: las piezas de la capa, sin tarjeta
 * contenedora, en una grilla que llena el ancho. Derecha: solo los colores.
 * Una pieza se cambia de capa arrastrándola (suben tres zonas para soltar, o se suelta sobre la lista),
 * con los tres puntos al pasar el mouse, o eligiéndola y tocando 1 · 2 · 3.
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
  /** Pide ir a una capa (desde la barra lateral o desde «Editar en Capas»). */
  goLayer: { layer: Layer; n: number } | null;
}

const LAYERS: Layer[] = [1, 2, 3];
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const layerVar = (l: Layer) => `var(--capa-${l})`;
const edgeVar = (l: Layer) => `var(--cc-l${l - 1}-edge)`;
/** Titular de la capa a escala: Primario más grande, Acento más chico. */
const HEAD: Record<Layer, string> = { 1: 'clamp(56px, 6vw, 96px)', 2: 'clamp(44px, 4.4vw, 64px)', 3: 'clamp(34px, 3.2vw, 44px)' };
/** Ancho mínimo de tarjeta por capa: la jerarquía se ve en el tamaño (Primario grande, Acento chico). */
const CARD_MIN: Record<Layer, number> = { 1: 320, 2: 240, 3: 180 };
/** Ya movió una pieza de capa (o cerró la guía): no se vuelve a mostrar. */
const LEARNED_KEY = 'cc-capas-drag-learned';

export function LayersScreen({ project, enabled, apply, onNext, onBlocked, onLayer, notify, onColorLive, onColorCommit, onRoleLive, onRoleCommit, goLayer }: Props) {
  const viewport = useViewport();
  const mobile = viewport === 'mobile';
  const touchUi = viewport !== 'desktop';
  const colors = useColors();
  const [active, setActive] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [colorFor, setColorFor] = useState<string | null>(null);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeLayer = (active + 1) as Layer;
  // Clima: la luz de la capa que se mira crece al doble; las otras bajan.
  const clima = useClima();
  useEffect(() => {
    clima.setFocus(activeLayer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLayer]);
  useEffect(
    () => () => clima.setFocus(null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => {
    onLayer(SHEET_NAME[activeLayer]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLayer]);

  // Cómo se cambia una pieza de capa: una guía sobre la primera pieza que queda hasta que se mueve una (o se cierra).
  const [learned, setLearned] = useState(() => {
    try {
      return localStorage.getItem(LEARNED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const learn = () => {
    setLearned(true);
    try {
      localStorage.setItem(LEARNED_KEY, '1');
    } catch {
      /* sin almacenamiento: la guía vuelve a aparecer */
    }
  };
  void notify;

  /** Hacia dónde se movió: más hondo (Primario → Acento) o más cerca. Define la animación de entrada. */
  const [dir, setDir] = useState<'deeper' | 'closer'>('deeper');
  const activeRef = useRef(0);
  activeRef.current = active;
  /** Va a una capa (0 a 2). Al bajar entra desde arriba de la capa; al subir, desde el final (venís de abajo). */
  const goTo = useCallback((i: number) => {
    const next = clamp(i, 0, 2);
    if (next === activeRef.current) return;
    const deeper = next > activeRef.current;
    setDir(deeper ? 'deeper' : 'closer');
    setActive(next);
    pull.current = 0;
    setPullPct(0);
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = deeper ? 0 : el.scrollHeight;
    });
  }, []);

  /* ---------- Rueda: al llegar al final de una capa, seguir bajando pasa a la de abajo (y al revés arriba) ---------- */
  const pull = useRef(0);
  const [pullPct, setPullPct] = useState(0);
  const pullTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const PULL = 260;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !enabled) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
      const atTop = el.scrollTop <= 0;
      const down = dy > 0 && atBottom && activeRef.current < 2;
      const up = dy < 0 && atTop && activeRef.current > 0;
      if (!down && !up) {
        pull.current = 0;
        setPullPct(0);
        return;
      }
      // Cambió el sentido: se empieza de cero.
      if ((pull.current > 0 && dy < 0) || (pull.current < 0 && dy > 0)) pull.current = 0;
      pull.current += Math.max(-80, Math.min(80, dy));
      const pct = Math.min(1, Math.abs(pull.current) / PULL);
      setPullPct(pull.current > 0 ? pct : -pct);
      if (pullTimer.current) clearTimeout(pullTimer.current);
      pullTimer.current = setTimeout(() => {
        pull.current = 0;
        setPullPct(0);
      }, 600);
      if (pct >= 1) goTo(activeRef.current + (pull.current > 0 ? 1 : -1));
    };
    el.addEventListener('wheel', onWheel, { passive: true });
    return () => el.removeEventListener('wheel', onWheel);
  }, [enabled, goTo]);
  useEffect(() => {
    if (goLayer) goTo(goLayer.layer - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goLayer?.n]);

  /* ---------- Piezas ---------- */
  const byLayer = useMemo(() => LAYERS.map(l => piecesIn(project, l)), [project]);
  const total = corpusRefs(project).length;
  const selected = selectedId ? project.patterns.find(x => x.id === selectedId && x.status !== 'discarded') ?? null : null;
  const coreEmpty = byLayer[0].length === 0;

  const moveToLayer = useCallback(
    (piece: Pattern, to: Layer) => {
      const from = piece.layer;
      if (!isLayer(from) || from === to) return;
      learn();
      apply(p => place(p, piece.id, to), `Moviste «${piece.name}» de ${SHEET_NAME[from]} a ${SHEET_NAME[to]}.`);
    },
    [apply],
  );

  /* ---------- Arrastre entre capas, con zonas para soltar ---------- */
  type Ghost = { piece: Pattern; x: number; y: number; ox: number; oy: number; returning: boolean };
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [zone, setZone] = useState<Layer | null>(null);
  const [zonesUp, setZonesUp] = useState(false);
  const dragRef = useRef<null | { piece: Pattern; sx: number; sy: number; ox: number; oy: number; started: boolean; timer?: ReturnType<typeof setTimeout>; touch: boolean; cleanup: () => void }>(null);

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
    const state = { piece, sx: e.clientX, sy: e.clientY, ox: rect.left + rect.width / 2, oy: rect.top + rect.height / 2, started: false, touch, cleanup: () => {} } as NonNullable<typeof dragRef.current>;
    dragRef.current = state;
    const begin = (x: number, y: number) => {
      state.started = true;
      logEvent('drag_start', { piece: piece.name, from: piece.layer });
      if (touch) navigator.vibrate?.(10);
      setGhost({ piece, x, y, ox: state.ox, oy: state.oy, returning: false });
      requestAnimationFrame(() => setZonesUp(true));
    };
    // En táctil el arrastre empieza con una pulsación larga de 350 ms (antes, mover el dedo es desplazarse).
    if (touch) state.timer = setTimeout(() => begin(state.sx, state.sy), 350);
    let lastX = e.clientX;
    let lastY = e.clientY;
    const move = (ev: PointerEvent) => {
      lastX = ev.clientX;
      lastY = ev.clientY;
      if (!state.started) {
        const dist = Math.hypot(ev.clientX - state.sx, ev.clientY - state.sy);
        if (touch) {
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
      setZone(targetAt(ev.clientX, ev.clientY));
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

  /* ---------- Teclado ---------- */
  const numberKey = (l: Layer) => () => {
    if (selected) moveToLayer(selected, l);
    else goTo(l - 1);
  };
  const primary = coreEmpty
    ? { label: 'Seguir a Sistema →', blocked: 'Necesita al menos una pieza en Primario.', blockedLabel: 'Primario vacío', onClick: () => {}, onBlockedClick: onBlocked }
    : { label: 'Seguir a Sistema →', kbd: '⏎', onClick: onNext };
  useShortcuts(enabled, {
    arrowup: () => goTo(active - 1),
    arrowdown: () => goTo(active + 1),
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

  /** Lo que se ofrece dentro del modal de una pieza: lo que mostraron las pruebas y qué hacer con ella. */
  const extrasOf = (x: Pattern) => {
    const pr = proposalFor(project, x.id);
    const tally = tallyText(project, x.id);
    const actions: { label: string; run: () => void; quiet?: boolean }[] = [];
    if (pr) {
      actions.push({
        label: pr.kind === 'out' ? 'Sacarla del sistema' : pr.kind === 'raise' ? 'Subirla de capa' : 'Bajarla de capa',
        run: () => (pr.kind === 'out' ? apply(p => takeOut(p, x.id), `Sacaste «${x.name}» del sistema.`) : apply(p => move(p, x.id, pr.kind === 'raise' ? 1 : -1))),
      });
    }
    actions.push({ label: 'Descartar pieza', run: () => apply(p => takeOut(p, x.id), `Descartaste «${x.name}». Podés recuperarla en Revisar.`), quiet: true });
    const note = pr || tally ? (
      <>
        {tally && <span>En pruebas: {tally}</span>}
        {pr && <span className="font-semibold">{pr.text}</span>}
      </>
    ) : undefined;
    return { actions, note };
  };

  /* ---------- Dibujo ---------- */
  const card = (x: Pattern, l: Layer) => {
    const sel = selectedId === x.id;
    const suggestion = isSuggestion(x);
    const isColor = x.category === 'color';
    return (
      <div
        key={x.id}
        data-piece={x.id}
        onPointerDown={e => startCardDrag(e, x)}
        className={`group relative flex min-w-0 select-none flex-col gap-2 rounded-[4px] p-[5px] ${touchUi ? 'touch-pan-y' : 'touch-none'}`}
        style={{ cursor: 'grab', outline: sel ? `2px solid ${layerVar(l)}` : undefined, outlineOffset: 1, opacity: ghost?.piece.id === x.id ? 0.3 : 1 }}
      >
        <PieceThumb piece={x} project={project} className="aspect-[4/5] w-full rounded-[4px] bg-raised" onSwatch={isColor ? () => { setSelectedId(x.id); setColorFor(x.id); } : undefined} />
        <span className="text-[1rem] font-semibold leading-tight">{x.name}</span>
        <span className="truncate font-mono text-[0.875rem] text-ink-2">
          {x.origin === 'user' ? 'USUARIO' : suggestion ? 'AGENTE · SUGERENCIA' : 'AGENTE'} · {evidenceCount(x, project)}/{total}
        </span>
        {/* Texto corto y «Ver completo» (abre un modal): no arrastra ni elige la pieza */}
        <span className="cursor-auto" onPointerDown={e => e.stopPropagation()}>
          <PieceRule piece={x} project={project} short={l === 3 ? oneLine(x) : shortRule(x)} {...extrasOf(x)} />
        </span>
        {/* Al pasar el mouse: cómo se mueve */}
        {!touchUi && (
          <span aria-hidden="true" className="pointer-events-none absolute left-3 top-3 hidden items-center gap-1 rounded-[4px] bg-void/80 px-2 py-[3px] text-[0.75rem] font-semibold text-bone group-hover:flex">
            <span className="text-[0.875rem] leading-none">⠿</span> Arrastrá para mover
          </span>
        )}
      </div>
    );
  };

  const items = byLayer[active];
  const dragging = !!ghost && !ghost.returning;

  /** «Estás en»: las tres capas. Mientras se arrastra, cada fila es también una zona para soltar. */
  /** Las tres láminas apiladas en perspectiva: la activa se levanta. Se tocan y también reciben piezas. */
  const stack = !mobile && (
    <div className="relative mx-auto mt-6 h-[170px] w-[180px] shrink-0" style={{ perspective: 600 }} aria-hidden="true">
      <div className="absolute inset-0" style={{ transformStyle: 'preserve-3d', transform: 'rotateX(58deg) rotateZ(-38deg)' }}>
        {LAYERS.map(l => {
          const i = l - 1;
          const on = active === i;
          const hot = dragging && zone === l && ghost?.piece.layer !== l;
          return (
            <button
              key={l}
              type="button"
              tabIndex={-1}
              data-drop-zone={l}
              onClick={() => goTo(i)}
              title={`${SHEET_NAME[l]} · ${byLayer[i].length}`}
              className="absolute left-[20px] top-[20px] h-[110px] w-[110px] rounded-[4px] transition-[transform,opacity,box-shadow] duration-300"
              style={{
                transform: `translateZ(${(2 - i) * 34 + (on ? 18 : 0)}px)`,
                background: on ? `color-mix(in oklab, ${layerVar(l)} 85%, transparent)` : `color-mix(in oklab, ${layerVar(l)} 35%, var(--cc-bg))`,
                boxShadow: on ? `0 0 0 2px var(--cc-text), 0 18px 30px rgba(0,0,0,0.5)` : hot ? '0 0 0 2px var(--cc-text)' : `0 0 0 1px ${edgeVar(l)}`,
                opacity: on ? 1 : 0.8,
              }}
            />
          );
        })}
      </div>
    </div>
  );

  const layerList = (
    <nav className="flex flex-col gap-3" aria-label="Estás en">
      {stack}
      <span className="type-label text-[0.75rem] text-ink-2">Estás en</span>
      <div className="relative flex gap-3">
        <div aria-hidden="true" className="relative w-[3px] shrink-0 rounded-full bg-white/10">
          <span className="absolute left-0 top-0 w-full rounded-full bg-bone transition-[height] duration-200" style={{ minHeight: 6, height: `${(active / 2) * 100}%` }} />
        </div>
        <ul className="m-0 flex flex-1 list-none flex-col gap-1 p-0">
          {LAYERS.map(l => {
            const on = active === l - 1;
            const hot = dragging && zone === l && ghost?.piece.layer !== l;
            return (
              <li key={l}>
                <button
                  type="button"
                  data-drop-zone={l}
                  onClick={() => goTo(l - 1)}
                  aria-current={on ? 'true' : undefined}
                  className="flex w-full items-center gap-2 rounded-[4px] px-2 py-[7px] text-left text-[0.875rem] hover:bg-white/5"
                  style={{ ...(on ? { background: `color-mix(in oklab, ${layerVar(l)} 20%, transparent)` } : {}), outline: hot ? '1px dotted var(--cc-text)' : undefined, minHeight: touchUi ? 44 : undefined }}
                >
                  <span aria-hidden="true" className="layer-dot size-2 shrink-0 rounded-full" style={{ background: layerVar(l), boxShadow: `0 0 0 1px ${edgeVar(l)}` }} />
                  <span className={`flex-1 ${on ? 'font-semibold text-ink' : 'text-ink-2'}`}>
                    {l} · {SHEET_NAME[l]}
                  </span>
                  <span className="font-mono text-[0.875rem] text-ink-2">{byLayer[l - 1].length}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="m-0 text-[0.875rem] leading-snug text-ink-2">Seguí con la rueda al final de una capa para pasar a la de abajo. También ↑ ↓ o 1 · 2 · 3.</p>
    </nav>
  );

  const pieceDetail = selected && (
    <section className="flex flex-col gap-2" aria-label="Detalle de la pieza">
      <span className="type-label text-[0.75rem] text-ink-2">Pieza elegida · {SHEET_NAME[selected.layer as Layer]}</span>
      <h3 className="m-0 text-[1.125rem] font-semibold leading-tight">{selected.name}</h3>
      <div className="flex flex-col gap-2 text-[0.875rem] leading-[1.55]">
        {selected.description?.trim() && <p className="m-0">{selected.description.trim()}</p>}
        {selected.systemHypothesis?.trim() && selected.systemHypothesis.trim() !== selected.description?.trim() && <p className="m-0 text-ink-2">{selected.systemHypothesis.trim()}</p>}
        {!selected.description?.trim() && !selected.systemHypothesis?.trim() && <p className="m-0 text-ink-2">Todavía sin regla redactada.</p>}
        <span className="type-data text-ink-2">
          {selected.origin === 'user' ? 'USUARIO' : 'AGENTE'} · En {evidenceText(selected, project)}
        </span>
      </div>
    </section>
  );

  const dropZones = (
    <div
      aria-hidden={!ghost}
      className={`${ghost ? 'pointer-events-auto' : 'pointer-events-none'} absolute z-40 flex ${mobile ? 'inset-x-0 bottom-0 flex-col gap-2 rounded-t-[4px] p-3 pb-[calc(12px+env(safe-area-inset-bottom))]' : 'bottom-4 left-[280px] right-[340px] gap-3'}`}
      style={{ transform: zonesUp ? 'translateY(0)' : 'translateY(140%)', opacity: ghost ? 1 : 0, transition: 'transform 200ms var(--ease-camera), opacity 200ms', background: mobile ? 'var(--cc-surface)' : undefined }}
    >
      {LAYERS.map(l => {
        const here = ghost?.piece.layer === l;
        const hot = zone === l && !here;
        return (
          <div
            key={l}
            data-drop-zone={l}
            className={`layer-${l} flex min-w-0 flex-1 flex-col justify-center gap-[2px] rounded-[4px] px-4 py-3`}
            style={{ minHeight: mobile ? 64 : 'clamp(56px, 11vh, 88px)', background: 'var(--cc-surface)', outline: hot ? '1px dotted var(--cc-text)' : undefined, outlineOffset: -4, filter: here ? 'brightness(0.8)' : undefined, boxShadow: '0 -16px 36px rgba(0,0,0,.6), 0 12px 30px rgba(0,0,0,.5), 0 0 0 1px var(--cc-line-strong, rgba(255,255,255,.18))' }}
          >
            <span className="flex items-baseline gap-2">
              <span className="layer-headline" style={{ fontSize: 30, fontWeight: 700, color: hot ? 'var(--layer-head)' : 'var(--cc-text-muted)', textDecoration: hot ? undefined : 'none' }}>
                {SHEET_NAME[l]}
              </span>
              {here && <span className="ml-auto text-[0.875rem] font-medium text-ink-2">Está acá</span>}
            </span>
            <span className="text-[0.875rem]" style={{ color: 'var(--cc-text-muted)' }}>
              {LAYER_QUESTION[l]}
            </span>
          </div>
        );
      })}
    </div>
  );

  const pieceColor = selected && colorFor === selected.id ? colors.byPiece[selected.id] : null;

  return (
    <div className="stage-enter relative flex h-full w-full overflow-hidden" data-layers-scene>
      {/* Izquierda: «Estás en» y la pieza elegida */}
      {!mobile && (
        <aside className="flex w-[240px] shrink-0 flex-col gap-8 overflow-y-auto overflow-x-hidden pb-6 pl-6 pr-2 pt-12 lg:pl-10">
          {layerList}
          {pieceDetail}
        </aside>
      )}

      {/* Centro: la capa, sin tarjeta contenedora; las piezas llenan el ancho. El fondo toma el color de la capa. */}
      <div ref={scrollRef} className={`layer-${activeLayer} relative min-w-0 flex-1 overflow-y-auto px-4 pb-10 pt-10 max-md:pb-28 lg:px-8`}>
        {pullPct < 0 && (
          <div className="sticky top-0 z-10 -mx-4 mb-2 h-1 lg:-mx-8" style={{ background: `linear-gradient(to right, var(--capa-${activeLayer - 1}) ${-pullPct * 100}%, transparent ${-pullPct * 100}%)` }} aria-hidden="true" />
        )}
        {mobile && (
          <div className="sticky top-0 z-20 -mx-4 mb-4 flex gap-2 bg-bg px-4 py-2" role="tablist" aria-label="Capas">
            {LAYERS.map(l => (
              <button
                key={l}
                type="button"
                role="tab"
                aria-selected={active === l - 1}
                onClick={() => goTo(l - 1)}
                className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-[4px] px-2 text-[0.875rem] font-semibold"
                style={{ background: active === l - 1 ? `color-mix(in oklab, ${layerVar(l)} 20%, transparent)` : 'var(--cc-surface)' }}
              >
                <span aria-hidden="true" className="layer-dot size-2 rounded-full" style={{ background: layerVar(l), boxShadow: `0 0 0 1px ${edgeVar(l)}` }} />
                {l} · {SHEET_NAME[l]}
              </button>
            ))}
          </div>
        )}
        <section key={active} className={`layer-${activeLayer} layer-in-${dir} relative flex flex-col gap-6`} aria-label={`Capa ${activeLayer} · ${SHEET_NAME[activeLayer]}`}>
          <header className="flex flex-col gap-3">
            <div className="flex items-end justify-between gap-3">
              <h1 data-headline className="layer-headline m-0" style={{ fontSize: HEAD[activeLayer] }}>
                {SHEET_NAME[activeLayer]}
              </h1>
              <span className="type-data pb-1 text-[0.875rem] text-ink-2">
                {items.length} {items.length === 1 ? 'pieza' : 'piezas'}
              </span>
            </div>
            <p className="m-0 text-[1.125rem] font-medium" style={{ color: 'var(--cc-text-muted)' }}>
              {LAYER_QUESTION[activeLayer]}
            </p>
          </header>
          {items.length === 0 ? (
            <p className="m-0 rounded-[4px] bg-ink/5 p-6 text-center text-[0.875rem] text-ink-2">Sin piezas. Mandá una desde otra capa: arrastrala hasta acá o elegila y tocá {activeLayer}.</p>
          ) : (
            <div className="relative">
              {!learned && !ghost && (
                <div role="note" className="drag-coach relative z-10 mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[4px] px-4 py-3" style={{ background: 'var(--cc-surface)', boxShadow: '0 0 0 1px var(--cc-line-mid, rgba(255,255,255,0.15))' }}>
                  <span aria-hidden="true" className="drag-coach-demo relative h-9 w-14 shrink-0">
                    <span className="absolute left-0 top-1 h-7 w-5 rounded-[2px]" style={{ background: 'color-mix(in oklab, var(--layer-color) 70%, transparent)' }} />
                    <span className="drag-coach-hand absolute text-[1.125rem] leading-none">✋</span>
                  </span>
                  <span className="min-w-0 flex-1 text-[0.9375rem] leading-snug">
                    <strong>Para cambiar una pieza de capa, {touchUi ? 'mantenela apretada' : 'hacé clic y arrastrala'}.</strong>{' '}
                    <span className="text-ink-2">Abajo aparecen las tres capas: soltala en la que va. También podés elegirla y tocar 1 · 2 · 3.</span>
                  </span>
                  <button type="button" onClick={learn} className="shrink-0 text-[0.875rem] font-semibold text-ink-2 underline underline-offset-4 hover:text-ink">
                    Entendido
                  </button>
                </div>
              )}
              <div className="grid gap-5" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${mobile ? 150 : CARD_MIN[activeLayer]}px, 1fr))` }}>
                {items.map((x, i) => (
                  <div key={x.id} className={!learned && i === 0 ? 'drag-coach-target rounded-[6px]' : undefined}>
                    {card(x, activeLayer)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
        {/* Asomo de la capa siguiente: se ve que hay algo debajo; seguir bajando con la rueda la trae */}
        {active < 2 && (
          <button
            type="button"
            onClick={() => goTo(active + 1)}
            className={`layer-${activeLayer + 1} group relative mt-12 flex w-full items-center gap-4 overflow-hidden rounded-[4px] px-5 py-4 text-left`}
            style={{ background: 'color-mix(in oklab, var(--layer-color) 10%, transparent)', boxShadow: 'inset 0 1px 0 color-mix(in oklab, var(--layer-color) 45%, transparent)' }}
          >
            <span aria-hidden="true" className="absolute inset-y-0 left-0 transition-[width] duration-100" style={{ width: `${Math.max(0, pullPct) * 100}%`, background: 'color-mix(in oklab, var(--layer-color) 22%, transparent)' }} />
            <span className="relative text-[0.875rem] text-ink-2">Debajo</span>
            <span className="layer-headline relative" style={{ fontSize: 28, textDecoration: 'none' }}>
              {SHEET_NAME[(activeLayer + 1) as Layer]}
            </span>
            <span className="relative text-[0.875rem] text-ink-2">
              {byLayer[active + 1].length} {byLayer[active + 1].length === 1 ? 'pieza' : 'piezas'}
            </span>
            <span className="relative ml-auto text-[0.875rem] font-semibold text-ink-2 group-hover:text-ink">{pullPct > 0 ? 'Seguí bajando…' : 'Bajá con la rueda o tocá ↓'}</span>
          </button>
        )}
        {mobile && pieceDetail && <div className="mt-8">{pieceDetail}</div>}
      </div>

      {/* Derecha: solo los colores */}
      {!mobile && (
        <aside className="w-[300px] shrink-0 overflow-y-auto pb-6 pl-2 pr-6 pt-12 lg:pr-10" aria-label="Colores">
          <ColorsPanel flat onLive={onRoleLive} onCommit={onRoleCommit} />
        </aside>
      )}

      {/* Colores en móvil: hoja inferior */}
      {mobile && rolesOpen && (
        <div className="fixed inset-0 z-[63]" onClick={() => setRolesOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="absolute inset-x-0 bottom-0 rounded-t-[4px] p-3 pb-[calc(16px+env(safe-area-inset-bottom))]" style={{ background: 'var(--cc-surface)' }} onClick={e => e.stopPropagation()}>
            <ColorsPanel mobile onLive={onRoleLive} onCommit={onRoleCommit} />
            <button type="button" onClick={() => setRolesOpen(false)} className="mt-2 min-h-[44px] w-full rounded-[4px] bg-ink/10 text-[0.875rem]">
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
          className={`absolute z-30 flex gap-2 rounded-[4px] p-3 ${mobile ? 'inset-x-3 bottom-[84px]' : 'bottom-4 left-1/2 w-[420px] -translate-x-1/2'}`}
          style={{ background: 'var(--cc-surface)' }}
          onSubmit={e => {
            e.preventDefault();
            const v = (new FormData(e.currentTarget).get('name') as string) ?? '';
            setRenaming(null);
            if (v.trim() && v.trim() !== selected.name) apply(p => rename(p, selected.id, v), `Renombraste «${selected.name}».`);
          }}
        >
          <input
            name="name"
            aria-label="Nombre de la pieza"
            defaultValue={selected.name}
            autoFocus
            onKeyDown={e => e.key === 'Escape' && setRenaming(null)}
            className="min-w-0 flex-1 border-b-2 border-line-strong bg-transparent py-1 text-[0.9375rem] text-ink outline-none focus:border-bone"
            style={{ minHeight: touchUi ? 44 : undefined }}
          />
          <button type="submit" className="rounded-[4px] bg-bone px-4 text-[0.875rem] font-bold text-void" style={{ minHeight: touchUi ? 44 : 36 }}>
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
            boxShadow: `0 20px 50px color-mix(in srgb, ${layerVar(ghost.piece.layer as Layer)} 40%, transparent)`,
          }}
        >
          <PieceThumb piece={ghost.piece} project={project} className="aspect-[4/5] w-full rounded-[4px]" word={false} />
        </div>
      )}

      <BottomBar
        actions={
          <>
            {mobile && <BarButton onClick={() => setRolesOpen(true)}>Colores</BarButton>}
            {selected && (
              <BarButton onClick={() => setRenaming(selected.id)}>
                Renombrar <kbd className="font-mono text-[0.875rem] opacity-75">F2</kbd>
              </BarButton>
            )}
            {selected && selected.category === 'color' && (
              <BarButton onClick={() => setColorFor(selected.id)}>
                Color <kbd className="font-mono text-[0.875rem] opacity-75">C</kbd>
              </BarButton>
            )}
          </>
        }
        primary={primary}
      />
    </div>
  );
}
