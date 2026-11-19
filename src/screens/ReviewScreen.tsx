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
      <div className="stage-enter relative h-full overflow-y-auto">
        <div className={`mx-auto grid gap-x-16 gap-y-10 px-6 pb-40 pt-12 lg:px-10 ${out.length ? 'max-w-[1240px] lg:grid-cols-2' : 'max-w-[720px] justify-items-center text-center'}`}>
          <div className={`flex flex-col gap-6 ${out.length ? '' : 'items-center'}`}>
          <span className="type-label text-[0.75rem] text-ink-2">✓ Etapa completa</span>
          <h1 data-headline className="type-stage m-0">
            Revisión completa
          </h1>
          <p className="m-0 text-[1.375rem] font-medium leading-snug">Revisaste todas las sugerencias.</p>
          <p className="type-data m-0 text-[0.875rem] text-ink-2">{summary(project, 'revisar')}</p>
          </div>
          <section aria-label="Descartadas" className="flex w-full flex-col gap-3 text-left">
            <h2 className="type-label m-0 text-[0.75rem] text-ink-2">Descartadas</h2>
            {out.length === 0 && <p className="m-0 text-[0.875rem] text-ink-2">No descartaste ninguna.</p>}
            <ul className="m-0 flex list-none flex-col p-0">
              {out.map(x => (
                <li key={x.id} className="flex items-center gap-3 border-t border-line py-3">
                  <PieceThumb piece={x} project={project} className="aspect-[4/3] w-[72px] shrink-0 rounded-[3px]" word={false} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="line-clamp-2 text-[1rem] font-semibold leading-snug">{x.name}</span>
                    <span className="type-data text-[0.875rem] text-ink-2">volvería a {SHEET_NAME[proposedLayer(x, project)]}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => apply(p => recover(p, x.id), `Recuperaste «${x.name}» en ${SHEET_NAME[proposedLayer(x, project)]}.`)}
                    className="px-3 py-[6px] text-[0.875rem] font-bold text-ink underline underline-offset-4 hover:no-underline"
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

  const HEAD_SIZE: Record<Layer, number> = { 1: 40, 2: 32, 3: 28 };

  return (
    <div className="stage-enter h-full overflow-y-auto">
      <div className="mx-auto grid max-w-[1240px] grid-cols-1 gap-x-12 gap-y-8 px-4 py-6 pb-32 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:px-10 md:py-8">
        {/* Izquierda: la pieza en grande, su nombre y dónde aparece */}
        <section aria-label="Sugerencia" className="flex min-w-0 flex-col gap-4">
          <span className="type-data text-[0.875rem] text-ink-2">
            Sugerencia {idx} de {progress.total}
          </span>
          <PieceThumb
            piece={current}
            project={project}
            className={`aspect-[4/3] w-full rounded-[4px] bg-raised ${mobile ? '' : 'max-h-[calc(100vh-380px)]'}`}
            style={suggested === 1 ? { boxShadow: '0 30px 80px color-mix(in srgb, var(--cc-l0) 33%, transparent)' } : undefined}
          />
          <label className="flex flex-col gap-1">
            <span className="type-label text-[0.75rem] text-ink-2">Nombre · podés editarlo</span>
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
              className="w-full resize-none rounded-[4px] bg-transparent px-0 py-1 text-[1.75rem] font-bold leading-[1.1] text-ink outline-none hover:bg-ink/5 focus:bg-ink/5"
            />
          </label>
          <span className="type-data text-[0.875rem] text-ink-2">En {evidenceText(current, project)}</span>
        </section>

        {/* Derecha: el titular de la capa propuesta, la razón y las opciones */}
        <section aria-label="Dónde entraría" className={`layer-${lit} flex min-w-0 flex-col gap-5`}>
          <span className="type-label text-[0.75rem] text-ink-2">{hover && hover !== suggested ? 'Si la mandás a' : 'Entraría en'}</span>
          <h1 key={lit} data-headline className="layer-headline m-0" style={{ fontSize: lit === 1 ? 'clamp(64px, 11vh, 132px)' : lit === 2 ? 'clamp(48px, 8vh, 64px)' : 40 }}>
            {SHEET_NAME[lit]}
          </h1>
          <p className="m-0 line-clamp-3 text-[1.375rem] font-medium leading-snug">
            {fact}
            {current.description?.trim() ? ` ${current.description.trim()}` : ''}
          </p>
          {evidenceRefs.length > 0 && (
            <div aria-label="Evidencia" className="grid grid-cols-6 gap-2">
              {evidenceRefs.map(r => (
                <Crop key={r.id} image={r.image} fit="cover" alt={r.name} className="aspect-square w-full rounded-[3px] bg-raised" />
              ))}
            </div>
          )}

          <div role="group" aria-label="¿En qué capa entra?" className="flex flex-col gap-2 pt-2">
            <h2 className="type-label m-0 text-[0.75rem] text-ink-2">¿En qué capa entra? Tocá una y la pieza queda ahí</h2>
            <div className="flex flex-col">
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
                    className={`layer-${l} flex items-center gap-4 border-t border-line px-1 py-3 text-left transition-colors duration-150 hover:bg-ink/5`}
                    style={{ minHeight: 64 }}
                  >
                    <span className="layer-headline w-[132px] shrink-0 md:w-[150px]" style={{ fontSize: HEAD_SIZE[l], fontWeight: l === 1 ? 900 : 700 }}>
                      {SHEET_NAME[l]}
                    </span>
                    <span className="min-w-0 flex-1 text-[0.875rem] leading-snug text-ink-2">{LAYER_QUESTION[l]}</span>
                    <span
                      className={`shrink-0 whitespace-nowrap text-[0.875rem] font-bold ${isSuggested ? 'rounded-full bg-bone px-4 py-2 text-void' : 'text-ink underline underline-offset-4'}`}
                    >
                      {isSuggested ? `Aceptar en ${SHEET_NAME[l]} ⏎` : `Mandar a ${SHEET_NAME[l]} · ${KEY_OF[l]}`}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-4 border-t border-line pt-3">
              <button type="button" onClick={discard} className="inline-flex items-center gap-2 px-1 text-[0.875rem] font-medium text-ink underline-offset-4 hover:underline" style={{ minHeight: 44 }}>
                Descartar
                <kbd className="text-[0.875rem] opacity-75">X</kbd>
              </button>
              <button
                type="button"
                onClick={skip}
                disabled={!canSkip}
                title={canSkip ? 'Pasa al final de la fila, sin decidir' : 'Es la última: decidila o descartala'}
                className="inline-flex items-center gap-2 px-1 text-[0.875rem] font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:hover:text-ink-2"
                style={{ minHeight: 44 }}
              >
                Saltar por ahora
                <kbd className="text-[0.875rem] opacity-75">S</kbd>
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
