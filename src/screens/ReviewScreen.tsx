import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Layer, Pattern, Project } from '../types';
import { useShortcuts } from '../hooks/useAuditShortcuts';
import { evidenceCount } from '../utils/layers';
import { ActionResult, SHEET_NAME, confirm, evidenceText, isSuggestion, livePieces, outPieces, piecesIn, place, proposedLayer, recover, rename, suggestions, takeOut, undecide, canUndecide } from '../pieces/model';
import { reviewProgress, summary } from '../utils/steps';
import { LAYER_QUESTION } from '../utils/layerQuestions';
import { useViewport } from '../hooks/useViewport';
import { BarButton, BottomBar } from '../components/shell/BottomBar';
import { Desk, DeskQuestion, Shelf } from '../components/shell/Desk';
import { Crop } from '../space/Crop';
import { PieceThumb } from './common';
import { PieceModal } from './PieceRule';
import { useClima } from './climaContext';
import { MutateOptions } from './types';

type Apply = (fn: (p: Project) => ActionResult, notice?: string | false) => ActionResult;

interface Props {
  project: Project;
  enabled: boolean;
  apply: Apply;
  mutate: (fn: (p: Project) => Project, o?: MutateOptions) => void;
  onNext: () => void;
  /** Subpaso: 0 una sugerencia por vez · 1 lo que decidiste. */
  sub: number;
  onSub: (i: number) => void;
}

const LAYERS: Layer[] = [1, 2, 3];
const KEY_OF: Record<Layer, string> = { 1: '1', 2: '2', 3: '3' };

export function ReviewScreen({ project, enabled, apply, mutate, onNext, sub, onSub }: Props) {
  const progress = reviewProgress(project);
  const mobile = useViewport() === 'mobile';

  // Si el proyecto no recuerda cuántas sugerencias había al empezar, se fija ahora.
  useEffect(() => {
    if (project.reviewTotal === undefined && progress.remaining > 0) mutate(p => ({ ...p, reviewTotal: progress.remaining }), { undoable: false, silent: true });
  }, [project.reviewTotal, progress.remaining, mutate]);

  // Las que se saltean pasan al final de la fila: no cambian nada y la etapa no se completa hasta decidirlas.
  // Se guardan en el proyecto para verlas en «Lo que decidiste».
  const skipped = project.reviewSkipped ?? [];
  const setSkipped = (fn: (s: string[]) => string[]) => mutate(p => ({ ...p, reviewSkipped: fn(p.reviewSkipped ?? []) }), { undoable: false, silent: true });
  /** Una saltada que se pidió ver ahora: va primera. */
  const [front, setFront] = useState<string | null>(null);
  const queue = useMemo(() => {
    const base = [...suggestions(project)].sort((a, b) => evidenceCount(b, project) - evidenceCount(a, project) || a.id.localeCompare(b.id));
    const rest = base.filter(x => !skipped.includes(x.id));
    const later = skipped.map(id => base.find(x => x.id === id)).filter((x): x is Pattern => !!x);
    const all = [...rest, ...later];
    const f = front ? all.find(x => x.id === front) : undefined;
    return f ? [f, ...all.filter(x => x !== f)] : all;
  }, [project, skipped, front]);
  const saveNameRef = useRef<() => void>(() => {});
  /** Cuál de las pendientes se está mirando: ‹ › recorren sin decidir. Al decidir, la siguiente ocupa su lugar. */
  const [cursor, setCursor] = useState(0);
  const at = queue.length ? Math.min(cursor, queue.length - 1) : 0;
  const current = queue[at] ?? null;
  const browse = (d: number) => {
    if (queue.length < 2) return;
    saveNameRef.current();
    setFront(null);
    setCursor((at + d + queue.length) % queue.length);
  };
  /** Pieza abierta en el modal completo («Lo que decidiste»). */
  const [detail, setDetail] = useState<Pattern | null>(null);
  /** Columnas de «Lo que decidiste» desplegadas (por defecto muestran las primeras). */
  /** Pestaña de «Lo que decidiste» (null = la que corresponda: Sin decidir si quedan, si no Aceptadas). */
  const [decTab, setDecTab] = useState<'acc' | 'und' | 'out' | null>(null);
  const [hover, setHover] = useState<Layer | null>(null);
  /** La capa elegida: un clic solo elige; la pieza no se mueve hasta confirmar. */
  const [pick, setPick] = useState<Layer | null>(null);
  useEffect(() => setPick(null), [current?.id]);
  useEffect(() => setHover(null), [current?.id]);
  /** La descripción se lee completa con «Ver más». */
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [current?.id]);

  const suggested = current ? proposedLayer(current, project) : 1;
  const currentLayer = (current && (current.layer as Layer | null)) || suggested;

  /** Si el nombre se editó, se guarda antes de decidir. */
  const nameRef = useRef<HTMLTextAreaElement>(null);
  const saveName = () => {
    const v = nameRef.current?.value.trim();
    if (current && v && v !== current.name) apply(p => rename(p, current.id, v), `Renombraste «${current.name}» como «${v}».`);
  };
  saveNameRef.current = saveName;
  const decidedName = () => nameRef.current?.value.trim() || current?.name || '';

  const clima = useClima();
  const accept = (l: Layer) => {
    if (!current) return;
    clima.pulse();
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
    setFront(null);
    setSkipped(s => [...s.filter(i => i !== current.id), current.id]);
    // La saltada va al final: la que ocupa su lugar es la siguiente (si era la última, se vuelve a la primera).
    if (at >= queue.length - 1) setCursor(0);
  };

  // Sin sugerencias por decidir, el primer subpaso deja paso a «Lo que decidiste».
  useEffect(() => {
    if (sub === 0 && !current) onSub(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub, !current]);
  const reviewing = sub === 0 && !!current;
  // Clima: la luz de la capa propuesta (o la que se elige / se señala) es la grande.
  useEffect(() => {
    clima.setFocus(reviewing ? hover ?? pick ?? suggested : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewing, hover, pick, suggested]);
  useEffect(
    () => () => clima.setFocus(null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useShortcuts(enabled, {
    '1': () => (reviewing ? setPick(1) : false),
    '2': () => (reviewing ? setPick(2) : false),
    '3': () => (reviewing ? setPick(3) : false),
    x: () => (reviewing ? discard() : false),
    s: () => (reviewing ? skip() : false),
    // ← → recorren las sugerencias sin decidir (en «Lo que decidiste» vuelven a ser paso anterior / siguiente).
    // Con una sola, las flechas no hacen nada (no confirman por accidente).
    arrowleft: () => (reviewing ? browse(-1) : false),
    arrowright: () => (reviewing ? browse(1) : false),
    enter: () => (reviewing ? accept(pick ?? currentLayer) : onNext()),
  });

  /* ---------- Estantes: las capas (izquierda) y la ayuda (derecha) ---------- */
  const shelves: Shelf[] = [
    {
      id: 'capas',
      label: 'Capas',
      side: 'left',
      content: (
        <div className="flex flex-col gap-5">
          {LAYERS.map(l => {
            const list = piecesIn(project, l).filter(x => !isSuggestion(x));
            return (
              <section key={l} className={`layer-${l} flex flex-col gap-1`}>
                <span className="flex items-baseline justify-between">
                  <span className="text-[0.9375rem] font-semibold">{SHEET_NAME[l]}</span>
                  <span className="type-data text-[0.875rem] text-ink-2">{list.length}</span>
                </span>
                {list.length === 0 ? <span className="text-[0.875rem] text-ink-3">Todavía nada.</span> : list.map(x => <span key={x.id} className="text-[0.875rem] leading-snug text-ink-2">{x.name}</span>)}
              </section>
            );
          })}
        </div>
      ),
    },
  ];

  /* ---------- 2 · Lo que decidiste: pestañas Aceptadas · Sin decidir · Descartadas, a todo el ancho ---------- */
  if (!reviewing) {
    const out = outPieces(project);
    const accepted = livePieces(project).filter(x => !isSuggestion(x) && x.layer);
    // Sin decidir: primero las que todavía no viste, después las que saltaste.
    const later = skipped.map(id => suggestions(project).find(x => x.id === id)).filter((x): x is Pattern => !!x);
    const undecided = [...suggestions(project).filter(x => !skipped.includes(x.id)), ...later];
    const pending = undecided.length;
    const tab = decTab ?? (pending ? 'und' : 'acc');
    const reviewNow = (x?: Pattern) => {
      setFront(x ? x.id : null);
      setCursor(0);
      onSub(0);
    };
    const TABS: { key: 'acc' | 'und' | 'out'; label: string; n: number }[] = [
      { key: 'acc', label: 'Aceptadas', n: accepted.length },
      { key: 'und', label: 'Sin decidir', n: pending },
      { key: 'out', label: 'Descartadas', n: out.length },
    ];

    /** Tarjeta legible: miniatura grande, el nombre completo y una acción en texto. */
    const card = (x: Pattern, note: string, actions?: { label: string; run: () => void } | { label: string; run: () => void }[], tag?: string) => {
      const list = !actions ? [] : Array.isArray(actions) ? actions : [actions];
      return (
      <li key={x.id} className="flex min-w-0 flex-col gap-2">
        <button type="button" onClick={() => setDetail(x)} title="Ver completo" className="group flex flex-col gap-2 text-left">
          <PieceThumb piece={x} project={project} className="aspect-[4/3] w-full rounded-[4px] bg-raised transition-transform duration-150 group-hover:scale-[1.01]" word={false} />
          <span className="text-[1rem] font-semibold leading-snug underline-offset-4 group-hover:underline">{x.name}</span>
        </button>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.875rem] text-ink-2">
          {tag && <span className="rounded-[3px] bg-ink/10 px-[6px] py-[1px] text-[0.8125rem] font-semibold text-ink">{tag}</span>}
          <span>{note}</span>
          <span className="ml-auto flex gap-4">
            {list.map(a => (
              <button key={a.label} type="button" onClick={a.run} className="font-bold text-ink underline underline-offset-4 hover:no-underline" style={{ minHeight: mobile ? 44 : undefined }}>
                {a.label}
              </button>
            ))}
          </span>
        </span>
      </li>
      );
    };
    const grid = (children: React.ReactNode) => (
      <ul className="m-0 grid list-none gap-x-6 gap-y-8 p-0" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${mobile ? 150 : 220}px, 1fr))` }}>
        {children}
      </ul>
    );
    const empty = (text: string) => <p className="m-0 py-10 text-[1.0625rem] text-ink-2">{text}</p>;

    let content: React.ReactNode;
    if (tab === 'acc') {
      content = accepted.length ? (
        grid(accepted.map(x => card(x, x.origin === 'user' ? 'Usuario' : 'Agente', undefined, SHEET_NAME[x.layer as Layer])))
      ) : (
        empty('Todavía no aceptaste ninguna.')
      );
    } else if (tab === 'und') {
      content = pending
        ? grid(undecided.map(x => card(x, `iría a ${SHEET_NAME[proposedLayer(x, project)]}`, { label: 'Decidir', run: () => reviewNow(x) }, skipped.includes(x.id) ? 'Saltada' : undefined)))
        : empty('No queda ninguna por decidir.');
    } else {
      content = out.length
        ? grid(
            out.map(x =>
              card(x, `volvería a ${SHEET_NAME[proposedLayer(x, project)]}`, {
                label: 'Recuperar',
                run: () => apply(p => recover(p, x.id), `Recuperaste «${x.name}» en ${SHEET_NAME[proposedLayer(x, project)]}.`),
              }),
            ),
          )
        : empty('No descartaste ninguna.');
    }

    return (
      <>
        <Desk stepKey="revisar-1" width="wide" shelves={shelves}>
          <div className="flex flex-col gap-8 pb-10">
            {/* Título solo; a la derecha, alineado a la base, lo que queda por decidir */}
            <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
              <h1 data-headline className="type-stage m-0" style={{ fontSize: 'clamp(40px, 5vw, 72px)', lineHeight: 0.95 }}>
                Piezas revisadas
              </h1>
              {pending ? (
                <div className="flex items-center gap-4 pb-1">
                  <span className="text-[1rem] text-ink-2">
                    Quedan <strong className="font-semibold text-ink">{pending}</strong> por decidir
                  </span>
                  <button type="button" onClick={() => reviewNow()} className="inline-flex h-10 items-center rounded-full bg-ink/10 px-5 text-[0.9375rem] font-semibold text-ink transition-colors duration-150 hover:bg-ink/20">
                    Decidirlas →
                  </button>
                </div>
              ) : (
                <span className="pb-2 text-[1rem] text-ink-2">✓ Revisaste todas las sugerencias</span>
              )}
            </header>
            {/* Pestañas: una lista por vez, a todo el ancho */}
            <div role="tablist" aria-label="Piezas revisadas" className="flex flex-wrap gap-2 border-b border-line">
              {TABS.map(t => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => setDecTab(t.key)}
                  className={`-mb-px flex items-baseline gap-2 border-b-2 px-3 py-3 text-[1.0625rem] transition-colors duration-150 ${tab === t.key ? 'border-[var(--cc-text)] font-bold text-ink' : 'border-transparent font-medium text-ink-2 hover:text-ink'}`}
                >
                  {t.label}
                  <span className="type-data text-[0.9375rem]">{t.n}</span>
                </button>
              ))}
            </div>
            <div role="tabpanel" key={tab} className="stage-enter">
              {content}
            </div>
          </div>
        </Desk>
        <BottomBar primary={{ label: 'Seguir a Capas →', kbd: '⏎', onClick: onNext }} />
        {detail &&
          (() => {
            const x = project.patterns.find(p => p.id === detail.id) ?? detail;
            const out = x.status === 'discarded';
            const undecided = !out && isSuggestion(x);
            const done = (fn: (p: Project) => ActionResult, notice: string) => {
              apply(fn, notice);
              setDetail(null);
            };
            const actions = out
              ? [{ label: 'Recuperar', run: () => done(p => recover(p, x.id), `Recuperaste «${x.name}» en ${SHEET_NAME[proposedLayer(x, project)]}.`) }]
              : [
                  ...(undecided ? [{ label: 'Decidir', run: () => { setDetail(null); reviewNow(x); } }] : canUndecide(x) ? [{ label: 'Pasar a Sin decidir', run: () => done(p => undecide(p, x.id), `«${x.name}» vuelve a Sin decidir.`) }] : []),
                  { label: 'Descartar', run: () => done(p => takeOut(p, x.id), `Descartaste «${x.name}».`), quiet: true },
                ];
            return <PieceModal piece={x} project={project} onClose={() => setDetail(null)} actions={actions} />;
          })()}
      </>
    );
  }

  /* ---------- Una sugerencia por vez ---------- */
  const evidenceRefs = current.evidence.map(id => project.references.find(r => r.id === id)).filter((r): r is NonNullable<typeof r> => !!r);
  const lit = hover ?? pick ?? suggested;
  const target = pick ?? suggested;
  const evidence = evidenceText(current, project).replace(' referencias', ' imágenes').replace(' referencia', ' imagen');
  const idx = Math.min(progress.total, progress.reviewed + 1);
  const fact = `Aparece en ${evidence}.`;

  const HEAD_SIZE: Record<Layer, number> = { 1: 40, 2: 32, 3: 28 };

  return (
    <>
    <Desk stepKey="revisar-0" width="wide" shelves={shelves}>
      {/* Centrado vertical en la mesa: no queda media pantalla vacía abajo */}
      <div className="flex min-h-full items-center">
      <div className="grid w-full grid-cols-1 gap-x-12 gap-y-8 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        {/* Izquierda: la pieza en grande, su nombre y dónde aparece */}
        <section aria-label="Sugerencia" className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <span className="type-data text-[0.875rem] text-ink-2">
              Sugerencia {at + 1} de {queue.length} por decidir
              {progress.reviewed > 0 ? ` · ${progress.reviewed} ya decididas` : ''}
            </span>
            {queue.length > 1 && (
              <span className="flex items-center gap-2" role="group" aria-label="Moverte entre las sugerencias">
                <button
                  type="button"
                  onClick={() => browse(-1)}
                  aria-label="Sugerencia anterior"
                  title="Anterior (←)"
                  className="inline-flex items-center gap-2 rounded-full border border-line-strong px-4 text-[0.9375rem] font-semibold text-ink transition-colors duration-150 hover:bg-ink/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ height: mobile ? 44 : 40 }}
                >
                  <span aria-hidden="true">←</span>
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => browse(1)}
                  aria-label="Sugerencia siguiente"
                  title="Siguiente (→)"
                  className="inline-flex items-center gap-2 rounded-full bg-bone px-4 text-[0.9375rem] font-semibold text-void transition-opacity duration-150 hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ height: mobile ? 44 : 40 }}
                >
                  Siguiente
                  <span aria-hidden="true">→</span>
                </button>
              </span>
            )}
          </div>
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
          <span className="type-label text-[0.75rem] text-ink-2">{hover && hover !== (pick ?? suggested) ? 'Si la mandás a' : pick && pick !== suggested ? 'Elegiste' : 'Entraría en'}</span>
          {/* Alto fijo (el del Primario, el más grande): al pasar el mouse por las capas el titular cambia de tamaño
              sin empujar las filas; si no, la fila se corre bajo el cursor y el hover entra y sale en loop. */}
          <div className="flex items-end" style={{ height: 'calc(clamp(64px, 11vh, 132px) * 0.84 + 12px)' }}>
            <h1 key={lit} data-headline className="layer-headline m-0" style={{ fontSize: lit === 1 ? 'clamp(64px, 11vh, 132px)' : lit === 2 ? 'clamp(48px, 8vh, 64px)' : 40 }}>
              {SHEET_NAME[lit]}
            </h1>
          </div>
          <div className="flex flex-col items-start gap-1">
            <p className={`m-0 text-[1.375rem] font-medium leading-snug ${more ? '' : 'line-clamp-4'}`}>
              {fact}
              {current.description?.trim() ? ` ${current.description.trim()}` : ''}
            </p>
            {(current.description?.trim().length ?? 0) > 180 && (
              <button type="button" onClick={() => setMore(m => !m)} aria-expanded={more} className="text-[0.875rem] font-bold text-ink underline underline-offset-4 hover:no-underline">
                {more ? 'Ver menos' : 'Ver más'}
              </button>
            )}
          </div>
          {evidenceRefs.length > 0 && (
            <div
              aria-label="Evidencia"
              className="flex flex-wrap gap-2"
            >
              {evidenceRefs.map(r => (
                <Crop key={r.id} image={r.image} fit="cover" alt={r.name} className="aspect-square w-[72px] shrink-0 rounded-[3px] bg-raised" />
              ))}
            </div>
          )}

          <div role="group" aria-label="¿En qué capa entra?" className="flex flex-col gap-2 pt-2">
            <h2 className="type-label m-0 text-[0.75rem] text-ink-2">¿En qué capa entra? Elegí una y confirmá</h2>
            <div className="flex flex-col">
              {LAYERS.map(l => {
                const isSuggested = l === suggested;
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setPick(l)}
                    aria-pressed={pick === l}
                    onMouseEnter={() => setHover(l)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(l)}
                    onBlur={() => setHover(null)}
                    className={`layer-${l} flex items-center gap-4 border-t border-line px-2 py-3 text-left transition-colors duration-150 hover:bg-ink/5 ${pick === l ? 'bg-ink/10' : ''}`}
                    style={{ minHeight: 64 }}
                  >
                    <span className="layer-headline w-[150px] shrink-0 md:w-[176px]" style={{ fontSize: HEAD_SIZE[l], fontWeight: l === 1 ? 900 : 700, textDecoration: 'none' }}>
                      {SHEET_NAME[l]}
                    </span>
                    <span className="min-w-0 flex-1 text-[0.875rem] leading-snug text-ink-2">{LAYER_QUESTION[l]}</span>
                    <span
                      className={`shrink-0 whitespace-nowrap text-[0.875rem] font-bold ${pick === l ? 'rounded-full bg-bone px-4 py-2 text-void' : isSuggested ? 'text-ink' : 'text-ink-2'}`}
                    >
                      {pick === l ? '✓ Elegida' : isSuggested ? 'Sugerida · elegir' : `Elegir · ${KEY_OF[l]}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>
      </div>
    </Desk>

      <BottomBar
        actions={
          <>
            <BarButton onClick={discard}>
              Descartar <kbd className="text-[0.875rem] opacity-75">X</kbd>
            </BarButton>
            <BarButton onClick={skip} disabled={!canSkip} title={canSkip ? 'Pasa al final de la fila, sin decidir' : 'Es la última: decidila o descartala'}>
              Saltar por ahora <kbd className="text-[0.875rem] opacity-75">S</kbd>
            </BarButton>
          </>
        }
        primary={{ label: `Confirmar en ${SHEET_NAME[target]} →`, kbd: '⏎', onClick: () => accept(target) }}
      />
    </>
  );
}
