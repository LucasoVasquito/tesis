import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Project } from '../../types';
import { useViewport } from '../../hooks/useViewport';

export interface StatusLine {
  mode: 'location' | 'activity' | 'back';
  text: string;
  /** Solo en vuelta atrás: volver a donde estabas. */
  action?: { label: string; run: () => void };
}
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface TopBarProps {
  project: Project;
  projects: Project[];
  onSelectProject: (id: string) => void;
  onNewProject: () => void;
  onEditBrief: () => void;
  onDeleteProject: () => void;
  onDeleteAllProjects: () => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onLoadExample: () => void;
  onDownloadDossier: () => void;
  onOpenLog: () => void;
  onOpenAbout: () => void;
  /** Ayuda: vuelve a mostrar la guía de tres carteles. */
  onOpenHelp: () => void;
  status: StatusLine;
  /** Migas: «Capas › Secundario». */
  crumb?: string;
  save: SaveState;
  /** Las 5 etapas (solo escritorio). */
  nav?: React.ReactNode;
  /** Deshacer el último cambio. */
  onUndo?: () => void;
  canUndo?: boolean;
}

/** Línea de estado: dónde estás, qué está haciendo el agente o que volviste atrás. Una línea de texto con un punto de 8 px que late mientras trabaja. */
export function StatusBar({ status, small, className }: { status: StatusLine; small?: boolean; className?: string }) {
  const dot =
    status.mode === 'activity'
      ? { background: 'var(--cc-l0)' }
      : status.mode === 'back'
        ? { background: 'var(--cc-warn)' }
        : { background: 'color-mix(in srgb, var(--cc-text) 45%, transparent)' };
  return (
    <div role="status" aria-live="polite" className={`flex min-w-0 items-center gap-3 ${className ?? ''}`}>
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${status.mode === 'activity' ? 'motion-safe:animate-pulse' : ''}`} style={dot} />
      <span className={`truncate text-ink ${small ? 'text-[0.875rem]' : 'text-[0.875rem]'}`} style={{ textShadow: '0 0 14px var(--cc-bg), 0 0 4px var(--cc-bg)' }}>
        {status.text}
      </span>
      {status.action && (
        <button type="button" onClick={status.action.run} className="shrink-0 text-[0.875rem] font-bold text-ink underline underline-offset-4 hover:no-underline">
          {status.action.label}
        </button>
      )}
    </div>
  );
}

function SaveIndicator({ state, dot }: { state: SaveState; dot?: boolean }) {
  if (dot) {
    const c = state === 'saving' ? 'var(--cc-text)' : state === 'error' ? 'var(--cc-error)' : 'color-mix(in srgb, var(--cc-text) 45%, transparent)';
    return <span role="img" aria-label={state === 'saving' ? 'Guardando' : state === 'error' ? 'No se guardó' : 'Guardado'} className="size-2 shrink-0 rounded-full" style={{ background: c }} />;
  }
  if (state === 'idle') return <span className="w-[88px]" />;
  const text = state === 'saving' ? 'Guardando…' : state === 'saved' ? '✓ Guardado' : 'No se guardó';
  const color = state === 'saving' ? 'var(--cc-text)' : state === 'saved' ? 'color-mix(in srgb, var(--cc-text) 75%, transparent)' : 'var(--cc-error)';
  return (
    <span aria-live="polite" className="whitespace-nowrap text-[0.875rem]" style={{ color }}>
      {text}
    </span>
  );
}

const MenuLabel = ({ children }: { children: React.ReactNode }) => (
  <li role="presentation" className="px-3 pb-1 pt-3 font-mono text-[0.875rem] text-ink-2">
    {children}
  </li>
);

function MenuItem({ children, onSelect, current, hint }: { children: React.ReactNode; onSelect: () => void; current?: boolean; hint?: string }) {
  return (
    <li role="none">
      <button
        type="button"
        role="menuitem"
        onClick={onSelect}
        aria-current={current || undefined}
        className="flex min-h-9 w-full items-center gap-3 rounded-ctrl px-3 py-2 text-left text-13 text-ink hover:bg-white/5 focus-visible:bg-white/5"
      >
        <span className="flex size-4 shrink-0 items-center justify-center">{current && <Check aria-hidden="true" className="size-4 stroke-[1.5]" />}</span>
        <span className="min-w-0 flex-1 truncate">{children}</span>
        {hint && <span className="shrink-0 font-mono text-[0.875rem] text-ink-2">{hint}</span>}
      </button>
    </li>
  );
}

export function TopBar(props: TopBarProps) {
  const { project, projects } = props;
  const viewport = useViewport();
  const mobile = viewport === 'mobile';
  const [open, setOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const menuId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
        const i = items.indexOf(document.activeElement as HTMLElement);
        const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
        items[next]?.focus();
        e.preventDefault();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  const name = project.name.trim() || 'Proyecto sin nombre';

  return (
    <header className={`no-print surface-glass relative z-10 flex shrink-0 items-center px-3 lg:gap-6 lg:px-10 ${mobile ? 'min-h-14 flex-wrap gap-x-2 pb-1 pt-1' : 'h-14 gap-3'}`}>
      {/* Proyecto */}
      <div className="relative flex min-w-0 flex-1 basis-0 items-center gap-3" ref={wrapRef}>
        <span className={`type-name shrink-0 whitespace-nowrap tracking-[0.04em] text-ink ${mobile ? 'text-[1.125rem]' : 'text-[1.375rem]'}`}>CAMALEÓN CORPUS</span>
        <button
          ref={buttonRef}
          type="button"
          className="btn btn-ghost min-w-0 max-w-full px-2 text-ink"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen(o => !o)}
        >
          <span className="sr-only">Proyecto: </span>
          <span className="truncate text-[0.875rem]">{name}</span>
          <ChevronDown aria-hidden="true" />
        </button>
        {props.crumb && !mobile && (
          <span className="hidden truncate text-[0.875rem] text-ink-2 min-[1200px]:inline" aria-label={`Estás en ${props.crumb}`}>
            {props.crumb}
          </span>
        )}
        {open && (
          <ul
            id={menuId}
            ref={menuRef}
            role="menu"
            aria-label="Proyecto"
            className="absolute left-0 top-full z-50 mt-2 max-h-[70vh] w-[min(300px,calc(100vw-24px))] overflow-y-auto rounded-card bg-raised p-1 shadow-float"
          >
            <MenuItem onSelect={run(props.onEditBrief)}>Ver y editar el brief</MenuItem>
            <MenuItem onSelect={run(props.onNewProject)}>Nuevo proyecto</MenuItem>
            <MenuLabel>Mis proyectos</MenuLabel>
            {projects.map(p => (
              <MenuItem key={p.id} current={p.id === project.id} onSelect={run(() => props.onSelectProject(p.id))} hint={`${p.references.length} refs`}>
                {p.name.trim() || 'Proyecto sin nombre'}
              </MenuItem>
            ))}
            <MenuItem onSelect={run(props.onLoadExample)} hint="demo">
              Cargar proyecto de ejemplo
            </MenuItem>
            <MenuItem onSelect={run(() => importRef.current?.click())}>Importar respaldo…</MenuItem>
            <MenuLabel>Registro</MenuLabel>
            <MenuItem onSelect={run(props.onOpenLog)}>Bitácora</MenuItem>
            <MenuItem onSelect={run(props.onOpenAbout)}>Acerca del método</MenuItem>
            <MenuLabel>Respaldo y exportación</MenuLabel>
            <MenuItem onSelect={run(props.onExportBackup)} hint={project.lastBackupAt ? `último ${new Date(project.lastBackupAt).toLocaleDateString('es-AR')}` : 'nunca'}>
              Descargar respaldo completo
            </MenuItem>
            <MenuItem onSelect={run(props.onDownloadDossier)} hint=".md">
              Dossier académico
            </MenuItem>
            <MenuLabel>Eliminar</MenuLabel>
            <MenuItem onSelect={run(props.onDeleteProject)}>Eliminar este proyecto</MenuItem>
            {projects.length > 1 && <MenuItem onSelect={run(props.onDeleteAllProjects)}>Eliminar todos los proyectos</MenuItem>}
          </ul>
        )}
        <input
          ref={importRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) props.onImportBackup(f);
            e.target.value = '';
          }}
        />
      </div>

      {/* Etapas (escritorio) o línea de estado (tablet y móvil) */}
      {viewport === 'desktop' ? (
        <div className="flex min-w-0 justify-center" style={{ flex: '0 1 auto' }}>
          {props.nav}
        </div>
      ) : (
        <div className={`flex min-w-0 justify-center ${mobile ? 'order-last basis-full pb-1' : 'shrink'}`} style={mobile ? undefined : { flex: '0 1 auto' }}>
          <StatusBar status={props.status} small={mobile} className="justify-center" />
        </div>
      )}

      {/* Guardado y ayuda */}
      <div className="flex min-w-0 flex-1 basis-0 items-center justify-end gap-4 max-[1100px]:flex-none">
        <SaveIndicator state={props.save} dot={mobile} />
        {!mobile && props.onUndo && (
          <button type="button" onClick={props.onUndo} disabled={!props.canUndo} className="whitespace-nowrap rounded-[4px] px-2 py-2 text-[0.875rem] font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:hover:text-ink-2" style={{ minHeight: viewport === 'desktop' ? undefined : 44 }}>
            ↶ Deshacer
          </button>
        )}
        <button type="button" onClick={props.onOpenHelp} className="rounded-[4px] px-2 py-2 text-[0.875rem] font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline" style={{ minHeight: viewport === 'desktop' ? undefined : 44 }}>
          ? Ayuda
        </button>
      </div>
    </header>
  );
}
