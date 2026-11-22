import React, { useEffect, useRef, useState } from 'react';
import { ColorsPanel } from '../components/ColorEditor';
import { RoleKey, useColors } from './colorContext';
import { Layer, Pattern, Project } from '../types';
import { useShortcuts } from '../hooks/useAuditShortcuts';
import { evidenceCount } from '../utils/layers';
import { fullRule, oneLine, shortRule } from '../utils/layerRules';
import { bestOn, BONE, INK } from '../utils/derivePalette';
import { ExportMenu } from '../components/ExportMenu';
import { Notify } from './types';
import { SHEET_NAME, evidenceText, isSuggestion, livePieces, piecesIn } from '../pieces/model';
import { BottomBar } from '../components/shell/BottomBar';
import { PieceThumb } from './common';
import { PieceRule } from './PieceRule';

interface SystemScreenProps {
  project: Project;
  enabled: boolean;
  onNext: () => void;
  onBlocked: (reason: string) => void;
  notify: Notify;
  onRoleLive: (key: RoleKey, hex: string | null) => void;
  onRoleCommit: (key: RoleKey, hex: string | null) => void;
  paletteMissing: number;
  paletteBusy: boolean;
  onCompletePalette: () => void;
}

const LAYERS: Layer[] = [1, 2, 3];
/** Titular de cada capa a escala: Primario 132 px, Secundario 80, Acento 56. */
const HEAD: Record<Layer, string> = { 1: 'clamp(80px, 9vw, 132px)', 2: 'clamp(52px, 5.6vw, 80px)', 3: 'clamp(38px, 4vw, 56px)' };

/** Quién ubicó la pieza. */
function Origin({ piece, suggestion }: { piece: Pattern; suggestion: boolean }) {
  if (piece.origin === 'user') return <span className="type-label self-start rounded-[3px] bg-bone px-[6px] py-[1px] text-[0.75rem] text-void">Tuyo</span>;
  return <span className="type-label self-start text-[0.75rem] text-ink-2">{suggestion ? 'Detectado · sugerencia' : 'Detectado'}</span>;
}

/** Titular de capa a escala (la diferencia de tamaño se lee sin leer nada). */
function SectionHead({ layer, count }: { layer: Layer; count: number }) {
  return (
    <div className={`layer-${layer} flex items-end justify-between gap-3`}>
      <h2 data-headline className="layer-headline m-0" style={{ fontSize: HEAD[layer] }}>
        {SHEET_NAME[layer]}
      </h2>
      <span className="type-data pb-1 text-[0.875rem] text-ink-2">
        {count} {count === 1 ? 'pieza' : 'piezas'}
      </span>
    </div>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => <h2 className="type-label m-0 text-[0.75rem] text-ink-2">{children}</h2>;

/**
 * 04 · SISTEMA. Un pliego de revista de tres zonas: índice fijo (240 px) · contenido · ficha fija (320 px).
 * Por debajo de 1280 px la ficha baja al final y el índice pasa a pestañas arriba.
 */
export function SystemScreen(props: SystemScreenProps) {
  const { project } = props;
  const colors = useColors();
  const [editColors, setEditColors] = useState(false);
  const [section, setSection] = useState<Layer>(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  useShortcuts(props.enabled, { enter: () => props.onNext(), p: () => props.onNext() });

  const core = piecesIn(project, 1);
  const support = piecesIn(project, 2);
  const accent = piecesIn(project, 3);
  // Sin Primario, la pieza con más evidencia se propone como titular.
  const fallbackLead = !core.length ? [...livePieces(project)].sort((a, b) => evidenceCount(b, project) - evidenceCount(a, project))[0] : undefined;
  const lead = core[0] ?? fallbackLead;
  const moreCore = core.slice(1);
  const suggestion = (x: Pattern) => isSuggestion(x) || x === fallbackLead;
  const title = project.name || project.intent || 'Sistema visual';
  const others = (list: Pattern[]) => list.filter(x => x !== fallbackLead);
  const counts: Record<Layer, number> = { 1: core.length, 2: others(support).length, 3: others(accent).length };
  const fonts = livePieces(project).filter(x => x.category === 'typography').slice(0, 3);
  const rules = [...core, ...others(support)].slice(0, 5);

  // Índice: marca la sección que se está leyendo.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      entries => {
        const hit = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setSection(Number((hit.target as HTMLElement).dataset.sec) as Layer);
      },
      { root, rootMargin: '-15% 0px -65% 0px' },
    );
    root.querySelectorAll('[data-sec]').forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);
  const goSection = (l: Layer) => {
    const el = scrollRef.current?.querySelector(`#sys-${l}`);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    setSection(l);
  };

  return (
    <div className="relative h-full">
      <div ref={scrollRef} className="h-full overflow-y-auto">
        <div id="front-page" className="stage-enter mx-auto grid w-full max-w-[2200px] gap-x-10 gap-y-8 px-4 pb-44 pt-6 text-ink lg:px-10 xl:grid-cols-[240px_minmax(0,1fr)_320px]">
          {/* Índice: fijo a la izquierda; pestañas arriba en pantallas angostas */}
          <nav aria-label="Secciones del sistema" className="no-print z-10 max-xl:sticky max-xl:top-0 max-xl:-mx-4 max-xl:bg-bg max-xl:px-4 max-xl:py-2 xl:sticky xl:top-6 xl:self-start">
            <ol className="m-0 flex list-none gap-2 p-0 xl:flex-col xl:gap-1">
              {LAYERS.map(l => (
                <li key={l} className={`layer-${l}`}>
                  <button
                    type="button"
                    onClick={() => goSection(l)}
                    aria-current={section === l ? 'true' : undefined}
                    className={`flex w-full items-baseline justify-between gap-3 rounded-[4px] px-3 py-2 text-left transition-colors duration-150 hover:bg-ink/5 ${section === l ? 'bg-ink/10' : ''}`}
                  >
                    <span className={`text-[1rem] ${section === l ? 'font-bold text-ink' : 'font-medium text-ink-2'}`}>
                      <span aria-hidden="true" className="layer-dot mr-2 inline-block size-2 rounded-full align-middle" style={{ background: 'var(--layer-color)', boxShadow: '0 0 0 1px var(--layer-edge)' }} />
                      {SHEET_NAME[l]}
                    </span>
                    <span className="type-data text-[0.875rem] text-ink-2">{counts[l]}</span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          {/* Contenido */}
          <div className="flex min-w-0 flex-col gap-16">
            <header className="flex flex-col gap-3">
              <h1 data-headline className="type-stage m-0">
                Sistema
              </h1>
              <span className="text-[1.375rem] font-medium leading-snug text-ink-2">{title}</span>
            </header>

            {/* Brief: nombre del proyecto, objetivo y descripción */}
            <section aria-label="Brief" className="flex max-w-[78ch] flex-col gap-5">
              <Label>Brief</Label>
              <div className="flex flex-col gap-1">
                <span className="type-label text-[0.75rem] text-ink-2">Proyecto</span>
                <h2 className="m-0 text-[2rem] font-semibold leading-[1.1]">{project.name?.trim() || 'Sin nombre todavía'}</h2>
              </div>
              <div className="flex flex-col gap-1">
                <span className="type-label text-[0.75rem] text-ink-2">Objetivo</span>
                <p className="m-0 text-[1.0625rem] leading-[1.6]">{project.objective?.trim() || project.intent?.trim() || 'Sin objetivo todavía. Escribilo en Referencias.'}</p>
              </div>
              {(project.brief || project.description)?.trim() && (
                <div className="flex flex-col gap-1">
                  <span className="type-label text-[0.75rem] text-ink-2">Descripción</span>
                  <p className="m-0 whitespace-pre-line text-[1rem] leading-[1.6] text-ink-2">{(project.brief || project.description).trim()}</p>
                </div>
              )}
            </section>

            {/* Capa 1 · Primario: pieza principal grande (7 de 12 columnas) con su título y descripción (5) */}
            <section id="sys-1" data-sec="1" className="flex scroll-mt-6 flex-col gap-8" aria-label="Capa 1 · Primario">
              <SectionHead layer={1} count={counts[1]} />
              {lead ? (
                <>
                  <div className="grid items-start gap-8 lg:grid-cols-12">
                    <PieceThumb
                      piece={lead}
                      project={project}
                      className="aspect-[4/3] w-full rounded-[4px] bg-raised lg:col-span-7"
                      style={{ opacity: suggestion(lead) ? 0.85 : 1, boxShadow: '0 30px 80px color-mix(in srgb, var(--cc-l0) 33%, transparent)' }}
                    />
                    <div className="flex flex-col gap-4 lg:col-span-5">
                      <Origin piece={lead} suggestion={suggestion(lead)} />
                      <h3 className="m-0 text-[2rem] font-semibold leading-[1.1]">{lead.name}</h3>
                      <p className="m-0 max-w-[68ch] text-[1.0625rem] leading-[1.6]">{fullRule(lead) || 'Todavía sin regla redactada.'}</p>
                      <span className="type-data text-[0.875rem] text-ink-2">En {evidenceText(lead, project)}</span>
                    </div>
                  </div>
                  {moreCore.length > 0 && (
                    <div className="grid grid-cols-2 gap-5 md:grid-cols-3 2xl:grid-cols-4">
                      {moreCore.map(x => (
                        <div key={x.id} className="flex min-w-0 flex-col gap-2">
                          <PieceThumb piece={x} project={project} className="aspect-[4/5] w-full rounded-[4px] bg-raised" style={{ opacity: suggestion(x) ? 0.85 : 1 }} />
                          <Origin piece={x} suggestion={suggestion(x)} />
                          <span className="text-[1.125rem] font-semibold leading-tight">{x.name}</span>
                          <PieceRule piece={x} project={project} short={shortRule(x)} />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="m-0 text-[1rem] text-ink-2">El Primario está vacío. Ubicá piezas en la Capa 1.</p>
              )}
            </section>

            {/* Capa 2 · Secundario: grilla de 4 columnas, miniaturas más chicas */}
            <section id="sys-2" data-sec="2" className="flex scroll-mt-6 flex-col gap-6" aria-label="Capa 2 · Secundario">
              <SectionHead layer={2} count={counts[2]} />
              {counts[2] === 0 && <p className="m-0 text-[1rem] text-ink-2">Sin secundario todavía.</p>}
              <div className="grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-4">
                {others(support).map(x => (
                  <div key={x.id} className="flex min-w-0 flex-col gap-2">
                    <PieceThumb piece={x} project={project} className="aspect-[4/5] w-full rounded-[4px] bg-raised" style={{ opacity: suggestion(x) ? 0.85 : 1 }} />
                    <Origin piece={x} suggestion={suggestion(x)} />
                    <span className="text-[1rem] font-semibold leading-tight">{x.name}</span>
                    <PieceRule piece={x} project={project} short={shortRule(x)} />
                  </div>
                ))}
              </div>
            </section>

            {/* Capa 3 · Acento: una fila de miniaturas */}
            <section id="sys-3" data-sec="3" className="flex scroll-mt-6 flex-col gap-5" aria-label="Capa 3 · Acento">
              <SectionHead layer={3} count={counts[3]} />
              {counts[3] === 0 && <p className="m-0 text-[1rem] text-ink-2">Sin acentos todavía.</p>}
              <ul className="m-0 grid list-none grid-cols-3 gap-4 p-0 sm:grid-cols-4 lg:grid-cols-6">
                {others(accent).map(x => (
                  <li key={x.id} className="flex min-w-0 flex-col gap-2">
                    <PieceThumb piece={x} project={project} className="aspect-square w-full rounded-[3px] bg-raised" word={false} style={{ opacity: suggestion(x) ? 0.85 : 1 }} />
                    <span className="text-[0.875rem] font-semibold leading-tight">{x.name}</span>
                    <PieceRule piece={x} project={project} short={oneLine(x)} />
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* Ficha: paleta, tipografías, reglas y exportar */}
          <aside aria-label="Ficha del sistema" className="flex flex-col gap-8 xl:sticky xl:top-6 xl:max-h-[calc(100vh-190px)] xl:self-start xl:overflow-y-auto xl:pr-1">
            <section className="flex flex-col gap-3">
              <Label>Paleta</Label>
              <div className="flex flex-col gap-2">
                {colors.roles.map(r => (
                  <div key={r.key} className="flex h-[72px] items-end justify-between rounded-[4px] px-3 pb-2" style={{ background: r.hex, color: bestOn(r.hex, INK, BONE), boxShadow: 'inset 0 0 0 1px var(--cc-line)' }}>
                    <span className="text-[0.875rem] font-bold">{r.label}</span>
                    <span className="type-data text-[0.875rem] font-bold">{r.hex.toUpperCase()}</span>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setEditColors(o => !o)} aria-expanded={editColors} className="self-start text-[0.875rem] font-bold text-ink underline underline-offset-4 hover:no-underline">
                {editColors ? 'Listo' : 'Editar colores'}
              </button>
              {editColors && <ColorsPanel flat onLive={props.onRoleLive} onCommit={props.onRoleCommit} />}
              {props.paletteMissing > 0 && (
                <button type="button" onClick={props.onCompletePalette} disabled={props.paletteBusy} className="self-start text-[0.875rem] font-medium text-ink-2 underline underline-offset-4 hover:text-ink disabled:no-underline">
                  {props.paletteBusy ? 'Analizando colores…' : `Completar paleta · ${props.paletteMissing}`}
                </button>
              )}
            </section>

            <section className="flex flex-col gap-3">
              <Label>Tipografías detectadas</Label>
              {fonts.length === 0 && <p className="m-0 text-[0.875rem] text-ink-2">Todavía no se detectó ninguna.</p>}
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {fonts.map(x => (
                  <li key={x.id} className="flex items-center gap-4">
                    <span aria-hidden="true" className="w-[64px] shrink-0 text-[2.5rem] font-bold leading-none">
                      Aa
                    </span>
                    <span className="line-clamp-2 text-[0.875rem] font-semibold leading-snug">{x.name}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="flex flex-col gap-3">
              <Label>Reglas del sistema</Label>
              {rules.length === 0 && <p className="m-0 text-[0.875rem] text-ink-2">Sin reglas todavía.</p>}
              <ol className="m-0 flex list-none flex-col gap-3 p-0">
                {rules.map(x => (
                  <li key={x.id} className="text-[0.875rem] leading-[1.5]">
                    <span className="font-semibold">{x.name}.</span>
                    <PieceRule piece={x} project={project} short={oneLine(x)} />
                  </li>
                ))}
              </ol>
            </section>

            <section className="no-print flex flex-col gap-3">
              <Label>Exportar</Label>
              <ExportMenu project={project} notify={props.notify} inline />
            </section>
          </aside>
        </div>
      </div>

      <BottomBar
        primary={
          core.length
            ? { label: 'Probar en una pieza', kbd: '⏎', onClick: props.onNext }
            : { label: 'Probar en una pieza', blocked: 'Necesita al menos una pieza en Primario.', blockedLabel: 'Primario vacío', onClick: () => {}, onBlockedClick: props.onBlocked }
        }
      />
    </div>
  );
}

export type { Layer };
