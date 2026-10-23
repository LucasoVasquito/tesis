import React, { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Project, VisualSystem, VisualSystemDetails } from '../../types';
import { Button, IconButton, TextArea } from '../ui';

const DETAIL_LABEL: Record<keyof VisualSystemDetails, string> = {
  brandEssence: 'Esencia',
  logoAndIdentity: 'Logo e identidad',
  packagingSystem: 'Packaging',
  photographyStyle: 'Fotografía',
  typographySystem: 'Sistema tipográfico',
  graphicApplications: 'Aplicaciones gráficas',
  mascotAndIllustration: 'Ilustración',
  digitalAndSocialMedia: 'Digital y redes',
};

interface SystemDetailProps {
  project: Project;
  system: VisualSystem;
  onUpdate: (s: VisualSystem) => void;
  onFocusReference: (id: string) => void;
}

/** Detalle editable del sistema: descripción, pilares y desglose redactado. */
export function SystemDetail({ project, system: s, onUpdate }: SystemDetailProps) {
  const [description, setDescription] = useState(s.description);
  const [pillars, setPillars] = useState<string[]>(s.aestheticPillars ?? []);
  const [newPillar, setNewPillar] = useState('');

  useEffect(() => {
    setDescription(s.description);
    setPillars(s.aestheticPillars ?? []);
  }, [s.id, s.description, s.aestheticPillars]);

  const dirty = description !== s.description || JSON.stringify(pillars) !== JSON.stringify(s.aestheticPillars ?? []);
  const save = () => {
    const cleaned = pillars.map(p => p.trim()).filter(Boolean);
    // Si se editan los pilares, la trazabilidad por posición deja de ser confiable para los que cambiaron.
    const oldPillars = s.aestheticPillars ?? [];
    const oldSources = s.sources?.aestheticPillars ?? [];
    const pillarSources = cleaned.map(p => {
      const i = oldPillars.indexOf(p);
      return i >= 0 ? oldSources[i] ?? [] : [];
    });
    onUpdate({
      ...s,
      description: description.trim(),
      aestheticPillars: cleaned,
      sources: { ...s.sources, aestheticPillars: pillarSources },
      updatedAt: new Date().toISOString(),
    });
  };

  const patterns = project.patterns.filter(p => s.patternIds.includes(p.id));
  const refIds = Array.from(new Set(patterns.flatMap(p => p.evidence)));
  const refs = project.references.filter(r => refIds.includes(r.id));
  const details = Object.entries(s.systemDetails ?? {}).filter(([, v]) => !!v) as [keyof VisualSystemDetails, string][];

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-5 p-5">
        <TextArea label="Descripción" rows={6} className="font-serif text-15" value={description} onChange={e => setDescription(e.target.value)} />

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 text-13 text-ink-2">Pilares</legend>
          {pillars.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                aria-label={`Pilar ${i + 1}`}
                className="field-input h-9"
                value={p}
                onChange={e => setPillars(ps => ps.map((x, j) => (j === i ? e.target.value : x)))}
              />
              <IconButton label={`Quitar pilar ${i + 1}`} size="sm" bare onClick={() => setPillars(ps => ps.filter((_, j) => j !== i))}>
                <X className="size-4 stroke-[1.5]" />
              </IconButton>
            </div>
          ))}
          <form
            className="flex items-center gap-2"
            onSubmit={e => {
              e.preventDefault();
              if (!newPillar.trim()) return;
              setPillars(ps => [...ps, newPillar.trim()]);
              setNewPillar('');
            }}
          >
            <input aria-label="Nuevo pilar" placeholder="Agregar pilar" className="field-input h-9" value={newPillar} onChange={e => setNewPillar(e.target.value)} />
            <IconButton label="Agregar pilar" size="sm" type="submit">
              <Plus className="size-4 stroke-[1.5]" />
            </IconButton>
          </form>
        </fieldset>

        <div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={!dirty} onClick={save}>
            Guardar cambios
          </Button>
          {dirty && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDescription(s.description);
                setPillars(s.aestheticPillars ?? []);
              }}
            >
              Descartar cambios
            </Button>
          )}
        </div>
      </div>

      {details.length > 0 && (
        <section aria-label="Desglose de identidad" className="flex flex-col gap-4 border-t border-line p-5">
          <span className="text-13 font-medium text-ink">Desglose de identidad</span>
          <dl className="m-0 flex flex-col gap-4">
            {details.map(([k, v]) => (
              <div key={k} className="flex flex-col gap-1">
                <dt className="text-xs text-ink-2">{DETAIL_LABEL[k] ?? k}</dt>
                <dd className="m-0 font-serif text-15 text-ink-2">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section aria-label="Referencias de soporte" className="flex flex-col gap-3 border-t border-line p-5">
        <span className="text-13 font-medium text-ink">Referencias de soporte · {refs.length}</span>
        {refs.length ? (
          <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0">
            {refs.map(r => (
              <li key={r.id} className="flex flex-col gap-1">
                <img src={r.image} alt={r.name} className="aspect-square w-full rounded-ctrl border border-line object-cover" referrerPolicy="no-referrer" loading="lazy" />
                <span className="font-mono text-xs text-ink-2">{r.id}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-13 text-ink-2">Asigná patrones para ver su evidencia.</p>
        )}
      </section>
    </div>
  );
}
