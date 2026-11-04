import React, { useEffect, useRef, useState } from 'react';
import { Layer, Pattern, Project } from '../types';
import { useShortcuts } from '../hooks/useAuditShortcuts';
import { Shortcut, ShortcutBar } from '../components/shell/ShortcutBar';
import { corpusRefs, layerInfo } from '../utils/layers';
import { Crop } from '../space/Crop';
import {
  ActionResult,
  SHEET_NAME,
  SplitPart,
  applySplit,
  confirm,
  confirmSheet,
  evidenceText,
  isSuggestion,
  livePieces,
  merge,
  move,
  notices,
  outPieces,
  piecesIn,
  place,
  rename,
  restore,
  setCover,
  sheetLabel,
  takeOut,
} from '../pieces/model';
import { BigButton, KeyButton, NoticeStrip, PieceImage, Toast } from './common';
import { CropDialog, MergeDialog, SplitDialog } from './PieceDialogs';

type Tab = Layer | 'out';

interface OrderScreenProps {
  project: Project;
  enabled: boolean;
  apply: (fn: (p: Project) => ActionResult) => ActionResult;
  toast: string | null;
  onGoSystem: () => void;
  onGoUpload: () => void;
  /** Pide a la IA cómo separar una pieza (no cambia nada hasta confirmar). */
  split: (piece: Pattern) => Promise<SplitPart[]>;
}

const ROLE: Record<Layer, string> = {
  1: 'Lo que define el sistema. Lo más importante va acá.',
  2: 'Lo que acompaña al núcleo.',
  3: 'Detalles que aparecen poco y dan carácter.',
};

/** Posición de cada hoja en el túnel: la activa de frente; las de atrás, corridas arriba a la derecha. */
function sheetStyle(d: number): React.CSSProperties {
  if (d === 0) return { transform: 'translate3d(0,0,0)', opacity: 1 };
  if (d > 0) return { transform: `translate3d(${d * 34}px, ${-d * 30}px, ${-d * 140}px)`, opacity: d === 1 ? 0.75 : 0.45, pointerEvents: 'none' };
  return { transform: 'translate3d(-30px, 40px, 260px)', opacity: 0, pointerEvents: 'none' };
}

/**
 * 02 · ORDENAR. La IA ya ubicó las piezas en las hojas como sugerencias (borde punteado).
 * El diseñador confirma, sube, baja o saca. Todo tiene un botón; el teclado acelera.
 */
export function OrderScreen(props: OrderScreenProps) {
  const { project, apply } = props;
  const [tab, setTab] = useState<Tab>(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [dialog, setDialog] = useState<null | { kind: 'merge' | 'crop'; id: string } | { kind: 'split'; id: string; parts: SplitPart[] | null; error?: string }>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const wheel = useRef({ acc: 0, lock: 0 });

  const layer: Layer | null = tab === 'out' ? null : tab;
  const pieces = layer ? piecesIn(project, layer) : outPieces(project);
  const primary = selected[selected.length - 1] ?? null;
  const sel = primary ? project.patterns.find(x => x.id === primary) ?? null : null;
  const refs = corpusRefs(project);
  const lit = sel ? new Set(sel.evidence) : null;
  const notice = notices(project, primary).find(n => !dismissed.includes(n.key)) ?? null;

  // Lo que sale de la hoja visible sale de la selección.
  useEffect(() => {
    const ids = new Set(pieces.map(x => x.id));
    if (selected.some(id => !ids.has(id))) setSelected(s => s.filter(id => ids.has(id)));
  }, [project, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const goTab = (t: Tab) => {
    setTab(t);
    setMenuFor(null);
  };
  const stepSheet = (dir: 1 | -1) => {
    if (tab === 'out') return goTab(dir === 1 ? 3 : 3);
    goTab(Math.min(3, Math.max(1, tab + dir)) as Layer);
  };

  const doMove = (id: string, dir: 1 | -1) => {
    const r = apply(p => move(p, id, dir)) as ActionResult & { to?: Layer };
    if (r.to) {
      // La selección sigue a la pieza a su hoja nueva.
      setTab(r.to);
      setSelected([id]);
    }
  };
  const doOut = (id: string) => {
    apply(p => takeOut(p, id));
    setSelected(s => s.filter(x => x !== id));
  };
  const select = (id: string, additive: boolean) => {
    setMenuFor(null);
    setSelected(s => (additive ? (s.includes(id) ? s.filter(x => x !== id) : [...s, id]) : [id]));
  };
  const stepPiece = (dir: 1 | -1) => {
    if (!pieces.length) return;
    const i = pieces.findIndex(x => x.id === primary);
    const next = pieces[i === -1 ? (dir === 1 ? 0 : pieces.length - 1) : (i + dir + pieces.length) % pieces.length];
    setSelected([next.id]);
  };

  const busy = !!dialog || !!renaming;
  useShortcuts(props.enabled && !busy, {
    w: () => stepSheet(1),
    s: () => stepSheet(-1),
    arrowleft: () => stepPiece(-1),
    arrowright: () => stepPiece(1),
    enter: () => (sel && isSuggestion(sel) ? void apply(p => confirm(p, [sel.id])) : false),
    arrowup: () => (sel && layer ? doMove(sel.id, 1) : false),
    arrowdown: () => (sel && layer ? doMove(sel.id, -1) : false),
    x: () => (sel && layer ? doOut(sel.id) : false),
    ' ': () => props.onGoSystem(),
    escape: () => (menuFor ? setMenuFor(null) : selected.length ? setSelected([]) : false),
  });

  const onWheel = (e: React.WheelEvent) => {
    if (tab === 'out') return;
    const w = wheel.current;
    const now = Date.now();
    if (now < w.lock) return;
    w.acc += e.deltaY;
    if (Math.abs(w.acc) > 80) {
      stepSheet(w.acc > 0 ? 1 : -1);
      w.acc = 0;
      w.lock = now + 450;
    }
  };

  const total = livePieces(project).length;
  const suggestions = layer ? pieces.filter(isSuggestion).length : 0;

  const shortcuts: Shortcut[] = sel
    ? [
        { keys: '⏎', label: 'Confirmar' },
        { keys: '↑↓', label: 'Subir / bajar' },
        { keys: 'X', label: 'Sacar' },
        { keys: 'ESC', label: 'Soltar' },
        { keys: 'ESPACIO', label: 'Ver sistema' },
      ]
    : [
        { keys: 'W S', label: 'Cambiar de hoja' },
        { keys: '←→', label: 'Elegir pieza' },
        { keys: 'ESPACIO', label: 'Ver sistema' },
      ];

  /* ---------- Sin análisis todavía ---------- */
  if (!total && !outPieces(project).length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 p-10 text-center">
        <span className="type-name text-[40px]">TODAVÍA NO HAY PIEZAS</span>
        <span className="max-w-[480px] text-[16px] text-ink-2">Subí tus referencias y apretá ANALIZAR: la IA arma las piezas y las ubica en las tres hojas. Después las ordenás acá.</span>
        <BigButton label="IR A SUBIR" onClick={props.onGoUpload} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        {/* Pestañas de hojas */}
        <nav aria-label="Hojas" className="flex w-[210px] shrink-0 flex-col gap-2 px-4 pt-6">
          {([1, 2, 3] as Layer[]).map(l => {
            const on = tab === l;
            const n = piecesIn(project, l).length;
            return (
              <button
                key={l}
                type="button"
                aria-current={on ? 'true' : undefined}
                onClick={() => goTab(l)}
                className={`${layerInfo(l).className} type-label flex items-center justify-between px-3 py-3 text-left text-[15px] transition-colors duration-120`}
                style={on ? { background: 'var(--layer-color)', color: 'var(--layer-ink)' } : { boxShadow: 'inset 0 0 0 2px color-mix(in oklab, var(--layer-color) 55%, transparent)' }}
              >
                <span>{sheetLabel(l)}</span>
                <span className="font-mono text-[13px] font-medium">({n})</span>
              </button>
            );
          })}
          <span className="mt-1 text-[12px] leading-snug text-ink-2">Adelante va lo más importante.</span>
          <button
            type="button"
            onClick={() => goTab('out')}
            aria-current={tab === 'out' ? 'true' : undefined}
            className={`type-label mt-auto mb-4 px-3 py-2 text-left text-[12px] ${tab === 'out' ? 'bg-raised text-ink' : 'text-ink-2 hover:text-ink'}`}
          >
            FUERA DEL SISTEMA ({outPieces(project).length})
          </button>
        </nav>

        {/* Hojas */}
        <div className="relative min-w-0 flex-1" onWheel={onWheel} style={{ perspective: '1400px', perspectiveOrigin: '60% 30%' }}>
          {tab === 'out' ? (
            <div className="absolute inset-0 overflow-y-auto pb-6 pr-6 pt-6">
              <div className="mb-4 flex items-baseline gap-3">
                <span className="type-name text-[30px]">FUERA DEL SISTEMA</span>
                <span className="text-[14px] text-ink-2">Lo que sacaste. Se puede recuperar.</span>
              </div>
              {!pieces.length && <span className="text-[15px] text-ink-2">Nada por ahora.</span>}
              <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                {pieces.map(x => (
                  <div key={x.id} className="flex flex-col gap-2 border-2 border-line-strong p-2 opacity-80">
                    <PieceImage piece={x} project={project} className="aspect-[4/3] w-full" style={{ filter: 'grayscale(1)' }} />
                    <span className="type-name text-[20px]">{x.name}</span>
                    <span className="font-mono text-[12px] text-ink-2">{evidenceText(x, project)}</span>
                    <KeyButton label="Recuperar" onClick={() => apply(p => restore(p, x.id))} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            ([1, 2, 3] as Layer[]).map(l => {
              const d = l - (tab as Layer);
              const info = layerInfo(l);
              return (
                <section
                  key={l}
                  aria-hidden={d !== 0}
                  aria-label={d === 0 ? `Hoja ${sheetLabel(l)}` : undefined}
                  className={`${info.className} absolute bottom-6 left-0 right-[80px] top-[54px] flex flex-col bg-void`}
                  style={{
                    ...sheetStyle(d),
                    zIndex: 10 - Math.abs(d),
                    border: `2px solid color-mix(in oklab, var(--layer-color) ${d === 0 ? 70 : 45}%, transparent)`,
                    transition: 'transform 400ms var(--ease-camera), opacity 400ms var(--ease-camera)',
                  }}
                >
                  {/* Rótulo y franja de la hoja */}
                  <div className="flex shrink-0 items-center gap-3 px-4 pt-3">
                    <span className="layer-tag">{sheetLabel(l)}</span>
                    {d === 0 && <span className="text-[14px] text-ink-2">{ROLE[l]}</span>}
                    {d === 0 && (
                      <div className="ml-auto flex items-center gap-2">
                        {selected.length > 1 && <KeyButton label={`Unir ${selected.length}`} tone="bone" onClick={() => {
                          apply(p => merge(p, selected));
                          setSelected([selected[0]]);
                        }} />}
                        {suggestions > 0 && (
                          <KeyButton label={`Confirmar las ${suggestions} sugerencias de esta hoja`} tone="core" onClick={() => apply(p => confirmSheet(p, l))} />
                        )}
                      </div>
                    )}
                  </div>
                  <div className="layer-rule mx-4 mt-2 shrink-0" />
                  {d === 0 && (
                    <div className="min-h-0 flex-1 overflow-y-auto p-4">
                      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
                        {pieces.map(x => (
                          <PieceCard
                            key={x.id}
                            piece={x}
                            project={project}
                            layer={l}
                            selected={selected.includes(x.id)}
                            menuOpen={menuFor === x.id}
                            renaming={renaming?.id === x.id ? renaming.value : null}
                            onSelect={additive => select(x.id, additive)}
                            onConfirm={() => apply(p => confirm(p, [x.id]))}
                            onUp={() => doMove(x.id, 1)}
                            onDown={() => doMove(x.id, -1)}
                            onOut={() => doOut(x.id)}
                            onMenu={() => setMenuFor(m => (m === x.id ? null : x.id))}
                            onRenameChange={v => setRenaming({ id: x.id, value: v })}
                            onRenameDone={commit => {
                              if (commit && renaming) apply(p => rename(p, x.id, renaming.value));
                              setRenaming(null);
                            }}
                            onAction={a => {
                              setMenuFor(null);
                              if (a === 'rename') setRenaming({ id: x.id, value: x.name });
                              if (a === 'merge') setDialog({ kind: 'merge', id: x.id });
                              if (a === 'crop') setDialog({ kind: 'crop', id: x.id });
                              if (a === 'split') {
                                setDialog({ kind: 'split', id: x.id, parts: null });
                                props
                                  .split(x)
                                  .then(parts => setDialog(dg => (dg?.kind === 'split' && dg.id === x.id ? { ...dg, parts } : dg)))
                                  .catch(err => setDialog(dg => (dg?.kind === 'split' && dg.id === x.id ? { ...dg, parts: [], error: err?.message || String(err) } : dg)));
                              }
                            }}
                          />
                        ))}
                        {!pieces.length && (
                          <div className="col-span-full flex flex-col gap-2 border-2 border-dashed border-line-strong p-6">
                            <span className="type-name text-[24px]">NADA EN {SHEET_NAME[l].toUpperCase()} TODAVÍA</span>
                            <span className="text-[14px] text-ink-2">
                              {l === 1 ? 'Elegí una pieza en Soporte y subila con [↑] SUBIR.' : l === 2 ? 'Bajá algo del Núcleo con [↓] o subí algo del Acento con [↑].' : 'Bajá algo del Soporte con [↓] BAJAR.'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              );
            })
          )}
        </div>

        {/* Panel lateral: las referencias de la pieza elegida, en grande */}
        {sel && (
          <aside aria-label={`Referencias de ${sel.name}`} className="flex w-[320px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-line px-4 py-5">
            <div className="flex items-start justify-between gap-2">
              <span className="type-name text-[26px]">{sel.name}</span>
              <button type="button" aria-label="Cerrar" onClick={() => setSelected([])} className="type-label text-[16px] text-ink-2 hover:text-ink">
                ×
              </button>
            </div>
            <span className="shrink-0 font-mono text-[12px] text-ink-2">{evidenceText(sel, project)}</span>
            {sel.description && <p className="m-0 shrink-0 text-[14px] leading-[1.45] text-ink-2">{sel.description}</p>}
            <span className="type-label mt-1 text-[12px] text-ink-2">DE DÓNDE SALE</span>
            <div className="grid grid-cols-2 gap-2">
              {sel.evidence
                .map(id => project.references.find(r => r.id === id))
                .filter((r): r is NonNullable<typeof r> => !!r)
                .map(r => (
                  <Crop key={r.id} image={r.image} fit="cover" alt={r.name} className="aspect-square w-full" />
                ))}
            </div>
          </aside>
        )}
      </div>

      {/* Referencias al fondo: se iluminan las de la pieza elegida */}
      <div className="flex h-[64px] shrink-0 items-center gap-[6px] overflow-x-auto px-4" aria-label="Referencias">
        <span className="type-label shrink-0 pr-2 text-[11px] text-ink-2">REFERENCIAS</span>
        {(lit ? [...refs.filter(r => lit.has(r.id)), ...refs.filter(r => !lit.has(r.id))] : refs).map(r => {
          const on = lit ? lit.has(r.id) : null;
          return (
            <Crop
              key={r.id}
              image={r.image}
              fit="cover"
              alt={r.name}
              className="size-[48px] shrink-0"
              style={{ filter: on ? 'none' : 'grayscale(1)', opacity: on === null ? 0.4 : on ? 1 : 0.12, transition: 'opacity 250ms, filter 250ms', outline: on ? '2px solid var(--color-bone)' : undefined }}
            />
          );
        })}
      </div>

      {notice ? (
        <NoticeStrip
          notice={notice}
          onDismiss={() => setDismissed(d => [...d, notice.key])}
          onAction={
            notice.action
              ? () => {
                  apply(p => place(p, notice.pieceId, notice.action!.layer));
                  setTab(notice.action!.layer);
                  setSelected([notice.pieceId]);
                }
              : undefined
          }
        />
      ) : (
        props.toast && <Toast text={props.toast} />
      )}
      {notice && props.toast && <Toast text={props.toast} />}

      <div className="flex shrink-0 items-end gap-4 px-3 pb-3 pt-1">
        <div className="min-w-0 flex-1 [&>div]:p-0">
          <ShortcutBar items={shortcuts} />
        </div>
        <BigButton k="ESPACIO" label="VER SISTEMA" onClick={props.onGoSystem} />
      </div>

      {dialog?.kind === 'merge' && (
        <MergeDialog
          project={project}
          pieceId={dialog.id}
          onMerge={otherId => {
            apply(p => merge(p, [dialog.id, otherId]));
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'crop' && (
        <CropDialog
          project={project}
          pieceId={dialog.id}
          onSave={(refId, crop) => {
            apply(p => setCover(p, dialog.id, refId, crop));
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'split' && (
        <SplitDialog
          project={project}
          pieceId={dialog.id}
          parts={dialog.parts}
          error={dialog.error}
          onConfirm={parts => {
            apply(p => applySplit(p, dialog.id, parts));
            setDialog(null);
            setSelected([]);
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

/* ---------- Tarjeta de pieza ---------- */

type MenuAction = 'merge' | 'split' | 'rename' | 'crop';

interface PieceCardProps {
  piece: Pattern;
  project: Project;
  layer: Layer;
  selected: boolean;
  menuOpen: boolean;
  renaming: string | null;
  onSelect: (additive: boolean) => void;
  onConfirm: () => void;
  onUp: () => void;
  onDown: () => void;
  onOut: () => void;
  onMenu: () => void;
  onRenameChange: (v: string) => void;
  onRenameDone: (commit: boolean) => void;
  onAction: (a: MenuAction) => void;
}

function PieceCard(props: PieceCardProps) {
  const { piece, project, layer, selected } = props;
  const suggestion = isSuggestion(piece);
  const core = layer === 1;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${piece.name}, ${suggestion ? 'sugerencia' : 'confirmada'}, ${evidenceText(piece, project)}`}
      onClick={e => props.onSelect(e.shiftKey)}
      onKeyDown={e => {
        if (e.key === 'Enter' && e.target === e.currentTarget && !selected) {
          e.preventDefault();
          props.onSelect(false);
        }
      }}
      className="group relative flex flex-col gap-2 p-2 text-left outline-none"
      style={{
        border: `${core ? 3 : 2}px ${suggestion ? 'dashed' : 'solid'} ${suggestion ? 'color-mix(in oklab, var(--layer-color) 70%, transparent)' : 'var(--layer-color)'}`,
        background: !suggestion && core ? 'color-mix(in oklab, var(--color-core) 14%, transparent)' : undefined,
        outline: selected ? '3px solid var(--color-bone)' : undefined,
        outlineOffset: 3,
      }}
    >
      <PieceImage piece={piece} project={project} className="aspect-[4/3] w-full" />
      <div className="flex items-start justify-between gap-2">
        {props.renaming !== null ? (
          <input
            autoFocus
            aria-label="Nuevo nombre"
            value={props.renaming}
            onClick={e => e.stopPropagation()}
            onChange={e => props.onRenameChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') props.onRenameDone(true);
              if (e.key === 'Escape') props.onRenameDone(false);
            }}
            onBlur={() => props.onRenameDone(true)}
            className="type-name w-full border-b-2 border-bone bg-transparent text-[22px] text-ink outline-none"
          />
        ) : (
          <span className="type-name line-clamp-2 text-[22px] leading-[0.95]">{piece.name}</span>
        )}
        {suggestion && <span className="type-label shrink-0 border border-dashed border-ink-3 px-1 text-[10px] text-ink-2">SUGERENCIA</span>}
      </div>
      <span className="font-mono text-[12px] text-ink-2">{evidenceText(piece, project)}</span>

      {/* Acciones visibles: al pasar el mouse o con la pieza elegida */}
      <div className={`flex flex-wrap gap-1 ${selected ? '' : 'hidden group-hover:flex group-focus-within:flex'}`}>
        {suggestion && <KeyButton k="⏎" label="Confirmar" tone="core" onClick={props.onConfirm} />}
        <KeyButton k="↑" label="Subir" onClick={props.onUp} disabled={layer === 1} />
        <KeyButton k="↓" label="Bajar" onClick={props.onDown} disabled={layer === 3} />
        <KeyButton k="X" label="Sacar" tone="ghost" onClick={props.onOut} />
        <KeyButton label="···" tone="ghost" title="Más opciones" onClick={props.onMenu} />
      </div>
      {props.menuOpen && (
        <ul role="menu" aria-label={`Opciones de ${piece.name}`} className="absolute bottom-2 right-2 z-20 m-0 flex w-[200px] list-none flex-col border-2 border-bone bg-void p-1">
          {(
            [
              ['merge', 'Unir con…'],
              ['split', 'Separar (la IA propone)'],
              ['rename', 'Renombrar'],
              ['crop', 'Recortar de nuevo'],
            ] as [MenuAction, string][]
          ).map(([a, label]) => (
            <li key={a} role="none">
              <button
                type="button"
                role="menuitem"
                autoFocus={a === 'merge'}
                onClick={e => {
                  e.stopPropagation();
                  props.onAction(a);
                }}
                className="type-label w-full px-2 py-2 text-left text-[12px] hover:bg-bone hover:text-void focus:bg-bone focus:text-void"
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
