import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Layer, Pattern, Project } from '../types';
import { useShortcuts } from '../hooks/useAuditShortcuts';
import { evidenceCount } from '../utils/layers';
import { ActionResult, SHEET_NAME, confirm, evidenceText, outPieces, place, proposedLayer, recover, rename, suggestions, takeOut } from '../pieces/model';
import { reviewProgress, summary } from '../utils/steps';
import { LAYER_QUESTION } from '../utils/layerQuestions';
import { useViewport } from '../hooks/useViewport';
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
                border: `${on ? 2 : 1}px solid ${on ? layerColor(layer) : 'color-mix(in srgb, var(--cc-text) 22%, transparent)'}`,
                background: on ? `color-mix(in oklab, ${layerColor(layer)} ${strong ? 26 : 14}%, var(--cc-bg))` : 'color-mix(in srgb, var(--cc-bg) 70%, transparent)',
                boxShadow: on ? `0 0 28px color-mix(in oklab, ${layerColor(layer)} 45%, transparent)` : undefined,
                transition: 'background 200ms, border-color 200ms, box-shadow 200ms',
              }}
            >
              <span className="absolute left-2 top-1 font-mono text-[10px] leading-none" style={{ color: on ? `var(--cc-l${layer - 1}-ink)` : 'color-mix(in srgb, var(--cc-text) 45%, transparent)' }}>
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
  const mobile = useViewport() === 'mobile';

  // Si el proyecto no recuerda cuántas sugerencias había al empezar, se fija ahora.
  useEffect(() => {
    if (project.reviewTotal === undefined && progress.remaining > 0) mutate(p => ({ ...p, reviewTotal: progress.remaining }), { undoable: false, silent: true });
  }, [project.reviewTotal, progress.remaining, mutate]);

  // Las que se saltean pasan al final de la fila: no cambian nada y la etapa no se completa hasta decidirlas.
  const [skipped, setSkipped] = useState<string[]>([]);
  const queue = useMemo(() => {
    const base = [...suggestions(project)].sort((a, b) => evidenceCount(b, project) - evidenceCount(a, project) || a.id.localeCompare(b.id));
    const rest = base.filter(x => !skipped.includes(x.id));
    const later = skipped.map(id => base.find(x => x.id === id)).filter((x): x is Pattern => !!x);
    return [...rest, ...later];
  }, [project, skipped]);
  const current = queue[0] ?? null;
  const [hover, setHover] = useState<Layer | null>(null);
  useEffect(() => setHover(null), [current?.id]);

  const suggested = current ? proposedLayer(current, project) : 1;
  const currentLayer = (current && (current.layer as Layer | null)) || suggested;

  /** Si el nombre se editó, se guarda antes de decidir. */
  const nameRef = useRef<HTMLTextAreaElement>(null);
  const saveName = () => {
    const v = nameRef.current?.value.trim();
    if (current && v && v !== current.name) apply(p => rename(p, current.id, v), `Renombraste «${current.name}» como «${v}».`);
  };
  const decidedName = () => nameRef.current?.value.trim() || current?.name || '';

  const accept = (l: Layer) => {
    if (!current) return;
    const name = decidedName();
    saveName();
    if (l === currentLayer) apply(p => confirm(p, [current.id]), `«${name}» quedó en ${SHEET_NAME[l]}.`);
    else apply(p => place(p, current.id, l), `«${name}» quedó en ${SHEET_NAME[l]}.`);
  };
  const discard = () => {
    if (!current) return;
    const name = decidedName();
    saveName();
    apply(p => takeOut(p, current.id), `Descartaste «${name}».`);
  };
  const canSkip = queue.length > 1;
  const skip = () => {
    if (!current || !canSkip) return;
    saveName();
    setSkipped(s => [...s.filter(i => i !== current.id), current.id]);
  };

  useShortcuts(enabled, {
    '1': () => (current ? accept(1) : false),
    '2': () => (current ? accept(2) : false),
    '3': () => (current ? accept(3) : false),
    x: () => (current ? discard() : false),
    s: () => (current ? skip() : false),
    enter: () => (current ? accept(currentLayer) : onNext()),
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
                    style={{ minHeight: mobile ? 44 : undefined }}
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
  const evidenceRefs = current.evidence.map(id => project.references.find(r => r.id === id)).filter((r): r is NonNullable<typeof r> => !!r).slice(0, 6);
  const lit = hover ?? suggested;
  const evidence = evidenceText(current, project).replace(' referencias', ' imágenes').replace(' referencia', ' imagen');
  const idx = Math.min(progress.total, progress.reviewed + 1);
  const fact = `Aparece en ${evidence}.`;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto grid max-w-[980px] grid-cols-1 gap-x-12 gap-y-8 px-4 py-6 pb-32 md:grid-cols-[minmax(0,1fr)_minmax(0,340px)] md:px-8 md:py-8">
        {/* Izquierda: la pieza y la decisión */}
        <section aria-label="Sugerencia" className="flex min-w-0 flex-col gap-4">
          <span className="font-mono text-[12px] tracking-[0.06em] text-ink-2">
            SUGERENCIA · {idx} DE {progress.total}
          </span>
          <PieceThumb piece={current} project={project} className={`aspect-[4/3] max-w-full self-start bg-raised ${mobile ? 'w-full' : ''}`} style={mobile ? undefined : { height: 'clamp(80px, calc(100vh - 470px), 240px)' }} />
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-[0.06em] text-ink-3">NOMBRE · PODÉS EDITARLO</span>
            <textarea
              key={current.id}
              ref={nameRef}
              rows={2}
              defaultValue={current.name}
              onBlur={saveName}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
              spellCheck={false}
              className="w-full resize-none border-b-2 border-transparent bg-transparent py-1 text-[26px] font-bold leading-[1.1] text-ink outline-none hover:border-line-strong focus:border-bone"
            />
          </label>
          <span className="font-mono text-[12px] tracking-[0.06em] text-ink-2">EN {evidenceText(current, project).toUpperCase()}</span>

          <div role="group" aria-label="¿En qué capa entra?" className="flex flex-col gap-3 pt-2">
            <div className="flex flex-col gap-1">
              <h2 className="m-0 text-[15px] font-bold">¿En qué capa entra?</h2>
              <p className="m-0 text-[13px] leading-snug text-ink-2">
                Tocá una capa y la pieza queda ahí. Sugerida: <b className="text-ink">{SHEET_NAME[suggested]}</b>. {fact}
              </p>
            </div>
            <div className={mobile ? 'flex flex-col gap-2' : 'grid grid-cols-3 gap-2'}>
              {LAYERS.map(l => {
                const isSuggested = l === suggested;
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() => accept(l)}
                    onMouseEnter={() => setHover(l)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(l)}
                    onBlur={() => setHover(null)}
                    className="flex min-h-[92px] flex-col items-start gap-1 rounded-[12px] border p-3 text-left transition-colors duration-120 hover:brightness-110"
                    style={{
                      borderColor: isSuggested ? layerColor(l) : 'var(--color-line-strong)',
                      borderWidth: isSuggested ? 2 : 1,
                      background: isSuggested ? `color-mix(in oklab, ${layerColor(l)} 14%, transparent)` : 'transparent',
                      boxShadow: `0 0 0 1px var(--cc-l${l - 1}-edge)`,
                    }}
                  >
                    <span className="flex w-full items-center gap-2 text-[14px] font-bold">
                      <span aria-hidden="true" className="layer-dot size-2 shrink-0 rounded-full" style={{ background: layerColor(l) }} />
                      {l} · {SHEET_NAME[l]}
                      <kbd className="ml-auto font-mono text-[11px] font-medium opacity-60">{isSuggested ? '⏎' : KEY_OF[l]}</kbd>
                    </span>
                    <span className="text-[12px] leading-snug text-ink-2">{LAYER_QUESTION[l]}</span>
                    <span
                      className="mt-auto rounded-[6px] px-2 py-[2px] text-[11px] font-bold"
                      style={isSuggested ? { background: layerColor(l), color: `var(--cc-l${l - 1}-on)` } : { color: 'var(--cc-text-muted)' }}
                    >
                      {isSuggested ? `Aceptar en ${SHEET_NAME[l]}` : `Mandar a ${SHEET_NAME[l]}`}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={discard} className="inline-flex items-center gap-2 rounded-[10px] border border-line-strong px-4 text-[13px] font-medium text-ink hover:bg-white/10" style={{ minHeight: 44 }}>
                Descartar
                <kbd className="font-mono text-[11px] opacity-50">X</kbd>
              </button>
              <button
                type="button"
                onClick={skip}
                disabled={!canSkip}
                title={canSkip ? 'Pasa al final de la fila, sin decidir' : 'Es la última: decidila o descartala'}
                className="inline-flex items-center gap-2 rounded-[10px] border border-transparent px-4 text-[13px] font-medium text-ink-2 hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                style={{ minHeight: 44 }}
              >
                Saltar por ahora
                <kbd className="font-mono text-[11px] opacity-50">S</kbd>
              </button>
            </div>
          </div>
        </section>

        {/* Derecha: dónde entraría y la evidencia */}
        <section aria-label="Dónde entraría" className="flex min-w-0 flex-col gap-4">
          {!mobile && <MiniStack piece={current} project={project} lit={lit} strong={hover !== null} />}
          <p className="m-0 text-center font-mono text-[12px] tracking-[0.08em]" style={{ color: `var(--cc-l${lit - 1}-ink)` }}>
            ENTRARÍA EN {SHEET_NAME[lit].toUpperCase()}
          </p>
          <div className="flex flex-col gap-3">
            <p className="m-0 line-clamp-5 text-[13px] leading-[1.5] text-ink-2">
              {fact}
              {current.description?.trim() ? ` ${current.description.trim()}` : ''}
            </p>
            {evidenceRefs.length > 0 && (
              <div>
                <span className="font-mono text-[10px] tracking-[0.06em] text-ink-3">DÓNDE APARECE</span>
                <div className="mt-2 grid grid-cols-3 gap-2" aria-label="Evidencia">
                  {evidenceRefs.map(r => (
                    <Crop key={r.id} image={r.image} fit="cover" alt={r.name} className="aspect-[4/3] w-full bg-raised" />
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
