import React, { useMemo, useState } from 'react';
import { Anchor, Copy, Download, Sparkles } from 'lucide-react';
import { Project, Reference, SystemResourceKey, VisualSystem } from '../types';
import { Button, EmptyState, ErrorState, LoadingState, TextArea, TextInput } from './ui';
import { FullView } from './shell/FullView';
import { compressImageString } from '../utils/imageCompressor';

interface SystemApplicationViewProps {
  project: Project;
  system: VisualSystem;
  onBack: () => void;
  onOpenLightbox: (ref: Reference) => void;
}

interface Iteration {
  id: string;
  imageUrl: string;
  promptUsed: string;
  modelUsed: string;
  size: string;
  referencesUsed: string[];
  appliedResources: string[];
  request: string;
  revision?: string;
  at: string;
}

const RESOURCES: { key: SystemResourceKey; label: string; category?: string }[] = [
  { key: 'palette', label: 'Paleta' },
  { key: 'typography', label: 'Tipografía', category: 'typography' },
  { key: 'texture', label: 'Textura', category: 'texture' },
  { key: 'composition', label: 'Composición', category: 'composition' },
  { key: 'graphic_elements', label: 'Recursos gráficos', category: 'graphic_elements' },
  { key: 'photography', label: 'Fotografía', category: 'photography_treatment' },
  { key: 'illustration', label: 'Ilustración', category: 'mascot_illustration' },
];

const SUPPORTS: { label: string; text: (s: VisualSystem, p: Project) => string }[] = [
  { label: 'Afiche', text: s => `Afiche de comunicación de ${s.name}` },
  { label: 'Packaging', text: s => `Packaging principal de ${s.name}` },
  { label: 'Post', text: (_s, p) => `Post de Instagram para ${p.name}` },
  { label: 'Fachada', text: (_s, p) => `Fachada del local de ${p.name}` },
  { label: 'Logo', text: (_s, p) => `Logotipo de ${p.name}` },
];

/**
 * Verificación externa: genera una pieza con OpenAI (GPT Image) a partir de los lineamientos.
 * No forma parte del sistema: sirve para ver si el sistema se sostiene fuera del corpus.
 */
export function SystemApplicationView({ project, system, onBack, onOpenLightbox }: SystemApplicationViewProps) {
  const patterns = project.patterns.filter(p => system.patternIds.includes(p.id) && p.status === 'confirmed');
  const [description, setDescription] = useState('');
  const [resources, setResources] = useState<Record<SystemResourceKey, boolean>>({
    palette: true,
    typography: true,
    texture: true,
    composition: true,
    graphic_elements: true,
    photography: false,
    illustration: false,
  });
  const [iterations, setIterations] = useState<Iteration[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [revision, setRevision] = useState('');
  const [busy, setBusy] = useState<null | 'new' | 'revision'>(null);
  const [error, setError] = useState<{ message: string; detail?: string; prompt?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const current = iterations[activeIdx] ?? null;
  const anchor = iterations.find(i => i.id === anchorId) ?? null;

  /** Referencias de evidencia que se envían como imágenes de entrada (hasta 3), priorizando los recursos activos. */
  const evidenceRefs = useMemo(() => {
    const activeCats = new Set(RESOURCES.filter(r => resources[r.key] && r.category).map(r => r.category));
    const ranked = [...patterns].sort((a, b) => Number(activeCats.has(b.category)) - Number(activeCats.has(a.category)) || b.confidence - a.confidence);
    const ids: string[] = [];
    for (const p of ranked) for (const id of p.evidence) if (!ids.includes(id)) ids.push(id);
    return ids
      .map(id => project.references.find(r => r.id === id))
      .filter(Boolean)
      .slice(0, 3) as Reference[];
  }, [patterns, project.references, resources]);

  const ruleFor = (key: SystemResourceKey): string => {
    if (key === 'palette') return system.colorPalette?.length ? system.colorPalette.slice(0, 4).map(c => c.hex).join(' · ') : 'Sin paleta inferida';
    const map: Partial<Record<SystemResourceKey, string | undefined>> = {
      typography: system.typographyRules?.[0],
      texture: system.textureRules?.[0],
      composition: system.compositionRules?.[0],
      photography: system.systemDetails?.photographyStyle,
      illustration: system.systemDetails?.mascotAndIllustration,
    };
    const cat = RESOURCES.find(r => r.key === key)?.category;
    return map[key] || patterns.find(p => p.category === cat)?.name || 'Sin regla en este sistema';
  };

  const generate = async (mode: 'new' | 'revision') => {
    if (mode === 'revision' && (!current || !revision.trim())) return;
    setBusy(mode);
    setError(null);
    try {
      const refs = await Promise.all(
        evidenceRefs.map(async r => ({ id: r.id, image: await compressImageString(r.image, { maxWidth: 768, maxHeight: 768, quality: 0.85 }) })),
      );
      const request = description.trim() || `Pieza clave de identidad de ${system.name}`;
      const res = await fetch('/api/generate-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system,
          projectName: project.name,
          confirmedPatterns: patterns,
          selectedResources: resources,
          references: refs,
          userDescription: mode === 'revision' && current ? current.request : request,
          iterationPrompt: mode === 'revision' ? revision.trim() : undefined,
          previousImageUrl: mode === 'revision' ? current?.imageUrl : undefined,
          anchorImageUrl: mode === 'new' ? anchor?.imageUrl : undefined,
        }),
      });
      const text = await res.text();
      let result: any;
      try {
        result = JSON.parse(text);
      } catch {
        throw Object.assign(new Error(`El servidor no devolvió una respuesta válida (HTTP ${res.status}).`), { detail: text.slice(0, 400) });
      }
      if (!res.ok || !result.success) throw Object.assign(new Error(result.error || 'No se pudo generar la pieza'), { detail: result.details, prompt: result.promptUsed });
      const d = result.data;
      const it: Iteration = {
        id: `it_${Date.now()}`,
        imageUrl: d.imageUrl,
        promptUsed: d.promptUsed,
        modelUsed: d.modelUsed,
        size: d.size,
        referencesUsed: d.referencesUsed ?? [],
        appliedResources: d.appliedResources ?? [],
        request: mode === 'revision' && current ? current.request : request,
        revision: mode === 'revision' ? revision.trim() : undefined,
        at: new Date().toISOString(),
      };
      setIterations(list => {
        setActiveIdx(list.length);
        return [...list, it];
      });
      if (mode === 'revision') setRevision('');
    } catch (err: any) {
      setError({ message: err?.message || String(err), detail: err?.detail, prompt: err?.prompt });
    } finally {
      setBusy(null);
    }
  };

  const copyPrompt = async () => {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(current.promptUsed);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* noop */
    }
  };

  return (
    <FullView title={`Probar en una pieza · ${system.name}`} meta="VERIFICACIÓN EXTERNA · no forma parte del sistema" onBack={onBack} backLabel="Lineamientos">
      <div className="mx-auto grid max-w-[1240px] gap-8 px-4 py-8 lg:grid-cols-[380px_minmax(0,1fr)] lg:px-8">
        {/* Pedido */}
        <form
          className="flex flex-col gap-6"
          onSubmit={e => {
            e.preventDefault();
            generate('new');
          }}
        >
          <div className="flex flex-col gap-2">
            <span className="text-13 text-ink-2">Soporte</span>
            <div className="flex flex-wrap gap-1">
              {SUPPORTS.map(s => (
                <button key={s.label} type="button" className="btn btn-secondary btn-sm" onClick={() => setDescription(s.text(system, project))}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <TextArea
            label="Qué pieza querés ver"
            rows={3}
            placeholder={`Ej: Afiche para el lanzamiento de ${project.name || 'la marca'}`}
            hint="El soporte define el formato: afiches y stories salen verticales; fachadas y web, horizontales."
            value={description}
            onChange={e => setDescription(e.target.value)}
          />

          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 text-13 text-ink-2">Recursos del sistema que entran en el pedido</legend>
            {RESOURCES.map(r => (
              <label key={r.key} className="flex cursor-pointer items-start gap-3 rounded-ctrl border border-line p-3 hover:border-line-strong">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-[#EDEDEF]"
                  checked={resources[r.key]}
                  onChange={() => setResources(x => ({ ...x, [r.key]: !x[r.key] }))}
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-13 font-medium text-ink">{r.label}</span>
                  <span className="line-clamp-2 text-xs text-ink-2">{ruleFor(r.key)}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="flex flex-col gap-2">
            <span className="text-13 text-ink-2">Evidencia enviada como imagen de entrada · {evidenceRefs.length}</span>
            {evidenceRefs.length ? (
              <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0">
                {evidenceRefs.map(r => (
                  <li key={r.id}>
                    <button type="button" onClick={() => onOpenLightbox(r)} className="flex w-full flex-col gap-1 text-left text-ink-2 hover:text-ink" aria-label={`Ver ${r.name} (${r.id})`}>
                      <img src={r.image} alt="" className="aspect-square w-full rounded-ctrl border border-evidence/60 object-cover" referrerPolicy="no-referrer" />
                      <span className="font-mono text-xs">{r.id}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-xs text-ink-2">El sistema no tiene patrones con evidencia: se genera solo con el texto.</p>
            )}
            <p className="m-0 text-xs text-ink-2">El modelo hereda paleta, materiales y lenguaje gráfico de estas imágenes, sin copiar su contenido.</p>
          </div>

          {anchor && (
            <div className="flex items-center gap-3 rounded-ctrl border border-line p-3">
              <img src={anchor.imageUrl} alt="" className="size-10 rounded-tag object-cover" />
              <span className="flex-1 text-xs text-ink-2">Ancla de estilo activa: las piezas nuevas mantienen su lenguaje visual.</span>
              <Button size="sm" variant="ghost" onClick={() => setAnchorId(null)}>
                Quitar
              </Button>
            </div>
          )}

          <Button type="submit" variant="primary" loading={busy === 'new'} loadingText="Generando…" icon={<Sparkles />} disabled={!!busy}>
            Generar pieza
          </Button>
        </form>

        {/* Resultado */}
        <section aria-label="Resultado" aria-busy={!!busy} className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-8 lg:self-start">
          {busy ? (
            <LoadingState
              meta={`VERIFICACIÓN · ${busy === 'revision' ? 'ITERACIÓN' : 'PIEZA NUEVA'}`}
              title="Generando con OpenAI"
              steps={[
                { label: 'prompt', state: 'done' },
                { label: `${evidenceRefs.length} referencias de evidencia`, state: 'done' },
                { label: 'imagen', state: 'current' },
              ]}
              note="Suele tardar entre 20 y 60 segundos."
            />
          ) : error ? (
            <ErrorState
              code="VERIFICACIÓN"
              title="No se pudo generar la pieza"
              body={error.message}
              detail={[error.detail, error.prompt && `Prompt:\n${error.prompt}`].filter(Boolean).join('\n\n') || undefined}
              onRetry={() => generate(current && revision.trim() ? 'revision' : 'new')}
              onDismiss={() => setError(null)}
            />
          ) : !current ? (
            <EmptyState
              meta="0 piezas"
              title="Todavía no generaste ninguna pieza"
              body="Elegí un soporte, revisá los recursos y generá. Las piezas no se guardan en el proyecto."
              className="min-h-[360px]"
            />
          ) : null}

          {current && !busy && (
            <div className="flex flex-col gap-4">
              <figure className="m-0 flex flex-col gap-3">
                <img src={current.imageUrl} alt={`Pieza generada: ${current.request}`} className="max-h-[70vh] w-full rounded-card border border-line bg-surface object-contain" />
                <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-ink-2">
                  <span>{current.modelUsed}</span>
                  <span>{current.size}</span>
                  <span>evidencia: {current.referencesUsed.join(', ') || '—'}</span>
                  {current.revision && <span>iteración: “{current.revision}”</span>}
                </figcaption>
              </figure>

              <div className="flex flex-wrap gap-2">
                <a className="btn btn-secondary btn-sm" href={current.imageUrl} download={`${system.name.replace(/\s+/g, '_')}_${current.id}.png`}>
                  <Download aria-hidden="true" />
                  Descargar
                </a>
                <Button size="sm" variant="ghost" icon={<Anchor />} aria-pressed={anchorId === current.id} onClick={() => setAnchorId(a => (a === current.id ? null : current.id))}>
                  {anchorId === current.id ? 'Es el ancla de estilo' : 'Usar como ancla de estilo'}
                </Button>
              </div>

              <form
                className="flex flex-col gap-2 sm:flex-row sm:items-end"
                onSubmit={e => {
                  e.preventDefault();
                  generate('revision');
                }}
              >
                <TextInput
                  label="Ajustar esta pieza"
                  placeholder="Ej: más aire arriba, el titular más chico"
                  value={revision}
                  onChange={e => setRevision(e.target.value)}
                  wrapperClassName="flex-1"
                />
                <Button type="submit" variant="secondary" disabled={!revision.trim() || !!busy}>
                  Iterar
                </Button>
              </form>

              <details className="group rounded-card border border-line bg-surface">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-13 text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
                  Prompt usado (trazabilidad)
                  <span className="font-mono text-xs">{current.promptUsed.length} caracteres</span>
                </summary>
                <div className="flex flex-col gap-3 border-t border-line p-4">
                  <pre className="m-0 whitespace-pre-wrap font-mono text-xs text-ink-2">{current.promptUsed}</pre>
                  <Button size="sm" variant="ghost" icon={<Copy />} onClick={copyPrompt} className="self-start">
                    {copied ? 'Copiado' : 'Copiar prompt'}
                  </Button>
                </div>
              </details>
            </div>
          )}

          {iterations.length > 1 && (
            <div className="flex flex-col gap-2">
              <span className="text-13 text-ink-2">Iteraciones · {iterations.length}</span>
              <ul className="m-0 flex list-none gap-2 overflow-x-auto p-0">
                {iterations.map((it, i) => (
                  <li key={it.id} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => setActiveIdx(i)}
                      aria-pressed={i === activeIdx}
                      aria-label={`Iteración ${i + 1}${it.id === anchorId ? ' (ancla de estilo)' : ''}`}
                      className={`block overflow-hidden rounded-ctrl border ${i === activeIdx ? 'border-ink' : 'border-line hover:border-line-strong'}`}
                    >
                      <img src={it.imageUrl} alt="" className="size-16 object-cover" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </FullView>
  );
}
