import React from 'react';
import { Pattern, Project, RuleField } from '../../types';
import { FAMILIES, familyOf, familyTint, FamilyId } from '../../utils/families';
import { RULE_FIELDS } from '../../utils/rules';
import { PaletteBand } from './PaletteBand';

/** Distribución de familias de los patrones de un sistema (barra y recuento). */
export function FamilyBar({ patterns }: { patterns: Pattern[] }) {
  const counts = new Map<FamilyId, number>();
  patterns.forEach(p => {
    const f = familyOf(p.category).id;
    counts.set(f, (counts.get(f) ?? 0) + 1);
  });
  const entries = [...counts.entries()];
  if (!entries.length) return null;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-[3px]" aria-hidden="true">
        {entries.map(([f, n]) => (
          <span key={f} style={{ flex: n, background: FAMILIES[f].color }} />
        ))}
      </div>
      <span className="text-xs text-ink-2">{entries.map(([f, n]) => `${n} ${FAMILIES[f].label.toLowerCase()}`).join(' · ')}</span>
    </div>
  );
}

/** Vista Comparar: los sistemas lado a lado, con lo que los distingue a la vista. */
export function CompareView({ project, onOpen }: { project: Project; onOpen: (systemId: string) => void }) {
  return (
    <div className="grid auto-cols-[minmax(280px,1fr)] grid-flow-col gap-4 overflow-x-auto pb-2">
      {project.systems.map((s, i) => {
        const patterns = s.patternIds.map(id => project.patterns.find(p => p.id === id)).filter(Boolean) as Pattern[];
        return (
          <section key={s.id} aria-label={`Sistema ${String.fromCharCode(65 + i)}: ${s.name}`} className="flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-surface">
            {s.colorPalette?.length ? <PaletteBand palette={s.colorPalette} height={64} labels={false} /> : <div className="h-16 bg-bg" />}
            <div className="flex flex-col gap-4 p-4">
              <div className="flex flex-col gap-1">
                <span className="font-mono text-xs text-ink-2">
                  Sistema {String.fromCharCode(65 + i)} · {patterns.length} patrones
                </span>
                <h3 className="m-0 text-lg font-semibold tracking-[-0.01em] text-ink">{s.name}</h3>
                {s.description && <p className="m-0 line-clamp-2 font-serif text-15 text-ink-2">{s.description}</p>}
              </div>
              <FamilyBar patterns={patterns} />
              {s.aestheticPillars?.length ? (
                <div className="flex flex-col gap-2">
                  <span className="text-xs text-ink-2">Pilares</span>
                  <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                    {s.aestheticPillars.map((pl, k) => {
                      const pid = s.sources?.aestheticPillars?.[k]?.[0];
                      const pat = pid ? project.patterns.find(p => p.id === pid) : undefined;
                      const f = pat ? familyOf(pat.category) : null;
                      return (
                        <li
                          key={k}
                          className="inline-flex min-h-7 items-center rounded-ctrl border px-2.5 py-1 text-13"
                          style={f ? { borderColor: familyTint(f, 0.3), color: f.ink } : { borderColor: 'rgba(255,255,255,.14)', color: 'var(--color-ink-2)' }}
                        >
                          {pl}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
              {RULE_FIELDS.map(({ field, label }) => {
                const rules = s[field as RuleField] ?? [];
                if (!rules.length) return null;
                return (
                  <div key={field} className="flex flex-col gap-1">
                    <span className="text-xs text-ink-2">{label}</span>
                    <ul className="m-0 flex list-none flex-col gap-1 p-0">
                      {rules.map(r => (
                        <li key={r.code} className="text-13 text-ink">
                          <span className="font-mono text-xs text-ink-2">{r.code}</span> {r.title}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              <button type="button" className="btn btn-ghost btn-sm self-start" onClick={() => onOpen(s.id)}>
                Abrir tablero
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
