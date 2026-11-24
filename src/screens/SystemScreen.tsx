import React, { useEffect, useRef, useState } from 'react';
import { useColors } from './colorContext';
import { Layer, Pattern, Project, SystemSheet } from '../types';
import { useShortcuts } from '../hooks/useAuditShortcuts';
import { evidenceCount } from '../utils/layers';
import { fullRule, oneLine, shortRule } from '../utils/layerRules';
import { bestOn, BONE, INK } from '../utils/derivePalette';
import { ExportMenu } from '../components/ExportMenu';
import { Notify } from './types';
import { SHEET_NAME, evidenceText, isSuggestion, livePieces, piecesIn } from '../pieces/model';
import { LAYER_QUESTION } from '../utils/layerQuestions';
import { BottomBar } from '../components/shell/BottomBar';
import { Desk, DeskQuestion, Shelf } from '../components/shell/Desk';
import { PieceThumb } from './common';
import { PieceRule } from './PieceRule';
import { SUBSTEPS } from '../utils/substeps';

interface SystemScreenProps {
  project: Project;
  enabled: boolean;
  onNext: () => void;
  onBlocked: (reason: string) => void;
  notify: Notify;
  paletteMissing: number;
  paletteBusy: boolean;
  onCompletePalette: () => void;
  /** Guarda la ficha redactada por el agente (reglas y estilos de letra). */
  onSaveSheet: (sheet: SystemSheet) => void;
  /** Subpaso: 0 Paleta · 1 Tipografía · 2 Primario · 3 Secundario · 4 Acento · 5 Reglas · 6 Exportar. */
  sub: number;
  onSub: (i: number) => void;
  /** «Editar en Capas»: salta a Capas (a la capa indicada, si hay) y deja la píldora para volver. */
  onEditInLayers: (layer: Layer | null) => void;
}

/** Titular de cada capa a escala: Primario 132 px, Secundario 80, Acento 56. */
const HEAD: Record<Layer, string> = { 1: 'clamp(80px, 9vw, 132px)', 2: 'clamp(52px, 5.6vw, 80px)', 3: 'clamp(38px, 4vw, 56px)' };

/** Quién ubicó la pieza. */
function Origin({ piece, suggestion }: { piece: Pattern; suggestion: boolean }) {
  if (piece.origin === 'user') return <span className="type-label self-start rounded-[3px] bg-bone px-[6px] py-[1px] text-[0.75rem] text-void">Tuyo</span>;
  return <span className="type-label self-start text-[0.75rem] text-ink-2">{suggestion ? 'Detectado · sugerencia' : 'Detectado'}</span>;
}

/** Espécimen «Aa» aproximado según el tipo de letra. */
const SPECIMEN: Record<string, React.CSSProperties> = {
  condensed: { fontFamily: 'var(--font-display)', textTransform: 'uppercase', fontWeight: 900 },
  mono: { fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontWeight: 600 },
  serif: { fontFamily: 'var(--font-serif, Georgia, serif)', fontWeight: 600 },
  script: { fontFamily: 'var(--font-serif, Georgia, serif)', fontStyle: 'italic', fontWeight: 500 },
  rounded: { fontFamily: 'ui-rounded, var(--font-sans)', fontWeight: 800 },
  grotesk: { fontFamily: 'var(--font-sans)', fontWeight: 900 },
  wide: { fontFamily: 'var(--font-sans)', fontWeight: 800, letterSpacing: '0.08em' },
};

/** Firma de las piezas ubicadas: si cambia, la ficha se vuelve a redactar. */
const sheetSig = (p: Project) =>
  livePieces(p)
    .filter(x => x.layer)
    .map(x => `${x.id}:${x.layer}:${x.name}`)
    .sort()
    .join('|');

/** Capa de Capas donde se edita cada subpaso de Sistema (null: Capas tal como estaba). */
const EDIT_AT: Record<number, Layer | null> = { 0: null, 1: null, 2: 1, 3: 2, 4: 3, 5: null };

/**
 * 04 · SISTEMA en siete subpasos (v6): leer, no editar. Paleta · Tipografía · Primario · Secundario · Acento · Reglas · Exportar.
 * Cada subpaso tiene «Editar en Capas». En Exportar, «Ver todo» muestra el pliego completo.
 */
export function SystemScreen(props: SystemScreenProps) {
  const { project, sub } = props;
  const colors = useColors();
  const [all, setAll] = useState(false);
  useEffect(() => setAll(false), [sub]);

  const core = piecesIn(project, 1);
  const support = piecesIn(project, 2);
  const accent = piecesIn(project, 3);
  // Sin Primario, la pieza con más evidencia se propone como titular.
  const fallbackLead = !core.length ? [...livePieces(project)].sort((a, b) => evidenceCount(b, project) - evidenceCount(a, project))[0] : undefined;
  const suggestion = (x: Pattern) => isSuggestion(x) || x === fallbackLead;
  const others = (list: Pattern[]) => list.filter(x => x !== fallbackLead);

  /* ---------- Ficha redactada por el agente: reglas de uso y estilos de letra ---------- */
  const sig = sheetSig(project);
  const sheet = project.systemSheet;
  const fresh = sheet?.sig === sig;
  const [sheetBusy, setSheetBusy] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const tried = useRef<string | null>(null);
  const draftSheet = async () => {
    const pieces = livePieces(project).filter(x => x.layer);
    if (!pieces.length) return;
    tried.current = sig;
    setSheetBusy(true);
    setSheetError(null);
    try {
      const res = await fetch('/api/system-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: project.name,
          palette: colors.palette,
          pieces: pieces.map(x => ({ layer: x.layer, category: x.category, name: x.name, description: x.description })),
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.success) throw new Error(result.details || result.error || `HTTP ${res.status}`);
      props.onSaveSheet({ sig, rules: result.data.rules ?? [], fonts: result.data.fonts ?? [] });
    } catch (err: any) {
      setSheetError('No se pudieron redactar las reglas.');
      console.warn(err);
    } finally {
      setSheetBusy(false);
    }
  };
  // Se redacta sola al entrar si las piezas cambiaron (una vez por cambio).
  useEffect(() => {
    if (!fresh && !sheetBusy && tried.current !== sig && sig) void draftSheet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, fresh]);

  /* ---------- Acción del subpaso ---------- */
  const last = sub === SUBSTEPS.sistema.length - 1;
  const primary = !last
    ? { label: 'Siguiente →', kbd: '⏎', onClick: () => props.onSub(sub + 1) }
    : core.length
      ? { label: 'Probar en una pieza →', kbd: '⏎', onClick: props.onNext }
      : { label: 'Probar en una pieza →', blocked: 'Necesita al menos una pieza en Primario.', blockedLabel: 'Primario vacío', onClick: () => {}, onBlockedClick: props.onBlocked };
  useShortcuts(props.enabled, { enter: () => (primary.blocked ? primary.onBlockedClick?.(primary.blocked) : primary.onClick()) });

  /** Acción secundaria de cada subpaso de lectura: en texto. */
  const editLink = (i: number) =>
    EDIT_AT[i] !== undefined && (
      <button type="button" onClick={() => props.onEditInLayers(EDIT_AT[i])} className="no-print self-start text-[0.9375rem] font-semibold text-ink-2 underline underline-offset-4 hover:text-ink">
        Editar en Capas
      </button>
    );

  /* ---------- Secciones (cada una es un subpaso; «Ver todo» las junta) ---------- */
  const palette = (
    <div className="flex flex-col gap-4">
      <ul className="m-0 grid list-none gap-5 p-0 md:grid-cols-3">
        {colors.roles.map(r => (
          <li key={r.key} className="flex flex-col gap-2">
            <div className="flex h-[min(34vh,280px)] items-end justify-between rounded-[4px] p-4" style={{ background: r.hex, color: bestOn(r.hex, INK, BONE), boxShadow: 'inset 0 0 0 1px var(--cc-line)' }}>
              <span className="text-[1rem] font-bold">{r.label}</span>
              <span className="type-data text-[1rem] font-bold">{r.hex.toUpperCase()}</span>
            </div>
            <span className="text-[0.875rem] leading-snug text-ink-2">{r.source}</span>
          </li>
        ))}
      </ul>
      {props.paletteMissing > 0 && (
        <button type="button" onClick={props.onCompletePalette} disabled={props.paletteBusy} className="self-start text-[0.875rem] font-medium text-ink-2 underline underline-offset-4 hover:text-ink disabled:no-underline">
          {props.paletteBusy ? 'Analizando colores…' : `Completar paleta desde tus referencias · ${props.paletteMissing}`}
        </button>
      )}
    </div>
  );

  const typography = sheet?.fonts.length ? (
    <ul className="m-0 flex list-none flex-col p-0" style={{ opacity: fresh ? 1 : 0.6 }}>
      {sheet.fonts.map(f => (
        <li key={f.style} className="flex items-center gap-8 border-t border-line py-6">
          <span aria-hidden="true" className="w-[160px] shrink-0 text-[6rem] leading-none" style={SPECIMEN[f.kind ?? ''] ?? { fontWeight: 700 }}>
            Aa
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="text-[1.5rem] font-semibold leading-tight">{f.style}</span>
            {f.use && <span className="text-[1rem] text-ink-2">{f.use}</span>}
          </span>
        </li>
      ))}
    </ul>
  ) : (
    <p className="m-0 text-[1rem] text-ink-2">{sheetBusy ? 'Leyendo los estilos de letra…' : 'Todavía no se detectó ninguna.'}</p>
  );

  const layerSection = (l: Layer) => {
    const list = l === 1 ? core : others(l === 2 ? support : accent);
    const lead = l === 1 ? core[0] ?? fallbackLead : list[0];
    const rest = l === 1 ? core.slice(1) : list.slice(1);
    const rule = (x: Pattern) => (l === 1 ? shortRule(x) : l === 2 ? shortRule(x) : oneLine(x));
    return (
      <div className={`layer-${l} flex flex-col gap-8`}>
        <p className="m-0 text-[1.25rem] font-medium" style={{ color: 'var(--cc-text-muted)' }}>
          {LAYER_QUESTION[l]} · {list.length} {list.length === 1 ? 'pieza' : 'piezas'}
        </p>
        {lead ? (
          <>
            {/* Una pieza destacada */}
            <div className="grid items-start gap-8 lg:grid-cols-12">
              <PieceThumb
                piece={lead}
                project={project}
                className="aspect-[4/3] w-full rounded-[4px] bg-raised lg:col-span-7"
                style={{ opacity: suggestion(lead) ? 0.85 : 1, boxShadow: l === 1 ? '0 30px 80px color-mix(in srgb, var(--cc-l0) 33%, transparent)' : undefined }}
              />
              <div className="flex flex-col gap-4 lg:col-span-5">
                <Origin piece={lead} suggestion={suggestion(lead)} />
                <h3 className="m-0 text-[2rem] font-semibold leading-[1.1]">{lead.name}</h3>
                <p className="m-0 max-w-[68ch] text-[1.0625rem] leading-[1.6]">{fullRule(lead) || 'Todavía sin regla redactada.'}</p>
                <span className="type-data text-[0.875rem] text-ink-2">En {evidenceText(lead, project)}</span>
              </div>
            </div>
            {/* Las demás, en fila */}
            {rest.length > 0 && (
              <div className="flex gap-5 overflow-x-auto pb-2">
                {rest.map(x => (
                  <div key={x.id} className="flex w-[220px] shrink-0 flex-col gap-2">
                    <PieceThumb piece={x} project={project} className="aspect-[4/5] w-full rounded-[4px] bg-raised" style={{ opacity: suggestion(x) ? 0.85 : 1 }} word={l !== 3} />
                    <span className="text-[1rem] font-semibold leading-tight">{x.name}</span>
                    <PieceRule piece={x} project={project} short={rule(x)} />
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="m-0 text-[1rem] text-ink-2">{l === 1 ? 'El Primario está vacío. Ubicá piezas en la Capa 1.' : l === 2 ? 'Sin secundario todavía.' : 'Sin acentos todavía.'}</p>
        )}
      </div>
    );
  };

  const rules = (
    <div className="flex flex-col gap-4">
      {sheet?.rules.length ? (
        <ol className="m-0 flex list-none flex-col p-0" style={{ opacity: fresh ? 1 : 0.6 }}>
          {sheet.rules.map((r, i) => (
            <li key={r} className="flex items-baseline gap-6 border-t border-line py-5">
              <span className="type-data w-8 shrink-0 text-[1rem] text-ink-2">{String(i + 1).padStart(2, '0')}</span>
              <span className="text-[clamp(1.25rem,2vw,1.75rem)] font-semibold leading-snug">{r}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="m-0 text-[1rem] text-ink-2">{sheetBusy ? 'Redactando las reglas…' : 'Sin reglas todavía.'}</p>
      )}
      {sheetError && (
        <p role="alert" className="m-0 text-[0.875rem] text-error-ink">
          {sheetError}
        </p>
      )}
      {!sheetBusy && (sheet || sheetError) && (
        <button type="button" onClick={() => void draftSheet()} className="no-print self-start text-[0.9375rem] text-ink-2 underline underline-offset-4 hover:text-ink">
          {fresh ? 'Volver a redactar' : 'Actualizar con los cambios'}
        </button>
      )}
      {sheetBusy && sheet && <span className="text-[0.875rem] text-ink-2">Actualizando…</span>}
    </div>
  );

  const sectionOf = (i: number) => (i === 0 ? palette : i === 1 ? typography : i <= 4 ? layerSection((i - 1) as Layer) : rules);
  const titleOf = (i: number) =>
    i >= 2 && i <= 4 ? (
      <h1 data-headline className={`layer-${i - 1} layer-headline m-0 mb-6`} style={{ fontSize: HEAD[(i - 1) as Layer] }}>
        {SHEET_NAME[(i - 1) as Layer]}
      </h1>
    ) : (
      <DeskQuestion>{SUBSTEPS.sistema[i].question}</DeskQuestion>
    );

  /* ---------- Estantes ---------- */
  const objective = project.objective.trim();
  const shelves: Shelf[] = [
    {
      id: 'brief',
      label: 'Brief',
      side: 'right',
      content: (
        <div className="flex flex-col gap-3">
          <span className="text-[1.25rem] font-semibold">{project.name.trim() || project.intent?.trim() || 'Proyecto sin nombre'}</span>
          {project.intent?.trim() && <span className="text-[0.9375rem] text-ink-2">{project.intent.trim()}</span>}
          <p className="m-0 whitespace-pre-line text-[0.9375rem] leading-[1.6]">{objective || 'Sin objetivo todavía. Escribilo en 0 · Brief.'}</p>
        </div>
      ),
    },
  ];

  /* ---------- La mesa ---------- */
  let body: React.ReactNode;
  if (!last) {
    body = (
      <div className="flex flex-col gap-6 pb-8">
        {titleOf(sub)}
        {sectionOf(sub)}
        {editLink(sub)}
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-8 pb-8">
        <div className="flex items-start justify-between gap-6">
          <DeskQuestion>Exportar</DeskQuestion>
          {/* Conmutador «Ver todo»: el pliego completo (misma base que el PDF) */}
          <button type="button" role="switch" aria-checked={all} onClick={() => setAll(v => !v)} className="no-print mt-3 flex shrink-0 items-center gap-3 text-[0.9375rem] font-semibold text-ink-2 hover:text-ink">
            <span aria-hidden="true" className="relative h-5 w-9 rounded-full transition-colors duration-150" style={{ background: all ? 'var(--cc-text)' : 'color-mix(in srgb, var(--cc-text) 20%, transparent)' }}>
              <span className="absolute top-[2px] size-4 rounded-full transition-[left] duration-150" style={{ left: all ? 18 : 2, background: all ? 'var(--cc-bg)' : 'var(--cc-text)' }} />
            </span>
            Ver todo
          </button>
        </div>
        {all ? (
          <div className="flex flex-col gap-20">
            <span className="text-[1.375rem] font-semibold">{project.name.trim() || project.intent?.trim() || 'Sistema visual'}</span>
            {[0, 1, 2, 3, 4, 5].map(i => (
              <section key={i} className="flex flex-col gap-6" aria-label={SUBSTEPS.sistema[i].label}>
                {i >= 2 && i <= 4 ? titleOf(i) : <h2 className="type-label m-0 text-[0.875rem] text-ink-2">{SUBSTEPS.sistema[i].label}</h2>}
                {sectionOf(i)}
              </section>
            ))}
          </div>
        ) : (
          <ExportMenu project={project} notify={props.notify} inline big />
        )}
      </div>
    );
  }

  return (
    <>
      <Desk stepKey={`sistema-${sub}-${all ? 'todo' : ''}`} width="wide" shelves={shelves}>
        {body}
      </Desk>
      <BottomBar primary={primary} />
    </>
  );
}

export type { Layer };
