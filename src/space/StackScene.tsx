import React, { useEffect, useRef, useState } from 'react';
import { Fragment, Project, StackView } from '../types';
import { evidenceLabel, isLayer, layerInfo, layerTag, suggestedLayer } from '../utils/layers';
import { Crop } from './Crop';
import { PERSPECTIVE, PLANE_H, PLANE_W, SIDE_ROTATION, STOPS, Stop, cameraAt, stopIndex, stopPos } from './geometry';
import { SceneItem, patternCover, stopItems } from './items';
import { FrontPage } from './FrontPage';

/**
 * De frente, las láminas se alinean una detrás de otra (como en 2d): la de adelante es la página
 * y las de atrás asoman como filetes corridos. Es la misma pila, girada.
 */
const FRONT_POS: Record<string, { x: number; y: number; z: number }> = {
  '1': { x: 0, y: 0, z: 90 },
  '2': { x: 20, y: 16, z: 45 },
  '3': { x: 40, y: 32, z: 0 },
  corpus: { x: 0, y: 0, z: -500 },
};
const FRONT_CAM = { x: 20, y: 16, z: 90 };

interface StackSceneProps {
  project: Project;
  /** Cámara continua (0 = núcleo … 3 = corpus). */
  t: number;
  /** true mientras se mueve con la rueda: la cámara sigue sin la transición larga. */
  scrubbing: boolean;
  selectedIds: string[];
  /** additive: Shift + clic suma a la selección. */
  onSelect: (id: string, stop: Stop, additive: boolean) => void;
  onFocusStop: (stop: Stop) => void;
  onWheelDepth: (deltaY: number) => void;
  /** Referencias que se iluminan en el corpus (trazabilidad). null = ninguna en particular. */
  litRefs?: Set<string> | null;
  /** Vista general (estado vacío): la pila entera, chica, a la derecha; todas las láminas visibles. */
  overview?: boolean;
  /** Costado (ordenar) o frente (la Síntesis como página). */
  view?: StackView;
}

const CORPUS_W = 1200;
const CORPUS_H = 760;
/** Lo que espera lámina se apila sobre el corpus en filas de este alto. */
const PENDING_ROW = 112;
const PENDING_PER_ROW = 4;

/** La pila de tres láminas más el corpus, en el espacio. */
export function StackScene(props: StackSceneProps) {
  const { project, t } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0.7);
  const [fitFront, setFitFront] = useState(1);

  // Escala de la escena según el tamaño disponible (no cambia la jerarquía: la da la profundidad).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setFit(Math.max(0.42, Math.min(1.05, Math.min(width / 1500, height / 940))));
      setFitFront(Math.max(0.5, Math.min(1.4, Math.min((width - 240) / 960, height / 640))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // La rueda mueve la cámara en Z. Se escucha sin passive para que la página no haga scroll.
  const wheelRef = useRef(props.onWheelDepth);
  wheelRef.current = props.onWheelDepth;
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      e.preventDefault();
      wheelRef.current(e.deltaY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const front = props.view === 'front';
  const cam = front ? FRONT_CAM : props.overview ? cameraAt(1.5) : cameraAt(t);
  const active = STOPS[Math.round(t)];
  const scale = front ? fitFront : props.overview ? fit * 0.42 : fit;
  const rx = front ? 0 : SIDE_ROTATION.x;
  const ry = front ? 0 : SIDE_ROTATION.y;
  const transform = `scale(${scale}) rotateX(${rx}deg) rotateY(${ry}deg) translate3d(${-cam.x}px, ${-cam.y}px, ${-cam.z}px)`;
  const where: Stop | 'overview' | 'front' = front ? 'front' : props.overview ? 'overview' : active;

  return (
    <div ref={wrapRef} className="relative h-full w-full select-none overflow-hidden" style={{ perspective: `${PERSPECTIVE}px`, perspectiveOrigin: '50% 45%' }}>
      <div
        className="absolute h-0 w-0"
        style={{
          left: front ? 'calc(50% - 100px)' : props.overview ? '70%' : '50%',
          top: front ? '50%' : props.overview ? '58%' : '48%',
          transformStyle: 'preserve-3d',
          transform,
          transition: props.scrubbing ? 'transform 140ms linear' : 'transform 500ms var(--ease-camera), left 500ms var(--ease-camera), top 500ms var(--ease-camera)',
        }}
      >
        {/* Del fondo hacia adelante: el corpus primero, el núcleo último (queda arriba). */}
        <CorpusPlane {...props} active={where} />
        {([3, 2, 1] as const).map(l => (
          <LayerPlane key={l} {...props} layer={l} active={where} />
        ))}
        {/* La página: aparece sobre la lámina de adelante cuando la pila termina de girar. */}
        <div
          aria-hidden={!front}
          style={{
            position: 'absolute',
            left: -PLANE_W / 2,
            top: -PLANE_H / 2,
            width: PLANE_W,
            height: PLANE_H,
            transform: `translate3d(${FRONT_POS['1'].x}px, ${FRONT_POS['1'].y}px, ${FRONT_POS['1'].z + 1}px)`,
            opacity: front ? 1 : 0,
            transition: front ? 'opacity 260ms var(--ease-emergent) 240ms' : 'opacity 160ms var(--ease-emergent)',
            pointerEvents: front ? 'auto' : 'none',
          }}
        >
          <FrontPage project={project} />
        </div>
      </div>
    </div>
  );
}

/** Opacidad de un plano según dónde está la cámara: el activo lleno, lo de atrás tenue, lo de adelante casi transparente. */
function planeOpacity(stop: Stop, active: Stop | 'overview' | 'front') {
  if (active === 'front') return stop === 'corpus' ? 0 : 1;
  if (active === 'overview') return stop === 'corpus' ? 0.5 : 1;
  const d = stopIndex(stop) - stopIndex(active);
  if (d === 0) return 1;
  if (d > 0) return d === 1 ? 0.55 : 0.35;
  return 0.18;
}

function planeStyle(stop: Stop, w: number, h: number, active: Stop | 'overview' | 'front'): React.CSSProperties {
  const p = active === 'front' ? FRONT_POS[String(stop)] : stopPos(stop);
  return {
    position: 'absolute',
    left: -w / 2,
    top: -h / 2,
    width: w,
    height: h,
    transform: `translate3d(${p.x}px, ${p.y}px, ${p.z}px)`,
    opacity: planeOpacity(stop, active),
    transition: 'opacity 300ms var(--ease-emergent), transform 500ms var(--ease-camera)',
    pointerEvents: stop === active ? 'auto' : 'none',
  };
}

/* ---------- Láminas ---------- */

function LayerPlane(props: StackSceneProps & { layer: 1 | 2 | 3; active: Stop | 'overview' | 'front' }) {
  const { project, layer, active } = props;
  const front = active === 'front';
  const info = layerInfo(layer);
  const items = stopItems(project, layer);
  return (
    <section aria-label={`Lámina ${layerTag(layer)}`} className={info.className} style={planeStyle(layer, PLANE_W, PLANE_H, active)}>
      <button
        type="button"
        tabIndex={-1}
        className="layer-tag pointer-events-auto absolute left-0 top-0"
        style={{ opacity: front ? 0 : 1, transition: 'opacity 200ms' }}
        onClick={() => props.onFocusStop(layer)}
      >
        {layerTag(layer)}
      </button>
      <div className="layer-rule absolute left-0 right-0 top-[26px]" style={{ opacity: front ? 0 : 1, transition: 'opacity 200ms' }} />
      {/* Contorno del plano: lo vuelve legible como lámina aunque esté vacío. De frente, es el filete que asoma detrás de la página. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 border-x border-b"
        style={
          front
            ? { top: 0, border: `2px solid ${layer === 3 ? 'var(--color-accent)' : 'rgba(242,239,232,.5)'}`, transition: 'top 300ms' }
            : { top: 26, borderColor: 'color-mix(in oklab, var(--layer-color) 22%, transparent)', transition: 'top 300ms' }
        }
      />
      <div
        className="absolute inset-x-0 bottom-0 top-[52px] flex flex-wrap content-start items-start gap-6 overflow-hidden px-1"
        style={{ opacity: front ? 0 : 1, transition: 'opacity 200ms var(--ease-emergent)' }}
      >
        {items.length === 0 && <span className="type-label text-[13px] text-ink-3">VACÍA · {info.role.toUpperCase()}</span>}
        {items.map(it => (
          <Item key={it.id} item={it} {...props} stop={layer} />
        ))}
      </div>
    </section>
  );
}

/* ---------- Corpus ---------- */

function CorpusPlane(props: StackSceneProps & { active: Stop | 'overview' | 'front' }) {
  const { project, active } = props;
  const items = stopItems(project, 'corpus');
  const pending = items.filter(i => i.kind !== 'ref');
  const refs = items.filter((i): i is Extract<SceneItem, { kind: 'ref' }> => i.kind === 'ref');
  const pendingRows = Math.min(3, Math.ceil(pending.length / PENDING_PER_ROW));
  const gridTop = pending.length ? 48 + pendingRows * PENDING_ROW : 40;
  const cols = Math.max(4, Math.ceil(Math.sqrt(refs.length * (CORPUS_W / (CORPUS_H - gridTop)))));
  return (
    <section
      aria-label="Corpus"
      style={{
        ...planeStyle('corpus', CORPUS_W, CORPUS_H, active),
        // Trazabilidad: con referencias iluminadas, el corpus se lee aunque la cámara esté adelante.
        ...(props.litRefs && active !== 'corpus' ? { opacity: 0.9 } : {}),
      }}
    >
      <button type="button" tabIndex={-1} className="type-label pointer-events-auto absolute left-0 top-0 border-2 border-line-strong px-2 py-[3px] text-[12px] text-ink-2" onClick={() => props.onFocusStop('corpus')}>
        CORPUS · {refs.length} REFS{pending.length ? ` · ${pending.length} SIN LÁMINA` : ''}
      </button>
      {pending.length > 0 && (
        <div className="absolute inset-x-0 top-[40px] grid items-start gap-x-6 gap-y-4 overflow-hidden" style={{ gridTemplateColumns: `repeat(${PENDING_PER_ROW}, minmax(0, 1fr))`, height: pendingRows * PENDING_ROW }}>
          {pending.map(it => (
            <Item key={it.id} item={it} {...props} stop="corpus" />
          ))}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 grid content-start gap-2" style={{ top: gridTop, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {refs.map(it => (
          <Item key={it.id} item={it} {...props} stop="corpus" />
        ))}
      </div>
    </section>
  );
}

/* ---------- Elementos ---------- */

function Item(props: StackSceneProps & { item: SceneItem; stop: Stop }) {
  const { item, project, selectedIds, stop } = props;
  const selected = selectedIds.includes(item.id);
  const select = (e: React.MouseEvent) => props.onSelect(item.id, stop, e.shiftKey);
  const common = {
    'data-scene-item': item.id,
    'aria-pressed': selected,
    onClick: select,
    tabIndex: -1,
  } as const;
  // Seleccionado: contorno del color de su lámina. En el corpus, hueso.
  const ring: React.CSSProperties = selected ? { outline: '3px solid var(--layer-color, var(--color-bone))', outlineOffset: 4 } : {};

  if (item.kind === 'ref') {
    const lit = props.litRefs ? props.litRefs.has(item.id) : null;
    return (
      <button type="button" {...common} className="relative block aspect-square w-full" style={ring}>
        <Crop
          image={item.ref.image}
          fit="cover"
          alt={item.ref.name}
          className="absolute inset-0"
          style={{
            filter: 'grayscale(1)',
            opacity: lit === null ? (selected ? 0.85 : 0.35) : lit ? 0.9 : 0.12,
            transition: 'opacity 300ms var(--ease-emergent)',
          }}
        />
      </button>
    );
  }

  if (item.kind === 'fragment') {
    const f = item.fragment;
    const ref = project.references.find(r => r.id === f.refId);
    return (
      <button type="button" {...common} className="flex w-[150px] flex-col items-start gap-2 text-left" style={ring}>
        {ref && <FragmentCrop f={f} image={ref.image} ratio={ref.aspectRatio} className="max-h-[130px] w-full" />}
        <span className="type-label text-[12px] leading-tight">{f.label}</span>
      </button>
    );
  }

  const pat = item.pattern;
  const layer = isLayer(pat.layer) ? pat.layer : null;
  const dot = !pat.audited ? <span title="Sin auditar" aria-label="Sin auditar" className="inline-block size-[10px] shrink-0 rounded-full bg-[#8d8d8d]" /> : null;
  const data = evidenceLabel(pat, project);

  // Núcleo: bloque lleno (jerarquía por masa de color).
  if (layer === 1) {
    return (
      <button type="button" {...common} className="flex w-[430px] items-stretch gap-4 bg-core p-3 text-left text-void" style={ring}>
        <PatternCover project={project} item={item} className="h-[132px] w-[140px] shrink-0" />
        <span className="flex min-w-0 flex-col justify-between gap-2">
          <span className="type-name line-clamp-3 text-[44px] leading-[0.84]">{pat.name}</span>
          <span className="flex items-center gap-2">
            {dot}
            <span className="type-label text-[11px]">{pat.isGroup ? `GRUPO · ${item.fragments.length}` : data}</span>
          </span>
        </span>
      </button>
    );
  }

  // Soporte, acento y sin lámina: línea y rótulo.
  const sug = layer ? null : suggestedLayer(pat, project);
  return (
    <button type="button" {...common} className={`flex items-center gap-3 text-left ${stop === 'corpus' ? 'w-full' : 'w-[260px]'}`} style={ring}>
      <PatternCover project={project} item={item} className={`shrink-0 ${stop === 'corpus' ? 'size-[80px]' : 'size-[92px]'}`} />
      <span className="flex min-w-0 flex-col gap-1">
        <span className={`type-name line-clamp-2 leading-[0.92] ${stop === 'corpus' ? 'text-[20px]' : 'text-[24px]'}`}>{pat.name}</span>
        <span className="flex items-center gap-2">
          {dot}
          <span className="type-data text-[12px] text-ink-2">{pat.isGroup ? `grupo · ${item.fragments.length}` : data}</span>
        </span>
        {sug && <span className="type-label text-[11px] text-ink-2">PROPUESTA · {layerTag(sug)}</span>}
      </span>
    </button>
  );
}

/** Imagen de un patrón o grupo: sus fragmentos lado a lado (hasta 3) o, si no tiene, su primera evidencia. */
function PatternCover({ project, item, className }: { project: Project; item: Extract<SceneItem, { kind: 'pattern' }>; className: string }) {
  const frags = item.fragments.slice(0, 3);
  if (frags.length > 1) {
    return (
      <span className={`flex gap-[3px] ${className}`}>
        {frags.map(f => {
          const ref = project.references.find(r => r.id === f.refId);
          return ref ? <Crop key={f.id} image={ref.image} crop={f.crop} fit="cover" alt={f.label} className="h-full min-w-0 flex-1" /> : null;
        })}
      </span>
    );
  }
  const cover = patternCover(project, item);
  return cover ? <Crop image={cover.image} crop={cover.crop} fit="cover" alt={cover.alt} className={className} /> : <span className={`bg-raised ${className}`} />;
}

export function FragmentCrop({ f, image, ratio, className }: { f: Fragment; image: string; ratio?: number; className?: string }) {
  return <Crop image={image} crop={f.crop} sourceRatio={ratio} alt={f.label} className={className} />;
}
