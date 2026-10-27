import React, { useEffect, useState } from 'react';
import { CornerUpLeft, Expand, ScanSearch, Trash2 } from 'lucide-react';
import { CropBox, Reference } from '../../types';
import { Button, ErrorState, LoadingState, TextArea, TextInput } from '../ui';
import { PartDraft, PartProposal, partKindInfo } from '../../utils/parts';
import { PartsPicker, PickerBox } from './PartsPicker';
import { PartsSection } from './PartsSection';

interface ReferenceInspectorProps {
  reference: Reference;
  /** Cantidad de patrones que usan esta referencia como evidencia. */
  evidenceCount: number;
  inspecting: boolean;
  inspectError?: string | null;
  onUpdate: (updates: Partial<Reference>) => void;
  onInspect: () => void;
  onOpenLightbox: () => void;
  onDelete: () => void;
  /** Partes recortadas de esta referencia. */
  parts: Reference[];
  /** Si esta referencia es una parte: la original. */
  parent: Reference | null;
  partDraft?: PartDraft;
  onDetectParts: () => void;
  onPartDraftChange: (d: PartDraft | null) => void;
  onAddParts: (proposals: PartProposal[]) => void;
  onSelectReference: (id: string) => void;
}

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 text-13">
    <dt className="text-ink-2">{label}</dt>
    <dd className="m-0 text-ink">{children}</dd>
  </div>
);

export function ReferenceInspector(props: ReferenceInspectorProps) {
  const { reference: r, evidenceCount, inspecting, inspectError, onUpdate, onInspect, onOpenLightbox, onDelete, parts, parent, partDraft } = props;
  const [name, setName] = useState(r.name);
  const [notes, setNotes] = useState(r.notes ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setName(r.name);
    setNotes(r.notes ?? '');
    setConfirmDelete(false);
  }, [r.id, r.name, r.notes]);

  const commitName = () => {
    const v = name.trim();
    if (!v) setName(r.name);
    else if (v !== r.name) onUpdate({ name: v });
  };
  const commitNotes = () => {
    if (notes.trim() !== (r.notes ?? '')) onUpdate({ notes: notes.trim() });
  };

  const b = r.breakdown;
  const review = partDraft?.status === 'review' ? partDraft.proposals : null;
  const addManual = (box: CropBox) =>
    review &&
    props.onPartDraftChange({
      status: 'review',
      proposals: [...review, { key: `m${Date.now().toString(36)}`, kind: 'other', label: 'Parte marcada', box, source: 'manual', selected: true }],
    });
  const partBoxes: PickerBox[] = parts
    .filter(p => p.crop)
    .map(p => ({ key: p.id, box: p.crop!, kind: p.partKind ?? 'other', badge: p.id.replace(r.id, ''), active: true, label: `${p.name} (${p.id})` }));

  return (
    <div className="flex flex-col">
      {review ? (
        <div className="sticky top-0 z-10 border-b border-line bg-bg">
        <PartsPicker
          image={r.image}
          alt={`${r.name}: marcá las partes`}
          boxes={review.map((p, i) => ({ key: p.key, box: p.box, kind: p.kind, badge: String(i + 1), active: p.selected, label: p.label }))}
          onDraw={addManual}
          onBoxClick={key => props.onPartDraftChange({ status: 'review', proposals: review.map(p => (p.key === key ? { ...p, selected: !p.selected } : p)) })}
          compact
        />
        </div>
      ) : parts.length ? (
        <PartsPicker image={r.image} alt={r.name} boxes={partBoxes} onBoxClick={props.onSelectReference} />
      ) : (
        <img src={r.image} alt={r.name} className="block max-h-[320px] w-full bg-bg object-contain" referrerPolicy="no-referrer" />
      )}

      {parent && (
        <div className="flex items-center gap-3 border-b border-line px-5 py-3">
          <img src={parent.image} alt="" className="size-10 shrink-0 rounded-[4px] bg-raised object-cover" referrerPolicy="no-referrer" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-mono text-xs" style={{ color: partKindInfo(r.partKind).family.ink }}>
              {partKindInfo(r.partKind).label} · de {parent.id}
            </span>
            <span className="truncate text-13 text-ink">{parent.name}</span>
          </div>
          <Button size="sm" variant="ghost" icon={<CornerUpLeft />} onClick={() => props.onSelectReference(parent.id)}>
            Original
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-5 p-5">
        <TextInput
          label="Nombre"
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={e => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              e.preventDefault();
              setName(r.name);
            }
          }}
        />
        <TextArea label="Notas" optional rows={3} className="font-serif text-15" value={notes} onChange={e => setNotes(e.target.value)} onBlur={commitNotes} />
        {r.tags && r.tags.length > 0 && (
          <ul className="m-0 flex list-none flex-wrap gap-1 p-0" aria-label="Etiquetas">
            {r.tags.map((t, i) => (
              <li key={`${t}-${i}`} className="rounded-full border border-line-mid px-2 text-xs text-ink-2">
                {t}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon={<Expand />} onClick={onOpenLightbox}>
            Lightbox
          </Button>
          {!confirmDelete && (
            <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => setConfirmDelete(true)}>
              Eliminar
            </Button>
          )}
        </div>
        {confirmDelete && (
          <div role="alert" className="flex flex-col gap-3 rounded-card border border-discarded/35 bg-discarded/5 p-4">
            <span className="text-13 text-ink">
              ¿Eliminar {r.id} del corpus?
              {parts.length > 0 && ` También se eliminan sus ${parts.length} ${parts.length === 1 ? 'parte' : 'partes'}.`}
              {evidenceCount > 0 && ` Sale de la evidencia de ${evidenceCount} ${evidenceCount === 1 ? 'patrón' : 'patrones'}.`}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="discard" onClick={onDelete} autoFocus>
                Eliminar referencia
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>

      {!parent && (
        <PartsSection
          reference={r}
          parts={parts}
          draft={partDraft}
          onDetect={props.onDetectParts}
          onDraftChange={props.onPartDraftChange}
          onConfirm={props.onAddParts}
          onSelectPart={props.onSelectReference}
        />
      )}

      {/* Desglose */}
      <section aria-labelledby={`bd-${r.id}`} className="flex flex-col gap-4 border-t border-line p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 id={`bd-${r.id}`} className="m-0 text-13 font-medium text-ink">
            Desglose
          </h3>
          {b && !inspecting && <span className="font-mono text-xs text-ink-2">{new Date(b.analyzedAt).toLocaleDateString('es-AR')}</span>}
        </div>

        {inspecting ? (
          <LoadingState
            meta="DESGLOSE · GEMINI"
            title={`Leyendo ${r.id}`}
            steps={[
              { label: 'color', state: 'current' },
              { label: 'tipografía', state: 'todo' },
              { label: 'textura', state: 'todo' },
              { label: 'composición', state: 'todo' },
            ]}
            note="Lectura en curso: los pasos son orientativos, no una medición."
            className="min-h-0"
          />
        ) : inspectError ? (
          <ErrorState code="DESGLOSE" title="No se pudo desglosar la referencia" body="El resto del proyecto no se modificó." detail={inspectError} onRetry={onInspect} className="min-h-0" />
        ) : !b ? (
          <div className="flex flex-col items-start gap-3">
            <p className="m-0 text-13 text-ink-2">Gemini describe color, tipografía, textura, composición y recursos gráficos de esta imagen.</p>
            <Button size="sm" variant="secondary" icon={<ScanSearch />} onClick={onInspect}>
              Desglosar con IA
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {b.colors?.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-xs text-ink-2">Colores</span>
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {b.colors.map((c, i) => (
                    <li key={`${c.hex}-${i}`} className="flex items-center gap-3">
                      <span className="size-6 shrink-0 rounded-tag border border-line" style={{ background: c.hex }} />
                      <span className="w-[72px] shrink-0 font-mono text-xs text-ink">{c.hex.toUpperCase()}</span>
                      <span className="min-w-0 flex-1 truncate text-13 text-ink-2">{c.name}</span>
                      {c.percentage && <span className="font-mono text-xs text-ink-2">{c.percentage}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <dl className="m-0 flex flex-col gap-3">
              <Row label="Tipografía">
                {b.typography?.hasText ? `${b.typography.familyStyle} · ${b.typography.treatment}` : 'Sin texto'}
              </Row>
              <Row label="Textura">
                {b.texture?.type} · {b.texture?.intensity}
              </Row>
              <Row label="Composición">
                {b.composition?.spatialDistribution} · espacio {b.composition?.negativeSpace} · contraste {b.composition?.contrastLevel}
              </Row>
              {b.photoTreatment && <Row label="Imagen">{b.photoTreatment}</Row>}
              {b.graphicResources?.length > 0 && <Row label="Recursos">{b.graphicResources.join(' · ')}</Row>}
              {b.formsAndGeometry?.length > 0 && <Row label="Geometría">{b.formsAndGeometry.join(' · ')}</Row>}
            </dl>
            {b.observableSummary && <p className="m-0 font-serif text-15 text-ink-2">{b.observableSummary}</p>}
            <Button size="sm" variant="ghost" onClick={onInspect} className="self-start">
              Volver a desglosar
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
