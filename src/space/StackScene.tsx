import React, { useEffect, useRef, useState } from 'react';
import { Fragment, Project } from '../types';
import { evidenceLabel, isLayer, layerInfo, layerTag, suggestedLayer } from '../utils/layers';
import { Crop } from './Crop';
import { PERSPECTIVE, PLANE_H, PLANE_W, SIDE_ROTATION, STOPS, Stop, cameraAt, stopIndex, stopPos } from './geometry';
import { SceneItem, patternCover, stopItems } from './items';

interface StackSceneProps {
  project: Project;
  /** Cámara continua (0 = núcleo … 3 = corpus). */
  t: number;
  /** true mientras se mueve con la rueda: la cámara sigue sin la transición larga. */
  scrubbing: boolean;
  selectedId: string | null;
  onSelect: (id: string, stop: Stop) => void;
  onFocusStop: (stop: Stop) => void;
  onWheelDepth: (deltaY: number) => void;
  /** Referencias que se iluminan en el corpus (trazabilidad). null = ninguna en particular. */
  litRefs?: Set<string> | null;
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

  // Escala de la escena según el tamaño disponible (no cambia la jerarquía: la da la profundidad).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setFit(Math.max(0.42, Math.min(1.05, Math.min(width / 1500, height / 940))));
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

  const cam = cameraAt(t);
  const active = STOPS[Math.round(t)];
  const transform = `scale(${fit}) rotateX(${SIDE_ROTATION.x}deg) rotateY(${SIDE_ROTATION.y}deg) translate3d(${-cam.x}px, ${-cam.y}px, ${-cam.z}px)`;

  return (
    <div ref={wrapRef} className="relative h-full w-full select-none overflow-hidden" style={{ perspective: `${PERSPECTIVE}px`, perspectiveOrigin: '50% 45%' }}>
      <div
        className="absolute left-1/2 top-[48%] h-0 w-0"
        style={{
          transformStyle: 'preserve-3d',
          transform,
          transition: props.scrubbing ? 'transform 140ms linear' : 'transform 500ms var(--ease-camera)',
        }}
      >
        {/* Del fondo hacia adelante: el corpus primero, el núcleo último (queda arriba). */}
        <CorpusPlane {...props} active={active} />
        {([3, 2, 1] as const).map(l => (
          <LayerPlane key={l} {...props} layer={l} active={active} />
        ))}
      </div>
    </div>
  );
}

/** Opacidad de un plano según dónde está la cámara: el activo lleno, lo de atrás tenue, lo de adelante casi transparente. */
function planeOpacity(stop: Stop, active: Stop) {
  const d = stopIndex(stop) - stopIndex(active);
  if (d === 0) return 1;
  if (d > 0) return d === 1 ? 0.55 : 0.35;
  return 0.18;
}

function planeStyle(stop: Stop, w: number, h: number, active: Stop): React.CSSProperties {
  const p = stopPos(stop);
  return {
    position: 'absolute',
    left: -w / 2,
    top: -h / 2,
    width: w,
    height: h,
    transform: `translate3d(${p.x}px, ${p.y}px, ${p.z}px)`,
    opacity: planeOpacity(stop, active),
    transition: 'opacity 300ms var(--ease-emergent)',
    pointerEvents: stop === active ? 'auto' : 'none',
  };
}

/* ---------- Láminas ---------- */

function LayerPlane(props: StackSceneProps & { layer: 1 | 2 | 3; active: Stop }) {
  const { project, layer, active } = props;
  const info = layerInfo(layer);
  const items = stopItems(project, layer);
  return (
    <section aria-label={`Lámina ${layerTag(layer)}`} className={info.className} style={planeStyle(layer, PLANE_W, PLANE_H, active)}>
      <button
        type="button"
        tabIndex={-1}
        className="layer-tag pointer-events-auto absolute left-0 top-0"
        onClick={() => props.onFocusStop(layer)}
      >
        {layerTag(layer)}
      </button>
      <div className="layer-rule absolute left-0 right-0 top-[26px]" />
      {/* Contorno del plano: lo vuelve legible como lámina aunque esté vacío. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[26px] border-x border-b" style={{ borderColor: 'color-mix(in oklab, var(--layer-color) 22%, transparent)' }} />
      <div className="absolute inset-x-0 bottom-0 top-[52px] flex flex-wrap content-start items-start gap-6 overflow-hidden px-1">
        {items.length === 0 && <span className="type-label text-[13px] text-ink-3">VACÍA · {info.role.toUpperCase()}</span>}
        {items.map(it => (
          <Item key={it.id} item={it} {...props} stop={layer} />
        ))}
      </div>
    </section>
  );
}

/* ---------- Corpus ---------- */

function CorpusPlane(props: StackSceneProps & { active: Stop }) {
  const { project, active } = props;
  const items = stopItems(project, 'corpus');
  const pending = items.filter(i => i.kind !== 'ref');
  const refs = items.filter((i): i is Extract<SceneItem, { kind: 'ref' }> => i.kind === 'ref');
  const pendingRows = Math.min(3, Math.ceil(pending.length / PENDING_PER_ROW));
  const gridTop = pending.length ? 48 + pendingRows * PENDING_ROW : 40;
  const cols = Math.max(4, Math.ceil(Math.sqrt(refs.length * (CORPUS_W / (CORPUS_H - gridTop)))));
  return (
    <section aria-label="Corpus" style={planeStyle('corpus', CORPUS_W, CORPUS_H, active)}>
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
  const { item, project, selectedId, stop } = props;
  const selected = selectedId === item.id;
  const select = () => props.onSelect(item.id, stop);
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
  const cover = patternCover(project, item);
  const layer = isLayer(pat.layer) ? pat.layer : null;
  const dot = !pat.audited ? <span title="Sin auditar" aria-label="Sin auditar" className="inline-block size-[10px] shrink-0 rounded-full bg-[#8d8d8d]" /> : null;
  const data = evidenceLabel(pat, project);

  // Núcleo: bloque lleno (jerarquía por masa de color).
  if (layer === 1) {
    return (
      <button type="button" {...common} className="flex w-[430px] items-stretch gap-4 bg-core p-3 text-left text-void" style={ring}>
        {cover && <Crop image={cover.image} crop={cover.crop} fit="cover" alt={cover.alt} className="h-[132px] w-[140px] shrink-0" />}
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
      {cover && <Crop image={cover.image} crop={cover.crop} fit="cover" alt={cover.alt} className={`shrink-0 ${stop === 'corpus' ? 'size-[80px]' : 'size-[92px]'}`} />}
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

export function FragmentCrop({ f, image, ratio, className }: { f: Fragment; image: string; ratio?: number; className?: string }) {
  return <Crop image={image} crop={f.crop} sourceRatio={ratio} alt={f.label} className={className} />;
}
