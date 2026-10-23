import React, { useEffect, useId, useRef, useState } from 'react';
import { FileUp, GripVertical } from 'lucide-react';
import { PaletteColor, Pattern, Project, VisualSystem } from '../types';
import { Button, EmptyState, StatusDot } from '../components/ui';
import { familyOf } from '../utils/families';
import { DND_TYPE, SystemBoard } from '../components/synthesis/SystemBoard';
import { SuggestionCard } from '../components/synthesis/SuggestionCard';
import { CompareView, FamilyBar } from '../components/synthesis/CompareView';

interface SynthesisStageProps {
  project: Project;
  onRenameSystem: (id: string, name: string) => void;
  onUpdateSystem: (s: VisualSystem) => void;
  onAssign: (patternId: string, systemId: string) => void;
  onUnassign: (patternId: string, systemId: string) => void;
  onCreateSystemWithPattern: (patternId: string) => void;
  onSynthesize: (id: string) => void;
  onOpenGuidelines: (id: string) => void;
  onTryPiece: (id: string) => void;
  onExportSystem: (id: string) => void;
  onDeleteSystem: (id: string) => void;
  onInferPalette: (id: string) => void;
  onAdoptSuggestion: (id: string) => void;
  onDismissSuggestion: (id: string) => void;
  onImportFile: (file: File) => void;
  /** ID del sistema recién creado o adoptado: se abre su pestaña y se enfoca el nombre. */
  focusSystemId?: string | null;
  synthesisErrors: Record<string, string>;
  inferringIds: string[];
}

const letter = (i: number) => String.fromCharCode(65 + i);

/* ---------- Patrón confirmado: arrastrable o asignable con Enter ---------- */
function ConfirmedPattern({ pattern, project, onAssign, onCreate }: { pattern: Pattern; project: Project; onAssign: (sysId: string) => void; onCreate: () => void }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapRef = useRef<HTMLLIElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const systems = project.systems;
  const inSystems = systems.filter(s => s.patternIds.includes(pattern.id));
  const f = familyOf(pattern.category);
  const thumb = pattern.evidence.map(id => project.references.find(r => r.id === id)).find(Boolean);

  useEffect(() => {
    if (!open) return;
    wrapRef.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus();
    const onDoc = (e: MouseEvent) => !wrapRef.current?.contains(e.target as Node) && setOpen(false);
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
        className="group flex w-full cursor-grab overflow-hidden rounded-card border border-line bg-surface text-left transition-colors duration-120 ease-emergent hover:border-line-strong active:cursor-grabbing"
      >
        <span aria-hidden="true" className="w-[3px] shrink-0" style={{ background: f.color }} />
        <span className="flex min-w-0 flex-1 gap-3 p-3">
          {thumb ? (
            <img src={thumb.image} alt="" className="size-11 shrink-0 rounded-ctrl object-cover" referrerPolicy="no-referrer" loading="lazy" />
          ) : (
            <span className="size-11 shrink-0 rounded-ctrl bg-raised" />
          )}
          <span className="flex min-w-0 flex-col gap-1">
            <span className="font-mono text-xs" style={{ color: f.ink }}>
              {pattern.id} · {f.label}
            </span>
            <span className="text-13 font-medium leading-[1.35] text-ink">{pattern.name}</span>
            <span className="text-xs text-ink-2">{inSystems.length ? `En ${inSystems.map(s => letter(systems.indexOf(s))).join(', ')}` : 'Sin asignar'}</span>
          </span>
        </span>
        <GripVertical aria-hidden="true" className="m-3 ml-0 size-4 shrink-0 stroke-[1.5] text-ink-3 group-hover:text-ink-2" />
      </button>
      <span id={`${menuId}-hint`} className="sr-only">
        Enter para elegir un sistema, o arrastrá al tablero.
      </span>
      {open && (
        <ul
          id={menuId}
          role="menu"
          aria-label={`Asignar ${pattern.id} a un sistema`}
          onKeyDown={onMenuKey}
          className="absolute left-0 right-0 top-full z-30 mt-1 rounded-card border border-line-mid bg-raised p-1 shadow-float"
        >
          {systems.map((s, i) => {
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
                  <span className="font-mono text-xs text-ink-2">{letter(i)}</span>
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

export function SynthesisStage(props: SynthesisStageProps) {
  const { project } = props;
  const confirmed = project.patterns.filter(p => p.status === 'confirmed');
  const suggestions = project.suggestedSystems ?? [];
  const fileRef = useRef<HTMLInputElement>(null);
  const tabsId = useId();
  const [active, setActive] = useState<string>(() => project.systems[0]?.id ?? 'compare');

  // Abrir la pestaña del sistema recién creado o adoptado.
  useEffect(() => {
    if (props.focusSystemId && project.systems.some(s => s.id === props.focusSystemId)) setActive(props.focusSystemId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.focusSystemId, project.systems.length]);
  // Si la pestaña activa dejó de existir, volver a la primera.
  useEffect(() => {
    if (active !== 'compare' && !project.systems.some(s => s.id === active)) setActive(project.systems[0]?.id ?? 'compare');
    if (active === 'compare' && project.systems.length < 2 && project.systems[0]) setActive(project.systems[0].id);
  }, [active, project.systems]);

  const current = project.systems.find(s => s.id === active) ?? null;
  const tabs = [
    ...project.systems.map((s, i) => ({ id: s.id, label: s.name, letter: letter(i), palette: s.colorPalette ?? [] })),
    ...(project.systems.length >= 2 ? [{ id: 'compare', label: 'Comparar', letter: '', palette: [] as PaletteColor[] }] : []),
  ];

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    setActive(next.id);
    document.getElementById(`${tabsId}-${next.id}`)?.focus();
  };

  return (
    <div className="h-full overflow-y-auto lg:overflow-hidden">
      <div className="flex min-h-full flex-col lg:h-full lg:flex-row">
        {/* Izquierda: patrones confirmados */}
        <aside aria-labelledby="confirmed-title" className="flex shrink-0 flex-col border-b border-line lg:w-[300px] lg:border-b-0 lg:border-r">
          <div className="flex flex-col gap-3 border-b border-line px-4 py-5">
            <h2 id="confirmed-title" className="m-0 font-mono text-xs font-normal text-ink-2">
              Patrones confirmados · {confirmed.length}
            </h2>
            <FamilyBar patterns={confirmed} />
            <p className="m-0 text-xs text-ink-2">Arrastralos al tablero, o enfocalos y presioná Enter.</p>
          </div>
          <div className="max-h-[240px] min-h-0 flex-1 overflow-y-auto p-4 lg:max-h-none">
            {confirmed.length === 0 ? (
              <EmptyState meta="0 confirmados" title="Todavía no hay patrones confirmados" body="Confirmá hallazgos en Auditoría para armar sistemas." />
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {confirmed.map(p => (
                  <ConfirmedPattern
                    key={p.id}
                    pattern={p}
                    project={project}
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

        {/* Derecha: sugerencias, pestañas de sistemas y tablero */}
        <section aria-label="Sistemas" className="flex min-w-0 flex-1 flex-col lg:overflow-y-auto">
          <div className="flex flex-col gap-6 p-4 lg:p-6">
            {suggestions.length > 0 && (
              // Sin sistemas, las sugerencias son el punto de partida; con sistemas, quedan plegadas.
              <details className="group flex flex-col" open={project.systems.length === 0}>
                <summary className="flex cursor-pointer list-none items-center gap-2 font-mono text-xs text-signal-ink hover:text-ink [&::-webkit-details-marker]:hidden">
                  <StatusDot tone="signal" glow={false} />
                  Sugerencias de la IA · {suggestions.length}
                  <span className="text-ink-2 group-open:hidden">· ver</span>
                </summary>
                <div className="mt-3 flex flex-col gap-3">
                  {suggestions.map(s => (
                    <SuggestionCard key={s.id} s={s} project={project} onAdopt={() => props.onAdoptSuggestion(s.id)} onDismiss={() => props.onDismissSuggestion(s.id)} />
                  ))}
                </div>
              </details>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              {tabs.length > 0 ? (
                <div role="tablist" aria-label="Sistemas" className="flex max-w-full gap-1 overflow-x-auto rounded-[8px] border border-line bg-bg p-1">
                  {tabs.map((t, i) => (
                    <button
                      key={t.id}
                      id={`${tabsId}-${t.id}`}
                      type="button"
                      role="tab"
                      aria-selected={active === t.id}
                      aria-controls={`${tabsId}-panel`}
                      tabIndex={active === t.id ? 0 : -1}
                      onClick={() => setActive(t.id)}
                      onKeyDown={e => onTabKey(e, i)}
                      className={`flex h-9 shrink-0 items-center gap-2 rounded-ctrl px-3 text-13 font-medium transition-colors duration-120 ${
                        active === t.id ? 'bg-raised text-ink' : 'text-ink-2 hover:text-ink'
                      }`}
                    >
                      {t.letter && <span className="font-mono text-xs text-ink-2">{t.letter}</span>}
                      {t.palette.length > 0 && (
                        <span aria-hidden="true" className="flex h-2.5 w-6 overflow-hidden rounded-[2px]">
                          {t.palette.slice(0, 4).map((c, k) => (
                            <span key={k} className="flex-1" style={{ background: c.hex }} />
                          ))}
                        </span>
                      )}
                      <span className="max-w-[220px] truncate">{t.label}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <span />
              )}
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

            <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={tabs.length ? `${tabsId}-${active}` : undefined}>
              {project.systems.length === 0 ? (
                <EmptyState
                  meta="0 sistemas"
                  title="Todavía no hay sistemas"
                  body={suggestions.length ? 'Adoptá una sugerencia de la IA o creá uno con “Nuevo sistema”.' : 'Creá uno con “Nuevo sistema” o desde un patrón confirmado.'}
                  className="mx-auto max-w-md"
                />
              ) : active === 'compare' ? (
                <CompareView project={project} onOpen={setActive} />
              ) : current ? (
                <SystemBoard
                  key={current.id}
                  project={project}
                  system={current}
                  letter={letter(project.systems.indexOf(current))}
                  autoFocusName={props.focusSystemId === current.id}
                  inferring={props.inferringIds.includes(current.id)}
                  error={props.synthesisErrors[current.id]}
                  onRename={name => props.onRenameSystem(current.id, name)}
                  onUpdate={props.onUpdateSystem}
                  onAssign={pid => props.onAssign(pid, current.id)}
                  onUnassign={pid => props.onUnassign(pid, current.id)}
                  onSynthesize={() => props.onSynthesize(current.id)}
                  onOpenGuidelines={() => props.onOpenGuidelines(current.id)}
                  onTryPiece={() => props.onTryPiece(current.id)}
                  onInferPalette={() => props.onInferPalette(current.id)}
                  onExportJson={() => props.onExportSystem(current.id)}
                  onDelete={() => props.onDeleteSystem(current.id)}
                />
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
