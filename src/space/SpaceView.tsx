import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Project, Reference } from '../types';
import { useShortcuts } from '../hooks/useAuditShortcuts';
import { Shortcut, ShortcutBar } from '../components/shell/ShortcutBar';
import { corpusRefs, layerInfo, layerTag } from '../utils/layers';
import { STOPS, Stop, clampT, stopIndex } from './geometry';
import { StackScene } from './StackScene';
import { SceneItem, stopItems, stopOf } from './items';
import { ActionResult, FragmentProposal, acceptProposals, addFragments, discard, groupFragments, groupToPattern, layerOf, proposalFor, setLayer, stepLayer } from './actions';
import { BREAKDOWN_SHORTCUTS, Breakdown, BreakdownState, proposalsFromParts } from './Breakdown';
import { BriefPanel, IntentBlock } from './ArmarHud';

interface SpaceViewProps {
  project: Project;
  enabled: boolean;
  /** Mensaje breve de la app (toast), como franja sobre la barra de atajos. */
  notice?: { text: string; tag?: string } | null;
  /** Aplica una acción de la pila (con su bitácora y su aviso). */
  apply: (fn: (p: Project) => ActionResult) => ActionResult;
  onAddFiles: (files: File[]) => void;
  onSubmitIntent: (intent: string) => void;
  briefBusy: boolean;
  briefError?: string | null;
  onSaveBrief: (text: string) => void;
  /** Pide a la IA los recortes de una referencia (/api/segment-reference). */
  segment: (ref: Reference) => Promise<any[]>;
}

const stopName = (s: Stop) => (s === 'corpus' ? 'CORPUS' : layerTag(s));

function describe(item: SceneItem | undefined) {
  if (!item) return '';
  if (item.kind === 'ref') return `Referencia ${item.ref.name}`;
  if (item.kind === 'fragment') return `Fragmento ${item.fragment.label}`;
  return `${item.pattern.isGroup ? 'Grupo' : 'Patrón'} ${item.pattern.name}${item.pattern.audited ? '' : ', sin auditar'}`;
}

/**
 * Vista espacial: la pila de láminas y el momento 01 · Armar.
 * Rueda y W/S mueven la cámara; ← / → eligen; ↑ / ↓ cambian de lámina; D, G, P, X, ⏎ y Esc.
 */
export function SpaceView(props: SpaceViewProps) {
  const { project, enabled, apply } = props;
  const [t, setT] = useState(1);
  const [scrubbing, setScrubbing] = useState(false);
  const [selection, setSelection] = useState<string[]>([]);
  const [naming, setNaming] = useState<{ groupId: string; value: string } | null>(null);
  const [breakdown, setBreakdown] = useState<{ ref: Reference; state: BreakdownState } | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const snapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active = STOPS[Math.round(t)];
  const items = stopItems(project, active);
  const primary = selection[selection.length - 1] ?? null;
  const empty = corpusRefs(project).length === 0;

  // Lo que desaparece (se borró o se agrupó) sale de la selección.
  useEffect(() => {
    const alive = selection.filter(id => stopOf(project, id));
    if (alive.length !== selection.length) setSelection(alive);
  }, [project, selection]);

  const goStop = useCallback((s: Stop) => {
    setScrubbing(false);
    setT(stopIndex(s));
  }, []);

  /** Rueda / trackpad: movimiento continuo; al soltar se imanta a la lámina más cercana. */
  const onWheelDepth = useCallback((dy: number) => {
    setScrubbing(true);
    setT(v => clampT(v + dy / 700));
    if (snapTimer.current) clearTimeout(snapTimer.current);
    snapTimer.current = setTimeout(() => {
      setScrubbing(false);
      setT(v => Math.round(v));
    }, 180);
  }, []);
  useEffect(() => () => void (snapTimer.current && clearTimeout(snapTimer.current)), []);

  /** ← / →: elegir. Con Shift, suma a la selección (para agrupar). */
  const step = (dir: 1 | -1, additive: boolean) => {
    if (!items.length) return;
    const i = items.findIndex(x => x.id === primary);
    const next = items[i === -1 ? (dir === 1 ? 0 : items.length - 1) : (i + dir + items.length) % items.length];
    setSelection(sel => (additive ? [...sel.filter(id => id !== next.id), next.id] : [next.id]));
  };

  const movable = selection.filter(id => layerOf(project, id) !== undefined);

  /** ↑ / ↓: la selección cambia de lámina y la cámara la sigue. */
  const moveLayer = (dir: 1 | -1) => {
    if (!movable.length) return false;
    const from = layerOf(project, movable[movable.length - 1]) ?? null;
    const to = stepLayer(from, dir);
    if (to === from) return;
    apply(p => setLayer(p, movable, to));
    goStop(to ?? 'corpus');
  };

  const selectedGroup = primary ? project.patterns.find(x => x.id === primary && x.isGroup) : undefined;
  const selectedRef = primary && active === 'corpus' ? corpusRefs(project).find(r => r.id === primary) : undefined;
  const fragOrGroupSel = selection.filter(id => project.fragments?.some(f => f.id === id) || project.patterns.some(x => x.id === id && x.isGroup));
  const acceptable = (selection.length ? selection : stopItems(project, 'corpus').map(x => x.id)).filter(id => layerOf(project, id) === null && proposalFor(project, id));

  /* ---------- Desglose (D) ---------- */
  const openBreakdown = async (ref: Reference) => {
    setBreakdown({ ref, state: { status: 'loading' } });
    try {
      const parts = await props.segment(ref);
      setBreakdown(b => (b?.ref.id === ref.id ? { ref, state: { status: 'review', proposals: proposalsFromParts(parts) } } : b));
    } catch (err: any) {
      setBreakdown(b => (b?.ref.id === ref.id ? { ref, state: { status: 'error', message: err?.message || String(err) } } : b));
    }
  };
  const acceptBreakdown = (proposals: FragmentProposal[]) => {
    if (!breakdown) return;
    const r = apply(p => addFragments(p, breakdown.ref.id, proposals));
    setBreakdown(null);
    const ids = (r as ActionResult & { ids?: string[] }).ids ?? [];
    if (ids.length) setSelection([ids[0]]);
  };

  useShortcuts(enabled && !breakdown && !naming && !briefOpen, {
    // W avanza hacia el fondo (hacia el corpus); S vuelve hacia el núcleo.
    w: () => goStop(STOPS[Math.min(STOPS.length - 1, Math.round(t) + 1)]),
    s: () => goStop(STOPS[Math.max(0, Math.round(t) - 1)]),
    arrowleft: e => step(-1, e.shiftKey),
    arrowright: e => step(1, e.shiftKey),
    arrowup: () => moveLayer(1),
    arrowdown: () => moveLayer(-1),
    d: () => (selectedRef ? void openBreakdown(selectedRef) : false),
    g: () => {
      if (!fragOrGroupSel.length) return false;
      const r = apply(p => groupFragments(p, fragOrGroupSel));
      const gid = (r as ActionResult & { groupId?: string }).groupId;
      if (gid) setSelection([gid]);
    },
    p: () => (selectedGroup ? setNaming({ groupId: selectedGroup.id, value: '' }) : false),
    x: () => {
      if (!primary || project.references.some(r => r.id === primary)) return false;
      apply(p => discard(p, primary));
      setSelection(sel => sel.filter(id => id !== primary));
    },
    enter: () => (acceptable.length ? void apply(p => acceptProposals(p, acceptable)) : false),
    escape: () => (selection.length ? setSelection([]) : false),
  });

  // ⌘V: pegar imágenes al corpus.
  useEffect(() => {
    if (!enabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter(f => f.type.startsWith('image/'));
      if (!files.length) return;
      e.preventDefault();
      props.onAddFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [enabled, props.onAddFiles]);

  /* ---------- Barra de atajos ---------- */
  let shortcuts: Shortcut[];
  if (breakdown) shortcuts = BREAKDOWN_SHORTCUTS;
  else if (naming) shortcuts = [{ keys: '⏎', label: 'Crear patrón' }, { keys: 'ESC', label: 'Cancelar' }];
  else if (empty) shortcuts = [{ keys: '⏎', label: 'Continuar' }, { keys: '⌘V', label: 'Pegar imágenes' }, { keys: 'RUEDA', label: 'Z' }];
  else {
    shortcuts = [
      { keys: 'RUEDA', label: 'Z' },
      { keys: 'W S', label: 'Lámina' },
      { keys: '←→', label: active === 'corpus' ? 'Elegir' : 'Fragmento' },
    ];
    if (selectedRef) shortcuts.push({ keys: 'D', label: 'Desglosar' });
    if (movable.length) shortcuts.push({ keys: '↑↓', label: 'Lámina' });
    if (fragOrGroupSel.length) shortcuts.push({ keys: '⇧←→', label: 'Sumar' }, { keys: 'G', label: 'Agrupar' });
    if (selectedGroup) shortcuts.push({ keys: 'P', label: 'Patrón' });
    if (acceptable.length) shortcuts.push({ keys: '⏎', label: acceptable.length > 1 ? `Aceptar ${acceptable.length} propuestas` : 'Aceptar propuesta' });
    if (primary && !selectedRef) shortcuts.push({ keys: 'X', label: 'Descartar' });
    if (selection.length) shortcuts.push({ keys: 'ESC', label: 'Soltar' });
    if (!selection.length) shortcuts.push({ keys: '⌘V', label: 'Pegar imágenes' });
  }

  const selectedItem = items.find(x => x.id === primary);

  return (
    <div
      className="relative flex h-full flex-col"
      onDragOver={e => {
        if (!Array.from(e.dataTransfer.types).includes('Files')) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
      }}
      onDrop={e => {
        setDragOver(false);
        const files = Array.from(e.dataTransfer.files || []).filter(f => f.type.startsWith('image/'));
        if (!files.length) return;
        e.preventDefault();
        props.onAddFiles(files);
        goStop('corpus');
      }}
    >
      <div className="relative min-h-0 flex-1">
        <StackScene
          project={project}
          t={t}
          scrubbing={scrubbing}
          selectedIds={selection}
          onSelect={(id, s, additive) => {
            setSelection(sel => (additive ? (sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]) : [id]));
            goStop(s);
          }}
          onFocusStop={goStop}
          onWheelDepth={onWheelDepth}
          overview={empty}
        />

        {/* 01 · Armar: la frase de intención (estado vacío completo o rótulo compacto). */}
        <div className="pointer-events-none absolute left-12 top-8 z-10">
          <IntentBlock
            intent={project.intent ?? ''}
            compact={!empty}
            busy={props.briefBusy}
            error={props.briefError}
            onSubmit={props.onSubmitIntent}
            onPickFiles={props.onAddFiles}
            onOpenBrief={() => setBriefOpen(true)}
            hasBrief={!!project.brief?.trim()}
          />
        </div>
        {briefOpen && <BriefPanel brief={project.brief ?? ''} onSave={props.onSaveBrief} onClose={() => setBriefOpen(false)} />}

        {/* Indicador de profundidad: dónde está la cámara. */}
        <nav aria-label="Profundidad" className="absolute right-5 top-1/2 z-10 flex -translate-y-1/2 flex-col items-end gap-2">
          {STOPS.map(s => {
            const on = s === active;
            const cls = s === 'corpus' ? '' : layerInfo(s).className;
            return (
              <button
                key={String(s)}
                type="button"
                aria-current={on ? 'location' : undefined}
                onClick={() => goStop(s)}
                className={`${cls} type-label px-2 py-[3px] text-[12px] transition-colors duration-120`}
                style={
                  on
                    ? { background: 'var(--layer-color, var(--color-bone))', color: 'var(--layer-ink, var(--color-void))' }
                    : { boxShadow: 'inset 0 0 0 2px color-mix(in oklab, var(--layer-color, var(--color-bone)) 45%, transparent)', color: 'var(--color-ink-2)' }
                }
              >
                {stopName(s)}
              </button>
            );
          })}
        </nav>

        {/* P: nombrar el patrón */}
        {naming && (
          <div className="absolute bottom-6 left-12 z-20 flex w-[520px] flex-col gap-2 border-2 border-core bg-void p-4">
            <span className="layer-tag layer-1 self-start">NOMBRE DEL PATRÓN</span>
            <input
              autoFocus
              aria-label="Nombre del patrón"
              placeholder="CRUDO ARTESANAL"
              value={naming.value}
              onChange={e => setNaming({ ...naming, value: e.target.value })}
              onKeyDown={e => {
                if (e.key === 'Enter' && naming.value.trim()) {
                  apply(p => groupToPattern(p, naming.groupId, naming.value));
                  setNaming(null);
                }
                if (e.key === 'Escape') setNaming(null);
              }}
              className="type-name w-full border-b-4 border-bone bg-transparent pb-1 text-[40px] text-ink outline-none placeholder:text-ink-3"
            />
            <span className="text-[13px] text-ink-2">La IA va a usar este grupo como definición para buscarlo en el resto del corpus.</span>
          </div>
        )}

        {dragOver && (
          <div className="pointer-events-none absolute inset-4 z-30 flex items-end justify-center border-2 border-dashed border-bone pb-10">
            <span className="type-name bg-void px-3 text-[28px]">SOLTÁ · CAEN AL CORPUS</span>
          </div>
        )}

        {breakdown && (
          <Breakdown
            reference={breakdown.ref}
            position={`${String(corpusRefs(project).findIndex(r => r.id === breakdown.ref.id) + 1).padStart(2, '0')}/${corpusRefs(project).length}`}
            state={breakdown.state}
            onChange={proposals => setBreakdown(b => (b ? { ...b, state: { status: 'review', proposals } } : b))}
            onAccept={acceptBreakdown}
            onCancel={() => setBreakdown(null)}
            onRetry={() => openBreakdown(breakdown.ref)}
          />
        )}

        <p className="sr-only" aria-live="polite">
          {stopName(active)}
          {selectedItem ? ` · ${describe(selectedItem)} · ${items.indexOf(selectedItem) + 1} de ${items.length}` : ` · ${items.length} elementos`}
          {selection.length > 1 ? ` · ${selection.length} seleccionados` : ''}
        </p>
      </div>

      {props.notice && (
        <div className="no-print mx-3 mb-2 flex h-[38px] shrink-0 items-center gap-3 border-t-2 border-bone bg-void px-5" role="status">
          <span className="layer-tag">{props.notice.tag ?? 'AVISO'}</span>
          <span className="truncate text-[14px]">{props.notice.text}</span>
        </div>
      )}
      <ShortcutBar items={shortcuts} />
    </div>
  );
}
