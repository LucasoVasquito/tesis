import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Project } from '../types';
import { useShortcuts } from '../hooks/useAuditShortcuts';
import { BottomBar } from '../components/shell/BottomBar';
import { Desk, DeskQuestion } from '../components/shell/Desk';
import { SUBSTEPS } from '../utils/substeps';

type Field = 'name' | 'intent' | 'objective';

interface BriefScreenProps {
  project: Project;
  enabled: boolean;
  /** Subpaso actual (0 Nombre · 1 Frase · 2 Objetivo · 3 Resumen). */
  sub: number;
  onSub: (i: number) => void;
  /** El agente está redactando el objetivo. */
  busy: boolean;
  onField: (field: Field, value: string) => void;
  /** Pide al agente que redacte el Objetivo; recibe lo que está escrito en el campo ahora. */
  onDraft: (objective: string) => void;
  onNext: () => void;
}

/** Textarea que crece con el contenido (sin scroll interno). */
function GrowArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [props.value]);
  return <textarea ref={ref} {...props} style={{ resize: 'none', overflow: 'hidden', ...props.style }} />;
}

const BIG: React.CSSProperties = { height: 72, fontSize: '1.75rem', fontWeight: 600, letterSpacing: '-0.01em' };

/**
 * 0 · BRIEF en cuatro subpasos (v6): ¿Cómo se llama? · ¿Qué es, en una frase? · ¿Qué querés lograr? · ¿Está bien así?
 * Una pregunta, un campo y una acción por subpaso. Nada es obligatorio.
 */
export function BriefScreen(props: BriefScreenProps) {
  const { project, sub } = props;

  // Lo que se está escribiendo: se guarda al avanzar, al salir del campo o al cambiar de subpaso.
  const [draft, setDraft] = useState<Record<Field, string>>({ name: project.name, intent: project.intent ?? '', objective: project.objective });
  useEffect(() => setDraft({ name: project.name, intent: project.intent ?? '', objective: project.objective }), [project.id, project.name, project.intent, project.objective]);
  const set = (f: Field, v: string) => setDraft(d => ({ ...d, [f]: v }));
  const commit = (f: Field) => props.onField(f, draft[f]);
  const commitAll = () => (['name', 'intent', 'objective'] as Field[]).forEach(commit);

  const last = sub === SUBSTEPS.brief.length - 1;
  const next = () => {
    commitAll();
    if (last) props.onNext();
    else props.onSub(sub + 1);
  };
  useShortcuts(props.enabled, { enter: () => next() });
  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      next();
    }
  };

  const canDraft = !!(draft.intent.trim() || draft.objective.trim());
  const help = (
    <div className="flex flex-col gap-3 text-[0.9375rem] leading-[1.6] text-ink-2">
      <p className="m-0">El brief orienta al agente: con esto lee el corpus con intención, qué buscar y qué dejar de lado.</p>
      <p className="m-0">Nada es obligatorio. Podés seguir sin completarlo y volver cuando quieras desde el menú del proyecto.</p>
      <p className="m-0">
        <kbd>⏎</kbd> o <kbd>→</kbd> sigue · <kbd>←</kbd> vuelve.
      </p>
    </div>
  );

  /* ---------- Resumen: cada campo se edita con un clic ---------- */
  const [editing, setEditing] = useState<Field | null>(null);
  useEffect(() => setEditing(null), [sub]);
  const summaryRow = (f: Field, label: string, multiline?: boolean) => (
    <div className="flex flex-col gap-1 border-t border-line py-5">
      <span className="type-label text-[0.75rem] text-ink-2">{label}</span>
      {editing === f ? (
        multiline ? (
          <GrowArea
            autoFocus
            value={draft[f]}
            onChange={e => set(f, e.target.value)}
            onBlur={() => {
              commit(f);
              setEditing(null);
            }}
            className="field-input"
            style={{ fontSize: '1rem', lineHeight: 1.6, minHeight: 96 }}
          />
        ) : (
          <input
            autoFocus
            value={draft[f]}
            onChange={e => set(f, e.target.value)}
            onBlur={() => {
              commit(f);
              setEditing(null);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            className="field-input"
            style={{ height: 48, fontSize: '1.125rem' }}
          />
        )
      ) : (
        <button type="button" onClick={() => setEditing(f)} className="group flex items-baseline justify-between gap-4 rounded-[4px] text-left" title="Editar">
          <span className={`whitespace-pre-line ${f === 'objective' ? 'text-[1rem] leading-[1.6]' : 'text-[1.375rem] font-semibold'} ${draft[f].trim() ? 'text-ink' : 'text-ink-3'}`}>
            {draft[f].trim() || 'Sin completar'}
          </span>
          <span className="shrink-0 text-[0.875rem] text-ink-2 underline-offset-4 group-hover:text-ink group-hover:underline">Editar</span>
        </button>
      )}
    </div>
  );

  let body: React.ReactNode;
  if (sub === 0)
    body = (
      <input value={draft.name} onChange={e => set('name', e.target.value)} onBlur={() => commit('name')} onKeyDown={onEnter} autoFocus aria-label="Nombre del proyecto" placeholder="Ej: Badder Hamburguesería" className="field-input" style={BIG} />
    );
  else if (sub === 1)
    body = (
      <input
        value={draft.intent}
        onChange={e => set('intent', e.target.value)}
        onBlur={() => commit('intent')}
        onKeyDown={onEnter}
        autoFocus
        aria-label="En una frase"
        placeholder="Ej: hamburguesería urbana con estética de cartel industrial"
        className="field-input"
        style={BIG}
      />
    );
  else if (sub === 2)
    body = (
      <div className="flex flex-col gap-3">
        <GrowArea
          value={draft.objective}
          onChange={e => set('objective', e.target.value)}
          onBlur={() => commit('objective')}
          autoFocus
          disabled={props.busy}
          rows={3}
          aria-label="Objetivo"
          placeholder="Qué tiene que lograr la identidad, para quién, con qué tono y qué evitar. Podés escribir dos líneas y dejar que el agente lo complete."
          className="field-input disabled:opacity-60"
          style={{ fontSize: '1.0625rem', lineHeight: 1.6, minHeight: 120 }}
        />
        {/* Acción secundaria: en texto, nunca un segundo botón lleno */}
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={() => {
            props.onField('objective', draft.objective);
            props.onDraft(draft.objective);
          }}
          disabled={props.busy || !canDraft}
          className="self-start text-[0.9375rem] font-semibold text-ink underline underline-offset-4 hover:no-underline disabled:cursor-not-allowed disabled:text-ink-3 disabled:no-underline"
        >
          {props.busy ? 'Redactando…' : 'Redactar con el agente'}
        </button>
        <span className="text-[0.875rem] text-ink-3">{canDraft ? 'Parte del nombre, la frase y lo que escribas acá; después lo editás.' : 'Escribí la frase (paso 2) o el objetivo para que el agente pueda redactarlo.'}</span>
      </div>
    );
  else
    body = (
      <div className="flex flex-col">
        {summaryRow('name', 'Nombre del proyecto')}
        {summaryRow('intent', 'En una frase')}
        {summaryRow('objective', 'Objetivo', true)}
      </div>
    );

  return (
    <>
      <Desk stepKey={`brief-${sub}`} width="form" shelves={[{ id: 'ayuda', label: 'Ayuda', side: 'right', content: help }]}>
        <div className="flex min-h-full flex-col justify-center py-6">
          <DeskQuestion>{SUBSTEPS.brief[sub].question}</DeskQuestion>
          {body}
        </div>
      </Desk>
      <BottomBar primary={{ label: last ? 'Seguir a Referencias →' : 'Siguiente →', kbd: '⏎', onClick: next }} />
    </>
  );
}
