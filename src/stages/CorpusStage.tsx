import React, { useEffect, useRef } from 'react';
import { Project, RefGroup, Reference } from '../types';
import { GroupInspector } from '../components/corpus/GroupInspector';
import { GroupDrop } from '../components/canvas/ReferenceCanvas';
import { Button, EmptyState, ErrorState, LoadingState, LoadingStep } from '../components/ui';
import { CanvasArea, CorpusView } from '../components/canvas/CanvasArea';
import { CanvasHandle } from '../components/canvas/ReferenceCanvas';
import { DockPanel } from '../components/shell/DockPanel';
import { ReferenceInspector } from '../components/corpus/ReferenceInspector';
import { MIN_REFERENCES } from '../utils/stages';
import { PartDraft, PartProposal, partsOf } from '../utils/parts';

export interface InductionState {
  status: 'idle' | 'running' | 'error';
  /** Índice de la ficha "en lectura" en el ciclo visual. */
  tick: number;
  error?: { title: string; detail?: string; code?: string };
}

const CATEGORIES = ['color', 'tipografía', 'textura', 'composición', 'recursos gráficos'];

interface CorpusStageProps {
  project: Project;
  view: CorpusView;
  onViewChange: (v: CorpusView) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAdd: () => void;
  onMove: (id: string, pos: { x: number; y: number }) => void;
  onResize: (id: string, width: number) => void;
  onAddFiles: (files: File[], at?: { x: number; y: number }) => void;
  onUpdateReference: (id: string, updates: Partial<Reference>) => void;
  onDeleteReference: (id: string) => void;
  onInspect: (r: Reference, force?: boolean) => void;
  onOpenLightbox: (r: Reference) => void;
  inspectingIds: string[];
  inspectErrors: Record<string, string>;
  partDrafts: Record<string, PartDraft>;
  onDetectParts: (r: Reference) => void;
  onPartDraftChange: (id: string, d: PartDraft | null) => void;
  onAddParts: (parentId: string, proposals: PartProposal[]) => Promise<string[]>;
  selectedGroupId: string | null;
  onSelectGroup: (id: string | null) => void;
  onGroupDrop: (d: GroupDrop) => void;
  onAssignGroup: (refId: string, groupId: string | 'new') => void;
  onRemoveFromGroup: (refId: string) => void;
  onUpdateGroup: (id: string, updates: Partial<RefGroup>) => void;
  onUngroup: (id: string) => void;
  onReadGroup: (id: string) => void;
  groupReads: Record<string, { status: 'loading' } | { status: 'error'; message: string }>;
  induction: InductionState;
  onRetryInduction: () => void;
  onDismissInductionError: () => void;
}

export function CorpusStage(props: CorpusStageProps) {
  const { project, induction } = props;
  const refs = project.references;
  const canvasRef = useRef<CanvasHandle>(null);
  const running = induction.status === 'running';
  const selected = refs.find(r => r.id === props.selectedId) ?? null;
  const groups = project.groups ?? [];
  const selectedGroup = !selected ? groups.find(g => g.id === props.selectedGroupId) ?? null : null;

  // Pegar imágenes desde el portapapeles (Ctrl/Cmd + V) en el centro visible del lienzo.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (running) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const files: File[] = [];
      const items = e.clipboardData?.items;
      if (items) for (const it of Array.from(items)) if (it.type.startsWith('image/')) { const f = it.getAsFile(); if (f) files.push(f); }
      if (!files.length && e.clipboardData?.files) files.push(...Array.from(e.clipboardData.files).filter(f => f.type.startsWith('image/')));
      if (!files.length) return;
      e.preventDefault();
      props.onAddFiles(files, canvasRef.current?.getViewCenter());
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [running, props.onAddFiles]);

  const reading = running && refs.length ? refs[induction.tick % refs.length] : null;
  const stepIdx = induction.tick % CATEGORIES.length;
  const steps: LoadingStep[] = CATEGORIES.map((label, i) => ({ label, state: i < stepIdx ? 'done' : i === stepIdx ? 'current' : 'todo' }));
  const newCount = refs.filter(r => r.isNew).length;

  const empty = (
    <EmptyState
      meta="0 referencias"
      title="Soltá imágenes acá"
      body={`Se necesitan al menos ${MIN_REFERENCES} referencias para inducir patrones.`}
      action={
        <Button size="sm" variant="secondary" onClick={props.onAdd}>
          Elegir archivos
        </Button>
      }
    />
  );

  const evidenceCount = selected ? project.patterns.filter(p => p.evidence.includes(selected.id)).length : 0;
  // Al abrir un grupo, encuadrarlo para que se vea el marco completo con su etiqueta.
  const groupKey = selectedGroup ? `${selectedGroup.id}` : '';
  useEffect(() => {
    if (selectedGroup) setTimeout(() => canvasRef.current?.fitTo(selectedGroup.refIds), 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKey]);

  const dockOpen = running || induction.status === 'error' || !!selected || !!selectedGroup;

  let dockTitle = selected?.name ?? '';
  let dockMeta: React.ReactNode = selected ? `${selected.parentId ? 'Parte' : 'Referencia'} · ${selected.id}` : undefined;
  if (selectedGroup) {
    dockTitle = selectedGroup.name;
    dockMeta = `Grupo · ${selectedGroup.refIds.length} ${selectedGroup.refIds.length === 1 ? 'referencia' : 'referencias'}`;
  }
  if (running) {
    dockTitle = 'Inducción en curso';
    dockMeta = '03 · Inducción';
  } else if (induction.status === 'error') {
    dockTitle = 'La inducción no terminó';
    dockMeta = '03 · Inducción';
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="relative min-w-0 flex-1">
        <CanvasArea
          canvasRef={canvasRef}
          references={refs}
          view={props.view}
          onViewChange={props.onViewChange}
          selectedId={running ? null : props.selectedId}
          onSelect={id => !running && props.onSelect(id)}
          onAdd={props.onAdd}
          onMove={props.onMove}
          onResize={props.onResize}
          onDropFiles={running ? undefined : props.onAddFiles}
          readingId={reading?.id ?? null}
          dimAll={running ? 0.4 : undefined}
          locked={running}
          analysisFor={r =>
            r.isNew
              ? { tone: 'pending', label: project.patterns.length ? 'Nueva: todavía no se indujo' : 'Sin inducir' }
              : project.patterns.length
                ? { tone: 'confirmed', label: 'Incluida en la última inducción' }
                : null
          }
          emptyState={empty}
          groups={groups}
          selectedGroupId={props.selectedGroupId}
          onSelectGroup={id => !running && props.onSelectGroup(id)}
          onGroupDrop={running ? undefined : props.onGroupDrop}
        />
      </div>

      <DockPanel
        open={dockOpen}
        title={dockTitle}
        meta={dockMeta}
        onClose={() => {
          if (induction.status === 'error') props.onDismissInductionError();
          else if (!running) {
            props.onSelect(null);
            props.onSelectGroup(null);
          }
        }}
      >
        {running ? (
          <div className="p-5">
            <LoadingState
              meta={`INDUCCIÓN · ${(induction.tick % refs.length) + 1} / ${refs.length}`}
              title={reading ? `Leyendo ${reading.id}` : 'Leyendo el corpus'}
              progress={((induction.tick % refs.length) + 1) / refs.length}
              steps={steps}
              note={`Gemini lee las ${refs.length} referencias en una sola consulta${newCount ? ` (${newCount} nuevas)` : ''}. El recorrido es visual: no mide el avance real.`}
            />
            {reading && <p className="m-0 mt-4 text-13 text-ink-2">{reading.name}</p>}
          </div>
        ) : induction.status === 'error' && induction.error ? (
          <div className="p-5">
            <ErrorState
              code={induction.error.code ?? 'ERROR'}
              title={induction.error.title}
              body="Tus referencias y decisiones están guardadas."
              detail={induction.error.detail}
              onRetry={props.onRetryInduction}
            />
          </div>
        ) : selected ? (
          <ReferenceInspector
            reference={selected}
            evidenceCount={evidenceCount}
            inspecting={props.inspectingIds.includes(selected.id)}
            inspectError={props.inspectErrors[selected.id]}
            onUpdate={u => props.onUpdateReference(selected.id, u)}
            onInspect={() => props.onInspect(selected, !!selected.breakdown)}
            onOpenLightbox={() => props.onOpenLightbox(selected)}
            onDelete={() => props.onDeleteReference(selected.id)}
            parts={partsOf(refs, selected.id)}
            parent={selected.parentId ? refs.find(r => r.id === selected.parentId) ?? null : null}
            partDraft={props.partDrafts[selected.id]}
            onDetectParts={() => props.onDetectParts(selected)}
            onPartDraftChange={d => props.onPartDraftChange(selected.id, d)}
            onAddParts={async proposals => {
              const ids = await props.onAddParts(selected.id, proposals);
              // Encuadrar la original con sus partes nuevas.
              if (ids.length) setTimeout(() => canvasRef.current?.fitTo([selected.id, ...ids]), 80);
            }}
            onSelectReference={id => {
              props.onSelect(id);
              canvasRef.current?.focusReference(id, { focus: false });
            }}
            groups={groups}
            onAssignGroup={g => props.onAssignGroup(selected.id, g)}
            onRemoveFromGroup={() => props.onRemoveFromGroup(selected.id)}
            onSelectGroup={props.onSelectGroup}
          />
        ) : selectedGroup ? (
          <GroupInspector
            group={selectedGroup}
            members={selectedGroup.refIds.map(id => refs.find(r => r.id === id)).filter(Boolean) as Reference[]}
            read={props.groupReads[selectedGroup.id]}
            onUpdate={u => props.onUpdateGroup(selectedGroup.id, u)}
            onRead={() => props.onReadGroup(selectedGroup.id)}
            onRemoveMember={id => props.onRemoveFromGroup(id)}
            onSelectReference={id => {
              props.onSelect(id);
              canvasRef.current?.focusReference(id, { focus: false });
            }}
            onUngroup={() => props.onUngroup(selectedGroup.id)}
          />
        ) : null}
      </DockPanel>
    </div>
  );
}
