import React, { useMemo } from 'react';
import { Pattern, Project, SuggestedSystem } from '../../types';
import { Button, StatusDot } from '../ui';
import { familyOf, familyTint } from '../../utils/families';
import { inferPalette } from '../../utils/palette';

/** Patrones del análisis asociados a una sugerencia (por nombre o por sistema sugerido). */
export function suggestionPatterns(s: SuggestedSystem, patterns: Pattern[]) {
  const names = new Set((s.associatedPatternNames ?? []).map(n => n.toLowerCase()));
  return patterns.filter(p => names.has(p.name.toLowerCase()) || p.suggestedSystemName?.toLowerCase() === s.name.toLowerCase());
}

/** Sugerencia de la IA antes de adoptarla: borde de señal, pilares por familia, mosaico de evidencia y paleta. */
export function SuggestionCard({ s, project, onAdopt, onDismiss }: { s: SuggestedSystem; project: Project; onAdopt: () => void; onDismiss: () => void }) {
  const matched = suggestionPatterns(s, project.patterns);
  const confirmed = matched.filter(p => p.status === 'confirmed');
  const refIds = Array.from(new Set([...(s.referenceIds ?? []), ...matched.flatMap(p => p.evidence)]));
  const refs = refIds.map(id => project.references.find(r => r.id === id)).filter(Boolean).slice(0, 4);
  const palette = useMemo(
    () =>
      inferPalette(
        [{ id: s.id, name: s.name, category: 'mood', description: '', evidence: refIds, confidence: 1, status: 'confirmed', relatedObservations: [] }],
        project.references,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.id, project.references],
  );

  return (
    <article
      aria-label={`Sugerencia de la IA: ${s.name}`}
      className="grid overflow-hidden rounded-[12px] border border-dashed border-signal/45 bg-signal/[.03] md:grid-cols-[minmax(0,1fr)_260px]"
    >
      <div className="flex flex-col gap-4 p-6">
        <span className="inline-flex h-6 items-center gap-2 self-start rounded-full bg-signal/12 px-[9px] font-mono text-xs font-medium text-signal-ink">
          <StatusDot tone="signal" glow={false} />
          Sugerencia de la IA
        </span>
        <h3 className="m-0 text-[22px] font-semibold tracking-[-0.01em] text-ink">{s.name}</h3>
        <p className="m-0 line-clamp-3 font-serif text-base text-ink-2">{s.description}</p>
        {s.aestheticPillars?.length > 0 && (
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Pilares propuestos">
            {s.aestheticPillars.map((pillar, i) => {
              const f = matched[i] ? familyOf(matched[i].category) : null;
              return (
                <li
                  key={i}
                  className="inline-flex h-7 items-center rounded-ctrl border px-2.5 text-13"
                  style={f ? { borderColor: familyTint(f, 0.3), color: f.ink } : { borderColor: 'rgba(255,255,255,.14)', color: 'var(--color-ink-2)' }}
                >
                  {pillar}
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={onAdopt}>
            Adoptar
          </Button>
          <Button variant="ghost" onClick={onDismiss}>
            Descartar
          </Button>
          <span className="flex items-center gap-2 text-xs text-ink-2">
            <StatusDot tone={confirmed.length ? 'confirmed' : 'neutral'} glow={false} />
            {matched.length
              ? `${confirmed.length} de ${matched.length} patrones confirmados${confirmed.length < matched.length ? ' · solo esos se incorporan' : ''}`
              : 'Sin patrones asociados reconocibles'}
          </span>
        </div>
      </div>
      <div className="grid grid-rows-[1fr_40px] border-t border-line md:border-l md:border-t-0">
        <div className="grid min-h-[200px] grid-cols-2 gap-0.5">
          {refs.map(r => (
            <img key={r!.id} src={r!.image} alt={`${r!.id}: ${r!.name}`} className="h-full min-h-[100px] w-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
          ))}
        </div>
        <div className="flex" aria-hidden="true">
          {palette.map((c, i) => (
            <span key={i} style={{ flex: Math.max(c.share ?? 0.1, 0.04), background: c.hex }} />
          ))}
        </div>
      </div>
    </article>
  );
}
