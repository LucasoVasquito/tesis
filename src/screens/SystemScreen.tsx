import React from 'react';
import { Layer, Pattern, Project } from '../types';
import { useShortcuts } from '../hooks/useAuditShortcuts';
import { evidenceCount } from '../utils/layers';
import { fullRule, oneLine, shortRule } from '../utils/layerRules';
import { ExportMenu } from '../components/ExportMenu';
import { Notify } from './types';
import { SHEET_NAME, evidenceText, isSuggestion, livePieces, piecesIn } from '../pieces/model';
import { BarButton, BottomBar } from '../components/shell/BottomBar';
import { PieceThumb } from './common';

interface SystemScreenProps {
  project: Project;
  enabled: boolean;
  onNext: () => void;
  onBlocked: (reason: string) => void;
  notify: Notify;
  paletteMissing: number;
  paletteBusy: boolean;
  onCompletePalette: () => void;
}

/** Quién ubicó la pieza. */
function Origin({ piece, suggestion }: { piece: Pattern; suggestion: boolean }) {
  if (piece.origin === 'user') return <span className="type-label self-start bg-bone px-1 text-[10px] text-void">TUYO</span>;
  return <span className="type-label self-start border border-ink-3 px-1 text-[10px] text-ink-2">{suggestion ? 'DETECTADO · SUGERENCIA' : 'DETECTADO'}</span>;
}

/** Rótulo de capa del color de la capa, con su filete. */
function SectionHead({ layer, count }: { layer: Layer; count: number }) {
  return (
    <div className={`layer-${layer} flex flex-col gap-2`}>
      <div className="flex items-baseline justify-between">
        <span className="type-label text-[13px] tracking-[0.08em]" style={{ color: 'var(--layer-text)' }}>
          CAPA {layer} · {SHEET_NAME[layer].toUpperCase()}
        </span>
        <span className="font-mono text-[11px] text-ink-2">{count}</span>
      </div>
      <div className="layer-rule" />
    </div>
  );
}

/**
 * 04 · SISTEMA. Una columna de lectura de 720px como máximo: el Núcleo titula con su imagen en 16:9,
 * el Soporte se desarrolla en tres columnas y el Acento va en una fila de miniaturas.
 */
export function SystemScreen(props: SystemScreenProps) {
  const { project } = props;
  useShortcuts(props.enabled, { enter: () => props.onNext(), p: () => props.onNext() });

  const core = piecesIn(project, 1);
  const support = piecesIn(project, 2);
  const accent = piecesIn(project, 3);
  // Sin Núcleo, la pieza con más evidencia se propone como titular.
  const fallbackLead = !core.length ? [...livePieces(project)].sort((a, b) => evidenceCount(b, project) - evidenceCount(a, project))[0] : undefined;
  const lead = core[0] ?? fallbackLead;
  const moreCore = core.slice(1);
  const suggestion = (x: Pattern) => isSuggestion(x) || x === fallbackLead;
  const title = project.name || project.intent || 'Sistema visual';
  const others = (list: Pattern[]) => list.filter(x => x !== fallbackLead);

  return (
    <div className="relative h-full">
      <div className="h-full overflow-y-auto">
        <div id="front-page" className="system-page mx-auto flex max-w-[720px] flex-col gap-12 bg-void px-8 pb-48 pt-10 text-ink">
          <header className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="type-name text-[22px] text-ink-2">{title}</span>
            <span className="type-label text-[11px] tracking-[0.1em] text-ink-3">SISTEMA VISUAL · CAMALEÓN CORPUS</span>
          </header>

          {/* Capa 1 · Núcleo */}
          <section className="flex flex-col gap-5" aria-label="Capa 1 · Núcleo">
            <SectionHead layer={1} count={core.length} />
            {lead ? (
              <>
                <div className="flex flex-col gap-4">
                  <PieceThumb
                    piece={lead}
                    project={project}
                    className="aspect-video bg-raised"
                    style={{ width: 'min(100%, calc(46vh * 16 / 9))', opacity: suggestion(lead) ? 0.85 : 1 }}
                  />
                  <Origin piece={lead} suggestion={suggestion(lead)} />
                  <h2 className="type-name m-0 text-[48px] leading-[0.9]">{lead.name}</h2>
                  <p className="m-0 max-w-[62ch] text-[16px] leading-[1.5] text-ink">{fullRule(lead) || 'Todavía sin regla redactada.'}</p>
                  <span className="font-mono text-[11px] tracking-[0.06em] text-ink-2">EN {evidenceText(lead, project).toUpperCase()}</span>
                </div>
                {moreCore.length > 0 && (
                  <div className="grid grid-cols-3 gap-5 pt-2">
                    {moreCore.map(x => (
                      <div key={x.id} className="flex min-w-0 flex-col gap-2">
                        <PieceThumb piece={x} project={project} className="aspect-[16/10] w-full bg-raised" style={{ opacity: suggestion(x) ? 0.85 : 1 }} />
                        <Origin piece={x} suggestion={suggestion(x)} />
                        <span className="type-name text-[26px] leading-[0.9]">{x.name}</span>
                        <span className="text-[13px] leading-[1.4] text-ink-2">{shortRule(x)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="m-0 text-[15px] text-ink-2">El Núcleo está vacío. Ubicá piezas en la Capa 1.</p>
            )}
          </section>

          {/* Capa 2 · Soporte */}
          <section className="flex flex-col gap-5" aria-label="Capa 2 · Soporte">
            <SectionHead layer={2} count={others(support).length} />
            {others(support).length === 0 && <p className="m-0 text-[14px] text-ink-2">Sin soporte todavía.</p>}
            <div className="grid grid-cols-3 gap-x-5 gap-y-8">
              {others(support).map(x => (
                <div key={x.id} className="flex min-w-0 flex-col gap-2">
                  <PieceThumb piece={x} project={project} className="aspect-[16/10] w-full bg-raised" style={{ opacity: suggestion(x) ? 0.85 : 1 }} />
                  <Origin piece={x} suggestion={suggestion(x)} />
                  <span className="type-name text-[22px] leading-[0.92]">{x.name}</span>
                  <span className="text-[13px] leading-[1.4] text-ink-2">{shortRule(x)}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Capa 3 · Acento */}
          <section className="flex flex-col gap-4" aria-label="Capa 3 · Acento">
            <SectionHead layer={3} count={others(accent).length} />
            {others(accent).length === 0 && <p className="m-0 text-[14px] text-ink-2">Sin acentos todavía.</p>}
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {others(accent).map(x => (
                <li key={x.id} className="flex items-center gap-4">
                  <PieceThumb piece={x} project={project} className="size-16 shrink-0 bg-raised" word={false} style={{ opacity: suggestion(x) ? 0.85 : 1 }} />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="flex items-center gap-2">
                      <span className="type-name text-[20px] leading-[0.95]">{x.name}</span>
                      <Origin piece={x} suggestion={suggestion(x)} />
                    </span>
                    <span className="text-[13px] leading-[1.4] text-ink-2">{oneLine(x)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {/* Degradé al pie: la barra inferior no tapa el texto */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-40" style={{ background: 'linear-gradient(to top, var(--color-bg) 30%, transparent)' }} />

      <BottomBar
        actions={
          <>
            <ExportMenu project={project} notify={props.notify} />
            {props.paletteMissing > 0 && (
              <BarButton onClick={props.onCompletePalette} disabled={props.paletteBusy}>
                {props.paletteBusy ? 'Analizando colores…' : `Completar paleta · ${props.paletteMissing}`}
              </BarButton>
            )}
          </>
        }
        primary={
          core.length
            ? { label: 'Probar en una pieza', kbd: '⏎', onClick: props.onNext }
            : { label: 'Probar en una pieza', blocked: 'Necesita al menos una pieza en Núcleo.', blockedLabel: 'Núcleo vacío', onClick: () => {}, onBlockedClick: props.onBlocked }
        }
      />
    </div>
  );
}

export type { Layer };
