import { useState } from 'react';
import { Layer, Project, Moment } from '../../types';
import { RailItem, railItems, stepIndex } from '../../utils/steps';
import { LAYER_QUESTION } from '../../utils/layerQuestions';
import { SHEET_NAME } from '../../pieces/model';
import { Viewport } from '../../hooks/useViewport';

const MUSTARD = 'var(--cc-warn)';

/** Las etapas en la barra superior (escritorio): la actual con subrayado de 2 px, las completadas con ✓. */
/** Qué quedó pendiente en una etapa marcada con «!». */
const STALE_WHY: Partial<Record<Moment, string>> = {
  revisar: 'Cambiaste piezas después de revisar. Pasá de nuevo para confirmar que todo siga bien.',
  capas: 'Cambiaste piezas después de ordenar las capas. Revisá que cada una siga en su lugar.',
  sistema: 'Cambiaste piezas o colores después de armar el Sistema. Entrá para ver el resultado actualizado.',
  probar: 'Cambiaste piezas o colores después de probar. Las variantes ya generadas pueden no reflejarlo.',
};

export function StageNav({ project, current, onGo }: { project: Project; current: Moment; onGo: (id: Moment, blocked: string | null) => void }) {
  const items = railItems(project, current);
  const [tip, setTip] = useState<Moment | null>(null);
  return (
    <nav aria-label="Etapas" className="no-print min-w-0">
      <ol className="m-0 flex list-none items-center gap-6 p-0 xl:gap-8">
        {items.map(it => {
          const cur = it.state === 'current';
          return (
            <li key={it.id} className="relative" onMouseEnter={() => it.state === 'stale' && setTip(it.id)} onMouseLeave={() => setTip(null)}>
              <button
                type="button"
                aria-current={cur ? 'step' : undefined}
                aria-disabled={it.blocked ? true : undefined}
                aria-describedby={it.state === 'stale' ? `stale-${it.id}` : undefined}
                title={it.blocked ?? (it.state === 'stale' ? undefined : it.line)}
                onFocus={() => it.state === 'stale' && setTip(it.id)}
                onBlur={() => setTip(null)}
                onClick={() => onGo(it.id, it.blocked)}
                className={`group relative flex h-14 items-center gap-[6px] whitespace-nowrap text-[0.875rem] ${cur ? 'font-bold text-ink' : 'font-medium text-ink-2 hover:text-ink'} ${it.blocked ? 'cursor-not-allowed' : ''}`}
              >
                <span className="type-data">{it.num}</span>
                <span>{it.label}</span>
                {it.state === 'done' && <span aria-label="completada" className="text-[0.875rem]">✓</span>}
                {it.state === 'stale' && (
                  <span aria-label="desactualizada" title="Cambiaste algo antes: revisalo" className="flex size-4 items-center justify-center rounded-full text-[0.875rem] font-bold" style={{ background: MUSTARD, color: 'var(--cc-bg)' }}>
                    !
                  </span>
                )}
                <span aria-hidden="true" className="absolute inset-x-0 bottom-[10px] h-[2px] transition-opacity duration-200" style={{ background: 'var(--cc-l0-head)', opacity: cur ? 1 : 0 }} />
              </button>
              {it.state === 'stale' && (
                <span id={`stale-${it.id}`} role="tooltip" className={`absolute left-1/2 top-[calc(100%-6px)] z-50 w-[270px] -translate-x-1/2 rounded-[4px] bg-raised p-3 text-[0.875rem] leading-snug text-ink ${tip === it.id ? '' : 'sr-only'}`}>
                  {STALE_WHY[it.id] ?? 'Cambiaste algo antes. Revisalo.'}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Marker({ item, size = 22 }: { item: RailItem; size?: number }) {
  const base = 'relative z-10 flex shrink-0 items-center justify-center rounded-full font-mono text-[0.875rem] leading-none';
  const st = { width: size, height: size };
  switch (item.state) {
    case 'current':
      return (
        <span className={`${base} bg-bone/20 font-bold text-ink ring-[1.5px] ring-bone`} style={st}>
          {item.num}
        </span>
      );
    case 'done':
      return (
        <span className={`${base} bg-bone text-void`} style={st}>
          ✓
        </span>
      );
    case 'stale':
      return (
        <span className={`${base} font-bold text-void`} style={{ ...st, background: MUSTARD }}>
          !
        </span>
      );
    case 'blocked':
      return (
        <span className={`${base} bg-bone/10 text-ink-3`} style={st}>
          {item.num}
        </span>
      );
    default:
      return (
        <span className={`${base} bg-bone/10 text-ink-2`} style={st}>
          {item.num}
        </span>
      );
  }
}

interface ListProps {
  project: Project;
  current: Moment;
  onGo: (id: Moment, blocked: string | null) => void;
  onGoLayer: (l: Layer) => void;
  touch?: boolean;
}

/** Lista completa de etapas con sus estados; Capas lleva sus tres capas como sub-ítems, con su pregunta guía. */
function RailList({ project, current, onGo, onGoLayer, touch }: ListProps) {
  const items = railItems(project, current);
  const reached = Math.max(project.reached ?? 0, stepIndex(current));
  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {items.map((it, i) => (
        <li key={it.id} className="relative">
          {i < items.length - 1 && (
            <span aria-hidden="true" className="absolute left-[10px] top-[22px] z-0 w-[2px]" style={{ bottom: '-2px', background: i < reached ? 'color-mix(in srgb, var(--cc-text) 45%, transparent)' : 'var(--cc-line)' }} />
          )}
          <button
            type="button"
            aria-current={it.state === 'current' ? 'step' : undefined}
            aria-disabled={it.blocked ? true : undefined}
            onClick={() => onGo(it.id, it.blocked)}
            className={`relative flex w-full items-start gap-3 text-left ${it.id === 'capas' && !it.blocked ? 'pb-2' : 'pb-6'} ${it.blocked ? 'cursor-not-allowed' : ''}`}
            style={{ minHeight: touch ? 44 : undefined }}
          >
            <Marker item={it} />
            <span className="flex min-w-0 flex-col gap-[2px]">
              <span className={`text-[0.875rem] font-semibold leading-[22px] ${it.state === 'current' || it.state === 'done' || it.state === 'stale' || it.state === 'here' ? 'text-ink' : it.blocked ? 'text-ink-3' : 'text-ink-2'}`}>{it.label}</span>
              <span className="text-[0.875rem] leading-[1.35]" style={{ color: it.warn ? MUSTARD : it.state === 'current' ? 'color-mix(in srgb, var(--cc-text) 75%, transparent)' : 'color-mix(in srgb, var(--cc-text) 75%, transparent)' }}>
                {it.line}
              </span>
            </span>
          </button>
          {it.id === 'capas' && !it.blocked && (
            <ul className="m-0 mb-4 ml-[34px] flex list-none flex-col gap-1 border-l border-line p-0 pl-3">
              {([1, 2, 3] as Layer[]).map(l => (
                <li key={l}>
                  <button type="button" onClick={() => onGoLayer(l)} className={`layer-${l} flex w-full items-start gap-2 text-left`} style={{ minHeight: touch ? 44 : undefined }}>
                    <span aria-hidden="true" className="layer-dot mt-[5px] size-[7px] shrink-0 rounded-full" style={{ background: 'var(--layer-color)' }} />
                    <span className="flex flex-col">
                      <span className="text-[0.875rem] font-semibold leading-tight text-ink-2">
                        {l} · {SHEET_NAME[l]}
                      </span>
                      <span className="text-[0.875rem] leading-tight" style={{ color: 'var(--cc-text-muted)' }}>
                        {LAYER_QUESTION[l]}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}

interface RailProps {
  project: Project;
  current: Moment;
  viewport: Viewport;
  onGo: (id: Moment, blocked: string | null) => void;
  onGoLayer: (l: Layer) => void;
}

/**
 * Barra lateral de etapas. Escritorio: 200px con todo a la vista. Tablet: 64px con los marcadores; al tocar uno se
 * despliega encima con nombres y estados. Móvil: una barra de pasos arriba (StepBar) y una hoja inferior.
 */
export function StepRail({ project, current, viewport, onGo, onGoLayer }: RailProps) {
  const [open, setOpen] = useState(false);
  const items = railItems(project, current);
  const go = (id: Moment, blocked: string | null) => {
    setOpen(false);
    onGo(id, blocked);
  };
  const goLayer = (l: Layer) => {
    setOpen(false);
    onGoLayer(l);
  };

  if (viewport === 'desktop') return null; // en escritorio las etapas van en la barra superior (StageNav)
  if (viewport === 'mobile') return <StepBar project={project} current={current} onGo={onGo} onGoLayer={onGoLayer} />;

  if (viewport === 'tablet') {
    return (
      <>
        <nav aria-label="Etapas" className="no-print flex w-16 shrink-0 flex-col items-center gap-0 border-r border-line bg-bg py-4">
          {items.map(it => (
            <button key={it.id} type="button" aria-label={`${it.label}: ${it.line}`} aria-current={it.state === 'current' ? 'step' : undefined} onClick={() => setOpen(true)} className="flex size-11 items-center justify-center">
              <Marker item={it} size={26} />
            </button>
          ))}
        </nav>
        {open && (
          <div className="fixed inset-0 top-14 z-50" onClick={() => setOpen(false)}>
            <div className="absolute inset-0 bg-black/40" />
            <div role="dialog" aria-label="Etapas" onClick={e => e.stopPropagation()} className="absolute bottom-0 left-0 top-0 w-[280px] overflow-y-auto border-r border-line-mid px-4 py-6" style={{ background: 'var(--cc-surface)' }}>
              <RailList project={project} current={current} onGo={go} onGoLayer={goLayer} touch />
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <nav aria-label="Etapas" className="no-print flex w-[200px] shrink-0 flex-col gap-0 overflow-y-auto border-r border-line bg-bg px-4 py-6">
      <RailList project={project} current={current} onGo={onGo} onGoLayer={onGoLayer} />
    </nav>
  );
}

/** Móvil: los cinco marcadores en línea y el nombre de la etapa actual. Al tocar, hoja inferior con la lista. */
export function StepBar({ project, current, onGo, onGoLayer }: { project: Project; current: Moment; onGo: ListProps['onGo']; onGoLayer: ListProps['onGoLayer'] }) {
  const [open, setOpen] = useState(false);
  const items = railItems(project, current);
  const cur = items.find(i => i.id === current)!;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label="Ver las etapas" className="no-print flex min-h-[44px] w-full shrink-0 items-center gap-3 border-b border-line bg-bg px-4 text-left">
        <span className="flex items-center gap-1">
          {items.map(it => (
            <Marker key={it.id} item={it} size={20} />
          ))}
        </span>
        <span className="min-w-0 flex-1 truncate text-[0.875rem] font-semibold">
          {cur.num}. {cur.label}
        </span>
        <span aria-hidden="true" className="text-ink-2">
          ▾
        </span>
      </button>
      {open && (
        <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div role="dialog" aria-label="Etapas" onClick={e => e.stopPropagation()} className="absolute inset-x-0 bottom-0 max-h-[80%] overflow-y-auto rounded-t-[4px] border-t border-line-mid px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-5" style={{ background: 'var(--cc-surface)' }}>
            <RailList
              project={project}
              current={current}
              touch
              onGo={(id, b) => {
                setOpen(false);
                onGo(id, b);
              }}
              onGoLayer={l => {
                setOpen(false);
                onGoLayer(l);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
