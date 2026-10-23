import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, CircleHelp, ScrollText } from 'lucide-react';
import { Project } from '../../types';
import { IconButton, StageRail, StageRailCompact, StageRailItem } from '../ui';

interface TopBarProps {
  project: Project;
  projects: Project[];
  rail: StageRailItem[];
  onSelectStage: (id: string) => void;
  onSelectProject: (id: string) => void;
  onNewProject: () => void;
  onEditBrief: () => void;
  onDeleteProject: () => void;
  onDeleteAllProjects: () => void;
  onExportProjectJson: () => void;
  onDownloadDossier: () => void;
  onOpenLog: () => void;
  onOpenAbout: () => void;
  isLogOpen: boolean;
}

const MenuLabel = ({ children }: { children: React.ReactNode }) => (
  <li role="presentation" className="px-3 pb-1 pt-3 font-mono text-xs text-ink-2">
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
        {hint && <span className="shrink-0 font-mono text-xs text-ink-2">{hint}</span>}
      </button>
    </li>
  );
}

export function TopBar(props: TopBarProps) {
  const { project, projects, rail } = props;
  const [open, setOpen] = useState(false);
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
    <header className="no-print flex h-14 shrink-0 items-center gap-1 border-b border-line bg-bg px-3 sm:gap-3 lg:gap-6 lg:px-4">
      {/* Proyecto */}
      <div className="relative flex min-w-0 shrink-0 items-center gap-3 lg:w-[240px]" ref={wrapRef}>
        <span className="hidden text-sm font-semibold tracking-[-0.01em] text-ink sm:inline">Emergent</span>
        <span aria-hidden="true" className="hidden h-4 w-px bg-line-mid sm:inline-block" />
        <button
          ref={buttonRef}
          type="button"
          className="btn btn-ghost min-w-0 max-w-[28vw] px-2 text-ink sm:max-w-[200px] lg:max-w-full"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen(o => !o)}
        >
          <span className="sr-only">Proyecto: </span>
          <span className="truncate">{name}</span>
          <ChevronDown aria-hidden="true" />
        </button>
        {open && (
          <ul
            id={menuId}
            ref={menuRef}
            role="menu"
            aria-label="Proyecto"
            className="absolute left-0 top-full z-50 mt-2 max-h-[70vh] w-[min(300px,calc(100vw-24px))] overflow-y-auto rounded-card border border-line-mid bg-raised p-1 shadow-float"
          >
            <MenuItem onSelect={run(props.onEditBrief)}>Editar brief</MenuItem>
            <MenuItem onSelect={run(props.onNewProject)}>Nuevo proyecto</MenuItem>
            <MenuLabel>Mis proyectos</MenuLabel>
            {projects.map(p => (
              <MenuItem key={p.id} current={p.id === project.id} onSelect={run(() => props.onSelectProject(p.id))} hint={`${p.references.length} refs`}>
                {p.name.trim() || 'Proyecto sin nombre'}
              </MenuItem>
            ))}
            <MenuLabel>Exportar proyecto</MenuLabel>
            <MenuItem onSelect={run(props.onDownloadDossier)} hint=".md">
              Dossier académico
            </MenuItem>
            <MenuItem onSelect={run(props.onExportProjectJson)} hint=".json">
              Proyecto completo
            </MenuItem>
            <MenuLabel>Eliminar</MenuLabel>
            <MenuItem onSelect={run(props.onDeleteProject)}>Eliminar este proyecto</MenuItem>
            {projects.length > 1 && <MenuItem onSelect={run(props.onDeleteAllProjects)}>Eliminar todos los proyectos</MenuItem>}
          </ul>
        )}
      </div>

      {/* Etapas */}
      <div className="flex min-w-0 flex-1 justify-center">
        <StageRail stages={rail} onSelect={props.onSelectStage} />
        <StageRailCompact stages={rail} onSelect={props.onSelectStage} />
      </div>

      {/* Global */}
      <div className="flex shrink-0 items-center gap-1 lg:w-[240px] lg:justify-end">
        <button type="button" className="btn btn-ghost hidden px-3 sm:inline-flex" aria-pressed={props.isLogOpen} onClick={props.onOpenLog}>
          Bitácora
        </button>
        <IconButton label="Bitácora" bare className="sm:hidden" aria-pressed={props.isLogOpen} onClick={props.onOpenLog}>
          <ScrollText className="size-4 stroke-[1.5]" />
        </IconButton>
        <IconButton label="Acerca del método" bare onClick={props.onOpenAbout}>
          <CircleHelp className="size-4 stroke-[1.5]" />
        </IconButton>
      </div>
    </header>
  );
}
