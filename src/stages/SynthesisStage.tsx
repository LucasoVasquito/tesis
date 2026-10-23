import React, { useEffect, useId, useRef, useState } from 'react';
import { FileUp, GripVertical, Pipette, Sparkles, Trash2, X } from 'lucide-react';
import { Pattern, Project, SuggestedSystem, TraceableField, VisualSystem } from '../types';
import { Button, CategoryTag, EmptyState, IconButton, StatusDot, Swatch } from '../components/ui';

const DND_TYPE = 'application/x-emergent-pattern';

interface SynthesisStageProps {
  project: Project;
  onRenameSystem: (id: string, name: string) => void;
  onAssign: (patternId: string, systemId: string) => void;
  onUnassign: (patternId: string, systemId: string) => void;
  onCreateSystemWithPattern: (patternId: string) => void;
  onSynthesize: (id: string) => void;
  onOpenGuidelines: (id: string) => void;
  onOpenDetail: (id: string) => void;
  onDeleteSystem: (id: string) => void;
  onInferPalette: (id: string) => void;
  onAdoptSuggestion: (id: string) => void;
  onDismissSuggestion: (id: string) => void;
  onImportFile: (file: File) => void;
  /** ID del sistema recién creado, para enfocar su nombre. */
  focusSystemId?: string | null;
  synthesisErrors: Record<string, string>;
  inferringIds: string[];
}

/* ---------- Patrón confirmado (arrastrable / asignable con teclado) ---------- */
function ConfirmedPattern({ pattern, systems, onAssign, onCreate }: { pattern: Pattern; systems: VisualSystem[]; onAssign: (sysId: string) => void; onCreate: () => void }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapRef = useRef<HTMLLIElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const inSystems = systems.filter(s => s.patternIds.includes(pattern.id));

  useEffect(() => {
    if (!open) return;
    wrapRef.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus();
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    const items = Array.from(wrapRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      btnRef.current?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    }
  };

  const pick = (fn: () => void) => () => {
    fn();
    setOpen(false);
    btnRef.current?.focus();
  };

  return (
    <li ref={wrapRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        draggable
        onDragStart={e => {
          e.dataTransfer.setData(DND_TYPE, pattern.id);
          e.dataTransfer.setData('text/plain', pattern.id);
          e.dataTransfer.effectAllowed = 'copy';
        }}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-describedby={`${menuId}-hint`}
        className="group flex w-full cursor-grab items-start gap-2 rounded-card border border-line bg-surface p-3 text-left transition-colors duration-120 ease-emergent hover:border-line-strong active:cursor-grabbing"
      >
        <GripVertical aria-hidden="true" className="mt-0.5 size-4 shrink-0 stroke-[1.5] text-ink-3 group-hover:text-ink-2" />
        <span className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-ink-2">{pattern.id}</span>
            <CategoryTag category={pattern.category} />
          </span>
          <span className="text-13 font-medium leading-[1.35] text-ink">{pattern.name}</span>
          <span className="text-xs text-ink-2">
            {inSystems.length ? `En: ${inSystems.map(s => s.name).join(', ')}` : 'Sin asignar'}
          </span>
        </span>
      </button>
      <span id={`${menuId}-hint`} className="sr-only">
        Enter para elegir un sistema, o arrastrá a una columna.
      </span>
      {open && (
        <ul
          id={menuId}
          role="menu"
          aria-label={`Asignar ${pattern.id} a un sistema`}
          onKeyDown={onMenuKey}
          className="absolute left-0 right-0 top-full z-30 mt-1 rounded-card border border-line-mid bg-raised p-1 shadow-float"
        >
          {systems.map(s => {
            const has = s.patternIds.includes(pattern.id);
            return (
              <li key={s.id} role="none">
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={has}
                  onClick={pick(() => onAssign(s.id))}
                  className="flex min-h-9 w-full items-center gap-2 rounded-ctrl px-3 text-left text-13 text-ink hover:bg-white/5 focus-visible:bg-white/5"
                >
                  <StatusDot tone={has ? 'confirmed' : 'neutral'} glow={false} />
                  <span className="truncate">{s.name}</span>
                  {has && <span className="ml-auto font-mono text-xs text-ink-2">asignado</span>}
                </button>
              </li>
            );
          })}
          <li role="none">
            <button
              type="button"
              role="menuitem"
              onClick={pick(onCreate)}
              className="flex min-h-9 w-full items-center gap-2 rounded-ctrl px-3 text-left text-13 text-ink hover:bg-white/5 focus-visible:bg-white/5"
            >
              + Nuevo sistema con este patrón
            </button>
          </li>
        </ul>
      )}
    </li>
  );
}

/* ---------- Lista con trazabilidad ---------- */
function TracedList({ title, items, sources }: { title: string; items?: string[]; sources?: string[][] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-ink-2">{title}</span>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {items.map((it, i) => (
          <li key={i} className="flex flex-col gap-0.5">
            <span className="font-serif text-15 leading-snug text-ink">{it}</span>
            {sources?.[i]?.length ? <span className="font-mono text-xs text-ink-2">← {sources[i].join(', ')}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Columna de sistema ---------- */
function SystemColumn(props: {
  system: VisualSystem;
  patterns: Pattern[];
  autoFocusName: boolean;
  error?: string;
  inferring: boolean;
} & Pick<SynthesisStageProps, 'onRenameSystem' | 'onAssign' | 'onUnassign' | 'onSynthesize' | 'onOpenGuidelines' | 'onOpenDetail' | 'onDeleteSystem' | 'onInferPalette'>) {
  const { system: s, patterns } = props;
  const [name, setName] = useState(s.name);
  const [over, setOver] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const nameId = useId();
  useEffect(() => setName(s.name), [s.name]);
  useEffect(() => {
    if (props.autoFocusName) {
      nameRef.current?.focus();
      nameRef.current?.select();
    }
  }, [props.autoFocusName]);

  const assigned = s.patternIds.map(id => patterns.find(p => p.id === id)).filter(Boolean) as Pattern[];
  const field = (f: TraceableField) => s.sources?.[f];

  return (
    <section
      aria-labelledby={nameId}
      className={`flex min-w-0 flex-col rounded-card border bg-surface transition-colors duration-120 ease-emergent ${over ? 'border-ink/60' : 'border-line'}`}
      onDragOver={e => {
        if (Array.from(e.dataTransfer.types).includes(DND_TYPE)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          setOver(true);
        }
      }}
      onDragLeave={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={e => {
        const id = e.dataTransfer.getData(DND_TYPE);
        setOver(false);
        if (id) {
          e.preventDefault();
          props.onAssign(id, s.id);
        }
      }}
    >
      <header className="flex flex-col gap-2 border-b border-line p-4">
        <span className="font-mono text-xs text-ink-2">
          {s.id}
          {s.adoptedFrom ? ' · sugerencia adoptada' : ''}
        </span>
        <label htmlFor={`${nameId}-input`} className="sr-only">
          Nombre del sistema
        </label>
        <h3 id={nameId} className="m-0">
          <input
            id={`${nameId}-input`}
            ref={nameRef}
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={() => {
              const v = name.trim();
              if (!v) setName(s.name);
              else if (v !== s.name) props.onRenameSystem(s.id, v);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                e.preventDefault();
                setName(s.name);
              }
            }}
            className="w-full rounded-ctrl border border-transparent bg-transparent px-1 py-0.5 text-lg font-medium tracking-[-0.01em] text-ink outline-none hover:border-line-mid focus:border-white/40 focus:shadow-[0_0_0_3px_rgba(255,255,255,.08)]"
          />
        </h3>
      </header>

      {/* Zona de soltado */}
      <div className="flex flex-col gap-2 border-b border-line p-4">
        <span className="text-xs text-ink-2">Patrones · {assigned.length}</span>
        {assigned.length === 0 ? (
          <div className="rounded-ctrl border border-dashed border-line-strong px-3 py-4 text-center text-13 text-ink-2">
            Arrastrá patrones confirmados acá, o elegí este sistema desde la lista con Enter.
          </div>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {assigned.map(p => (
              <li key={p.id} className="flex items-center gap-2 rounded-ctrl bg-white/[.03] py-1 pl-3 pr-1">
                <span className="font-mono text-xs text-ink-2">{p.id}</span>
                <span className="min-w-0 flex-1 truncate text-13 text-ink" title={p.name}>
                  {p.name}
                </span>
                <IconButton label={`Quitar ${p.id} de ${s.name}`} size="sm" bare onClick={() => props.onUnassign(p.id, s.id)}>
                  <X className="size-4 stroke-[1.5]" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
        {over && <span className="text-xs text-ink">Soltá para asignar</span>}
      </div>

      {/* Paleta inferida */}
      <div className="flex flex-col gap-2 border-b border-line p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-ink-2">Paleta inferida del corpus</span>
          <Button
            size="sm"
            variant="ghost"
            icon={<Pipette />}
            loading={props.inferring}
            loadingText="Infiriendo…"
            onClick={() => props.onInferPalette(s.id)}
            disabled={assigned.length === 0}
          >
            {s.colorPalette?.length ? 'Recalcular' : 'Inferir'}
          </Button>
        </div>
        {s.colorPalette?.length ? (
          <>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
              {s.colorPalette.map((c, i) => (
                <Swatch key={`${c.hex}-${i}`} hex={c.hex} name={c.name} source={c.source} />
              ))}
            </div>
            {s.colorPalette.length < 4 && (
              <p className="m-0 text-xs text-ink-2">La evidencia solo aporta {s.colorPalette.length} colores distintos.</p>
            )}
            {s.colorPalette.some(c => !c.source) && (
              <p className="m-0 text-xs text-pending-ink">Hay colores sin origen en el corpus. Recalculá para obtener trazabilidad.</p>
            )}
          </>
        ) : (
          <p className="m-0 text-13 text-ink-2">Se calcula con los colores de la evidencia de los patrones asignados.</p>
        )}
      </div>

      {/* Contenido redactado */}
      <div className="flex flex-1 flex-col gap-5 p-4">
        {s.description ? (
          <p className="m-0 line-clamp-6 font-serif text-15 leading-normal text-ink-2">{s.description}</p>
        ) : null}
        <TracedList title="Pilares" items={s.aestheticPillars} sources={field('aestheticPillars')} />
        <TracedList title="Tipografía" items={s.typographyRules} sources={field('typographyRules')} />
        <TracedList title="Textura" items={s.textureRules} sources={field('textureRules')} />
        <TracedList title="Composición" items={s.compositionRules} sources={field('compositionRules')} />
        {props.error && (
          <p role="alert" className="m-0 text-xs text-error-ink">
            No se pudo redactar: {props.error}
          </p>
        )}
      </div>

      <footer className="flex flex-col gap-2 border-t border-line p-4">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon={<Sparkles />}
            loading={!!s.isSynthesizing}
            loadingText="Redactando…"
            disabled={assigned.length === 0}
            onClick={() => props.onSynthesize(s.id)}
            title={assigned.length === 0 ? 'Asigná al menos un patrón' : undefined}
          >
            Redactar con IA
          </Button>
          <Button size="sm" variant="ghost" onClick={() => props.onOpenGuidelines(s.id)}>
            Ver lineamientos
          </Button>
          <Button size="sm" variant="ghost" onClick={() => props.onOpenDetail(s.id)}>
            Detalle
          </Button>
          {!confirmDelete && (
            <IconButton label={`Eliminar ${s.name}`} size="sm" bare className="ml-auto" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4 stroke-[1.5]" />
            </IconButton>
          )}
        </div>
        {confirmDelete && (
          <div role="alert" className="flex flex-col gap-2 rounded-ctrl border border-discarded/35 bg-discarded/5 p-3">
            <span className="text-13 text-ink">¿Eliminar “{s.name}”? Los patrones siguen confirmados.</span>
            <div className="flex gap-2">
              <Button size="sm" variant="discard" autoFocus onClick={() => props.onDeleteSystem(s.id)}>
                Eliminar sistema
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </footer>
    </section>
  );
}

/* ---------- Sugerencia de la IA (columna fantasma) ---------- */
function SuggestionColumn({ s, patterns, onAdopt, onDismiss }: { s: SuggestedSystem; patterns: Pattern[]; onAdopt: () => void; onDismiss: () => void }) {
  const names = new Set((s.associatedPatternNames ?? []).map(n => n.toLowerCase()));
  const matched = patterns.filter(p => names.has(p.name.toLowerCase()));
  const confirmed = matched.filter(p => p.status === 'confirmed');
  return (
    <section aria-label={`Sugerencia de la IA: ${s.name}`} className="flex min-w-0 flex-col gap-4 rounded-card border border-dashed border-line-strong p-4">
      <span className="font-mono text-xs text-ink-2">Sugerencia de la IA</span>
      <h3 className="m-0 text-lg font-medium tracking-[-0.01em] text-ink">{s.name}</h3>
      <p className="m-0 line-clamp-5 font-serif text-15 text-ink-2">{s.description}</p>
      {s.aestheticPillars?.length > 0 && (
        <ul className="m-0 flex list-disc flex-col gap-1 pl-[18px] text-13 text-ink-2">
          {s.aestheticPillars.slice(0, 4).map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}
      <span className="text-xs text-ink-2">
        {matched.length
          ? `${confirmed.length} de ${matched.length} patrones asociados están confirmados${confirmed.length < matched.length ? '; solo esos se incorporan.' : '.'}`
          : 'Sin patrones asociados reconocibles.'}
      </span>
      <div className="mt-auto flex gap-2">
        <Button size="sm" variant="secondary" onClick={onAdopt}>
          Adoptar
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Descartar
        </Button>
      </div>
    </section>
  );
}

export function SynthesisStage(props: SynthesisStageProps) {
  const { project } = props;
  const confirmed = project.patterns.filter(p => p.status === 'confirmed');
  const fileRef = useRef<HTMLInputElement>(null);
  const suggestions = project.suggestedSystems ?? [];

  return (
    <div className="h-full overflow-y-auto lg:overflow-hidden">
      <div className="flex min-h-full flex-col lg:h-full lg:flex-row">
        {/* Izquierda: patrones confirmados */}
        <aside aria-labelledby="confirmed-title" className="flex shrink-0 flex-col border-b border-line lg:w-[320px] lg:border-b-0 lg:border-r">
          <div className="flex flex-col gap-1 border-b border-line px-4 py-4">
            <span className="font-mono text-xs text-ink-2">05 · Síntesis</span>
            <h2 id="confirmed-title" className="m-0 text-15 font-medium text-ink">
              Patrones confirmados · {confirmed.length}
            </h2>
            <p className="m-0 text-13 text-ink-2">Arrastralos a un sistema, o enfocalos y presioná Enter.</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {confirmed.length === 0 ? (
              <EmptyState meta="0 confirmados" title="Todavía no hay patrones confirmados" body="Confirmá hallazgos en Auditoría para armar sistemas." />
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {confirmed.map(p => (
                  <ConfirmedPattern
                    key={p.id}
                    pattern={p}
                    systems={project.systems}
                    onAssign={sysId =>
                      project.systems.find(s => s.id === sysId)?.patternIds.includes(p.id) ? props.onUnassign(p.id, sysId) : props.onAssign(p.id, sysId)
                    }
                    onCreate={() => props.onCreateSystemWithPattern(p.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Derecha: sistemas */}
        <section aria-labelledby="systems-title" className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 lg:px-6">
            <div className="flex flex-col gap-1">
              <h2 id="systems-title" className="m-0 text-2xl font-medium tracking-[-0.01em] text-ink">
                Sistemas y lineamientos
              </h2>
              <p className="m-0 text-13 text-ink-2">Armá sistemas divergentes con los patrones confirmados y comparalos lado a lado.</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) props.onImportFile(f);
                e.target.value = '';
              }}
            />
            <Button size="sm" variant="ghost" icon={<FileUp />} onClick={() => fileRef.current?.click()}>
              Importar sistema (.json)
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto p-4 lg:p-6">
            {project.systems.length === 0 && suggestions.length === 0 ? (
              <div className="mx-auto max-w-md">
                <EmptyState
                  meta="0 sistemas"
                  title="Todavía no hay sistemas"
                  body="Creá uno con “Nuevo sistema” o desde un patrón confirmado."
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 items-start gap-4 lg:auto-cols-[minmax(300px,1fr)] lg:grid-flow-col lg:grid-cols-none">
                {project.systems.map(s => (
                  <SystemColumn
                    key={s.id}
                    system={s}
                    patterns={project.patterns}
                    autoFocusName={props.focusSystemId === s.id}
                    error={props.synthesisErrors[s.id]}
                    inferring={props.inferringIds.includes(s.id)}
                    onRenameSystem={props.onRenameSystem}
                    onAssign={props.onAssign}
                    onUnassign={props.onUnassign}
                    onSynthesize={props.onSynthesize}
                    onOpenGuidelines={props.onOpenGuidelines}
                    onOpenDetail={props.onOpenDetail}
                    onDeleteSystem={props.onDeleteSystem}
                    onInferPalette={props.onInferPalette}
                  />
                ))}
                {suggestions.map(s => (
                  <SuggestionColumn
                    key={s.id}
                    s={s}
                    patterns={project.patterns}
                    onAdopt={() => props.onAdoptSuggestion(s.id)}
                    onDismiss={() => props.onDismissSuggestion(s.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
