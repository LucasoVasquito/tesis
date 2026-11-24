import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BoardBox, Layer, Project, Reference } from '../types';
import { useShortcuts } from '../hooks/useAuditShortcuts';
import { useViewport } from '../hooks/useViewport';
import { corpusRefs } from '../utils/layers';
import { MIN_REFS, SHEET_NAME, createUserPiece, suggestions } from '../pieces/model';
import { AnalysisPanel } from './ReferencesSteps';
import { LAYER_QUESTION } from '../utils/layerQuestions';
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
  /** Pide centrar el lienzo en una imagen (por ejemplo, la que no se pudo leer). */
  focus: { id: string; n: number } | null;
  /** Modo cuentagotas: se elige un color tocando cualquier punto de una imagen del lienzo. */
  eyedropper?: { label: string; current: string } | null;
  /** hex elegido (o null si se cancela). `back` false = no volver a la etapa de origen. */
  onEyedropperDone?: (hex: string | null, back?: boolean) => void;
  onNotify?: (text: string) => void;
}

/** La ayuda del lienzo ya se mostró una vez. */
const CANVAS_HELP_KEY = 'cc_canvas_help_seen';

/** Lupa del cuentagotas: 9×9 píxeles ampliados alrededor del cursor. */
const LOUPE_N = 9;
const LOUPE_PX = 99;
const hex2 = (n: number) => n.toString(16).padStart(2, '0');
/** Texto legible (claro u oscuro) sobre un hex de fondo. */
const textOnHex = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum < 0.55 ? '#F4F1EC' : '#141210';
};

export function ReferencesScreen(props: Props) {
  const { project, mutate } = props;
  const refs = useMemo(() => corpusRefs(project), [project]);
  const viewport = useViewport();
  const mobile = viewport === 'mobile';
  const fileInput = useRef<HTMLInputElement>(null);
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

  // Franja fija arriba (título + frase de intención): el lienzo empieza debajo y nada lo tapa.
  // Al moverse o hacer zoom, el título baja a 32 px y la franja se achica; el contenido no se mueve de lugar.
  const stripH = mobile ? 132 : 160;
  const stripC = mobile ? 76 : 88;
  const [collapsed, setCollapsed] = useState(() => camCache.has(project.id));
  const collapsedRef = useRef(collapsed);
  const collapse = useCallback(() => {
    if (collapsedRef.current) return;
    collapsedRef.current = true;
    setCollapsed(true);
    setCam(c => ({ ...c, y: c.y + (stripH - stripC) }));
  }, [stripH, stripC]);

  const [selected, setSelected] = useState<string | null>(null);
  /** Varias imágenes elegidas (⇧ o Ctrl + clic, o «Elegir varias» en táctil): con 2 o más se crea un patrón. */
  const [picked, setPicked] = useState<string[]>([]);
  const [multi, setMulti] = useState(false);
  /** Formulario «Crear patrón» abierto. */
  const [grouping, setGrouping] = useState(false);
  const [gName, setGName] = useState('');
  const [gNote, setGNote] = useState('');
  const [gLayer, setGLayer] = useState<Layer>(2);
  const openGrouping = () => {
    if (picked.length < 2) return;
    setGName('');
    setGNote('');
    setGLayer(2);
    setGrouping(true);
  };
  const submitGroup = () => {
    if (!gName.trim() || picked.length < 2) return;
    const r = createUserPiece(project, picked, gName, gLayer, gNote);
    if (!r.id) return;
    mutate(() => r.project, { notice: r.message });
    setGrouping(false);
    setPicked([]);
    setMulti(false);
  };
  /** Patrones tuyos por imagen: se marcan en el lienzo con una etiqueta. */
  const ownByRef = useMemo(() => {
    const m = new Map<string, { name: string; layer: Layer | null }[]>();
    project.patterns
      .filter(x => x.origin === 'user' && x.status !== 'discarded' && !x.isGroup && x.evidence.length > 1)
      .forEach(x => x.evidence.forEach(id => m.set(id, [...(m.get(id) ?? []), { name: x.name, layer: (x.layer as Layer | null) ?? null }])));
    return m;
  }, [project.patterns]);
  /** Orden en el frente: lo último seleccionado va arriba. */
  const [front, setFront] = useState<Record<string, number>>({});
  const frontCounter = useRef(1);
  /** Caja que se está arrastrando o redimensionando (se guarda al soltar). */
  const [live, setLive] = useState<{ id: string; box: BoardBox } | null>(null);
  const liveRef = useRef(live);
  liveRef.current = live;
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
    collapse();
    setCam(c => {
      const z = clamp(c.z * factor, MIN_Z, MAX_Z);
      const mx = px ?? size.w / 2;
      const my = py ?? (size.h - BOTTOM_RESERVE) / 2 + 40;
      const wx = (mx - c.x) / c.z;
      const wy = (my - c.y) / c.z;
      return { z, x: mx - wx * z, y: my - wy * z };
    });
  }, [size.w, size.h, collapse]);

  // Convención Figma/Miro: la rueda o el trackpad desplazan el lienzo; Ctrl/Cmd + rueda (o el pellizco del trackpad) hace zoom en el cursor.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !props.enabled) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * (Math.abs(e.deltaY) >= 50 ? 0.002 : 0.01)), e.clientX - rect.left, e.clientY - rect.top);
      else {
        collapse();
        setCam(c => ({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [props.enabled, zoomAt, collapse]);

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
        const aspect = Math.max(0.35, size.w / Math.max(200, size.h - BOTTOM_RESERVE));
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
      if (cur.kind === 'pan') {
        if (!collapsedRef.current) {
          collapse();
          cur.cam = { ...cur.cam, y: cur.cam.y + (stripH - stripC) };
        }
        setCam({ ...cur.cam, x: cur.cam.x + dx, y: cur.cam.y + dy });
      }
      else if (cur.kind === 'move') {
        const next = { id: cur.id, box: { ...cur.box, x: cur.box.x + dx / z, y: cur.box.y + dy / z } };
        liveRef.current = next;
        setLive(next);
      }
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
        liveRef.current = { id: cur.id, box: { x, y, w, h } };
        setLive(liveRef.current);
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
        if (!cur.moved) {
          setSelected(null);
          setPicked([]);
        }
        return;
      }
      // Se guarda fuera del actualizador de estado: React lo corre durante el render y no se puede actualizar App desde ahí.
      const l = liveRef.current;
      if (l && cur.moved) {
        const box = l.box;
        mutate(p => ({ ...p, references: p.references.map(r => (r.id === l.id ? { ...r, board: box } : r)) }), { silent: true });
      }
      setLive(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  // Espacio + arrastrar: desplazar (además de arrastrar el fondo).
  const spaceDown = useRef(false);
  const [spacePan, setSpacePan] = useState(false);
  useEffect(() => {
    if (!props.enabled) return;
    const typing = () => {
      const el = document.activeElement as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    };
    const dn = (e: KeyboardEvent) => {
      if (e.key !== ' ' || typing()) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'BUTTON' || el.tagName === 'A')) return;
      e.preventDefault();
      spaceDown.current = true;
      setSpacePan(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key !== ' ') return;
      spaceDown.current = false;
      setSpacePan(false);
    };
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', dn);
      window.removeEventListener('keyup', up);
    };
  }, [props.enabled]);

  // Dos dedos: zoom con el pellizco (y desplazamiento con el punto medio).
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<null | { dist: number; mx: number; my: number }>(null);
  const trackTouch = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.current.size === 2) {
      drag.current = null; // se cancela lo que se arrastraba con un dedo
      setLive(null);
      const [a, b] = [...touches.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    }
  };
  const moveTouch = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch' || !touches.current.has(e.pointerId)) return;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.current.size !== 2 || !pinch.current) return;
    collapse();
    const [a, b] = [...touches.current.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const rect = wrapRef.current?.getBoundingClientRect();
    const factor = dist / pinch.current.dist;
    const dx = mx - pinch.current.mx;
    const dy = my - pinch.current.my;
    pinch.current = { dist, mx, my };
    setCam(c => {
      const z = clamp(c.z * factor, MIN_Z, MAX_Z);
      const px = mx - (rect?.left ?? 0);
      const py = my - (rect?.top ?? 0);
      const wx = (px - c.x) / c.z;
      const wy = (py - c.y) / c.z;
      return { z, x: px - wx * z + dx, y: py - wy * z + dy };
    });
  };
  const endTouch = (e: React.PointerEvent) => {
    touches.current.delete(e.pointerId);
    if (touches.current.size < 2) pinch.current = null;
  };

  /* ---------- Cuentagotas ---------- */
  const ey = props.eyedropper ?? null;
  const eyRef = useRef(ey);
  eyRef.current = ey;
  const propsRef = useRef(props);
  propsRef.current = props;
  const loupeRef = useRef<HTMLDivElement>(null);
  const loupeCanvas = useRef<HTMLCanvasElement>(null);
  const loupeLabel = useRef<HTMLSpanElement>(null);
  const sampleCache = useRef(new Map<string, HTMLCanvasElement | null | 'loading'>());
  const lastSample = useRef<string | null>(null);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const warned = useRef(false);

  /** Copia de la imagen en un canvas (para leer píxeles). null si el navegador no deja leerla (por ejemplo, un servidor sin CORS). */
  const loadSample = (r: Reference) => {
    sampleCache.current.set(r.id, 'loading');
    const img = new Image();
    if (!r.image.startsWith('data:') && !r.image.startsWith('blob:')) img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const k = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * k));
        c.height = Math.max(1, Math.round(img.naturalHeight * k));
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('sin contexto');
        ctx.drawImage(img, 0, 0, c.width, c.height);
        ctx.getImageData(0, 0, 1, 1);
        sampleCache.current.set(r.id, c);
      } catch {
        sampleCache.current.set(r.id, null);
      }
      // Se refresca la lupa en el último punto, sin esperar a que se mueva el cursor.
      if (eyRef.current && lastPos.current) sampleAt(lastPos.current.x, lastPos.current.y);
    };
    img.onerror = () => sampleCache.current.set(r.id, null);
    img.src = r.image;
  };

  const hideLoupe = () => {
    if (loupeRef.current) loupeRef.current.style.display = 'none';
    lastSample.current = null;
    lastPos.current = null;
  };

  /** Lee el píxel bajo el cursor, mueve la lupa y devuelve el color (o null si no hay imagen/color ahí). */
  const sampleAt = (clientX: number, clientY: number): string | null => {
    const wrap = wrapRef.current;
    const box = loupeRef.current;
    if (!wrap || !box) return null;
    lastPos.current = { x: clientX, y: clientY };
    const el = (document.elementFromPoint(clientX, clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-ref]');
    const place = (hex: string | null, text: string) => {
      const wr = wrap.getBoundingClientRect();
      const x = clientX - wr.left;
      const y = clientY - wr.top;
      box.style.display = 'flex';
      box.style.transform = `translate(${Math.min(Math.max(x + 22, 4), wr.width - LOUPE_PX - 8)}px, ${Math.min(Math.max(y - LOUPE_PX - 22, 4), wr.height - LOUPE_PX - 40)}px)`;
      if (loupeLabel.current) {
        loupeLabel.current.textContent = text;
        loupeLabel.current.style.background = hex ?? 'var(--cc-surface)';
        loupeLabel.current.style.color = hex ? textOnHex(hex) : 'var(--cc-text)';
      }
    };
    if (!el) {
      lastSample.current = null;
      place(null, 'Tocá una imagen');
      loupeCanvas.current?.getContext('2d')?.clearRect(0, 0, LOUPE_PX, LOUPE_PX);
      return null;
    }
    const r = refs.find(x => x.id === el.dataset.ref);
    if (!r) return null;
    const src = sampleCache.current.get(r.id);
    if (src === undefined) {
      loadSample(r);
      place(null, 'Leyendo…');
      return null;
    }
    if (src === 'loading') {
      place(null, 'Leyendo…');
      return null;
    }
    if (src === null) {
      lastSample.current = null;
      place(null, 'No se puede leer');
      if (!warned.current) {
        warned.current = true;
        propsRef.current.onNotify?.('No se puede leer el color de esa imagen (el sitio de origen no lo permite). Probá con otra o subí el archivo.');
      }
      return null;
    }
    const rect = el.getBoundingClientRect();
    const s = Math.max(rect.width / src.width, rect.height / src.height);
    const ix = Math.floor((clientX - rect.left - (rect.width - src.width * s) / 2) / s);
    const iy = Math.floor((clientY - rect.top - (rect.height - src.height * s) / 2) / s);
    const half = (LOUPE_N - 1) / 2;
    const data = src.getContext('2d', { willReadFrequently: true })?.getImageData(ix - half, iy - half, LOUPE_N, LOUPE_N);
    if (!data) return null;
    const c = (half * LOUPE_N + half) * 4;
    const hex = data.data[c + 3] < 8 ? null : `#${hex2(data.data[c])}${hex2(data.data[c + 1])}${hex2(data.data[c + 2])}`.toUpperCase();
    // Lupa: los píxeles ampliados sin suavizar.
    const lc = loupeCanvas.current;
    const lctx = lc?.getContext('2d');
    if (lc && lctx) {
      const tmp = document.createElement('canvas');
      tmp.width = LOUPE_N;
      tmp.height = LOUPE_N;
      tmp.getContext('2d')?.putImageData(data, 0, 0);
      lctx.imageSmoothingEnabled = false;
      lctx.clearRect(0, 0, LOUPE_PX, LOUPE_PX);
      lctx.drawImage(tmp, 0, 0, LOUPE_PX, LOUPE_PX);
    }
    lastSample.current = hex;
    place(hex, hex ?? 'Sin color');
    return hex;
  };

  const pendingTouch = useRef(false);
  const eyedropperDown = (e: React.PointerEvent): boolean => {
    if (!eyRef.current) return false;
    const overImage = !!(document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('[data-ref]');
    if (!overImage) return false; // el fondo se arrastra para desplazar
    const hex = sampleAt(e.clientX, e.clientY);
    if (e.pointerType === 'touch') {
      pendingTouch.current = true; // en táctil se elige al soltar, para poder apuntar con la lupa
    } else if (hex) {
      propsRef.current.onEyedropperDone?.(hex);
    }
    return true;
  };
  const eyedropperUp = (e: React.PointerEvent) => {
    if (!eyRef.current || e.pointerType !== 'touch' || !pendingTouch.current) return;
    pendingTouch.current = false;
    const hex = lastSample.current;
    if (hex && touches.current.size < 2) propsRef.current.onEyedropperDone?.(hex);
  };

  const onBackgroundDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    begin({ kind: 'pan', sx: e.clientX, sy: e.clientY, cam: camRef.current, moved: false });
  };
  const onImageDown = (e: React.PointerEvent, r: Reference) => {
    if (e.button !== 0 || !r.board) return;
    if (spaceDown.current) return; // con Espacio se desplaza el lienzo: lo resuelve el fondo
    trackTouch(e);
    if (touches.current.size >= 2) return;
    e.stopPropagation();
    e.preventDefault();
    if (e.shiftKey || e.ctrlKey || e.metaKey || multi) {
      // Si había una sola elegida, entra en la selección múltiple.
      setPicked(cur => {
        const base = cur.length ? cur : selected ? [selected] : [];
        return base.includes(r.id) ? base.filter(id => id !== r.id) : [...base, r.id];
      });
      setSelected(null);
      return;
    }
    setPicked([r.id]);
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

  /* ---------- Ayuda del lienzo: una sola vez como aviso; después vive en «? Ayuda» ---------- */
  useEffect(() => {
    if (!refs.length) return;
    try {
      if (localStorage.getItem(CANVAS_HELP_KEY) === '1') return;
      localStorage.setItem(CANVAS_HELP_KEY, '1');
    } catch {
      return;
    }
    props.onNotify?.(mobile ? 'Un dedo mueve; dos dedos hacen zoom. Tocá una imagen y arrastrá las esquinas para cambiar el tamaño.' : 'Rueda para moverte, Ctrl + rueda para zoom. Arrastrá las esquinas para cambiar el tamaño. Esto queda en «? Ayuda».');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refs.length > 0]);

  /* ---------- Teclado ---------- */
  const primary = (() => {
    if (busy) return { label: 'Analizando…', blocked: 'El análisis está en curso.', blockedLabel: 'Analizando…', onClick: () => {}, onBlockedClick: props.onBlocked };
    if (analyzed) {
      const n = suggestions(project).length;
      return { label: n ? `Revisar ${n} ${n === 1 ? 'sugerencia' : 'sugerencias'} →` : 'Seguir a Revisar →', kbd: '⏎', onClick: props.onNext };
    }
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
    delete: () => (!ey && selected ? (props.onDeleteRef(selected), setSelected(null)) : false),
    backspace: () => (!ey && selected ? (props.onDeleteRef(selected), setSelected(null)) : false),
    '+': () => zoomAt(1.25),
    '=': () => zoomAt(1.25),
    '-': () => zoomAt(0.8),
    '0': () => fit(),
    escape: () => (ey ? props.onEyedropperDone?.(null) : grouping ? setGrouping(false) : busy ? props.onCancelAnalysis() : picked.length > 1 ? setPicked([]) : selected ? setSelected(null) : false),
    g: () => (!ey && picked.length > 1 ? openGrouping() : false),
    enter: () => (ey ? false : primary.blocked ? primary.onBlockedClick?.(primary.blocked) : primary.onClick()),
  });

  /* ---------- Dibujo ---------- */
  const dots = 24 * cam.z;
  const sorted = [...refs].filter(r => r.board || (live && live.id === r.id)).sort((a, b) => (front[a.id] ?? 0) - (front[b.id] ?? 0));

  return (
    <div className="stage-enter relative h-full w-full overflow-hidden">
      <div
        ref={wrapRef}
        data-canvas
        role="application"
        aria-label="Lienzo de referencias"
        onPointerDown={e => {
          trackTouch(e);
          if (touches.current.size >= 2) return;
          if (eyedropperDown(e)) return;
          onBackgroundDown(e);
        }}
        onPointerMove={e => {
          moveTouch(e);
          if (ey && (e.pointerType !== 'touch' || pendingTouch.current)) sampleAt(e.clientX, e.clientY);
        }}
        onPointerLeave={hideLoupe}
        onPointerUp={e => {
          eyedropperUp(e);
          endTouch(e);
          if (ey && e.pointerType === 'touch') hideLoupe();
        }}
        onPointerCancel={e => {
          endTouch(e);
          hideLoupe();
        }}
        onDragOver={e => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className="absolute inset-x-0 bottom-0 touch-none select-none"
        style={{
          top: collapsed ? stripC : stripH,
          cursor: ey ? 'crosshair' : spacePan || drag.current?.kind === 'pan' ? 'grabbing' : 'grab',
          backgroundImage: 'radial-gradient(circle, color-mix(in srgb, var(--cc-text) 9%, transparent) 1px, transparent 1.2px)',
          backgroundSize: `${dots}px ${dots}px`,
          backgroundPosition: `${cam.x}px ${cam.y}px`,
          outline: dragOver ? '2px dashed color-mix(in srgb, var(--cc-text) 50%, transparent)' : undefined,
          outlineOffset: -8,
        }}
      >
        <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})` }}>
          {sorted.map(r => {
            const b = boxOf(r);
            if (!b) return null;
            const isSel = selected === r.id;
            const pickIdx = picked.length > 1 ? picked.indexOf(r.id) : -1;
            const own = ownByRef.get(r.id);
            const bad = r.broken || unreadable.has(r.id);
            const hs = (mobile ? 24 : 12) / cam.z;
            return (
              <div
                key={r.id}
                data-ref={r.id}
                onPointerDown={e => (ey ? undefined : onImageDown(e, r))}
                className="absolute bg-raised"
                style={{
                  left: b.x,
                  top: b.y,
                  width: b.w,
                  height: b.h,
                  zIndex: front[r.id] ?? 0,
                  cursor: ey ? 'crosshair' : 'move',
                  outline: bad ? `${3 / cam.z}px solid var(--cc-error)` : pickIdx >= 0 ? `${3 / cam.z}px solid var(--cc-primary)` : isSel ? `${2 / cam.z}px solid var(--cc-text)` : undefined,
                  outlineOffset: pickIdx >= 0 ? 2 / cam.z : undefined,
                }}
              >
                <img
                  src={r.image}
                  alt={r.name}
                  draggable={false}
                  onError={() => setUnreadable(s => new Set(s).add(r.id))}
                  className="pointer-events-none size-full select-none object-cover"
                />
                {pickIdx >= 0 && (
                  <span className="pointer-events-none absolute flex items-center justify-center rounded-full font-bold" style={{ right: 6 / cam.z, top: 6 / cam.z, width: 24 / cam.z, height: 24 / cam.z, fontSize: 13 / cam.z, background: 'var(--cc-primary)', color: 'var(--cc-on-primary)' }}>
                    {pickIdx + 1}
                  </span>
                )}
                {own && (
                  <span className="pointer-events-none absolute flex max-w-full flex-col items-start" style={{ left: 6 / cam.z, bottom: 6 / cam.z, gap: 3 / cam.z }}>
                    {own.slice(0, 2).map(o => (
                      <span key={o.name} className={`${o.layer ? `layer-${o.layer}` : ''} max-w-full truncate rounded-[3px] font-semibold leading-tight`} style={{ fontSize: Math.max(10, 12 / cam.z), padding: `${2 / cam.z}px ${6 / cam.z}px`, background: 'rgba(10,10,10,.8)', color: 'var(--cc-text)', boxShadow: `inset ${3 / cam.z}px 0 0 var(--layer-color, var(--cc-text))` }}>
                        {o.name}
                      </span>
                    ))}
                  </span>
                )}
                {bad && (
                  <span className="pointer-events-none absolute left-0 top-0 bg-[var(--cc-error)] px-[6px] py-[2px] font-mono leading-none text-void" style={{ fontSize: Math.max(9, 11 / cam.z) }}>
                    NO SE PUDO LEER
                  </span>
                )}
                {isSel &&
                  !ey &&
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
            <span className="type-name text-[2.5rem] text-ink-2">Soltá imágenes acá</span>
            <span className="max-w-[420px] text-[0.875rem] text-ink-2">Arrastrá archivos desde el escritorio, pegá una URL o una imagen con Ctrl+V, o usá + Imagen. Para analizar hacen falta al menos {MIN_REFS}.</span>
          </div>
        )}

        {/* Lupa del cuentagotas: se mueve con el cursor y muestra los píxeles ampliados */}
        <div ref={loupeRef} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 z-40 hidden flex-col items-center gap-1" style={{ width: LOUPE_PX }}>
          <div className="relative overflow-hidden rounded-full" style={{ width: LOUPE_PX, height: LOUPE_PX, boxShadow: '0 0 0 2px var(--cc-text), 0 4px 18px rgba(0,0,0,.6)', background: '#222' }}>
            <canvas ref={loupeCanvas} width={LOUPE_PX} height={LOUPE_PX} className="size-full" />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: LOUPE_PX / LOUPE_N, height: LOUPE_PX / LOUPE_N, boxShadow: '0 0 0 1.5px #0A0A0A, inset 0 0 0 1.5px #F2EFE8' }} />
          </div>
          <span ref={loupeLabel} className="rounded-[3px] px-2 py-[2px] font-mono text-[0.875rem] font-bold" style={{ boxShadow: '0 0 0 1px rgba(255,255,255,.4)' }} />
        </div>
      </div>

      {/* Aviso del modo cuentagotas */}
      {ey && (
        <div role="status" className="absolute left-4 top-4 z-30 flex w-[min(380px,calc(100%-32px))] flex-col gap-2 rounded-[4px] p-3 lg:left-10 lg:top-6" style={{ background: 'var(--cc-surface)' }} onPointerDown={e => e.stopPropagation()}>
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="size-6 shrink-0 rounded-[3px]" style={{ background: ey.current, boxShadow: '0 0 0 1px rgba(255,255,255,.35)' }} />
            <span className="text-[0.875rem] font-semibold leading-tight">Cuentagotas · color {ey.label}</span>
          </div>
          <p className="m-0 text-[0.875rem] leading-snug" style={{ color: 'var(--cc-text-muted)' }}>
            {refs.length
              ? `${mobile ? 'Tocá' : 'Hacé clic en'} cualquier punto de una imagen para quedarte con ese color. Rueda para moverte, Ctrl + rueda para acercar y elegir con precisión.`
              : 'Todavía no hay imágenes en el lienzo. Sumá alguna o cancelá.'}
          </p>
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[0.75rem] tracking-[0.06em] text-ink-2">ESC PARA CANCELAR</span>
            <button type="button" onClick={() => props.onEyedropperDone?.(null)} className="rounded-[3px] bg-ink/10 px-3 py-1 text-[0.875rem] font-semibold hover:bg-white/10" style={{ minHeight: mobile ? 44 : undefined }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* El análisis: progreso y, al terminar, lo que encontró (una vez por análisis) */}
      {!ey && (
        <AnalysisPanel
          project={project}
          analysis={props.analysis}
          onCancel={props.onCancelAnalysis}
          onRetry={props.onAnalyze}
          onReview={props.onNext}
          top={(collapsed ? stripC : stripH) + 8}
        />
      )}

      {/* Varias elegidas: crear un patrón con ellas */}
      {!ey && picked.length > 1 && !grouping && (
        <div className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-full py-2 pl-5 pr-2 shadow-float" style={{ background: 'var(--cc-surface)' }} onPointerDown={e => e.stopPropagation()}>
          <span className="text-[0.9375rem] font-semibold">{picked.length} elegidas</span>
          <button type="button" onClick={() => setPicked([])} className="text-[0.875rem] text-ink-2 underline underline-offset-4 hover:text-ink">
            Soltar
          </button>
          <button type="button" onClick={openGrouping} className="inline-flex h-10 items-center gap-2 rounded-full bg-bone px-5 text-[0.875rem] font-bold text-void hover:bg-[var(--cc-primary)] hover:text-[var(--cc-on-primary)]">
            Crear patrón {!mobile && <kbd className="font-medium opacity-75">G</kbd>}
          </button>
        </div>
      )}
      {!ey && grouping && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onPointerDown={e => e.target === e.currentTarget && setGrouping(false)}>
          <form
            role="dialog"
            aria-modal="true"
            aria-label="Crear patrón"
            onKeyDown={e => e.key === 'Escape' && (e.stopPropagation(), setGrouping(false))}
            className="flex w-[min(520px,100%)] flex-col gap-5 rounded-[6px] p-6 shadow-float"
            style={{ background: 'var(--cc-surface)' }}
            onSubmit={e => {
              e.preventDefault();
              submitGroup();
            }}
          >
            <div className="flex flex-col gap-1">
              <span className="type-label text-[0.75rem] text-ink-2">Crear patrón · {picked.length} referencias</span>
              <span className="text-[1.375rem] font-semibold">¿Qué tienen en común?</span>
            </div>
            <div className="flex gap-2 overflow-x-auto">
              {picked.map(id => {
                const r = refs.find(x => x.id === id);
                return r ? <img key={id} src={r.image} alt={r.name} className="size-14 shrink-0 rounded-[3px] object-cover" /> : null;
              })}
            </div>
            <label className="flex flex-col gap-2">
              <span className="type-label text-[0.75rem] text-ink-2">Nombre</span>
              <input autoFocus value={gName} onChange={e => setGName(e.target.value)} onKeyDown={e => e.key === 'Escape' && setGrouping(false)} placeholder="Ej: Sellos circulares" className="field-input" style={{ height: 48, fontSize: '1.125rem' }} />
            </label>
            <label className="flex flex-col gap-2">
              <span className="type-label text-[0.75rem] text-ink-2">Qué se repite · opcional</span>
              <textarea value={gNote} onChange={e => setGNote(e.target.value)} rows={2} placeholder="Ej: un círculo con texto alrededor, siempre en una esquina" className="field-input" />
            </label>
            <div className="flex flex-col gap-2" role="radiogroup" aria-label="Capa">
              <span className="type-label text-[0.75rem] text-ink-2">¿En qué capa va?</span>
              <div className="grid grid-cols-3 gap-2">
                {([1, 2, 3] as Layer[]).map(l => (
                  <button
                    key={l}
                    type="button"
                    role="radio"
                    aria-checked={gLayer === l}
                    onClick={() => setGLayer(l)}
                    title={LAYER_QUESTION[l]}
                    className={`layer-${l} flex flex-col items-start gap-1 rounded-[4px] px-3 py-2 text-left`}
                    style={{ outline: gLayer === l ? '2px solid var(--cc-text)' : '1px solid var(--cc-line)', outlineOffset: -1 }}
                  >
                    <span className="layer-headline" style={{ fontSize: 20, textDecoration: 'none' }}>
                      {SHEET_NAME[l]}
                    </span>
                    <span className="text-[0.75rem] leading-snug text-ink-2">{LAYER_QUESTION[l]}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-end gap-4">
              <button type="button" onClick={() => setGrouping(false)} className="text-[0.875rem] text-ink-2 underline underline-offset-4 hover:text-ink">
                Cancelar
              </button>
              <button type="submit" disabled={!gName.trim()} className="inline-flex h-11 items-center rounded-full bg-bone px-6 text-[0.9375rem] font-bold text-void disabled:cursor-not-allowed disabled:opacity-50">
                Crear patrón
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Franja fija: título de etapa y, si hay, la frase del brief (se edita en 0 · Brief) */}
      {!ey && (
        <header
          className={`absolute inset-x-0 top-0 z-20 flex gap-3 px-4 pb-3 lg:px-10 ${mobile ? 'flex-col justify-end' : 'items-end justify-between gap-6'}`}
          style={{ height: collapsed ? stripC : stripH, transition: 'height 200ms ease-out' }}
          onPointerDown={e => e.stopPropagation()}
        >
          <h1 data-headline className="type-stage m-0 text-ink" style={collapsed ? { fontSize: 32, lineHeight: 1 } : mobile ? { fontSize: 40 } : { fontSize: 'clamp(40px, 5vw, 72px)', lineHeight: 0.95 }}>
            Tus referencias
          </h1>
          {!collapsed && (project.intent?.trim() || project.name.trim()) && (
            <p className={`m-0 pb-2 text-[1rem] leading-snug text-ink-2 ${mobile ? '' : 'max-w-[min(440px,45%)] text-right'}`}>
              {project.intent?.trim() || project.name.trim()}
            </p>
          )}
        </header>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={e => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) props.onAddFiles(files);
        }}
      />
      <BottomBar
        actions={
          <>
            {analyzed && !busy && <BarButton onClick={props.onRequestReanalyze}>Volver a analizar</BarButton>}
            {busy && <BarButton onClick={props.onCancelAnalysis}>Cancelar análisis</BarButton>}
            {(analyzed || busy) && <BarSep />}
            <BarButton onClick={() => (mobile ? fileInput.current?.click() : props.onOpenUpload())}>+ Imagen</BarButton>
            {refs.length > 1 && (
              <BarButton
                active={multi}
                onClick={() => {
                  setMulti(m => !m);
                  if (multi) setPicked([]);
                }}
                title="Elegí varias imágenes para crear un patrón (también con ⇧ + clic)"
              >
                {multi ? 'Listo' : 'Elegir varias'}
              </BarButton>
            )}
            <BarSep />
            <BarButton onClick={() => zoomAt(0.8)} ariaLabel="Alejar" title="Alejar (−)">
              −
            </BarButton>
            <BarButton onClick={() => zoomAt(1 / camRef.current.z)} title="Volver al 100%">
              <span className="min-w-[40px] text-center font-mono text-[0.875rem]">{Math.round(cam.z * 100)}%</span>
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
