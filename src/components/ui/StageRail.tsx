import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { StatusDot, Tone } from './StatusPill';

export type StageRailState = 'done' | 'current' | 'available' | 'locked';

export interface StageRailItem {
  id: string;
  num: string;
  label: string;
  state: StageRailState;
  /** Texto que explica por qué está bloqueada ("Necesitás 3 referencias"). */
  requirement?: string;
  /** Algunas etapas (Inducción) se ven en el riel pero no se visitan. */
  visitable?: boolean;
}

const STATE_TEXT: Record<StageRailState, string> = {
  done: 'hecho',
  current: 'actual',
  available: 'disponible',
  locked: 'bloqueado',
};

const STATE_TONE: Record<StageRailState, Tone> = {
  done: 'confirmed',
  current: 'current',
  available: 'neutral',
  locked: 'neutral',
};

interface StageRailProps {
  stages: StageRailItem[];
  onSelect: (id: string) => void;
}

function isInteractive(s: StageRailItem) {
  return s.state !== 'locked' && s.visitable !== false && s.state !== 'current';
}

/** Riel de etapas para escritorio (≥ 1024px). */
export function StageRail({ stages, onSelect }: StageRailProps) {
  const baseId = useId();
  return (
    <nav aria-label="Etapas del método" className="hidden min-w-0 max-w-[880px] flex-1 lg:flex">
      <ol className="flex w-full items-stretch overflow-x-auto rounded-card border border-line bg-surface">
        {stages.map((s, i) => {
          const interactive = isInteractive(s);
          const tipId = `${baseId}-${s.id}-tip`;
          const blocked = s.state === 'locked' || s.visitable === false;
          return (
            <li key={s.id} className={`group relative flex flex-[1_0_140px] ${i < stages.length - 1 ? 'border-r border-line' : ''}`}>
              <button
                type="button"
                onClick={() => interactive && onSelect(s.id)}
                aria-current={s.state === 'current' ? 'step' : undefined}
                aria-disabled={blocked || undefined}
                aria-describedby={s.requirement && blocked ? tipId : undefined}
                className={`flex w-full flex-col items-start gap-0 px-4 py-1 text-left transition-colors duration-120 ease-emergent ${
                  s.state === 'current' ? 'bg-raised' : 'hover:bg-white/[.03]'
                } ${s.state === 'locked' ? 'text-ink-3' : 'text-ink'} ${blocked ? 'cursor-not-allowed hover:bg-transparent' : ''} ${
                  i === 0 ? 'rounded-l-card' : ''
                } ${i === stages.length - 1 ? 'rounded-r-card' : ''}`}
              >
                <span className={`flex items-center gap-2 font-mono text-xs ${s.state === 'locked' ? 'text-ink-3' : 'text-ink-2'}`}>
                  <StatusDot tone={STATE_TONE[s.state]} glow={s.state === 'done'} />
                  {s.num} · {STATE_TEXT[s.state]}
                </span>
                <span className="text-sm font-medium leading-5">{s.label}</span>
              </button>
              {s.requirement && blocked && (
                <span
                  id={tipId}
                  role="tooltip"
                  className="pointer-events-none absolute left-4 top-full z-50 mt-2 w-max max-w-[240px] rounded-ctrl border border-line-mid bg-raised px-3 py-2 text-xs text-ink opacity-0 shadow-float transition-opacity duration-120 ease-emergent group-hover:opacity-100 group-focus-within:opacity-100"
                >
                  {s.requirement}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Versión compacta para < 1024px: "04 / 05 · Auditoría" con menú. */
export function StageRailCompact({ stages, onSelect }: StageRailProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const current = stages.find(s => s.state === 'current') ?? stages[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <nav aria-label="Etapas del método" className="relative min-w-0 lg:hidden" ref={wrapRef}>
      <button
        type="button"
        className="btn btn-ghost h-11 max-w-full gap-1.5 px-2 text-ink"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(o => !o)}
      >
        <span className="font-mono text-xs text-ink-2">
          {current.num} / {String(stages.length).padStart(2, '0')}
        </span>
        <span className="truncate">· {current.label}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <ol
          id={menuId}
          className="absolute left-1/2 top-full z-50 mt-2 w-[min(320px,calc(100vw-32px))] -translate-x-1/2 rounded-card border border-line-mid bg-raised p-1 shadow-float"
        >
          {stages.map(s => {
            const interactive = isInteractive(s);
            const blocked = s.state === 'locked' || s.visitable === false;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  aria-current={s.state === 'current' ? 'step' : undefined}
                  aria-disabled={blocked || undefined}
                  onClick={() => {
                    if (!interactive) return;
                    onSelect(s.id);
                    setOpen(false);
                  }}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-ctrl px-3 py-2 text-left ${
                    s.state === 'current' ? 'bg-white/5' : interactive ? 'hover:bg-white/5' : ''
                  } ${s.state === 'locked' ? 'text-ink-3' : 'text-ink'}`}
                >
                  <StatusDot tone={STATE_TONE[s.state]} glow={s.state === 'done'} />
                  <span className="font-mono text-xs text-ink-2">{s.num}</span>
                  <span className="flex-1 text-sm font-medium">{s.label}</span>
                  <span className="font-mono text-xs text-ink-2">{STATE_TEXT[s.state]}</span>
                </button>
                {s.requirement && blocked && <p className="px-3 pb-2 pl-[52px] text-xs text-ink-2">{s.requirement}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </nav>
  );
}
