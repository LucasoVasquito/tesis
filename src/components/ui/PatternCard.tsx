import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Pattern, Reference } from '../../types';
import { Button } from './Button';
import { CategoryTag } from './CategoryTag';
import { StatusPill, TrendTag } from './StatusPill';
import { familyOf } from '../../utils/families';

export type PatternCardMode = 'idle' | 'discard' | 'note';

interface PatternCardProps {
  pattern: Pattern;
  index: number;
  total: number;
  references: Reference[];
  mode: PatternCardMode;
  onModeChange: (mode: PatternCardMode) => void;
  onConfirm: () => void;
  onDiscard: (reason: string) => void;
  onSaveNote: (note: string) => void;
  onRestore: () => void;
  onFocusEvidence?: (refId: string) => void;
  className?: string;
}

export function PatternCard({
  pattern,
  index,
  total,
  references,
  mode,
  onModeChange,
  onConfirm,
  onDiscard,
  onSaveNote,
  onRestore,
  onFocusEvidence,
  className,
}: PatternCardProps) {
  const titleId = useId();
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [note, setNote] = useState(pattern.designerNotes ?? '');
  const reasonRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  // Al cambiar de patrón o de modo, reiniciar los campos inline.
  useEffect(() => {
    setReason('');
    setReasonError(null);
    setNote(pattern.designerNotes ?? '');
  }, [pattern.id, mode, pattern.designerNotes]);

  useEffect(() => {
    if (mode === 'discard') reasonRef.current?.focus();
    if (mode === 'note') noteRef.current?.focus();
  }, [mode]);

  const judged = pattern.status !== 'detected';
  const refById = new Map(references.map(r => [r.id, r]));

  const submitDiscard = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!reason.trim()) {
      setReasonError('Escribí por qué descartás este patrón.');
      reasonRef.current?.focus();
      return;
    }
    onDiscard(reason.trim());
  };

  const submitNote = (e?: React.FormEvent) => {
    e?.preventDefault();
    onSaveNote(note.trim());
  };

  const escToIdle = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onModeChange('idle');
    }
  };

  return (
    <article
      aria-labelledby={titleId}
      className={`flex w-full max-w-[560px] flex-col overflow-hidden rounded-card border border-l-[3px] border-line-mid bg-surface ${className ?? ''}`}
      style={{ borderLeftColor: familyOf(pattern.category).color }}
    >
      {/* 1 · Cabecera */}
      <header className="flex flex-col gap-3 px-5 pb-4 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-xs font-medium text-ink-2">
            {pattern.id} · {index + 1} de {total}
          </span>
          <div className="flex flex-wrap gap-2">
            <TrendTag trend={pattern.trend} />
            <CategoryTag category={pattern.category} />
            <StatusPill status={pattern.status} />
          </div>
        </div>
        <h3 id={titleId} className="m-0 text-lg font-medium leading-[1.3] tracking-[-0.01em] text-ink">
          {pattern.name}
        </h3>
        <p className="m-0 font-serif text-base leading-normal text-ink-2">{pattern.description}</p>
        {pattern.designerGroup && (
          <p className="m-0 font-mono text-xs text-signal-ink">
            ← tu grupo «{pattern.designerGroup.name}»
            {pattern.designerGroup.verdict === 'supports'
              ? ' · la IA lo sostiene'
              : pattern.designerGroup.verdict === 'refines'
                ? ' · la IA lo matiza'
                : pattern.designerGroup.verdict === 'contradicts'
                  ? ' · la IA lo discute'
                  : ''}
          </p>
        )}
      </header>

      {/* 2 · Evidencia */}
      <section aria-label="Evidencia" className="flex flex-col gap-3 border-t border-line px-5 py-4">
        <div className="flex justify-between text-13">
          <span className="text-ink-2">
            Evidencia · {pattern.evidence.length} {pattern.evidence.length === 1 ? 'referencia' : 'referencias'}
          </span>
          <span className="font-mono text-ink">confianza {(pattern.confidence ?? 0).toFixed(2)}</span>
        </div>
        {pattern.evidence.length > 0 ? (
          <ul className="grid grid-cols-3 gap-2">
            {pattern.evidence.map(id => {
              const ref = refById.get(id);
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => onFocusEvidence?.(id)}
                    disabled={!ref}
                    className="flex w-full flex-col gap-2 rounded-ctrl text-left text-ink-2 transition-colors duration-120 ease-emergent hover:text-ink disabled:cursor-not-allowed"
                    aria-label={ref ? `Enfocar ${ref.name} (${id}) en el lienzo` : `${id}: la referencia ya no está en el corpus`}
                  >
                    {ref ? (
                      <img
                        src={ref.image}
                        alt=""
                        className="block aspect-square w-full rounded-ctrl border border-signal/60 object-cover"
                        referrerPolicy="no-referrer"
                        loading="lazy"
                      />
                    ) : (
                      <span className="block aspect-square w-full rounded-ctrl border border-dashed border-line-strong" />
                    )}
                    <span className="font-mono text-xs font-medium">{id}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="m-0 text-13 text-ink-2">Sin referencias de evidencia en el corpus actual.</p>
        )}
      </section>

      {/* 3 · Rasgos observables */}
      {pattern.relatedObservations?.length > 0 && (
        <section aria-label="Rasgos observables" className="flex flex-col gap-2 border-t border-line px-5 py-4">
          <span className="text-13 text-ink-2">Rasgos observables</span>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-[18px] text-13 text-ink">
            {pattern.relatedObservations.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        </section>
      )}

      {pattern.systemHypothesis && (
        <details className="group border-t border-line px-5 py-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-13 text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
            <ChevronRight aria-hidden="true" className="size-4 stroke-[1.5] transition-transform duration-180 ease-emergent group-open:rotate-90" />
            Hipótesis de sistema
          </summary>
          <p className="m-0 mt-2 font-serif text-15 leading-normal text-ink-2">{pattern.systemHypothesis}</p>
        </details>
      )}

      {(pattern.discardReason && pattern.status === 'discarded') || pattern.designerNotes ? (
        <section aria-label="Decisiones del diseñador" className="flex flex-col gap-3 border-t border-line px-5 py-4">
          {pattern.status === 'discarded' && pattern.discardReason && (
            <div className="flex flex-col gap-1">
              <span className="font-mono text-xs text-ink-2">Motivo del descarte</span>
              <p className="m-0 font-serif text-15 italic text-ink-2">{pattern.discardReason}</p>
            </div>
          )}
          {pattern.designerNotes && mode !== 'note' && (
            <div className="flex flex-col gap-1">
              <span className="font-mono text-xs text-ink-2">Nota del diseñador</span>
              <p className="m-0 font-serif text-15 italic text-ink-2">{pattern.designerNotes}</p>
            </div>
          )}
        </section>
      ) : null}

      {/* Formularios inline */}
      {mode === 'discard' && (
        <form onSubmit={submitDiscard} className="flex flex-col gap-3 border-t border-line px-5 py-4" noValidate>
          <label htmlFor={`${titleId}-reason`} className="text-13 text-ink-2">
            Motivo del descarte <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${titleId}-reason`}
            ref={reasonRef}
            className="field-input"
            value={reason}
            placeholder="Requerido"
            onChange={e => {
              setReason(e.target.value);
              if (reasonError) setReasonError(null);
            }}
            onKeyDown={escToIdle}
            aria-required="true"
            aria-invalid={reasonError ? true : undefined}
            aria-describedby={reasonError ? `${titleId}-reason-error` : `${titleId}-reason-hint`}
          />
          {reasonError ? (
            <span id={`${titleId}-reason-error`} className="text-xs text-error-ink">
              {reasonError}
            </span>
          ) : (
            <span id={`${titleId}-reason-hint`} className="text-xs text-ink-2">
              Se guarda en la bitácora y orienta la próxima inducción.
            </span>
          )}
          <div className="flex gap-2">
            <Button type="submit" variant="discard" kbd="↵">
              Guardar
            </Button>
            <Button variant="ghost" onClick={() => onModeChange('idle')} kbd="Esc">
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {mode === 'note' && (
        <form onSubmit={submitNote} className="flex flex-col gap-3 border-t border-line px-5 py-4">
          <label htmlFor={`${titleId}-note`} className="text-13 text-ink-2">
            Nota del diseñador
          </label>
          <textarea
            id={`${titleId}-note`}
            ref={noteRef}
            rows={3}
            className="field-input font-serif text-15"
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => {
              escToIdle(e);
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitNote();
            }}
            aria-describedby={`${titleId}-note-hint`}
          />
          <span id={`${titleId}-note-hint`} className="text-xs text-ink-2">
            Ctrl + Enter para guardar.
          </span>
          <div className="flex gap-2">
            <Button type="submit" variant="secondary">
              Guardar nota
            </Button>
            <Button variant="ghost" onClick={() => onModeChange('idle')} kbd="Esc">
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {/* 4 · Acciones */}
      {mode === 'idle' && (
        <footer className="flex flex-wrap gap-2 border-t border-line px-5 py-4">
          {judged ? (
            <Button variant="secondary" onClick={onRestore}>
              Restaurar a pendiente
            </Button>
          ) : (
            <>
              <Button variant="confirm" kbd="C" onClick={onConfirm}>
                Confirmar
              </Button>
              <Button variant="discard" kbd="D" onClick={() => onModeChange('discard')}>
                Descartar
              </Button>
            </>
          )}
          <Button variant="ghost" kbd="N" className="ml-auto" onClick={() => onModeChange('note')}>
            Anotar
          </Button>
        </footer>
      )}
    </article>
  );
}
