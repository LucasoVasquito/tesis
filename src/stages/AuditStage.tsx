import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, PanelRightOpen, Plus } from 'lucide-react';
import { Pattern, PatternStatus, Project, Reference } from '../types';
import { Button, EmptyState, IconButton, PatternCard, PatternCardMode } from '../components/ui';
import { CanvasArea, CorpusView } from '../components/canvas/CanvasArea';
import { CanvasHandle } from '../components/canvas/ReferenceCanvas';
import { DockPanel } from '../components/shell/DockPanel';
import { useAuditShortcuts } from '../hooks/useAuditShortcuts';

export type AuditFilter = 'pending' | 'all' | 'confirmed' | 'discarded';

export const AUDIT_FILTERS: { id: AuditFilter; label: string; status?: PatternStatus }[] = [
  { id: 'pending', label: 'Pendientes', status: 'detected' },
  { id: 'all', label: 'Todos' },
  { id: 'confirmed', label: 'Confirmados', status: 'confirmed' },
  { id: 'discarded', label: 'Descartados', status: 'discarded' },
];

export function filterPatterns(patterns: Pattern[], f: AuditFilter) {
  const status = AUDIT_FILTERS.find(x => x.id === f)?.status;
  return status ? patterns.filter(p => p.status === status) : patterns;
}

interface AuditStageProps {
  project: Project;
  filter: AuditFilter;
  onFilterChange: (f: AuditFilter) => void;
  index: number;
  onIndexChange: (i: number) => void;
  onConfirm: (p: Pattern) => void;
  onDiscard: (p: Pattern, reason: string) => void;
  onSaveNote: (p: Pattern, note: string) => void;
  onRestore: (p: Pattern) => void;
  onNewPattern: () => void;
  onEditPattern: (p: Pattern) => void;
  onOpenReference: (r: Reference) => void;
  view: CorpusView;
  onViewChange: (v: CorpusView) => void;
}

export function AuditStage(props: AuditStageProps) {
  const { project, filter, index } = props;
  const list = filterPatterns(project.patterns, filter);
  const safeIndex = Math.min(Math.max(index, 0), Math.max(list.length - 1, 0));
  const current = list[safeIndex] ?? null;
  const [mode, setMode] = useState<PatternCardMode>('idle');
  const [dockOpen, setDockOpen] = useState(true);
  const canvasRef = useRef<CanvasHandle>(null);

  useEffect(() => setMode('idle'), [current?.id]);
  useEffect(() => {
    if (index !== safeIndex) props.onIndexChange(safeIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, safeIndex]);

  const prev = () => list.length && props.onIndexChange((safeIndex - 1 + list.length) % list.length);
  const next = () => list.length && props.onIndexChange((safeIndex + 1) % list.length);

  useAuditShortcuts({
    enabled: dockOpen,
    current,
    mode,
    setMode,
    prev,
    next,
    confirm: () => current && props.onConfirm(current),
  });

  const counts = {
    pending: project.patterns.filter(p => p.status === 'detected').length,
    all: project.patterns.length,
    confirmed: project.patterns.filter(p => p.status === 'confirmed').length,
    discarded: project.patterns.filter(p => p.status === 'discarded').length,
  };

  const nav = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <IconButton label="Patrón anterior" size="sm" onClick={prev} disabled={list.length < 2}>
          <ChevronLeft className="size-4 stroke-[1.5]" />
        </IconButton>
        <span className="font-mono text-xs text-ink-2" aria-live="polite">
          {list.length ? `${safeIndex + 1} de ${list.length}` : '0 de 0'}
        </span>
        <IconButton label="Patrón siguiente" size="sm" onClick={next} disabled={list.length < 2}>
          <ChevronRight className="size-4 stroke-[1.5]" />
        </IconButton>
      </div>
      <Button size="sm" variant="secondary" icon={<Plus />} onClick={props.onNewPattern} className="self-start">
        Nuevo patrón propio
      </Button>
      <p className="m-0 hidden font-mono text-xs text-ink-2 lg:block" id="audit-keys">
        <kbd className="kbd">C</kbd> confirmar · <kbd className="kbd">D</kbd> descartar · <kbd className="kbd">N</kbd> anotar · <kbd className="kbd">←</kbd>{' '}
        <kbd className="kbd">→</kbd> navegar
      </p>
      <div role="radiogroup" aria-label="Filtrar patrones por estado" className="flex flex-wrap gap-1">
        {AUDIT_FILTERS.map(f => (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={filter === f.id}
            onClick={() => {
              props.onFilterChange(f.id);
              props.onIndexChange(0);
            }}
            className={`btn btn-sm px-2 ${filter === f.id ? 'btn-secondary' : 'btn-ghost'}`}
          >
            {f.label}
            <span className="font-mono text-xs text-ink-2">{counts[f.id]}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const highlight = current && dockOpen ? { ids: current.evidence, label: current.id, dimOthers: 0.3 } : null;

  return (
    <div className="flex h-full min-h-0">
      <div className="relative min-w-0 flex-1">
        <CanvasArea
          canvasRef={canvasRef}
          references={project.references}
          view={props.view}
          onViewChange={props.onViewChange}
          selectedId={null}
          onSelect={id => {
            const r = project.references.find(x => x.id === id);
            if (r) props.onOpenReference(r);
          }}
          highlight={highlight}
          locked
          extraTools={
            !dockOpen ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDockOpen(true)}>
                <PanelRightOpen aria-hidden="true" />
                Mostrar patrón
              </button>
            ) : null
          }
        />
      </div>

      <DockPanel
        open={dockOpen}
        width={420}
        title="Auditoría"
        meta="03 · patrón actual"
        onClose={() => setDockOpen(false)}
        toolbar={nav}
        scrollKey={current?.id}
      >
        <div className="p-3">
          {current ? (
            <PatternCard
              key={current.id}
              pattern={current}
              index={safeIndex}
              total={list.length}
              references={project.references}
              mode={mode}
              onModeChange={setMode}
              onConfirm={() => props.onConfirm(current)}
              onDiscard={reason => {
                setMode('idle');
                props.onDiscard(current, reason);
              }}
              onSaveNote={note => {
                setMode('idle');
                props.onSaveNote(current, note);
              }}
              onRestore={() => props.onRestore(current)}
              onEdit={() => props.onEditPattern(current)}
              onFocusEvidence={id => {
                if (canvasRef.current) canvasRef.current.focusReference(id);
                else {
                  const el = document.getElementById(`ref-card-${id}`);
                  el?.scrollIntoView({ block: 'center' });
                  el?.focus({ preventScroll: true });
                }
              }}
            />
          ) : (
            <EmptyState
              meta={filter === 'pending' ? '0 pendientes' : '0 patrones'}
              title={filter === 'pending' ? 'Juzgaste todos los hallazgos' : 'No hay patrones con este estado'}
              body={filter === 'pending' ? 'Podés revisar los confirmados y descartados, o pasar a síntesis.' : 'Probá con otro filtro.'}
            />
          )}
        </div>
      </DockPanel>
    </div>
  );
}
