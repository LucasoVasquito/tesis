import React, { useEffect, useId, useRef, useState } from 'react';
import { MoreHorizontal, Pipette, Plus, Sparkles, X } from 'lucide-react';
import { Pattern, Project, Reference, Rule, RuleField, VisualSystem } from '../../types';
import { Button, IconButton, TextArea } from '../ui';
import { FAMILIES, familyOf } from '../../utils/families';
import { PaletteBand } from './PaletteBand';
import { ColorCard, RULE_FAMILY, RuleCard } from './RuleCard';
import { PillarTile } from './PillarTile';
import { pillarCandidates, pillarImages } from '../../utils/pillars';

export const DND_TYPE = 'application/x-emergent-pattern';

export const isDrafted = (s: VisualSystem) => !!(s.typographyRules?.length || s.textureRules?.length || s.compositionRules?.length);

interface SystemBoardProps {
  project: Project;
  system: VisualSystem;
  letter: string;
  autoFocusName: boolean;
  inferring: boolean;
  error?: string;
  onRename: (name: string) => void;
  onUpdate: (s: VisualSystem) => void;
  onAssign: (patternId: string) => void;
  onUnassign: (patternId: string) => void;
  onSynthesize: () => void;
  onOpenGuidelines: () => void;
  onTryPiece: () => void;
  onInferPalette: () => void;
  onTracePillars: () => void;
  onExportJson: () => void;
  onDelete: () => void;
}

type Tab = RuleField | 'color';

/* ---------- Menú "⋯" ---------- */
function OverflowMenu({ items }: { items: { label: string; onSelect: () => void; danger?: boolean; disabled?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    wrap.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
    const onDoc = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      const list = Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
      const i = list.indexOf(document.activeElement as HTMLElement);
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        btn.current?.focus();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="relative" ref={wrap}>
      <IconButton ref={btn} label="Más acciones del sistema" aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}>
        <MoreHorizontal className="size-4 stroke-[1.5]" />
      </IconButton>
      {open && (
        <ul id={id} role="menu" className="absolute right-0 top-full z-30 mt-1 w-56 rounded-card border border-line-mid bg-raised p-1 shadow-float">
          {items.map(it => (
            <li key={it.label} role="none">
              <button
                type="button"
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
                className={`flex min-h-9 w-full items-center rounded-ctrl px-3 text-left text-13 hover:bg-white/5 focus-visible:bg-white/5 disabled:text-ink-3 ${
                  it.danger ? 'text-discarded-ink' : 'text-ink'
                }`}
              >
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Edición de textos (reemplaza al panel "Detalle") ---------- */
function TextEditor({ system: s, onSave, onCancel }: { system: VisualSystem; onSave: (s: VisualSystem) => void; onCancel: () => void }) {
  const [description, setDescription] = useState(s.description);
  const [pillars, setPillars] = useState<string[]>(s.aestheticPillars ?? []);
  const [newPillar, setNewPillar] = useState('');
  const save = () => {
    const cleaned = pillars.map(p => p.trim()).filter(Boolean);
    const old = s.aestheticPillars ?? [];
    const oldSrc = s.sources?.aestheticPillars ?? [];
    onSave({
      ...s,
      description: description.trim(),
      aestheticPillars: cleaned,
      // Un pilar editado pierde la trazabilidad por posición; uno intacto la conserva.
      sources: {
        aestheticPillars: cleaned.map(p => (old.indexOf(p) >= 0 ? oldSrc[old.indexOf(p)] ?? [] : [])),
        pillarRefs: cleaned.map(p => (old.indexOf(p) >= 0 ? s.sources?.pillarRefs?.[old.indexOf(p)] ?? null : null)),
      },
      updatedAt: new Date().toISOString(),
    });
  };
  return (
    <div className="flex flex-col gap-4 border-b border-line p-6">
      <TextArea label="Descripción" rows={4} className="font-serif text-15" value={description} onChange={e => setDescription(e.target.value)} autoFocus />
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 text-13 text-ink-2">Pilares</legend>
        {pillars.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <input aria-label={`Pilar ${i + 1}`} className="field-input h-9" value={p} onChange={e => setPillars(ps => ps.map((x, j) => (j === i ? e.target.value : x)))} />
            <IconButton label={`Quitar pilar ${i + 1}`} size="sm" bare onClick={() => setPillars(ps => ps.filter((_, j) => j !== i))}>
              <X className="size-4 stroke-[1.5]" />
            </IconButton>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <input
            aria-label="Nuevo pilar"
            placeholder="Agregar pilar"
            className="field-input h-9"
            value={newPillar}
            onChange={e => setNewPillar(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && newPillar.trim()) {
                e.preventDefault();
                setPillars(ps => [...ps, newPillar.trim()]);
                setNewPillar('');
              }
            }}
          />
          <IconButton
            label="Agregar pilar"
            size="sm"
            onClick={() => {
              if (!newPillar.trim()) return;
              setPillars(ps => [...ps, newPillar.trim()]);
              setNewPillar('');
            }}
          >
            <Plus className="size-4 stroke-[1.5]" />
          </IconButton>
        </div>
      </fieldset>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={save}>
          Guardar cambios
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

export function SystemBoard(props: SystemBoardProps) {
  const { project, system: s } = props;
  const [name, setName] = useState(s.name);
  const [over, setOver] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tab, setTab] = useState<Tab>('typographyRules');
  const [showWhy, setShowWhy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  useEffect(() => setName(s.name), [s.name]);
  useEffect(() => {
    if (props.autoFocusName) {
      nameRef.current?.focus();
      nameRef.current?.select();
    }
  }, [props.autoFocusName]);

  const patterns = s.patternIds.map(id => project.patterns.find(p => p.id === id)).filter(Boolean) as Pattern[];
  const refById = new Map(project.references.map(r => [r.id, r]));
  const refIds = Array.from(new Set(patterns.flatMap(p => p.evidence)));
  const palette = s.colorPalette ?? [];
  const drafted = isDrafted(s);
  const brand = project.name.split(/\s[—–-]\s/)[0].trim() || s.name;

  const patternById = (id: string) => project.patterns.find(p => p.id === id);
  const patternMap = new Map(project.patterns.map(p => [p.id, p]));
  const images = pillarImages(s, project);
  const candidates = pillarCandidates(s, project);
  const firstRefOf = (pids: string[]): Reference | undefined => {
    for (const pid of pids) for (const rid of patternById(pid)?.evidence ?? []) if (refById.has(rid)) return refById.get(rid);
    return undefined;
  };

  const tabs: { id: Tab; label: string; count: number; color: string }[] = [
    { id: 'typographyRules', label: 'Tipografía', count: s.typographyRules?.length ?? 0, color: RULE_FAMILY.typographyRules.color },
    { id: 'textureRules', label: 'Textura', count: s.textureRules?.length ?? 0, color: RULE_FAMILY.textureRules.color },
    { id: 'compositionRules', label: 'Composición', count: s.compositionRules?.length ?? 0, color: RULE_FAMILY.compositionRules.color },
    { id: 'color', label: 'Color', count: palette.length, color: '' },
  ];
  const activeRules: Rule[] = tab === 'color' ? [] : (s[tab] ?? []);

  return (
    <article
      aria-labelledby={titleId}
      className={`flex min-w-0 flex-col overflow-hidden rounded-[12px] border bg-surface transition-colors duration-120 ${over ? 'border-signal/60' : 'border-line'}`}
      onDragOver={e => {
        if (Array.from(e.dataTransfer.types).includes(DND_TYPE)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          setOver(true);
        }
      }}
      onDragLeave={e => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(false)}
      onDrop={e => {
        const id = e.dataTransfer.getData(DND_TYPE);
        setOver(false);
        if (id) {
          e.preventDefault();
          props.onAssign(id);
        }
      }}
    >
      {/* 1 · Banda de paleta */}
      {palette.length ? (
        <PaletteBand palette={palette} />
      ) : (
        <div className="flex h-[120px] items-center justify-center gap-3 border-b border-line bg-bg">
          <span className="text-13 text-ink-2">{patterns.length ? 'Sin paleta todavía.' : 'Asigná patrones para inferir la paleta del corpus.'}</span>
          {patterns.length > 0 && (
            <Button size="sm" variant="secondary" icon={<Pipette />} loading={props.inferring} loadingText="Infiriendo…" onClick={props.onInferPalette}>
              Inferir paleta
            </Button>
          )}
        </div>
      )}

      {/* 2 · Cabecera */}
      <div className="flex flex-wrap items-end gap-6 border-b border-line p-6">
        <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-2">
          <span className="font-mono text-xs text-ink-2">
            Sistema {props.letter} · {patterns.length} {patterns.length === 1 ? 'patrón' : 'patrones'} · {refIds.length} referencias
            {s.adoptedFrom ? ' · sugerencia adoptada' : ''}
          </span>
          <label htmlFor={`${titleId}-name`} className="sr-only">
            Nombre del sistema
          </label>
          <h3 id={titleId} className="m-0">
            <input
              id={`${titleId}-name`}
              ref={nameRef}
              value={name}
              onChange={e => setName(e.target.value)}
              onBlur={() => {
                const v = name.trim();
                if (!v) setName(s.name);
                else if (v !== s.name) props.onRename(v);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setName(s.name);
                }
              }}
              className="-ml-1 w-full rounded-ctrl border border-transparent bg-transparent px-1 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink outline-none hover:border-line-mid focus:border-white/40 focus:shadow-[0_0_0_3px_rgba(255,255,255,.08)]"
            />
          </h3>
          {s.description && !editing && <p className="m-0 line-clamp-1 max-w-[720px] font-serif text-[17px] text-ink-2" title={s.description}>{s.description}</p>}
          {/* Patrones asignados (zona de soltado) */}
          <ul className="m-0 mt-1 flex list-none flex-wrap gap-1 p-0" aria-label="Patrones del sistema">
            {patterns.map(p => {
              const f = familyOf(p.category);
              return (
                <li key={p.id} className="flex h-7 items-center gap-1 rounded-tag border pl-2 font-mono text-xs" style={{ borderColor: `oklch(0.8 0.11 ${f.hue ?? 0} / .3)`, color: f.ink }}>
                  <span title={p.name}>{p.id}</span>
                  <button
                    type="button"
                    className="flex size-6 items-center justify-center rounded-tag text-ink-2 hover:bg-white/5 hover:text-ink"
                    aria-label={`Quitar ${p.id} de ${s.name}`}
                    onClick={() => props.onUnassign(p.id)}
                  >
                    <X className="size-3.5 stroke-[1.5]" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
            <li className={`flex h-7 items-center rounded-tag border border-dashed px-2 text-xs ${over ? 'border-signal text-signal-ink' : 'border-line-strong text-ink-2'}`}>
              {over ? 'Soltá para asignar' : 'Arrastrá patrones acá'}
            </li>
          </ul>
        </div>

        {/* Acciones: el énfasis sigue al próximo paso lógico */}
        <div className="flex flex-wrap items-center gap-2">
          {drafted ? (
            <>
              <Button variant="signal" icon={<Sparkles />} onClick={props.onTryPiece} title="Verificación externa: no forma parte del sistema">
                Probar en una pieza
              </Button>
              <Button variant="secondary" onClick={props.onOpenGuidelines}>
                Ver lineamientos
              </Button>
              <Button variant="ghost" loading={!!s.isSynthesizing} loadingText="Redactando…" onClick={props.onSynthesize} disabled={!patterns.length}>
                Volver a redactar
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="signal"
                icon={<Sparkles />}
                loading={!!s.isSynthesizing}
                loadingText="Redactando…"
                onClick={props.onSynthesize}
                disabled={!patterns.length}
                title={!patterns.length ? 'Asigná al menos un patrón' : undefined}
              >
                Redactar con IA
              </Button>
              <Button variant="secondary" onClick={props.onOpenGuidelines}>
                Ver lineamientos
              </Button>
            </>
          )}
          <OverflowMenu
            items={[
              { label: 'Editar descripción y pilares', onSelect: () => setEditing(true) },
              { label: palette.length ? 'Recalcular paleta' : 'Inferir paleta', onSelect: props.onInferPalette, disabled: !patterns.length },
              { label: 'Rastrear pilares con IA', onSelect: props.onTracePillars, disabled: !s.aestheticPillars?.length },
              { label: 'Probar en una pieza', onSelect: props.onTryPiece },
              { label: 'Exportar sistema .json', onSelect: props.onExportJson },
              { label: 'Eliminar sistema', onSelect: () => setConfirmDelete(true), danger: true },
            ]}
          />
        </div>
        {props.error && (
          <p role="alert" className="m-0 w-full text-xs text-error-ink">
            No se pudo redactar: {props.error}
          </p>
        )}
        {confirmDelete && (
          <div role="alert" className="flex w-full flex-wrap items-center gap-3 rounded-ctrl border border-discarded/35 bg-discarded/5 p-3">
            <span className="flex-1 text-13 text-ink">¿Eliminar “{s.name}”? Los patrones siguen confirmados.</span>
            <Button size="sm" variant="discard" autoFocus onClick={props.onDelete}>
              Eliminar sistema
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
          </div>
        )}
      </div>

      {editing && (
        <TextEditor
          system={s}
          onCancel={() => setEditing(false)}
          onSave={next => {
            props.onUpdate(next);
            setEditing(false);
          }}
        />
      )}

      {/* 3 · Pilares */}
      <section aria-label="Pilares" className="flex flex-col gap-4 border-b border-line p-6">
        <span className="font-mono text-xs text-ink-2">Pilares · {s.aestheticPillars?.length ?? 0}</span>
        {s.aestheticPillars?.length ? (
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 p-0">
            {s.aestheticPillars.map((pillar, i) => (
              <PillarTile
                key={i}
                index={i}
                pillar={pillar}
                image={images[i] ?? null}
                patterns={patternMap}
                candidates={candidates}
                onChoose={refId => {
                  const refs = [...(s.sources?.pillarRefs ?? [])];
                  while (refs.length < (s.aestheticPillars?.length ?? 0)) refs.push(null);
                  refs[i] = refId;
                  props.onUpdate({ ...s, sources: { ...s.sources, pillarRefs: refs }, updatedAt: new Date().toISOString() });
                }}
              />
            ))}
          </ul>
        ) : (
          <p className="m-0 text-13 text-ink-2">Todavía no hay pilares. “Redactar con IA” los propone a partir de los patrones asignados.</p>
        )}
      </section>

      {/* 4 · Reglas */}
      <section aria-label="Reglas" className="flex flex-col gap-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="Familias de reglas" className="flex flex-wrap gap-1 rounded-[8px] border border-line bg-bg p-1">
            {tabs.map(t => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`${titleId}-tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`${titleId}-panel`}
                onClick={() => setTab(t.id)}
                className={`flex h-8 items-center gap-2 rounded-ctrl px-3 text-13 font-medium transition-colors duration-120 ${
                  tab === t.id ? 'bg-raised text-ink' : 'text-ink-2 hover:text-ink'
                }`}
              >
                {t.id === 'color' ? (
                  <span aria-hidden="true" className="flex h-2 w-3 overflow-hidden rounded-[2px]">
                    {(palette.length ? palette.slice(0, 3) : [{ hex: '#6B6B73' }]).map((c, i) => (
                      <span key={i} className="flex-1" style={{ background: c.hex }} />
                    ))}
                  </span>
                ) : (
                  <span aria-hidden="true" className="size-2 rounded-[2px]" style={{ background: t.color }} />
                )}
                {t.label}
                <span className="font-mono text-xs text-ink-2">{t.count}</span>
              </button>
            ))}
          </div>
          {tab !== 'color' && activeRules.some(r => r.detail && r.detail !== r.title) && (
            <Button size="sm" variant="ghost" aria-pressed={showWhy} onClick={() => setShowWhy(v => !v)}>
              {showWhy ? 'Ocultar fundamentos' : 'Ver fundamentos'}
            </Button>
          )}
        </div>

        <div id={`${titleId}-panel`} role="tabpanel" aria-labelledby={`${titleId}-tab-${tab}`}>
          {tab === 'color' ? (
            palette.length ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
                {palette.map((c, i) => (
                  <ColorCard key={`${c.hex}-${i}`} c={c} />
                ))}
              </div>
            ) : (
              <p className="m-0 text-13 text-ink-2">Sin paleta inferida.</p>
            )
          ) : activeRules.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
              {activeRules.map((r, i) => (
                <RuleCard
                  key={r.code}
                  index={i}
                  rule={r}
                  family={RULE_FAMILY[tab as RuleField] ?? FAMILIES.image}
                  palette={palette}
                  references={project.references}
                  fallbackRefIds={r.patternIds.flatMap(pid => patternById(pid)?.evidence ?? [])}
                  specimenText={brand}
                  showWhy={showWhy}
                />
              ))}
            </div>
          ) : (
            <p className="m-0 text-13 text-ink-2">
              {drafted ? 'Este sistema no tiene reglas de esta familia.' : 'Todavía no hay reglas. “Redactar con IA” las propone como fichas con ejemplo y trazabilidad.'}
            </p>
          )}
        </div>
      </section>
    </article>
  );
}
