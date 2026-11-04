import React, { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { Pattern, PatternCategory, Reference } from '../types';
import { Button, CATEGORY_LABEL, TextArea, TextInput } from './ui';
import { Modal } from './shell/Modal';

/** Lo que el diseñador escribe de un patrón propio (o ajusta de uno existente). */
export interface PatternDraft {
  name: string;
  category: PatternCategory;
  description: string;
  /** Un rasgo observable por línea. */
  observations: string;
  evidence: string[];
  designerGroup?: Pattern['designerGroup'];
}

export const emptyDraft = (): PatternDraft => ({ name: '', category: 'composition', description: '', observations: '', evidence: [] });

export const draftFromPattern = (p: Pattern): PatternDraft => ({
  name: p.name,
  category: p.category,
  description: p.description,
  observations: (p.relatedObservations ?? []).join('\n'),
  evidence: [...p.evidence],
  designerGroup: p.designerGroup,
});

interface PatternEditorProps {
  title: string;
  meta?: string;
  initial: PatternDraft;
  references: Reference[];
  /** Si se pasa, ofrece asignar el patrón a ese sistema al guardar. */
  assignTo?: { id: string; name: string };
  saveLabel?: string;
  onSave: (draft: PatternDraft, assignToSystem: boolean) => void;
  onClose: () => void;
}

const CATEGORIES = Object.keys(CATEGORY_LABEL) as PatternCategory[];

/** Alta o edición de un patrón: texto + selección de referencias sobre la grilla del corpus. */
export function PatternEditor({ title, meta, initial, references, assignTo, saveLabel = 'Guardar patrón', onSave, onClose }: PatternEditorProps) {
  const [draft, setDraft] = useState<PatternDraft>(initial);
  const [assign, setAssign] = useState(!!assignTo);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => (q ? references.filter(r => `${r.id} ${r.name} ${(r.tags ?? []).join(' ')}`.toLowerCase().includes(q)) : references), [references, q]);
  const known = new Set(references.map(r => r.id));
  const missing = draft.evidence.filter(id => !known.has(id));

  const toggle = (id: string) => setDraft(d => ({ ...d, evidence: d.evidence.includes(id) ? d.evidence.filter(x => x !== id) : [...d.evidence, id] }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) return setError('Ponele un nombre al patrón.');
    if (!draft.evidence.length) return setError('Elegí al menos una referencia que lo sostenga.');
    onSave({ ...draft, name: draft.name.trim(), description: draft.description.trim() }, assign);
  };

  return (
    <Modal open title={title} meta={meta} onClose={onClose} width={720}>
      <form onSubmit={submit} className="flex flex-col gap-5 p-5" noValidate>
        <TextInput
          label="Nombre del patrón"
          required
          data-autofocus
          value={draft.name}
          onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
          placeholder="Ej. Lettering inflado con contorno grueso"
        />
        <div className="flex flex-col gap-2">
          <label htmlFor="pe-cat" className="text-13 text-ink-2">
            Categoría
          </label>
          <select id="pe-cat" className="field-input" value={draft.category} onChange={e => setDraft(d => ({ ...d, category: e.target.value as PatternCategory }))}>
            {CATEGORIES.map(c => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <TextArea
          label="Qué es y cómo opera"
          optional
          rows={3}
          className="font-serif text-15"
          value={draft.description}
          onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
          hint="Cuanto más concreto, mejor lo usa la síntesis y la generación de piezas."
        />
        <TextArea
          label="Rasgos observables"
          optional
          rows={3}
          value={draft.observations}
          onChange={e => setDraft(d => ({ ...d, observations: e.target.value }))}
          hint="Uno por línea: trazo, saturación, grano, estructura de la grilla…"
        />

        <section aria-label="Referencias" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-13 text-ink">
              Referencias que lo sostienen <span className="font-mono text-xs text-ink-2">· {draft.evidence.length}</span>
            </span>
            <input type="search" className="field-input max-w-[200px]" placeholder="Filtrar por ID o nombre" aria-label="Filtrar referencias" value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          {missing.length > 0 && <p className="m-0 text-xs text-ink-2">Ya no están en el corpus: {missing.join(', ')}. Se quitan al guardar.</p>}
          <ul className="m-0 grid max-h-[320px] list-none grid-cols-4 gap-2 overflow-y-auto p-0 sm:grid-cols-5">
            {visible.map(r => {
              const on = draft.evidence.includes(r.id);
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    aria-label={`${r.name} (${r.id})`}
                    onClick={() => toggle(r.id)}
                    className={`relative flex w-full flex-col gap-1 rounded-ctrl border p-1 text-left transition-colors duration-120 ${on ? 'border-signal bg-signal/10' : 'border-line bg-surface hover:border-line-strong'}`}
                  >
                    <img src={r.image} alt="" loading="lazy" referrerPolicy="no-referrer" className={`aspect-square w-full rounded-[4px] bg-raised ${r.parentId ? 'object-contain' : 'object-cover'}`} />
                    <span className="truncate px-0.5 font-mono text-xs text-ink-2">{r.id}</span>
                    {on && (
                      <span aria-hidden="true" className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-signal text-bg">
                        <Check className="size-3.5" />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {visible.length === 0 && <p className="m-0 text-13 text-ink-2">Ninguna referencia coincide.</p>}
        </section>

        {assignTo && (
          <label className="flex cursor-pointer items-center gap-2 text-13 text-ink">
            <input type="checkbox" className="size-4 accent-[#EDEDEF]" checked={assign} onChange={e => setAssign(e.target.checked)} />
            Sumarlo también a «{assignTo.name}»
          </label>
        )}

        {error && (
          <p role="alert" className="m-0 text-xs text-error-ink">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit" variant="confirm">
            {saveLabel}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
