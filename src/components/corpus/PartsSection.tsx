import React from 'react';
import { Scissors, SquareDashedMousePointer } from 'lucide-react';
import { PartKind, Reference } from '../../types';
import { PART_KINDS, PartDraft, PartProposal, partKindInfo } from '../../utils/parts';
import { Button, ErrorState, LoadingState } from '../ui';

interface PartsSectionProps {
  reference: Reference;
  parts: Reference[];
  draft?: PartDraft;
  onDetect: () => void;
  onDraftChange: (d: PartDraft | null) => void;
  onConfirm: (proposals: PartProposal[]) => void;
  onSelectPart: (id: string) => void;
}

/** Sección "Partes" del inspector: separar la referencia en fichas propias (tipografía, mascota, logo…). */
export function PartsSection({ reference: r, parts, draft, onDetect, onDraftChange, onConfirm, onSelectPart }: PartsSectionProps) {
  const headingId = `parts-${r.id}`;
  const startManual = () => onDraftChange({ status: 'review', proposals: [] });

  const review = draft?.status === 'review' ? draft.proposals : null;
  const update = (key: string, u: Partial<PartProposal>) =>
    review && onDraftChange({ status: 'review', proposals: review.map(p => (p.key === key ? { ...p, ...u } : p)) });
  const selectedCount = review?.filter(p => p.selected).length ?? 0;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4 border-t border-line p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 id={headingId} className="m-0 text-13 font-medium text-ink">
          Partes
        </h3>
        {parts.length > 0 && !draft && <span className="font-mono text-xs text-ink-2">{parts.length} en el moodboard</span>}
      </div>

      {draft?.status === 'loading' ? (
        <LoadingState
          meta="PARTES · GEMINI"
          title={`Buscando partes en ${r.id}`}
          steps={[
            { label: 'tipografía', state: 'current' },
            { label: 'logo y mascota', state: 'todo' },
            { label: 'recursos', state: 'todo' },
          ]}
          note="Gemini marca dónde está cada parte; el recorte se hace en tu navegador."
          className="min-h-0"
        />
      ) : draft?.status === 'error' ? (
        <div className="flex flex-col gap-3">
          <ErrorState code="PARTES" title="No se pudo separar la referencia" body="Podés reintentar o marcar las partes a mano." detail={draft.message} onRetry={onDetect} className="min-h-0" />
          <Button size="sm" variant="ghost" icon={<SquareDashedMousePointer />} onClick={startManual} className="self-start">
            Marcar a mano
          </Button>
        </div>
      ) : review ? (
        <div className="flex flex-col gap-4">
          <p className="m-0 text-13 text-ink-2">
            {review.length
              ? 'Revisá las partes: destildá las que no sirvan, corregí el nombre o el tipo. Arrastrá sobre la imagen para marcar otra.'
              : 'Arrastrá sobre la imagen para marcar una parte.'}
          </p>
          {review.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {review.map((p, i) => {
                const f = partKindInfo(p.kind).family;
                return (
                  <li
                    key={p.key}
                    className={`grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-ctrl border p-2 transition-opacity duration-120 ${
                      p.selected ? 'border-line-mid' : 'border-line opacity-60'
                    }`}
                  >
                    <label className="flex h-10 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={p.selected}
                        onChange={e => update(p.key, { selected: e.target.checked })}
                        className="size-4 accent-[var(--color-ink)]"
                        aria-label={`Sumar la parte ${i + 1}`}
                      />
                      <span className="w-5 rounded-[3px] text-center font-mono text-xs font-medium leading-[18px] text-bg" style={{ background: f.color }}>
                        {i + 1}
                      </span>
                    </label>
                    <div className="flex min-w-0 flex-col gap-2">
                      <input
                        className="field-input h-10"
                        value={p.label}
                        onChange={e => update(p.key, { label: e.target.value })}
                        aria-label={`Nombre de la parte ${i + 1}`}
                      />
                      <div className="flex items-center gap-2">
                        <select
                          className="field-input h-9 w-auto text-13"
                          value={p.kind}
                          onChange={e => update(p.key, { kind: e.target.value as PartKind })}
                          aria-label={`Tipo de la parte ${i + 1}`}
                        >
                          {PART_KINDS.map(k => (
                            <option key={k.kind} value={k.kind}>
                              {k.label}
                            </option>
                          ))}
                        </select>
                        <span className="font-mono text-xs text-ink-2">{p.source === 'ai' ? 'IA' : 'a mano'}</span>
                      </div>
                      {p.description && <p className="m-0 font-serif text-sm leading-[1.45] text-ink-2">{p.description}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" icon={<Scissors />} disabled={!selectedCount} onClick={() => onConfirm(review)}>
              {selectedCount ? `Sumar ${selectedCount} ${selectedCount === 1 ? 'parte' : 'partes'} al moodboard` : 'Elegí al menos una parte'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onDraftChange(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {parts.length > 0 ? (
            <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0">
              {parts.map(p => {
                const k = partKindInfo(p.partKind);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => onSelectPart(p.id)}
                      className="flex w-full flex-col gap-1 rounded-ctrl border border-line bg-surface p-1 text-left transition-[border-color] duration-120 hover:border-line-strong"
                      aria-label={`${p.name} (${p.id}), ${k.label}`}
                    >
                      <img src={p.image} alt="" className="aspect-square w-full rounded-[4px] bg-raised object-contain" />
                      <span className="truncate px-0.5 font-mono text-xs" style={{ color: k.family.ink }}>
                        {p.id.replace(r.id, '')} · {k.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="m-0 text-13 text-ink-2">
              Separá la tipografía, la mascota o el logo en fichas propias. Cada parte puede sostener un patrón por sí sola, con evidencia más precisa que la pieza entera.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={<Scissors />} onClick={onDetect}>
              {parts.length ? 'Buscar más partes' : 'Separar en partes'}
            </Button>
            <Button size="sm" variant="ghost" icon={<SquareDashedMousePointer />} onClick={startManual}>
              Marcar a mano
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
