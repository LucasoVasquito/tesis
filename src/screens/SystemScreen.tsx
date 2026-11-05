import React, { useState } from 'react';
import { Layer, Pattern, Project } from '../types';
import { useShortcuts } from '../hooks/useAuditShortcuts';
import { ShortcutBar } from '../components/shell/ShortcutBar';
import { corpusRefs, evidenceCount } from '../utils/layers';
import { oneLine, ruleFor, shortRule } from '../utils/layerRules';
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

/** Rótulo de sugerencia sobre la página: la pieza todavía no está confirmada. */
const SugTag = ({ dark }: { dark?: boolean }) => (
  <span className={`type-label border border-dashed px-1 text-[9px] ${dark ? 'border-void/60 text-void' : 'border-void/50 text-void/70'}`}>AGENTE · SUGERENCIA</span>
);

/**
 * 03 · SISTEMA. La pila girada se lee como página: el Núcleo titula, el Soporte desarrolla
 * y el Acento anota al margen. Nunca vacía: las sugerencias aparecen en punteado.
 */
export function SystemScreen(props: SystemScreenProps) {
  const { project } = props;
  const [hover, setHover] = useState<Pattern | null>(null);
  useShortcuts(props.enabled, { ' ': () => props.onBack(), escape: () => props.onBack(), i: () => props.onGenerate() });

  const core = piecesIn(project, 1);
  const support = piecesIn(project, 2);
  const accent = piecesIn(project, 3);
  // Sin Núcleo, la pieza con más evidencia se propone como titular (en punteado).
  const fallbackLead = !core.length ? [...livePieces(project)].sort((a, b) => evidenceCount(b, project) - evidenceCount(a, project))[0] : undefined;
  const lead = core[0] ?? fallbackLead;
  const moreCore = core.slice(1);
  const lit = hover ? new Set(hover.evidence) : null;
  const hoverProps = (x: Pattern) => ({ onMouseEnter: () => setHover(x), onMouseLeave: () => setHover(null), onFocus: () => setHover(x), onBlur: () => setHover(null), tabIndex: 0 });
  const dashed = (x: Pattern, color: string): React.CSSProperties => (isSuggestion(x) || x === fallbackLead ? { outline: `2px dashed ${color}`, outlineOffset: 2 } : {});

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 gap-6 px-8 pt-5">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <KeyButton k="ESPACIO" label="← Ordenar" tone="ghost" onClick={props.onBack} />
          {/* La página. Entra girando, como la pila vista de frente. */}
          <div className="relative min-h-0 flex-1" style={{ perspective: '1600px' }}>
            <div aria-hidden="true" className="absolute inset-0 translate-x-[20px] translate-y-[16px] border-2 border-accent" />
            <div aria-hidden="true" className="absolute inset-0 translate-x-[10px] translate-y-[8px] border-2 border-bone/50" />
            <div
              id="front-page"
              className="system-page relative grid h-full w-full gap-[14px] overflow-hidden bg-bone p-4 text-void"
              style={{ gridTemplateColumns: 'minmax(0,1fr) 210px', gridTemplateRows: 'auto minmax(0,1fr)' }}
            >
              {/* 01 · Núcleo: titular */}
              <div className="col-span-2 flex flex-col gap-2">
                {lead && (
                  <div {...hoverProps(lead)} className="flex items-stretch gap-[14px] bg-core p-3 outline-none" style={dashed(lead, 'var(--color-void)')}>
                    <PieceImage piece={lead} project={project} className="h-[150px] w-[170px] shrink-0" />
                    <div className="flex min-w-0 flex-col justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <span className="layer-tag" style={{ background: 'var(--color-void)', color: 'var(--color-bone)' }}>
                          01 NÚCLEO
                        </span>
                        {(isSuggestion(lead) || lead === fallbackLead) && <SugTag dark />}
                      </span>
                      <span className="type-name line-clamp-2 text-[52px] leading-[0.84]">{lead.name}</span>
                      <span className="line-clamp-3 text-[13px] font-medium leading-[1.35]">{ruleFor(lead, 1)}</span>
                    </div>
                  </div>
                )}
                {moreCore.length > 0 && (
                  <div className="flex gap-2">
                    {moreCore.map(x => (
                      <div key={x.id} {...hoverProps(x)} className="flex min-w-0 flex-1 items-center gap-2 bg-core p-2 outline-none" style={dashed(x, 'var(--color-void)')}>
                        <PieceImage piece={x} project={project} className="size-[44px] shrink-0" />
                        <span className="type-name line-clamp-2 text-[19px] leading-[0.9]">{x.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 02 · Soporte: cuerpo en columnas */}
              <div className="grid min-w-0 content-start gap-[14px] overflow-hidden" style={{ gridTemplateColumns: '1fr 1fr' }}>
                {support.filter(x => x !== fallbackLead).map(x => (
                  <div key={x.id} {...hoverProps(x)} className="flex min-w-0 gap-[10px] outline-none" style={dashed(x, 'rgba(20,22,30,.45)')}>
                    <PieceImage piece={x} project={project} className="size-[56px] shrink-0" />
                    <div className="flex min-w-0 flex-col gap-[3px]">
                      <span className="flex items-center gap-2">
                        <span className="type-label text-[10px] tracking-[0.06em]">02 SOPORTE</span>
                        {isSuggestion(x) && <SugTag />}
                      </span>
                      <span className="type-name line-clamp-2 text-[18px] leading-[0.95]">{x.name}</span>
                      <span className="line-clamp-2 text-[11px] leading-[1.35]">{shortRule(x)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* 03 · Acento: nota al margen */}
              <div className="flex min-w-0 flex-col gap-4 overflow-hidden">
                {accent.filter(x => x !== fallbackLead).map(x => (
                  <div key={x.id} {...hoverProps(x)} className="flex flex-col gap-1 border-l-[3px] border-accent pl-[10px] outline-none" style={dashed(x, 'var(--color-accent)')}>
                    <span className="flex items-center gap-2">
                      <span className="type-label text-[10px] tracking-[0.06em] text-accent">03 ACENTO</span>
                      {isSuggestion(x) && <SugTag />}
                    </span>
                    <span className="type-name line-clamp-3 text-[16px] leading-[0.95]">{x.name}</span>
                    <span className="line-clamp-2 text-[11px] leading-[1.35]">{oneLine(x)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* Al pasar el mouse por la página se ven las referencias de donde sale cada cosa. */}
          <div className="flex h-[52px] shrink-0 items-center gap-[6px] overflow-hidden" aria-live="polite">
            <span className="type-label shrink-0 pr-2 text-[11px] text-ink-2">{hover ? `DE DÓNDE SALE «${hover.name.toUpperCase()}»` : 'PASÁ EL MOUSE POR LA PÁGINA PARA VER DE DÓNDE SALE'}</span>
            {lit &&
              corpusRefs(project)
                .filter(r => lit.has(r.id))
                .map(r => <Crop key={r.id} image={r.image} fit="cover" alt={r.name} className="size-[44px] shrink-0" />)}
          </div>
        </div>

        <div className="w-[170px] shrink-0 pt-12">
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
          { keys: 'ESPACIO', label: 'Volver a ordenar' },
          { keys: 'I', label: 'Generar con DALL·E' },
        ]}
      />
    </div>
  );
}

export type { Layer };
