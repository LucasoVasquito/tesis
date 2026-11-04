import React from 'react';
import { ImagePlus } from 'lucide-react';
import { RefGroup, Reference } from '../../types';
import { Tone } from '../ui';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { CanvasHandle, CanvasHighlight, GroupDrop, ReferenceCanvas } from './ReferenceCanvas';
import { ReferenceList } from './ReferenceList';

export type CorpusView = 'canvas' | 'list';

interface CanvasAreaProps {
  references: Reference[];
  view: CorpusView;
  onViewChange: (v: CorpusView) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAdd?: () => void;
  onMove?: (id: string, pos: { x: number; y: number }) => void;
  onResize?: (id: string, width: number) => void;
  onDropFiles?: (files: File[], at?: { x: number; y: number }) => void;
  highlight?: CanvasHighlight | null;
  readingId?: string | null;
  dimAll?: number;
  analysisFor?: (ref: Reference) => { tone: Tone; label: string } | null;
  locked?: boolean;
  emptyState?: React.ReactNode;
  canvasRef?: React.Ref<CanvasHandle>;
  /** Contenido extra para la barra (p. ej. "Mostrar patrón" en Auditoría). */
  extraTools?: React.ReactNode;
  groups?: RefGroup[];
  selectedGroupId?: string | null;
  onSelectGroup?: (id: string) => void;
  onGroupDrop?: (drop: GroupDrop) => void;
  cardActions?: (r: Reference) => React.ReactNode;
}

/** Lienzo o lista de referencias, con la barra flotante común. En < 1024px siempre es Lista. */
export function CanvasArea(props: CanvasAreaProps) {
  const isDesktop = useIsDesktop();
  const view: CorpusView = isDesktop ? props.view : 'list';

  const toggle = isDesktop ? (
    <div role="group" aria-label="Vista del corpus" className="flex overflow-hidden rounded-ctrl border border-line-mid">
      {(['canvas', 'list'] as CorpusView[]).map(v => (
        <button
          key={v}
          type="button"
          aria-pressed={view === v}
          onClick={() => props.onViewChange(v)}
          className={`h-8 px-3 text-13 font-medium transition-colors duration-120 ease-emergent ${
            view === v ? 'bg-ink text-bg' : 'text-ink-2 hover:bg-white/5 hover:text-ink'
          }`}
        >
          {v === 'canvas' ? 'Lienzo' : 'Lista'}
        </button>
      ))}
    </div>
  ) : null;

  const tools = (
    <>
      {toggle}
      {props.onAdd && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={props.onAdd} disabled={props.locked}>
          <ImagePlus aria-hidden="true" />
          Agregar referencias
        </button>
      )}
      {props.extraTools}
    </>
  );

  if (view === 'list') {
    return (
      <div
        className="relative h-full"
        onDragOver={e => {
          if (props.onDropFiles && Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault();
        }}
        onDrop={e => {
          if (!props.onDropFiles) return;
          e.preventDefault();
          const files = Array.from(e.dataTransfer.files || []);
          if (files.length) props.onDropFiles(files);
        }}
      >
        <div
          className={`absolute left-4 top-4 z-20 flex flex-wrap items-center gap-2 rounded-card border border-line-mid bg-raised p-1 shadow-float ${
            !props.onAdd && !toggle && !props.extraTools ? 'hidden' : ''
          }`}
        >
          {tools}
        </div>
        <ReferenceList
          references={props.references}
          selectedId={props.selectedId}
          onSelect={id => props.onSelect(id)}
          highlight={props.highlight}
          readingId={props.readingId}
          dimAll={props.dimAll}
          analysisFor={props.analysisFor}
          emptyState={props.emptyState}
        />
      </div>
    );
  }

  return (
    <ReferenceCanvas
      ref={props.canvasRef}
      references={props.references}
      selectedId={props.selectedId}
      onSelect={props.onSelect}
      onMove={props.onMove}
      onResize={props.onResize}
      onDropFiles={props.onDropFiles}
      highlight={props.highlight}
      readingId={props.readingId}
      dimAll={props.dimAll}
      analysisFor={props.analysisFor}
      locked={props.locked}
      toolbarStart={tools}
      emptyState={props.emptyState}
      groups={props.groups}
      selectedGroupId={props.selectedGroupId}
      onSelectGroup={props.onSelectGroup}
      onGroupDrop={props.onGroupDrop}
      cardActions={props.cardActions}
    />
  );
}
