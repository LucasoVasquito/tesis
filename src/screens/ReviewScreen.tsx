import React, { useEffect, useMemo, useState } from 'react';
import { Layer, Pattern, Project } from '../types';
import { useShortcuts } from '../hooks/useAuditShortcuts';
import { evidenceCount } from '../utils/layers';
import { ActionResult, SHEET_NAME, confirm, evidenceText, outPieces, place, proposedLayer, recover, suggestions, takeOut } from '../pieces/model';
import { reviewProgress, summary } from '../utils/steps';
import { BottomBar } from '../components/shell/BottomBar';
import { Crop } from '../space/Crop';
import { PieceThumb } from './common';
import { MutateOptions } from './types';

type Apply = (fn: (p: Project) => ActionResult, notice?: string | false) => ActionResult;

interface Props {
  project: Project;
  enabled: boolean;
  apply: Apply;
  mutate: (fn: (p: Project) => Project, o?: MutateOptions) => void;
  onNext: () => void;
}

const LAYERS: Layer[] = [1, 2, 3];
const KEY_OF: Record<Layer, string> = { 1: '1', 2: '2', 3: '3' };
const layerColor = (l: Layer) => `var(--capa-${l})`;

/** Mini pila 3D isométrica: las tres capas. La de destino se ilumina y recibe la miniatura. */
function MiniStack({ piece, project, lit, strong }: { piece: Pattern; project: Project; lit: Layer; strong: boolean }) {
  const ref = project.references.find(r => r.id === (piece.cover?.refId ?? piece.evidence[0]));
  const crop = piece.cover && piece.cover.refId === ref?.id ? piece.cover.crop : undefined;
  return (
    <div aria-hidden="true" className="relative mx-auto h-[170px] w-[260px]" style={{ perspective: 900 }}>
      <div className="absolute left-1/2 top-[20px] h-[130px] w-[200px]" style={{ transformStyle: 'preserve-3d', transform: 'translateX(-50%) rotateX(58deg) rotateZ(-36deg)' }}>
        {[3, 2, 1].map(l => {
          const layer = l as Layer;
          const on = layer === lit;
          return (
            <div
              key={l}
              className="absolute inset-0 overflow-hidden"
              style={{
                transform: `translateZ(${(2 - l) * 34}px)`,
                border: `${on ? 2 : 1}px solid ${on ? layerColor(layer) : 'rgba(242,239,232,.22)'}`,
                background: on ? `color-mix(in oklab, ${layerColor(layer)} ${strong ? 26 : 14}%, oklch(0.165 0.012 40))` : 'oklch(0.2 0.012 40 / .7)',
                boxShadow: on ? `0 0 28px color-mix(in oklab, ${layerColor(layer)} 45%, transparent)` : undefined,
                transition: 'background 200ms, border-color 200ms, box-shadow 200ms',
              }}
            >
              <span className="absolute left-2 top-1 font-mono text-[10px] leading-none" style={{ color: on ? layerColor(layer) : 'rgba(242,239,232,.45)' }}>
                {SHEET_NAME[layer].toUpperCase()}
              </span>
              {on && ref && (
                <Crop image={ref.image} crop={crop} fit="cover" alt="" className="absolute inset-[22%] size-auto" style={{ opacity: strong ? 1 : 0.55 }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ReviewScreen({ project, enabled, apply, mutate, onNext }: Props) {
  const progress = reviewProgress(project);

  // Si el proyecto no recuerda cuántas sugerencias había al empezar, se fija ahora.
  useEffect(() => {
    if (project.reviewTotal === undefined && progress.remaining > 0) mutate(p => ({ ...p, reviewTotal: progress.remaining }), { undoable: false, silent: true });
  }, [project.reviewTotal, progress.remaining, mutate]);

  const queue = useMemo(() => [...suggestions(project)].sort((a, b) => evidenceCount(b, project) - evidenceCount(a, project) || a.id.localeCompare(b.id)), [project]);
  const current = queue[0] ?? null;
  const [hover, setHover] = useState<Layer | null>(null);
  useEffect(() => setHover(null), [current?.id]);

  const suggested = current ? proposedLayer(current, project) : 1;
  const currentLayer = (current && (current.layer as Layer | null)) || suggested;
  // La capa sugerida es el botón primario.
  const primaryLayer = currentLayer;

  const accept = (l: Layer) => {
    if (!current) return;
    const name = current.name;
    if (l === currentLayer) apply(p => confirm(p, [current.id]), `«${name}» quedó en ${SHEET_NAME[l]}.`);
    else apply(p => place(p, current.id, l), `«${name}» quedó en ${SHEET_NAME[l]}.`);
  };
  const discard = () => {
    if (current) apply(p => takeOut(p, current.id), `Descartaste «${current.name}».`);
  };

  useShortcuts(enabled, {
    '1': () => (current ? accept(1) : false),
    '2': () => (current ? accept(2) : false),
    '3': () => (current ? accept(3) : false),
    x: () => (current ? discard() : false),
    enter: () => (current ? accept(primaryLayer) : onNext()),
  });

  /* ---------- Etapa completa ---------- */
  if (!current) {
    const out = outPieces(project);
    return (
      <div className="relative h-full overflow-y-auto">
        <div className="mx-auto flex max-w-[640px] flex-col gap-6 px-8 pb-40 pt-12">
          <span className="font-mono text-[12px] tracking-[0.08em] text-ink-2">✓ ETAPA COMPLETA</span>
          <h1 className="m-0 text-[32px] font-bold leading-[1.1]">Revisaste todas las sugerencias</h1>
          <p className="m-0 font-mono text-[13px] text-ink-2">{summary(project, 'revisar')}</p>
          <section aria-label="Descartadas" className="flex flex-col gap-3">
            <h2 className="m-0 font-mono text-[11px] font-medium tracking-[0.08em] text-ink-2">DESCARTADAS</h2>
            {out.length === 0 && <p className="m-0 text-[14px] text-ink-2">No descartaste ninguna.</p>}
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {out.map(x => (
                <li key={x.id} className="flex items-center gap-3 rounded-[10px] border border-line p-2">
                  <PieceThumb piece={x} project={project} className="aspect-[4/3] w-[72px] shrink-0" word={false} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-semibold">{x.name}</span>
                    <span className="font-mono text-[11px] text-ink-2">volvería a {SHEET_NAME[proposedLayer(x, project)]}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => apply(p => recover(p, x.id), `Recuperaste «${x.name}» en ${SHEET_NAME[proposedLayer(x, project)]}.`)}
                    className="rounded-[8px] border border-line-strong px-3 py-[6px] text-[13px] font-medium text-ink hover:bg-white/10"
                  >
                    Recuperar
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <BottomBar primary={{ label: 'Ver capas', kbd: '⏎', onClick: onNext }} />
      </div>
    );
  }

  /* ---------- Una sugerencia por vez ---------- */
  const evidenceRefs = current.evidence.map(id => project.references.find(r => r.id === id)).filter((r): r is NonNullable<typeof r> => !!r).slice(0, 3);
  const lit = hover ?? suggested;
  const reason = current.systemHypothesis?.trim() || current.description?.trim() || 'El agente la encontró repetida en varias referencias.';
  const idx = Math.min(progress.total, progress.reviewed + 1);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto grid max-w-[920px] grid-cols-1 gap-x-12 gap-y-8 px-8 py-8 md:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        {/* Izquierda */}
        <section aria-label="Sugerencia" className="flex min-w-0 flex-col gap-4">
          <span className="font-mono text-[12px] tracking-[0.06em] text-ink-2">
            SUGERENCIA DEL AGENTE · {idx} DE {progress.total}
          </span>
          <PieceThumb piece={current} project={project} className="aspect-[4/3] max-w-full bg-raised" style={{ height: 'clamp(80px, calc(100vh - 416px), 280px)' }} />
          <h1 className="m-0 text-[32px] font-bold leading-[1.05]">{current.name}</h1>
          <span className="font-mono text-[12px] tracking-[0.06em] text-ink-2">EN {evidenceText(current, project).toUpperCase()}</span>
          <div role="group" aria-label="Decidir" className="flex flex-wrap items-center gap-2">
            {LAYERS.map(l => {
              const isPrimary = l === primaryLayer;
              return (
                <button
                  key={l}
                  type="button"
                  onClick={() => accept(l)}
                  onMouseEnter={() => setHover(l)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(l)}
                  onBlur={() => setHover(null)}
                  className={`inline-flex h-10 items-center gap-2 rounded-[10px] px-4 text-[14px] font-bold transition-colors duration-120 ${isPrimary ? 'text-void' : 'border border-line-strong text-ink hover:bg-white/10'}`}
                  style={isPrimary ? { background: layerColor(l) } : undefined}
                >
                  {!isPrimary && <span aria-hidden="true" className="size-2 rounded-full" style={{ background: layerColor(l) }} />}
                  {SHEET_NAME[l]}
                  {isPrimary ? <kbd className="font-mono text-[12px] font-medium opacity-60">⏎</kbd> : <kbd className="font-mono text-[11px] font-medium opacity-50">{KEY_OF[l]}</kbd>}
                </button>
              );
            })}
            <button
              type="button"
              onClick={discard}
              className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-transparent px-3 text-[14px] font-medium text-ink-2 hover:border-line-strong hover:text-ink"
            >
              Descartar
              <kbd className="font-mono text-[11px] font-medium opacity-50">X</kbd>
            </button>
          </div>
        </section>

        {/* Derecha */}
        <section aria-label="Dónde entraría" className="flex min-w-0 flex-col gap-4">
          <MiniStack piece={current} project={project} lit={lit} strong={hover !== null} />
          <p className="m-0 text-center font-mono text-[12px] tracking-[0.08em]" style={{ color: layerColor(lit) }}>
            ENTRARÍA EN {SHEET_NAME[lit].toUpperCase()}
          </p>
          <div className="flex flex-col gap-3">
            <p className="m-0 line-clamp-4 text-[13px] leading-[1.5] text-ink-2">{reason}</p>
            {evidenceRefs.length > 0 && (
              <div className="flex gap-2" aria-label="Evidencia">
                {evidenceRefs.map(r => (
                  <Crop key={r.id} image={r.image} fit="cover" alt={r.name} className="aspect-[4/3] w-[72px] bg-raised" />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
