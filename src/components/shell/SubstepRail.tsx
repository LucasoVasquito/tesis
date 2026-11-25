import React from 'react';
import { Moment, Project } from '../../types';
import { SUBSTEPS, subBlocked, subDone, subSummary } from '../../utils/substeps';

/**
 * Riel de subpasos (v6): 40 px debajo de la barra superior. Hecho ✓ · actual ● · pendiente ○.
 * Todos se pueden tocar, salvo los que dependen de otro (deshabilitados, con el motivo al pasar el mouse).
 * Un subpaso hecho muestra su resumen de una línea al pasar el mouse.
 */
export function SubstepRail({ project, stage, current, onGo }: { project: Project; stage: Moment; current: number; onGo: (i: number) => void }) {
  const steps = SUBSTEPS[stage];
  if (steps.length < 2) return null;
  return (
    <nav aria-label="Subpasos" className="no-print surface-glass relative z-[5] flex h-9 shrink-0 items-center justify-center overflow-x-auto px-4">
      <ol className="m-0 flex list-none items-center gap-1 p-0">
        {steps.map((s, i) => {
          const here = i === current;
          const done = subDone(project, stage, i);
          const blocked = here ? null : subBlocked(project, stage, i);
          const summary = done ? subSummary(project, stage, i) : '';
          const mark = here ? '●' : done ? '✓' : '○';
          const title = blocked ?? (summary ? `${s.label} · ${summary}` : undefined);
          return (
            <li key={s.id} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden="true" className="mx-1 h-px w-6 bg-line-mid" />}
              <button
                type="button"
                onClick={() => !blocked && onGo(i)}
                aria-current={here ? 'step' : undefined}
                aria-disabled={blocked ? true : undefined}
                title={title}
                className={`flex h-8 items-center gap-2 whitespace-nowrap rounded-[4px] px-2 text-[0.875rem] transition-colors duration-150 ${
                  here ? 'font-bold text-ink' : blocked ? 'cursor-not-allowed text-ink-3' : 'text-ink-2 hover:bg-ink/5 hover:text-ink'
                }`}
              >
                <span aria-hidden="true" className={`font-mono text-[0.8125rem] ${done && !here ? 'text-ink' : ''}`}>
                  {mark}
                </span>
                <span>
                  {i + 1} {s.label}
                </span>
                <span className="sr-only">{here ? '(actual)' : done ? '(hecho)' : '(pendiente)'}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
