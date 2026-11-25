import React, { useEffect, useRef, useState } from 'react';
import { useColors } from './colorContext';
import { Layer, Pattern, Project, StructureSheet, SystemBoundary, SystemSheet } from '../types';
import { useShortcuts } from '../hooks/useAuditShortcuts';
import { corpusRefs, evidenceCount } from '../utils/layers';
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
import { CropStrip, EvidenceStrip } from './EvidenceStrip';
import { SUBSTEPS } from '../utils/substeps';
import { tallyText } from '../utils/results';
import { compressImageString } from '../utils/imageCompressor';
import { looksStructural, looksUsage, structureRefs, structureRules, structureSig } from '../utils/structure';
import { ruleTargets } from '../utils/evidence';
import { BOUNDARIES, boundaryInfo, detectBoundaryRule } from '../utils/boundary';

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
  /** `drafted`: lo redactó el agente. Las reglas del usuario se toman de lo último guardado, no de lo que había al pedirlo. */
  onSaveSheet: (sheet: SystemSheet, drafted?: boolean) => void;
  /** Guarda la estructura. `drafted`: la leyó el agente (se conservan las reglas del usuario guardadas). */
  onSaveStructure: (sheet: StructureSheet, drafted?: boolean) => void;
  /** Guarda el límite del sistema (qué puede entrar desde afuera). */
  onSaveBoundary: (boundary: SystemBoundary) => void;
  /** Subpaso: 0 Paleta · 1 Tipografía · 2 Primario · 3 Secundario · 4 Acento · 5 Estructura · 6 Reglas · 7 Exportar. */
  sub: number;
  onSub: (i: number) => void;
  /** «Editar en Capas»: salta a Capas (a la capa indicada, si hay) y deja la píldora para volver. */
  onEditInLayers: (layer: Layer | null) => void;
}

/** Titular de cada capa a escala: Primario 132 px, Secundario 80, Acento 56. */
const HEAD: Record<Layer, string> = { 1: 'clamp(80px, 9vw, 132px)', 2: 'clamp(52px, 5.6vw, 80px)', 3: 'clamp(38px, 4vw, 56px)' };

/** Quién ubicó la pieza. */
function Origin({ piece, suggestion }: { piece: Pattern; suggestion: boolean }) {
  if (piece.origin === 'user') return <span className="type-label self-start rounded-[3px] bg-bone px-[6px] py-[1px] text-[0.75rem] text-void">Usuario</span>;
  return <span className="type-label self-start text-[0.75rem] text-ink-2">{suggestion ? 'Agente · sugerencia' : 'Agente'}</span>;
}

/** Ejemplo tipográfico: una fuente libre real (Google Fonts) por tipo de letra. */
interface Specimen {
  family: string;
  style: React.CSSProperties;
}
const SPECIMEN: Record<string, Specimen> = {
  condensed: { family: 'Big Shoulders Display', style: { fontFamily: '"Big Shoulders Display", Impact, sans-serif', fontWeight: 900, textTransform: 'uppercase' } },
  mono: { family: 'Space Mono', style: { fontFamily: '"Space Mono", ui-monospace, monospace', fontWeight: 700 } },
  serif: { family: 'Playfair Display', style: { fontFamily: '"Playfair Display", Georgia, serif', fontWeight: 800 } },
  script: { family: 'Caveat Brush', style: { fontFamily: '"Caveat Brush", cursive', fontWeight: 400 } },
  rounded: { family: 'Nunito Black', style: { fontFamily: 'Nunito, ui-rounded, sans-serif', fontWeight: 900 } },
  grotesk: { family: 'Archivo Black', style: { fontFamily: '"Archivo Black", Arial, sans-serif', fontWeight: 400 } },
  wide: { family: 'Syncopate', style: { fontFamily: 'Syncopate, sans-serif', fontWeight: 700 } },
  blackletter: { family: 'Pirata One', style: { fontFamily: '"Pirata One", serif', fontWeight: 400 } },
  bubble: { family: 'Bowlby One', style: { fontFamily: '"Bowlby One", sans-serif', fontWeight: 400 } },
  display3d: { family: 'Bungee Shade', style: { fontFamily: '"Bungee Shade", sans-serif', fontWeight: 400 } },
  stencil: { family: 'Black Ops One', style: { fontFamily: '"Black Ops One", sans-serif', fontWeight: 400 } },
};

/**
 * Qué fuente mostrar: primero lo que dice la descripción del estilo («gótica fracturada», «burbuja orgánica»…),
 * porque la clasificación del agente suele ser genérica; después su `kind`.
 */
function specimenFor(f: { style: string; kind?: string }): Specimen {
  const t = f.style.toLowerCase();
  const by: [RegExp, string][] = [
    [/g[oó]tic|fractur|blackletter|black letter|b[aá]rbar/, 'blackletter'],
    [/burbuja|bubble|fluid|org[aá]nic|l[ií]quid|inflad/, 'bubble'],
    [/tridimension|3s?d|perspectiv|extrud|sombr/, 'display3d'],
    [/stencil|plantilla|militar/, 'stencil'],
    [/mono|t[eé]cnic|m[aá]quina/, 'mono'],
    [/serif|serifa|editorial cl[aá]sic/, 'serif'],
    [/manuscrit|script|cursiv|pincel|brush/, 'script'],
    [/redonde|rounded/, 'rounded'],
    [/condensad|angosta|rotulad/, 'condensed'],
    [/extendid|ancha|wide/, 'wide'],
  ];
  const hit = by.find(([re]) => re.test(t));
  return SPECIMEN[hit ? hit[1] : f.kind ?? ''] ?? SPECIMEN.grotesk;
}

/** Una regla de uso: se toca para editarla; Enter guarda, Esc cancela, vacía se borra. */
function RuleRow({ n, text, mine, note, extra, onSave }: { n: number; text: string; mine?: boolean; note?: React.ReactNode; extra?: React.ReactNode; onSave: (t: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const done = (save: boolean) => {
    setEditing(false);
    if (save && draft.trim() !== text) onSave(draft.trim());
    else setDraft(text);
  };
  return (
    <li className="flex items-baseline gap-6 border-t border-line py-5">
      <span className="type-data w-8 shrink-0 text-[1rem] text-ink-2">{String(n).padStart(2, '0')}</span>
      {editing ? (
        <textarea
          autoFocus
          rows={2}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => done(true)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              done(true);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              done(false);
            }
          }}
          aria-label={`Regla ${n}`}
          className="field-input min-w-0 flex-1"
          style={{ fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.35, resize: 'vertical' }}
        />
      ) : (
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <button type="button" onClick={() => { setDraft(text); setEditing(true); }} title="Tocá para editar" className="group flex min-w-0 items-baseline justify-between gap-4 text-left">
            <span className="text-[clamp(1.25rem,2vw,1.75rem)] font-semibold leading-snug">{text}</span>
            <span className="no-print flex shrink-0 items-baseline gap-3 text-[0.875rem] text-ink-2">
              {mine && <span className="type-label rounded-[3px] bg-bone px-[6px] py-[1px] text-[0.75rem] text-void">Usuario</span>}
              <span className="underline underline-offset-4 group-hover:text-ink">Editar</span>
            </span>
          </button>
          {note && <div className="type-data text-[0.875rem] font-normal text-ink-2">{note}</div>}
          {extra}
        </div>
      )}
    </li>
  );
}

/** Campo para escribir una regla nueva. */
function NewRule({ onAdd, placeholder = 'Ej.: El acento verde solo va en sellos de advertencia.', label = 'Regla nueva' }: { onAdd: (t: string) => void; placeholder?: string; label?: string }) {
  const [v, setV] = useState('');
  return (
    <div className="flex flex-col gap-2">
      <textarea
        autoFocus
        rows={2}
        value={v}
        onChange={e => setV(e.target.value)}
        onBlur={() => onAdd(v.trim())}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onAdd(v.trim());
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onAdd('');
          }
        }}
        aria-label={label}
        placeholder={placeholder}
        className="field-input"
        style={{ fontSize: '1.125rem', fontWeight: 600, lineHeight: 1.35, resize: 'vertical' }}
      />
      <span className="text-[0.8125rem] text-ink-2">Enter guarda · Esc cancela</span>
    </div>
  );
}

/** Firma de las reglas de uso: cambia si cambian las piezas, el límite o cualquier regla del usuario. */
const sheetSig = (p: Project) =>
  [
    `b:${p.boundary ?? 'closed'}`,
    ...(p.systemSheet?.userRules ?? []).map(r => `u:${r}`),
    ...(p.structureSheet?.userRules ?? []).map(r => `s:${r}`),
    ...livePieces(p)
      .filter(x => x.layer)
      .map(x => `${x.id}:${x.layer}:${x.name}`)
      .sort(),
  ].join('|');

/** Capa de Capas donde se edita cada subpaso de Sistema (null: Capas tal como estaba). */
// La estructura no se edita en Capas: se lee de las referencias y se corrige acá mismo.
const EDIT_AT: Record<number, Layer | null> = { 0: null, 1: null, 2: 1, 3: 2, 4: 3, 6: null };

/**
 * 04 · SISTEMA en ocho subpasos: leer, no editar. Paleta · Tipografía · Primario · Secundario · Acento · Estructura · Reglas · Exportar.
 * Cada subpaso tiene «Editar en Capas». En Exportar, «Ver todo» muestra el pliego completo.
 */
export function SystemScreen(props: SystemScreenProps) {
  const { project, sub } = props;
  const colors = useColors();
  const [all, setAll] = useState(false);
  const [addingRule, setAddingRule] = useState(false);
  const [addingStructure, setAddingStructure] = useState(false);
  const [pendingBoundary, setPendingBoundary] = useState<{ side: 'usage' | 'structure'; text: string; suggested: SystemBoundary } | null>(null);
  useEffect(() => {
    setAll(false);
    setAddingRule(false);
    setAddingStructure(false);
    setPendingBoundary(null);
  }, [sub]);

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
  const latestSig = useRef(sig);
  latestSig.current = sig;
  const draftSheet = async () => {
    const pieces = livePieces(project).filter(x => x.layer);
    if (!pieces.length) return;
    const reqSig = sig;
    tried.current = reqSig;
    setSheetBusy(true);
    setSheetError(null);
    try {
      const res = await fetch('/api/system-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: project.name,
          palette: colors.palette,
          boundary: project.boundary ?? 'closed',
          pieces: pieces.map(x => ({ layer: x.layer, category: x.category, name: x.name, description: x.description })),
          userRules: sheet?.userRules ?? [],
          // La estructura ya escrita: las reglas de uso no la repiten ni la contradicen.
          structureRules: structureRules(project).map(r => r.text),
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.success) throw new Error(result.details || result.error || `HTTP ${res.status}`);
      if (latestSig.current !== reqSig) return;
      props.onSaveSheet({ sig: reqSig, rules: result.data.rules ?? [], targets: result.data.targets, fonts: result.data.fonts ?? [] }, true);
    } catch (err: any) {
      if (latestSig.current === reqSig) setSheetError('No se pudieron redactar las reglas.');
      console.warn(err);
    } finally {
      setSheetBusy(false);
    }
  };

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
      {sheet.fonts.map(f => {
        const sp = specimenFor(f);
        const word = (project.name || 'Aa').split(/s[—–-]s/)[0].trim().split(/s+/)[0];
        return (
          <li key={f.style} className="grid items-center gap-x-10 gap-y-3 border-t border-line py-8 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <span aria-label={`Ejemplo: ${word}`} className="min-w-0 break-words text-[clamp(3.5rem,7vw,6rem)] leading-[1.05]" style={sp.style}>
              {word}
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-[1.5rem] font-semibold leading-tight">{f.style}</span>
              {f.use && <span className="text-[1rem] text-ink-2">{f.use}</span>}
              <span className="type-data mt-1 text-[0.875rem] text-ink-2">Parecida a {sp.family}</span>
            </span>
          </li>
        );
      })}
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
                <EvidenceStrip piece={lead} project={project} className="no-print" />
                {tallyText(project, lead.id) && <span className="type-data text-[0.875rem] text-ink-2">En pruebas: {tallyText(project, lead.id)}</span>}
              </div>
            </div>
            {/* Las demás, en grilla: todas a la vista, sin deslizar */}
            {rest.length > 0 && (
              <div className="grid gap-x-5 gap-y-8" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                {rest.map(x => (
                  <div key={x.id} className="flex min-w-0 flex-col gap-2">
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

  /** Guarda la ficha conservando lo demás. Sin ficha todavía, sig vacío: así se sigue redactando la del agente. */
  const saveSheet = (patch: Partial<SystemSheet>) => props.onSaveSheet({ sig: sheet?.sig ?? '', rules: sheet?.rules ?? [], targets: sheet?.targets, fonts: sheet?.fonts ?? [], userRules: sheet?.userRules, ...patch });

  /**
   * Recortes de una regla de uso: los de la pieza de la que habla. Las del agente traen la pieza (`targets`);
   * en las tuyas se busca por el nombre. Sin pieza reconocible, no se muestra nada.
   */
  const usageCrops = (text: string, names?: string[]) => {
    const targets = ruleTargets(project, text, names);
    if (!targets.length) return null;
    return (
      <div className="no-print mt-1 flex flex-col gap-3">
        {targets.map(x => (
          <div key={x.id} className="flex min-w-0 flex-col gap-1">
            <span className="text-[0.8125rem] text-ink-2">{x.name}</span>
            <EvidenceStrip piece={x} project={project} size={72} />
          </div>
        ))}
      </div>
    );
  };
  const mine = sheet?.userRules ?? [];
  const theirs = sheet?.rules ?? [];
  const total = mine.length + theirs.length;
  const currentBoundary = project.boundary ?? 'closed';

  const boundaryNote = (text: string, onPromote: (b: SystemBoundary) => void) => {
    const b = detectBoundaryRule(text);
    if (!b) return null;
    const info = boundaryInfo(b);
    return (
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-pending-ink">
        <span>Esta regla define el límite del sistema (qué entra de afuera).</span>
        <button
          type="button"
          onClick={() => onPromote(b)}
          className="no-print font-semibold text-ink underline underline-offset-4 hover:no-underline"
        >
          Pasar a «{info.label}» y quitar esta regla
        </button>
      </span>
    );
  };

  const pendingBox = (side: 'usage' | 'structure', onKeep: (text: string) => void) => {
    if (!pendingBoundary || pendingBoundary.side !== side) return null;
    const info = boundaryInfo(pendingBoundary.suggested);
    return (
      <div role="status" className="flex flex-col gap-3 rounded-[4px] border border-line-strong bg-surface p-4">
        <p className="m-0 text-[0.9375rem] leading-snug text-ink">
          «{pendingBoundary.text}» toca el límite del sistema. Conviene elegirlo arriba en <b>Límite del sistema</b> para que mande en todo el export y en Probar, sin dejarlo como regla suelta:
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              props.onSaveBoundary(pendingBoundary.suggested);
              setPendingBoundary(null);
            }}
            className="rounded-full bg-bone px-4 py-1.5 text-[0.875rem] font-bold text-void"
          >
            Usar «{info.label}»
          </button>
          <button
            type="button"
            onClick={() => {
              onKeep(pendingBoundary.text);
              setPendingBoundary(null);
            }}
            className="text-[0.875rem] text-ink-2 underline underline-offset-4 hover:text-ink"
          >
            Dejar como regla igual
          </button>
          <button type="button" onClick={() => setPendingBoundary(null)} className="text-[0.875rem] text-ink-2 underline underline-offset-4 hover:text-ink">
            Cancelar
          </button>
        </div>
      </div>
    );
  };

  const boundarySelector = (
    <div className="flex flex-col gap-3 pb-2">
      <div className="flex flex-col gap-1">
        <span className="type-label text-[0.75rem] text-ink-2">Límite del sistema · qué puede entrar de afuera</span>
        <span className="text-[0.875rem] text-ink-2">Una sola decisión que manda en el export, en Probar y en las reglas del agente.</span>
      </div>
      <div role="radiogroup" aria-label="Límite del sistema" className="grid gap-3 md:grid-cols-3">
        {BOUNDARIES.map(b => {
          const active = currentBoundary === b.id;
          return (
            <button
              key={b.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                if (!active) props.onSaveBoundary(b.id);
              }}
              className={`flex flex-col items-start gap-1 rounded-[4px] border p-4 text-left transition-colors duration-150 ${
                active ? 'border-bone bg-bone text-void' : 'border-line text-ink hover:border-line-strong hover:bg-ink/5'
              }`}
            >
              <span className="text-[1rem] font-bold leading-tight">{b.label}</span>
              <span className={`text-[0.875rem] leading-snug ${active ? 'text-void/80' : 'text-ink-2'}`}>{b.short}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const rules = (
    <div className="flex flex-col gap-5">
      {boundarySelector}
      {total ? (
        <ol className="m-0 flex list-none flex-col p-0" style={{ opacity: fresh ? 1 : 0.6 }}>
          {mine.map((r, i) => (
            <RuleRow
              key={`m${i}${r}`}
              n={i + 1}
              text={r}
              mine
              note={
                boundaryNote(r, b => {
                  props.onSaveBoundary(b);
                  saveSheet({ userRules: mine.filter((_, j) => j !== i) });
                }) ?? (looksStructural(project, r) ? 'Parece de Estructura: habla de la pieza entera, no de un elemento.' : undefined)
              }
              extra={usageCrops(r)}
              onSave={t => saveSheet({ userRules: t ? mine.map((x, j) => (j === i ? t : x)) : mine.filter((_, j) => j !== i) })}
            />
          ))}
          {theirs.map((r, i) => (
            <RuleRow
              key={`a${i}${r}`}
              n={mine.length + i + 1}
              text={r}
              extra={usageCrops(r, sheet?.targets?.[i])}
              // Al editar una del agente pasa a ser tuya: el agente ya no la reescribe.
              onSave={t =>
                saveSheet({
                  rules: theirs.filter((_, j) => j !== i),
                  // Las piezas de cada regla van en el mismo orden: se saca la misma posición.
                  targets: sheet?.targets?.filter((_, j) => j !== i),
                  userRules: t && t !== r ? [...mine, t] : mine,
                })
              }
            />
          ))}
        </ol>
      ) : (
        <p className="m-0 text-[1rem] text-ink-2">{sheetBusy ? 'Redactando las reglas…' : 'Sin reglas todavía.'}</p>
      )}
      {pendingBox('usage', t => saveSheet({ userRules: [...mine, t] }))}
      {addingRule ? (
        <NewRule
          onAdd={t => {
            setAddingRule(false);
            if (!t) return;
            const suggested = detectBoundaryRule(t);
            if (suggested) setPendingBoundary({ side: 'usage', text: t, suggested });
            else saveSheet({ userRules: [...mine, t] });
          }}
        />
      ) : (
        <button type="button" data-guide="rules-add" onClick={() => setAddingRule(true)} className="no-print self-start text-[0.9375rem] font-bold text-ink underline underline-offset-4 hover:no-underline">
          + Escribir una regla
        </button>
      )}
      {sheetError && (
        <p role="alert" className="m-0 text-[0.875rem] text-error-ink">
          {sheetError}
        </p>
      )}
      {!sheetBusy && (sheet || sheetError) && (
        <button type="button" onClick={() => void draftSheet()} className="no-print self-start text-[0.9375rem] text-ink-2 underline underline-offset-4 hover:text-ink">
          {fresh ? 'Volver a redactar las del agente' : 'Actualizar con los cambios'}
        </button>
      )}
      {sheetBusy && sheet && <span className="text-[0.875rem] text-ink-2">Actualizando…</span>}
      <p className="m-0 max-w-[62ch] text-[0.875rem] text-ink-2">Cada regla de uso habla de un elemento; lo que vale para la pieza entera va en Estructura. Las reglas van en lo que exportás. Las tuyas van primero y el agente no las reescribe. Tocá una regla para editarla; si la dejás vacía, se borra.</p>
    </div>
  );

  /* ---------- Estructura: cómo se arma una pieza por dentro (se lee mirando las referencias) ---------- */
  const sSig = structureSig(project);
  const sSheet = project.structureSheet;
  const sFresh = sSheet?.sig === sSig;
  const sMine = sSheet?.userRules ?? [];
  const sTheirs = sSheet?.rules ?? [];
  const [sBusy, setSBusy] = useState(false);
  const [sError, setSError] = useState<string | null>(null);
  const sTried = useRef<string | null>(null);
  const latestSSig = useRef(sSig);
  latestSSig.current = sSig;
  const saveStructure = (patch: Partial<StructureSheet>) => props.onSaveStructure({ sig: sSheet?.sig ?? '', rules: sTheirs, userRules: sSheet?.userRules, ...patch });
  const draftStructure = async () => {
    const refs = structureRefs(project);
    if (refs.length < 2) return;
    const reqSig = sSig;
    sTried.current = reqSig;
    setSBusy(true);
    setSError(null);
    try {
      const references = await Promise.all(
        refs.map(async r => ({ id: r.id, image: await compressImageString(r.image, { maxWidth: 768, maxHeight: 768, quality: 0.75 }).catch(() => r.image) })),
      );
      const res = await fetch('/api/system-structure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: project.name,
          // La actitud del brief («maximalista, caótico»): las imágenes solas no dicen cuánto pesa.
          intent: project.intent,
          objective: project.objective,
          boundary: project.boundary ?? 'closed',
          references,
          pieces: livePieces(project).filter(x => x.layer).map(x => ({ layer: x.layer, name: x.name })),
          userRules: sMine,
          // Las reglas de uso ya escritas: la estructura no las repite ni las contradice.
          usageRules: [...mine, ...theirs],
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.success) throw new Error(result.details || result.error || `HTTP ${res.status}`);
      if (latestSSig.current !== reqSig) return;
      props.onSaveStructure({ sig: reqSig, rules: result.data.rules ?? [] }, true);
    } catch (err: any) {
      if (latestSSig.current === reqSig) setSError('No se pudo leer la estructura.');
      console.warn(err);
    } finally {
      setSBusy(false);
    }
  };
  // Al cambiar piezas, referencias, límite o reglas del usuario en cualquiera de los dos lados, se actualizan ambas listas del agente.
  const looking = sub === 5 || sub === 6 || last;
  const waitStructureFirst = sub === 5 && !sFresh && sTried.current !== sSig && !!sSig && structureRefs(project).length >= 2;
  useEffect(() => {
    if (!fresh && !sheetBusy && !sBusy && !waitStructureFirst && tried.current !== sig && sig) void draftSheet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, fresh, sheetBusy, sBusy, waitStructureFirst]);

  const waitSheetFirst = sub !== 5 && !fresh && tried.current !== sig && !!sig && livePieces(project).some(x => x.layer);
  useEffect(() => {
    if (looking && !sFresh && !sBusy && !sheetBusy && !waitSheetFirst && sTried.current !== sSig && sSig) void draftStructure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [looking, sSig, sFresh, sBusy, sheetBusy, waitSheetFirst]);
  const refNote = (ids: string[]) => {
    const total = corpusRefs(project).length;
    return ids.length ? `Se ve en ${ids.length} de ${total} referencias` : undefined;
  };

  const structure = (
    <div className="flex flex-col gap-4">
      <p className="m-0 max-w-[62ch] text-[1.0625rem] leading-[1.6] text-ink-2">
        Las capas dicen qué elementos tiene la marca. La estructura dice cómo se ordenan dentro de una pieza: cuánto se llena, qué tan grande es lo grande, qué va al centro y qué a los bordes. Sirve para cualquier formato.
      </p>
      {sMine.length + sTheirs.length ? (
        <ol className="m-0 flex list-none flex-col p-0" style={{ opacity: sFresh || !sTheirs.length ? 1 : 0.6 }}>
          {sMine.map((r, i) => (
            <RuleRow
              key={`m${i}${r}`}
              n={i + 1}
              text={r}
              mine
              note={
                boundaryNote(r, b => {
                  props.onSaveBoundary(b);
                  saveStructure({ userRules: sMine.filter((_, j) => j !== i) });
                }) ?? (looksUsage(project, r) ? 'Parece una regla de uso: habla de un elemento, no de la pieza entera.' : undefined)
              }
              onSave={t => saveStructure({ userRules: t ? sMine.map((x, j) => (j === i ? t : x)) : sMine.filter((_, j) => j !== i) })}
            />
          ))}
          {sTheirs.map((r, i) => (
            <RuleRow
              key={`a${i}${r.text}`}
              n={sMine.length + i + 1}
              text={r.text}
              note={refNote(r.refIds)}
              extra={
                <CropStrip
                  className="no-print mt-1"
                  size={72}
                  caption={r.text}
                  items={r.refIds.flatMap(id => {
                    const ref = project.references.find(x => x.id === id);
                    return ref ? [{ ref, crop: r.crops?.[id] }] : [];
                  })}
                />
              }
              // Al editar una del agente pasa a ser tuya: el agente ya no la reescribe.
              onSave={t => saveStructure({ rules: sTheirs.filter((_, j) => j !== i), userRules: t && t !== r.text ? [...sMine, t] : sMine })}
            />
          ))}
        </ol>
      ) : (
        <p className="m-0 text-[1rem] text-ink-2">
          {sBusy ? `Mirando cómo se arman tus referencias · ${structureRefs(project).length} imágenes…` : structureRefs(project).length < 2 ? 'Hacen falta al menos dos referencias.' : 'Sin estructura todavía.'}
        </p>
      )}
      {pendingBox('structure', t => saveStructure({ userRules: [...sMine, t] }))}
      {addingStructure ? (
        <NewRule
          label="Regla de estructura nueva"
          placeholder="Ej.: El titular ocupa todo el ancho; el resto es diez veces más chico."
          onAdd={t => {
            setAddingStructure(false);
            if (!t) return;
            const suggested = detectBoundaryRule(t);
            if (suggested) setPendingBoundary({ side: 'structure', text: t, suggested });
            else saveStructure({ userRules: [...sMine, t] });
          }}
        />
      ) : (
        <button type="button" data-guide="structure-add" onClick={() => setAddingStructure(true)} className="no-print self-start text-[0.9375rem] font-bold text-ink underline underline-offset-4 hover:no-underline">
          + Escribir una regla de estructura
        </button>
      )}
      {sError && (
        <p role="alert" className="m-0 text-[0.875rem] text-error-ink">
          {sError}
        </p>
      )}
      {!sBusy && (sSheet || sError) && (
        <button type="button" onClick={() => void draftStructure()} className="no-print self-start text-[0.9375rem] text-ink-2 underline underline-offset-4 hover:text-ink">
          {sFresh ? 'Volver a leer la estructura' : 'Actualizar con las referencias nuevas'}
        </button>
      )}
      {sBusy && sSheet && <span className="text-[0.875rem] text-ink-2">Leyendo…</span>}
      {!all && (
        <p className="m-0 max-w-[62ch] text-[0.875rem] text-ink-2">
          Límite actual: <b>{boundaryInfo(currentBoundary).label}</b> ({boundaryInfo(currentBoundary).short}){' '}
          <button type="button" onClick={() => props.onSub(6)} className="no-print font-semibold text-ink underline underline-offset-4 hover:no-underline">
            Cambiar en Reglas
          </button>
        </p>
      )}
      <p className="m-0 max-w-[62ch] text-[0.875rem] text-ink-2">La estructura va en lo que exportás y en Probar. Las tuyas van primero y el agente no las reescribe.</p>
    </div>
  );

  const sectionOf = (i: number) => (i === 0 ? palette : i === 1 ? typography : i <= 4 ? layerSection((i - 1) as Layer) : i === 5 ? structure : rules);
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
            {[0, 1, 2, 3, 4, 5, 6].map(i => (
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
