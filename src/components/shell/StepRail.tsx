import { Project, Moment } from '../../types';
import { RailItem, railItems, stepIndex } from '../../utils/steps';

const MUSTARD = 'oklch(0.80 0.12 86)';

function Marker({ item }: { item: RailItem }) {
  const base = 'relative z-10 flex size-[22px] shrink-0 items-center justify-center rounded-full font-mono text-[11px] leading-none';
  switch (item.state) {
    case 'current':
      return <span className={`${base} border-[1.5px] border-bone bg-void text-ink`}>{item.num}</span>;
    case 'done':
      return <span className={`${base} bg-bone text-void`}>✓</span>;
    case 'stale':
      return (
        <span className={`${base} font-bold text-void`} style={{ background: MUSTARD }}>
          !
        </span>
      );
    case 'blocked':
      return <span className={`${base} border border-dashed border-bone/25 bg-void text-ink-3`}>{item.num}</span>;
    default:
      return <span className={`${base} border border-bone/25 bg-void text-ink-2`}>{item.num}</span>;
  }
}

/**
 * Barra lateral de etapas (200px). Las cinco son clickeables: la bloqueada no navega, explica por qué.
 * Los marcadores se unen con una línea de 2px: hueso al 45% hasta la etapa más avanzada alcanzada, al 10% después.
 */
export function StepRail({ project, current, onGo }: { project: Project; current: Moment; onGo: (id: Moment, blocked: string | null) => void }) {
  const items = railItems(project, current);
  const reached = Math.max(project.reached ?? 0, stepIndex(current));
  return (
    <nav aria-label="Etapas" className="no-print flex w-[200px] shrink-0 flex-col gap-0 border-r border-line bg-bg px-4 py-6">
      <ol className="m-0 flex list-none flex-col p-0">
        {items.map((it, i) => (
          <li key={it.id} className="relative">
            {i < items.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute left-[10px] top-[22px] z-0 w-[2px]"
                style={{ bottom: '-2px', background: i < reached ? 'rgba(242,239,232,.45)' : 'rgba(242,239,232,.10)' }}
              />
            )}
            <button
              type="button"
              aria-current={it.state === 'current' ? 'step' : undefined}
              aria-disabled={it.blocked ? true : undefined}
              onClick={() => onGo(it.id, it.blocked)}
              className={`relative flex w-full items-start gap-3 pb-6 text-left ${it.blocked ? 'cursor-not-allowed' : ''}`}
            >
              <Marker item={it} />
              <span className="flex min-w-0 flex-col gap-[2px]">
                <span className={`text-[14px] font-semibold leading-[22px] ${it.state === 'current' || it.state === 'done' || it.state === 'stale' || it.state === 'here' ? 'text-ink' : it.blocked ? 'text-ink-3' : 'text-ink-2'}`}>{it.label}</span>
                <span className="text-[12px] leading-[1.35]" style={{ color: it.warn ? MUSTARD : it.state === 'current' ? 'rgba(242,239,232,.75)' : 'rgba(242,239,232,.5)' }}>
                  {it.line}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
