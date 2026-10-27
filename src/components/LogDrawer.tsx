import React, { useId, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { FeedbackItem, LogKind, Project } from '../types';
import { FEEDBACK_TYPE_LABEL, mergedLog } from '../utils/log';
import { Button, EmptyState, IconButton, LogEntry, LogList, TextArea, Tone } from './ui';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { formatLogTime } from '../utils/project';

export const LOG_TONE: Record<LogKind, Tone> = {
  brief: 'neutral',
  induce: 'pending',
  confirm: 'confirmed',
  discard: 'discarded',
  restore: 'pending',
  note: 'signal',
  assign: 'confirmed',
  unassign: 'neutral',
  system_create: 'confirmed',
  system_adopt: 'confirmed',
  system_dismiss: 'neutral',
  system_delete: 'discarded',
  synthesize: 'signal',
  import: 'signal',
  feedback: 'signal',
  split: 'pending',
};

interface LogDrawerProps {
  open: boolean;
  project: Project;
  onClose: () => void;
  onAddRule: (fb: { type: FeedbackItem['type']; comment: string }) => void;
}

export function LogDrawer({ open, project, onClose, onAddRule }: LogDrawerProps) {
  const titleId = useId();
  const ref = useFocusTrap<HTMLDivElement>(open, onClose);
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<FeedbackItem['type']>('designer_rule');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const entries = useMemo(() => mergedLog(project), [project]);

  if (!open) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) {
      setError('Escribí la regla o el criterio.');
      return;
    }
    onAddRule({ type, comment: comment.trim() });
    setComment('');
    setAdding(false);
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end" data-overlay-open="true">
      <button type="button" tabIndex={-1} aria-label="Cerrar bitácora" className="absolute inset-0 cursor-default bg-black/50" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex h-full w-full max-w-[420px] flex-col border-l border-line-mid bg-surface shadow-float motion-safe:animate-[em-fade-in_180ms_var(--ease-emergent)]"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-3">
          <div className="flex flex-col">
            <span className="font-mono text-xs text-ink-2">{entries.length} entradas</span>
            <h2 id={titleId} className="m-0 text-15 font-medium text-ink">
              Bitácora
            </h2>
          </div>
          <IconButton label="Cerrar bitácora" size="sm" onClick={onClose}>
            <X className="size-4 stroke-[1.5]" />
          </IconButton>
        </div>

        <div className="shrink-0 border-b border-line px-5 py-4">
          {adding ? (
            <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
              <div className="flex flex-col gap-2">
                <label htmlFor={`${titleId}-type`} className="text-13 text-ink-2">
                  Tipo
                </label>
                <select id={`${titleId}-type`} className="field-input" value={type} onChange={e => setType(e.target.value as FeedbackItem['type'])}>
                  {(['designer_rule', 'scope_refinement', 'reference_exclusion'] as const).map(t => (
                    <option key={t} value={t}>
                      {FEEDBACK_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>
              <TextArea
                label="Regla o criterio"
                rows={3}
                className="font-serif text-15"
                value={comment}
                error={error}
                hint="Se envía como contexto en la próxima inducción."
                onChange={e => {
                  setComment(e.target.value);
                  setError(null);
                }}
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    setAdding(false);
                  }
                }}
                data-autofocus
                autoFocus
              />
              <div className="flex gap-2">
                <Button type="submit" size="sm" variant="secondary">
                  Guardar regla
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          ) : (
            <Button size="sm" variant="secondary" icon={<Plus />} onClick={() => setAdding(true)}>
              Agregar regla
            </Button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {entries.length === 0 ? (
            <EmptyState meta="0 entradas" title="Todavía no hay decisiones" body="Cada inducción, confirmación, descarte y sistema queda registrado acá." />
          ) : (
            <LogList label="Entradas de la bitácora, de la más reciente a la más antigua">
              {entries.map(e => (
                <LogEntry key={e.id} time={formatLogTime(e.at)} target={e.targetId} action={e.label} reason={e.reason} tone={LOG_TONE[e.kind]} />
              ))}
            </LogList>
          )}
        </div>
      </div>
    </div>
  );
}
