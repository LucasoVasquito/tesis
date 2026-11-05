import React, { useState } from 'react';
import { Layer, Pattern, Project } from '../types';
import { useShortcuts } from '../hooks/useAuditShortcuts';
import { ShortcutBar } from '../components/shell/ShortcutBar';
import { corpusRefs, evidenceCount, layerTag } from '../utils/layers';
import { fullRule, oneLine, shortRule } from '../utils/layerRules';
import { Crop } from '../space/Crop';
import { ExportBar } from '../space/ExportBar';
import { isSuggestion, livePieces, piecesIn } from '../pieces/model';
import { KeyButton, PieceImage, Toast } from './common';

interface SystemScreenProps {
  project: Project;
  enabled: boolean;
  toast: string | null;
  onBack: () => void;
  onGenerate: () => void;
  onNotice: (text: string) => void;
  paletteMissing: number;
  paletteBusy: boolean;
  onCompletePalette: () => void;
}

/** Quién ubicó la pieza. Las sugerencias del agente no llevan borde punteado: llevan su etiqueta. */
function Origin({ piece, suggestion }: { piece: Pattern; suggestion: boolean }) {
  if (piece.origin === 'user') return <span className="type-label bg-bone px-1 text-[10px] text-void">USUARIO</span>;
  if (suggestion) return <span className="type-label border border-ink-3 px-1 text-[10px] text-ink-2">AGENTE · SUGERENCIA</span>;
  return <span className="type-label border border-ink-3 px-1 text-[10px] text-ink-2">AGENTE</span>;
}

/** Rótulo de capa del color de la capa, con su filete. */
function SectionHead({ layer, count }: { layer: Layer; count: number }) {
  return (
    <div className={`layer-${layer} flex flex-col gap-2`}>
      <div className="flex items-baseline justify-between">
        <span className="type-label text-[13px] tracking-[0.08em]" style={{ color: 'var(--layer-color)' }}>
          {layerTag(layer)}
        </span>
        <span className="font-mono text-[11px] text-ink-2">{count}</span>
      </div>
      <div className="layer-rule" />
    </div>
  );
}

/**
 * 02 · SISTEMA. Una página editorial oscura, en grilla de 12 columnas: el Núcleo titula (1–8),
 * el Soporte desarrolla debajo y el Acento anota al margen (9–12). Se ajusta al contenido.
 */
export function SystemScreen(props: SystemScreenProps) {
  const { project } = props;
  const [hover, setHover] = useState<Pattern | null>(null);
  useShortcuts(props.enabled, { ' ': () => props.onBack(), escape: () => props.onBack(), p: () => props.onGenerate(), i: () => props.onGenerate() });

  const core = piecesIn(project, 1);
  const support = piecesIn(project, 2);
  const accent = piecesIn(project, 3);
  // Sin Núcleo, la pieza con más evidencia se propone como titular.
  const fallbackLead = !core.length ? [...livePieces(project)].sort((a, b) => evidenceCount(b, project) - evidenceCount(a, project))[0] : undefined;
  const lead = core[0] ?? fallbackLead;
  const moreCore = core.slice(1);
  const lit = hover ? new Set(hover.evidence) : null;
  const hoverProps = (x: Pattern) => ({ onMouseEnter: () => setHover(x), onMouseLeave: () => setHover(null), onFocus: () => setHover(x), onBlur: () => setHover(null), tabIndex: 0 });
  const suggestion = (x: Pattern) => isSuggestion(x) || x === fallbackLead;
  const title = project.name || project.intent || 'Sistema visual';

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 gap-6 pl-8 pr-6 pt-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div>
            <KeyButton k="ESPACIO" label="← Moodboard" tone="ghost" onClick={props.onBack} />
          </div>
          {/* La página: crece con el contenido, sin altura fija. */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div id="front-page" className="system-page grid grid-cols-12 content-start gap-x-10 gap-y-12 bg-void px-10 pb-12 pt-8 text-ink">
              {/* Encabezado */}
              <header className="col-span-12 flex flex-wrap items-baseline justify-between gap-3">
                <span className="type-name text-[22px] text-ink-2">{title}</span>
                <span className="type-label text-[11px] tracking-[0.1em] text-ink-3">SISTEMA VISUAL · CAMALEÓN</span>
              </header>

              {/* Capa 1 · Núcleo (columnas 1 a 8) */}
              <section className="col-span-8 col-start-1 row-start-2 flex flex-col gap-5" aria-label="Capa 1 · Núcleo">
                <SectionHead layer={1} count={core.length} />
                {lead ? (
                  <>
                    <div {...hoverProps(lead)} className="flex flex-col gap-5 outline-none">
                      <PieceImage piece={lead} project={project} className="aspect-[4/3] w-full" style={suggestion(lead) ? { opacity: 0.85 } : undefined} />
                      <div className="flex flex-col gap-3">
                        <span className="flex items-center gap-2">
                          <Origin piece={lead} suggestion={suggestion(lead)} />
                        </span>
                        <h2 className="type-name m-0 text-[72px] leading-[0.86]">{lead.name}</h2>
                        <p className="m-0 max-w-[62ch] text-[16px] leading-[1.5] text-ink">{fullRule(lead) || 'Todavía sin regla redactada.'}</p>
                      </div>
                    </div>
                    {moreCore.length > 0 && (
                      <div className="grid grid-cols-3 gap-5 pt-2">
                        {moreCore.map(x => (
                          <div key={x.id} {...hoverProps(x)} className="flex flex-col gap-2 outline-none">
                            <PieceImage piece={x} project={project} className="aspect-[4/3] w-full" style={suggestion(x) ? { opacity: 0.85 } : undefined} />
                            <Origin piece={x} suggestion={suggestion(x)} />
                            <span className="type-name text-[30px] leading-[0.9]">{x.name}</span>
                            <span className="text-[13px] leading-[1.4] text-ink-2">{shortRule(x)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="m-0 text-[15px] text-ink-2">El Núcleo está vacío. Ubicá piezas en la Capa 1 del moodboard.</p>
                )}

              </section>

              {/* Capa 3 · Acento (columnas 9 a 12, al costado) */}
              <aside className="col-span-4 col-start-9 row-span-2 row-start-2 flex flex-col gap-5" aria-label="Capa 3 · Acento">
                <SectionHead layer={3} count={accent.filter(x => x !== fallbackLead).length} />
                {accent.filter(x => x !== fallbackLead).length === 0 && <p className="m-0 text-[14px] text-ink-2">Sin acentos todavía.</p>}
                {accent
                  .filter(x => x !== fallbackLead)
                  .map(x => (
                    <div key={x.id} {...hoverProps(x)} className="flex flex-col gap-2 outline-none">
                      <PieceImage piece={x} project={project} className="aspect-[4/3] w-[70%]" style={suggestion(x) ? { opacity: 0.85 } : undefined} />
                      <Origin piece={x} suggestion={suggestion(x)} />
                      <span className="type-name text-[22px] leading-[0.92]">{x.name}</span>
                      <span className="text-[13px] leading-[1.4] text-ink-2">{oneLine(x)}</span>
                    </div>
                  ))}
              </aside>

              {/* Capa 2 · Soporte (columnas 1 a 8, debajo del Núcleo) */}
              <section className="col-span-8 col-start-1 row-start-3 flex flex-col gap-5" aria-label="Capa 2 · Soporte">
                <SectionHead layer={2} count={support.filter(x => x !== fallbackLead).length} />
                {support.filter(x => x !== fallbackLead).length === 0 && <p className="m-0 text-[14px] text-ink-2">Sin soporte todavía.</p>}
                <div className="grid grid-cols-2 gap-x-6 gap-y-8 xl:grid-cols-3">
                  {support
                    .filter(x => x !== fallbackLead)
                    .map(x => (
                      <div key={x.id} {...hoverProps(x)} className="flex flex-col gap-2 outline-none">
                        <PieceImage piece={x} project={project} className="aspect-[4/3] w-full" style={suggestion(x) ? { opacity: 0.85 } : undefined} />
                        <Origin piece={x} suggestion={suggestion(x)} />
                        <span className="type-name text-[26px] leading-[0.9]">{x.name}</span>
                        <span className="text-[13px] leading-[1.4] text-ink-2">{shortRule(x)}</span>
                      </div>
                    ))}
                </div>
              </section>
            </div>
          </div>
          {/* Al pasar el mouse se ven las referencias de donde sale cada cosa. */}
          <div className="flex h-[52px] shrink-0 items-center gap-[6px] overflow-hidden" aria-live="polite">
            <span className="type-label shrink-0 pr-2 text-[11px] text-ink-2">{hover ? `DE DÓNDE SALE «${hover.name.toUpperCase()}»` : 'PASÁ EL MOUSE POR LA PÁGINA PARA VER DE DÓNDE SALE'}</span>
            {lit &&
              corpusRefs(project)
                .filter(r => lit.has(r.id))
                .map(r => <Crop key={r.id} image={r.image} fit="cover" alt={r.name} className="size-[44px] shrink-0" />)}
          </div>
        </div>

        <div className="w-[190px] shrink-0 pt-12">
          <ExportBar
            project={project}
            onGenerate={props.onGenerate}
            onNotice={props.onNotice}
            paletteMissing={props.paletteMissing}
            paletteBusy={props.paletteBusy}
            onCompletePalette={props.onCompletePalette}
          />
        </div>
      </div>
      {props.toast && <Toast text={props.toast} />}
      <ShortcutBar
        items={[
          { keys: 'ESPACIO', label: 'Volver al moodboard' },
          { keys: 'P', label: 'Probar en un ejemplo' },
        ]}
      />
    </div>
  );
}

export type { Layer };
