import React, { useEffect, useState } from 'react';
import { Project } from '../types';
import { TextArea, TextInput } from '../components/ui';

export interface BriefDraft {
  name: string;
  objective: string;
  description: string;
}

interface BriefStageProps {
  project: Project;
  /** El formulario es controlado desde App para que el CTA de la ActionBar pueda enviarlo. */
  draft: BriefDraft;
  onDraftChange: (d: BriefDraft) => void;
  onSubmit: () => void;
}

export function BriefStage({ project, draft, onDraftChange, onSubmit }: BriefStageProps) {
  // El error aparece al salir de un campo que se editó, o al intentar continuar; nunca al cargar.
  const [touched, setTouched] = useState<{ name?: boolean; objective?: boolean }>({});
  const [dirty, setDirty] = useState<{ name?: boolean; objective?: boolean }>({});

  // Al cambiar de proyecto se reinicia la validación.
  useEffect(() => {
    setTouched({});
    setDirty({});
  }, [project.id]);

  const nameError = touched.name && !draft.name.trim() ? 'Escribí un nombre para el proyecto.' : null;
  const objectiveError = touched.objective && !draft.objective.trim() ? 'Escribí el objetivo: orienta la lectura del corpus.' : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[560px] flex-col gap-8 px-4 py-12 lg:py-24">
        <header className="flex flex-col gap-3">
          <span className="font-mono text-xs text-ink-2">01 · Brief</span>
          <h1 className="m-0 text-4xl font-medium leading-[1.1] tracking-[-0.02em] text-ink">Definí el proyecto</h1>
          <p className="m-0 font-serif text-lg text-ink-2">Esta información orienta la lectura del corpus. Podés cambiarla después.</p>
        </header>

        <form
          id="brief-form"
          noValidate
          className="flex flex-col gap-5"
          onSubmit={e => {
            e.preventDefault();
            setTouched({ name: true, objective: true });
            if (draft.name.trim() && draft.objective.trim()) onSubmit();
          }}
        >
          <TextInput
            label="Nombre"
            required
            placeholder="Ej: KROM — Indumentaria utilitaria"
            value={draft.name}
            error={nameError}
            autoFocus={!draft.name}
            onChange={e => {
              onDraftChange({ ...draft, name: e.target.value });
              setDirty(d => ({ ...d, name: true }));
            }}
            onBlur={() => dirty.name && setTouched(t => ({ ...t, name: true }))}
          />
          <TextInput
            label="Objetivo"
            required
            placeholder="Ej: Sistema identitario táctil para ropa de trabajo"
            value={draft.objective}
            error={objectiveError}
            onChange={e => {
              onDraftChange({ ...draft, objective: e.target.value });
              setDirty(d => ({ ...d, objective: true }));
            }}
            onBlur={() => dirty.objective && setTouched(t => ({ ...t, objective: true }))}
          />
          <TextArea
            label="Contexto"
            optional
            rows={4}
            placeholder="Universo visual, soportes, restricciones, referencias de la marca…"
            value={draft.description}
            onChange={e => onDraftChange({ ...draft, description: e.target.value })}
          />
          {/* Enviar con Enter desde los campos de una línea */}
          <button type="submit" className="sr-only" tabIndex={-1}>
            Continuar al corpus
          </button>
        </form>

      </div>
    </div>
  );
}
