import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ApplicationSession, CoreCheck, GeneratedPiece, GenerationRound, Layer, Pattern, PieceType, Project } from '../types';
import { useShortcuts } from '../hooks/useAuditShortcuts';
import { ShortcutBar } from '../components/shell/ShortcutBar';
import { LightboxModal } from '../components/LightboxModal';
import { loadPieceImage, savePieceImage, toDataUrl } from '../utils/pieceStore';
import { compressImageString } from '../utils/imageCompressor';
import { cropImage } from '../utils/parts';
import { stackSystem } from '../utils/stackExport';
import { fullRule } from '../utils/layerRules';
import { sheetLabel } from '../pieces/model';
import {
  MAX_CORE_IMAGES,
  MAX_DECISIONS,
  PIECE_TYPES,
  PromptInput,
  Selection,
  buildProbarPrompt,
  buildRecipe,
  pieceTypeInfo,
  selectDecisions,
} from '../utils/probar';
import { BigButton, KeyButton, PieceImage } from './common';

interface ProbarScreenProps {
  project: Project;
  enabled: boolean;
  session?: ApplicationSession;
  onSaveSession: (session: ApplicationSession) => void;
  onBack: () => void;
}

type Piece = GeneratedPiece & { imageUrl: string };

/** Piezas que se muestran siempre en la tira de la marca (las demás aparecen cuando se aprueban). */
const STRIP: PieceType[] = ['logo', 'facade', 'packaging', 'poster', 'post'];

/** Nombres en español de las direcciones que explora cada variante (el servidor las manda como "Direction A — …"). */
const DIRECTIONS: Partial<Record<PieceType, string[]>> & { default: string[] } = {
  logo: ['Logotipo tipográfico', 'Símbolo + logotipo', 'Emblema', 'Marca mínima'],
  poster: ['Tipografía protagonista', 'Imagen protagonista', 'Gráfico y sistemático', 'La más arriesgada'],
  packaging: ['Fiel a los materiales', 'Gráfica envolvente', 'Mínimo y premium', 'Familia de piezas'],
  facade: ['Cartelería protagonista', 'Material y color', 'Recursos gráficos en la arquitectura', 'La más arriesgada'],
  web: ['Tipografía', 'Imagen', 'Retícula y recursos', 'La más arriesgada'],
  other: ['Fiel', 'Más audaz', 'Más mínima', 'La más arriesgada'],
  default: ['Tipografía', 'Imagen', 'Patrón gráfico', 'La más arriesgada'],
};
function directionLabel(p: { direction: string; pieceType: PieceType }) {
  const m = /^Direction ([A-D])/.exec(p.direction);
  if (!m) return p.direction;
  return (DIRECTIONS[p.pieceType] ?? DIRECTIONS.default)['ABCD'.indexOf(m[1])];
}

function OriginTag({ piece }: { piece: Pattern }) {
  if (piece.origin === 'user') return <span className="type-label shrink-0 bg-bone px-1 text-[10px] text-void">USUARIO</span>;
  return <span className="type-label shrink-0 border border-ink-3 px-1 text-[10px] text-ink-2">AGENTE</span>;
}

/** Rótulo de columna: número, nombre y una línea que explica. */
const ColHead = ({ n, title, hint }: { n: string; title: string; hint?: string }) => (
  <div className="flex flex-col gap-1">
    <span className="flex items-baseline gap-2">
      <span className="font-mono text-[12px] text-ink-3">{n}</span>
      <span className="type-name text-[26px] leading-none">{title}</span>
    </span>
    {hint && <span className="text-[12px] leading-snug text-ink-2">{hint}</span>}
  </div>
);

/**
 * 03 · PROBAR. Verifica el sistema aplicándolo a una pieza concreta, no generar por generar.
 * Tres columnas: la pieza, la receta (qué parte del sistema se usa, por capa y por peso) y los resultados.
 */
export function ProbarScreen({ project, enabled, session, onSaveSession, onBack }: ProbarScreenProps) {
  const system = useMemo(() => stackSystem(project), [project]);
  const [pieceType, setPieceType] = useState<PieceType>('logo');
  const [direct, setDirect] = useState(false);
  const [brandText, setBrandText] = useState(() => session?.brandText ?? project.name.split(/\s[—–-]\s/)[0].trim());
  const [requests, setRequests] = useState<Partial<Record<PieceType, string>>>(() => session?.requests ?? {});
  const [transparent, setTransparent] = useState(false);
  const [useLogo, setUseLogo] = useState(true);
  /** Lo que el usuario marcó o desmarcó a mano en la receta, por tipo de pieza. */
  const [overrides, setOverrides] = useState<Partial<Record<PieceType, Record<string, boolean>>>>({});
  const [rounds, setRounds] = useState<GenerationRound[]>(() => session?.rounds ?? []);
  const [images, setImages] = useState<Record<string, string>>({});
  const [approved, setApproved] = useState<Partial<Record<PieceType, string>>>(() => session?.approved ?? {});
  const [checks, setChecks] = useState<Record<string, CoreCheck[] | 'loading' | 'error'>>(() => session?.coreChecks ?? {});
  const [busy, setBusy] = useState<null | number>(null);
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);
  const [zoomId, setZoomId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const requestRef = useRef<HTMLTextAreaElement>(null);

  useShortcuts(enabled, { escape: () => onBack(), ' ': () => onBack() });

  // Imágenes guardadas: se cargan de IndexedDB al abrir.
  useEffect(() => {
    let alive = true;
    const ids = rounds.flatMap(r => r.pieces.map(p => p.id)).filter(id => !images[id]);
    if (!ids.length) return;
    Promise.all(ids.map(async id => [id, await loadPieceImage(project.id, id)] as const)).then(found => {
      if (!alive) return;
      const loaded = Object.fromEntries(found.filter(([, url]) => url)) as Record<string, string>;
      if (Object.keys(loaded).length) setImages(im => ({ ...loaded, ...im }));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Todo lo generado se guarda en el proyecto (las imágenes, aparte).
  const firstSave = useRef(true);
  useEffect(() => {
    if (firstSave.current) {
      firstSave.current = false;
      return;
    }
    const done = Object.fromEntries(Object.entries(checks).filter(([, v]) => Array.isArray(v))) as Record<string, CoreCheck[]>;
    onSaveSession({ rounds, approved, audits: session?.audits ?? {}, coreChecks: done, requests, brandText });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rounds, approved, checks, requests, brandText]);

  const withImg = (p: GeneratedPiece): Piece => ({ ...p, imageUrl: images[p.id] ?? '' });
  const allPieces = rounds.flatMap(r => r.pieces).map(withImg);
  const byId = (id?: string) => allPieces.find(p => p.id === id) ?? null;
  const approvedLogo = byId(approved.logo);
  const anchor = pieceType !== 'logo' && useLogo ? approvedLogo : null;
  const info = pieceTypeInfo(pieceType);
  const details = requests[pieceType] ?? '';

  /* ---------- Receta ---------- */
  const recipe = useMemo(() => buildRecipe(project, pieceType), [project, pieceType]);
  const isOn = (id: string) => overrides[pieceType]?.[id] ?? recipe.suggested.has(id);
  const [limitNote, setLimitNote] = useState(false);
  const toggle = (x: Pattern, layer: 2 | 3) => {
    // Con el límite de decisiones lleno no se suma nada más: avisa en vez de no hacer nada.
    if (!isOn(x.id) && decisions >= MAX_DECISIONS) {
      setLimitNote(true);
      return;
    }
    setLimitNote(false);
    setOverrides(o => {
      const cur = { ...(o[pieceType] ?? {}) };
      const next = !isOn(x.id);
      cur[x.id] = next;
      // Acento: como máximo una pieza.
      if (layer === 3 && next) recipe.accent.filter(a => a.id !== x.id).forEach(a => (cur[a.id] = false));
      return { ...o, [pieceType]: cur };
    });
  };
  const sel: Selection = useMemo(() => selectDecisions(recipe, isOn), [recipe, overrides, pieceType]); // eslint-disable-line react-hooks/exhaustive-deps
  const decisions = sel.core.length + sel.support.length + (sel.accent ? 1 : 0);
  const omittedIds = new Set(sel.omitted.map(x => x.id));

  const promptInput = (): PromptInput => ({ type: pieceType, sel, direct, text: brandText, request: details, transparent: pieceType === 'logo' && transparent });
  const prompt = useMemo(
    () => buildProbarPrompt(project, promptInput()),
    [project, sel, direct, brandText, details, pieceType, transparent], // eslint-disable-line react-hooks/exhaustive-deps
  );

  /* ---------- Pedido al servidor ---------- */
  const post = async (url: string, body: any) => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const text = await res.text();
    let result: any;
    try {
      result = JSON.parse(text);
    } catch {
      throw Object.assign(new Error(`El servidor no devolvió una respuesta válida (HTTP ${res.status}). ¿Está corriendo "npm run server"?`), { detail: text.slice(0, 400) });
    }
    if (!res.ok || !result.success) throw Object.assign(new Error(result.error || 'No se pudo generar la pieza'), { detail: [result.details, result.promptUsed].filter(Boolean).join('\n\n') });
    return result.data;
  };

  /** Imágenes de las piezas del Núcleo (como máximo 3, priorizando las del usuario): recorte de la portada o primera referencia. */
  const coreImages = async (): Promise<{ id: string; image: string }[]> => {
    const ordered = [...sel.core].sort((a, b) => Number(b.origin === 'user') - Number(a.origin === 'user'));
    const out: { id: string; image: string }[] = [];
    for (const x of ordered) {
      if (out.length >= MAX_CORE_IMAGES) break;
      const refId = x.cover?.refId ?? x.evidence[0];
      const ref = project.references.find(r => r.id === refId);
      if (!ref) continue;
      try {
        const image = x.cover?.crop && x.cover.refId === ref.id ? (await cropImage(ref.image, [x.cover.crop], 900))[0]?.image : await compressImageString(ref.image, { maxWidth: 1024, maxHeight: 1024, quality: 0.88 });
        if (image) out.push({ id: x.id, image });
      } catch {
        /* una imagen que no se puede leer no frena el pedido */
      }
    }
    return out;
  };

  const toPieces = (data: any, roundId: string): Piece[] => {
    const now = new Date().toISOString();
    const pieces: Piece[] = (data.variants || []).map((v: any, i: number) => ({
      id: `${roundId}_${i}`,
      roundId,
      imageUrl: v.imageUrl,
      createdAt: now,
      responseId: v.responseId,
      direction: v.direction || '',
      rationale: v.rationale || '',
      revisedPrompt: v.revisedPrompt || '',
      model: [v.textModel, v.imageModel].filter(Boolean).join(' + '),
      pieceType: data.pieceType,
      mode: data.renderMode === 'direct' ? 'direct' : 'system',
    }));
    setImages(im => ({ ...im, ...Object.fromEntries(pieces.map(p => [p.id, p.imageUrl])) }));
    pieces.forEach(p => savePieceImage(project.id, p.id, p.imageUrl));
    return pieces;
  };
  const strip = ({ imageUrl, ...p }: Piece): GeneratedPiece => p;

  /** ¿La pieza generada respeta cada pieza del Núcleo? Lo mira el agente con visión. */
  const checkCore = async (piece: Piece, core: Pattern[]) => {
    if (!core.length || piece.mode === 'direct') return;
    setChecks(c => ({ ...c, [piece.id]: 'loading' }));
    try {
      const image = await compressImageString(piece.imageUrl, { maxWidth: 1280, maxHeight: 1280, quality: 0.9, mimeType: 'image/jpeg' });
      const data = await post('/api/check-core', { imageUrl: image, pieceLabel: pieceTypeInfo(piece.pieceType).label, core: core.map(x => ({ id: x.id, name: x.name, rule: fullRule(x) })) });
      setChecks(c => ({ ...c, [piece.id]: data.checks as CoreCheck[] }));
    } catch {
      setChecks(c => ({ ...c, [piece.id]: 'error' }));
    }
  };

  const generate = async (count: number) => {
    setBusy(count);
    setError(null);
    try {
      const refs = direct ? [] : await coreImages();
      const anchorImageUrl = anchor?.imageUrl ? await toDataUrl(anchor.imageUrl) : undefined;
      const data = await post('/api/generate-application', {
        system,
        project: { name: project.name, objective: project.objective, description: project.description },
        pieceType,
        brandText: brandText.trim(),
        details: details.trim(),
        transparent: pieceType === 'logo' && transparent,
        mode: direct ? 'direct' : 'system',
        finalPrompt: prompt,
        references: refs,
        variants: count,
        anchorImageUrl,
        anchorPieceType: anchor?.pieceType,
      });
      const roundId = `r${Date.now()}`;
      const pieces = toPieces(data, roundId);
      const core = sel.core;
      setRounds(rs => [
        ...rs,
        {
          id: roundId,
          label: `${info.label}${direct ? ' · directo' : ''}`,
          brief: prompt,
          request: details.trim() || undefined,
          referencesUsed: data.referencesUsed ?? [],
          pieces: pieces.map(strip),
          failed: data.failed ?? 0,
          failureMessage: data.failureMessage,
          createdAt: new Date().toISOString(),
        },
      ]);
      setSelectedId(pieces[0]?.id ?? null);
      pieces.forEach(p => void checkCore(p, core));
    } catch (err: any) {
      setError({ message: err?.message || String(err), detail: err?.detail });
    } finally {
      setBusy(null);
    }
  };

  const toggleApprove = (p: Piece) => setApproved(a => ({ ...a, [p.pieceType]: a[p.pieceType] === p.id ? undefined : p.id }));

  const shown = allPieces.filter(p => p.pieceType === pieceType).slice(-4).reverse();
  const stripTypes = [...STRIP, ...PIECE_TYPES.map(p => p.id).filter(t => !STRIP.includes(t) && approved[t])];
  const zoomPiece = allPieces.find(p => p.id === zoomId) || null;
  const lastRound = rounds[rounds.length - 1] ?? null;

  const layerBlock = (layer: Layer, title: string, note: string, items: Pattern[], body: (x: Pattern) => React.ReactNode, emptyText: string) => (
    <section className={`layer-${layer} flex flex-col gap-2`} aria-label={sheetLabel(layer)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="type-label text-[12px] tracking-[0.08em]" style={{ color: 'var(--layer-color)' }}>
          {title}
        </span>
        <span className="type-label text-[10px] text-ink-2">{note}</span>
      </div>
      <div className="layer-rule" />
      {items.length === 0 && <span className="text-[13px] text-ink-3">{emptyText}</span>}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">{items.map(x => body(x))}</ul>
    </section>
  );

  const item = (x: Pattern, layer: Layer, control: React.ReactNode, state: 'on' | 'off' | 'out') => (
    <li key={x.id} className="flex items-center gap-3 p-1" style={{ opacity: state === 'off' ? 0.55 : 1, outline: state === 'on' ? '1px solid color-mix(in oklab, var(--layer-color) 55%, transparent)' : undefined }}>
      <PieceImage piece={x} project={project} className="size-[52px] shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="type-name text-[20px] leading-[0.95]">{x.name}</span>
        <span className="flex items-center gap-2">
          <OriginTag piece={x} />
          {state === 'out' && <span className="font-mono text-[10px] text-ink-2">FUERA DEL PEDIDO · LÍMITE {MAX_DECISIONS}</span>}
        </span>
      </div>
      {control}
    </li>
  );

  const check = (on: boolean, disabled: boolean, label: string, onClick?: () => void) => (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-[26px] shrink-0 items-center justify-center border-2 text-[16px] leading-none disabled:cursor-default"
      style={{ borderColor: 'var(--layer-color)', background: on ? 'var(--layer-color)' : 'transparent', color: 'var(--layer-ink)' }}
    >
      {on ? '✓' : ''}
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      {/* Tira de la marca: lo aprobado. El logo aprobado se reutiliza en las demás piezas. */}
      <nav aria-label="Piezas de la marca" className="flex shrink-0 items-center gap-3 overflow-x-auto px-6 pb-2 pt-3">
        <KeyButton k="ESC" label="← Sistema" tone="ghost" onClick={onBack} />
        <span className="type-label shrink-0 text-[11px] text-ink-2">TU MARCA APLICADA</span>
        <ul className="m-0 flex list-none gap-2 p-0">
          {stripTypes.map(t => {
            const p = byId(approved[t]);
            const current = t === pieceType;
            return (
              <li key={t} className="shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setPieceType(t);
                    if (p) setSelectedId(p.id);
                    setTimeout(() => requestRef.current?.focus({ preventScroll: true }), 50);
                  }}
                  aria-current={current ? 'true' : undefined}
                  className={`flex w-[104px] items-center gap-2 border p-1 text-left ${current ? 'border-bone' : 'border-line hover:border-line-strong'}`}
                >
                  {p ? <img src={p.imageUrl || undefined} alt="" className="size-[32px] bg-raised object-cover" /> : <span className="flex size-[32px] items-center justify-center border border-dashed border-line-strong text-ink-3">+</span>}
                  <span className="flex min-w-0 flex-col text-[11px] leading-tight">
                    <span className={current ? 'text-ink' : 'text-ink-2'}>{pieceTypeInfo(t).label}</span>
                    <span className={p ? 'text-confirmed-ink' : 'text-ink-3'}>{p ? '✓ aprobada' : '—'}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="grid min-h-0 flex-1 gap-0 border-t border-line lg:grid-cols-[300px_minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* 1 · La pieza */}
        <section aria-label="La pieza" className="flex min-h-0 flex-col gap-5 overflow-y-auto border-r border-line p-5">
          <ColHead n="01" title="LA PIEZA" hint="Qué querés probar." />
          <div role="radiogroup" aria-label="Tipo de pieza" className="grid grid-cols-4 gap-1">
            {PIECE_TYPES.map(p => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={pieceType === p.id}
                onClick={() => setPieceType(p.id)}
                className={`type-label px-1 py-2 text-[11px] ${pieceType === p.id ? 'bg-bone text-void' : 'border border-line-strong text-ink-2 hover:border-bone hover:text-ink'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <span className="font-mono text-[12px] text-ink-2">
            formato sugerido {info.format} · {info.photo ? 'fotografía realista' : 'arte gráfico'}
          </span>
          <label className="flex flex-col gap-1">
            <span className="type-label text-[11px] text-ink-2">TEXTO QUE APARECE EN LA PIEZA · OPCIONAL</span>
            <input value={brandText} onChange={e => setBrandText(e.target.value)} className="border-b-2 border-line-strong bg-transparent py-1 text-[15px] text-ink outline-none focus:border-bone" />
            <span className="text-[11px] text-ink-3">Se escribe tal cual: revisá mayúsculas y tildes.</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="type-label text-[11px] text-ink-2">PEDIDO LIBRE · OPCIONAL</span>
            <textarea
              ref={requestRef}
              rows={5}
              placeholder={info.placeholder}
              value={details}
              onChange={e => setRequests(r => ({ ...r, [pieceType]: e.target.value }))}
              className="resize-y border-2 border-line-strong bg-transparent p-2 text-[14px] leading-[1.4] text-ink outline-none placeholder:text-ink-3 focus:border-bone"
            />
          </label>
          {pieceType === 'logo' ? (
            <label className="flex cursor-pointer items-center gap-3 text-[13px]">
              <input type="checkbox" className="size-4 accent-[#F2EFE8]" checked={transparent} onChange={e => setTransparent(e.target.checked)} />
              Fondo transparente (PNG)
            </label>
          ) : approvedLogo ? (
            <label className="flex cursor-pointer items-center gap-3 border border-line p-2 text-[13px]">
              <input type="checkbox" className="size-4 shrink-0 accent-[#F2EFE8]" checked={useLogo} onChange={e => setUseLogo(e.target.checked)} />
              <img src={approvedLogo.imageUrl || undefined} alt="" className="size-10 shrink-0 bg-raised object-contain" />
              <span className="flex flex-col">
                Usar el logo aprobado
                <span className="text-[11px] text-ink-2">Se reproduce tal cual, sin rediseñarlo.</span>
              </span>
            </label>
          ) : (
            <p className="m-0 text-[12px] text-ink-2">
              Sin logo aprobado: el modelo dibuja la marca desde cero.{' '}
              <button type="button" className="text-ink underline underline-offset-2" onClick={() => setPieceType('logo')}>
                Empezar por el logo
              </button>
            </p>
          )}
        </section>

        {/* 2 · La receta */}
        <section aria-label="La receta" className="flex min-h-0 flex-col gap-5 overflow-y-auto border-r border-line p-5">
          <ColHead n="02" title="LA RECETA" hint={limitNote ? `Ya hay ${MAX_DECISIONS} decisiones, el máximo: desmarcá una para sumar otra.` : direct ? 'El modo directo no usa el sistema: solo el pedido, el texto y la paleta.' : `Qué parte del sistema se usa, por capa y por peso. ${decisions} de ${MAX_DECISIONS} decisiones.`} />
          <div className="flex flex-col gap-6" style={{ opacity: direct ? 0.4 : 1, pointerEvents: direct ? 'none' : undefined }}>
            {layerBlock(
              1,
              sheetLabel(1),
              'obligatorio',
              recipe.core,
              x => item(x, 1, check(!omittedIds.has(x.id), true, `${x.name}: obligatorio`), omittedIds.has(x.id) ? 'out' : 'on'),
              'El Núcleo está vacío: ubicá piezas en la Capa 1.',
            )}
            {layerBlock(
              2,
              sheetLabel(2),
              recipe.suggested.size ? 'el agente preseleccionó lo que aplica' : 'marcá lo que sume',
              recipe.support,
              x => item(x, 2, check(isOn(x.id) && !omittedIds.has(x.id), false, `${x.name}: usar en el pedido`, () => toggle(x, 2)), omittedIds.has(x.id) ? 'out' : isOn(x.id) ? 'on' : 'off'),
              'No hay piezas de Soporte.',
            )}
            {layerBlock(
              3,
              sheetLabel(3),
              'detalle · una sola',
              recipe.accent,
              x => item(x, 3, check(isOn(x.id) && !omittedIds.has(x.id), false, `${x.name}: usar como detalle`, () => toggle(x, 3)), omittedIds.has(x.id) ? 'out' : isOn(x.id) ? 'on' : 'off'),
              'No hay piezas de Acento.',
            )}
          </div>
          <details open={promptOpen} onToggle={e => setPromptOpen((e.currentTarget as HTMLDetailsElement).open)} className="border border-line">
            <summary className="type-label flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[11px] text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
              <span>VER PEDIDO COMPLETO</span>
              <span className="font-mono">{promptOpen ? '−' : '+'}</span>
            </summary>
            <pre className="m-0 max-h-72 overflow-auto whitespace-pre-wrap border-t border-line p-3 font-mono text-[11px] leading-[1.5] text-ink-2">{prompt}</pre>
          </details>
          <div className="sticky bottom-0 mt-auto bg-void pb-1 pt-3">
            <BigButton
              label="GENERAR 2 VARIANTES"
              onClick={() => generate(2)}
              disabled={busy !== null || (!direct && !sel.core.length)}
              hint={!direct && !sel.core.length ? 'Sin Núcleo no hay sistema que probar' : undefined}
            />
          </div>
        </section>

        {/* 3 · Los resultados */}
        <section aria-label="Los resultados" aria-busy={busy !== null} className="flex min-h-0 flex-col gap-4 overflow-y-auto p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <ColHead n="03" title="LOS RESULTADOS" hint="Cada variante se revisa contra el Núcleo." />
            <div role="radiogroup" aria-label="Cómo pedirla" className="flex shrink-0 overflow-hidden border border-line-strong">
              {(
                [
                  [false, 'Con el sistema'],
                  [true, 'Directo'],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={direct === v}
                  onClick={() => setDirect(v)}
                  className={`type-label px-2 py-1 text-[10px] ${direct === v ? 'bg-bone text-void' : 'text-ink-2 hover:text-ink'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {busy !== null && (
            <div className="flex items-center gap-3 border border-line p-4" role="status">
              <span className="spinner text-core" />
              <span className="text-[14px]">Generando {busy} {busy === 1 ? 'variante' : 'variantes'}… suele tardar entre 30 y 90 segundos.</span>
            </div>
          )}
          {error && busy === null && (
            <div role="alert" className="flex flex-col gap-2 border border-error p-4">
              <span className="text-[14px]">{error.message}</span>
              {error.detail && (
                <details className="text-[11px] text-ink-2">
                  <summary className="cursor-pointer">Detalle técnico</summary>
                  <pre className="m-0 mt-1 max-h-32 overflow-auto whitespace-pre-wrap font-mono">{error.detail}</pre>
                </details>
              )}
              <div className="flex gap-2">
                <KeyButton label="Reintentar" onClick={() => generate(2)} />
                <KeyButton label="Cerrar" tone="ghost" onClick={() => setError(null)} />
              </div>
            </div>
          )}
          {busy === null && !error && shown.length === 0 && (
            <div className="flex min-h-[260px] flex-col items-center justify-center gap-2 border-2 border-dashed border-line-strong p-6 text-center">
              <span className="type-name text-[26px]">{pieceType === 'logo' ? 'EMPEZÁ POR EL LOGO' : `TODAVÍA NO HAY ${info.label.toUpperCase()}`}</span>
              <span className="max-w-[360px] text-[13px] text-ink-2">Armá la receta y generá 2 variantes. Aprobá la que mejor respete el Núcleo: el logo aprobado se usa en las demás piezas.</span>
            </div>
          )}
          {lastRound && lastRound.failed > 0 && busy === null && (
            <p role="status" className="m-0 text-[12px] text-pending-ink">
              {lastRound.failed} {lastRound.failed === 1 ? 'variante no se pudo generar' : 'variantes no se pudieron generar'}: {lastRound.failureMessage}
            </p>
          )}

          <ul className="m-0 grid list-none gap-4 p-0 xl:grid-cols-2">
            {shown.map((p, i) => {
              const c = checks[p.id];
              const isApproved = approved[p.pieceType] === p.id;
              const coreOf = (id: string) => project.patterns.find(x => x.id === id);
              return (
                <li key={p.id} className="flex flex-col gap-2 border bg-void p-2" style={{ borderColor: p.id === selectedId ? 'var(--color-bone)' : 'var(--color-line)' }}>
                  <button type="button" onClick={() => { setSelectedId(p.id); setZoomId(p.id); }} aria-label={`Ampliar variante ${i + 1}`} className="block p-0">
                    <img src={p.imageUrl || undefined} alt={`${info.label}, ${directionLabel(p) || `variante ${i + 1}`}`} className={`max-h-[46vh] w-full object-contain ${p.pieceType === 'logo' && transparent ? 'bg-[repeating-conic-gradient(#222_0_25%,#2c2c2c_0_50%)] bg-[length:16px_16px]' : 'bg-raised'}`} />
                  </button>
                  <span className="flex flex-wrap items-center gap-x-2 px-1 text-[12px] text-ink-2">
                    <span className="text-ink">{directionLabel(p) || `Variante ${i + 1}`}</span>
                    <span className="font-mono">· {p.mode === 'direct' ? 'directo' : 'con el sistema'}</span>
                    {isApproved && <span className="ml-auto text-confirmed-ink">✓ aprobada</span>}
                  </span>

                  {/* El Núcleo, pieza por pieza */}
                  {p.mode === 'direct' ? (
                    <span className="px-1 text-[12px] text-ink-3">Modo directo: sin control del Núcleo.</span>
                  ) : c === 'loading' ? (
                    <span className="flex items-center gap-2 px-1 text-[12px] text-ink-2">
                      <span className="spinner text-core" /> El agente está mirando si respeta el Núcleo…
                    </span>
                  ) : c === 'error' ? (
                    <span className="flex items-center gap-2 px-1 text-[12px] text-ink-2">
                      No se pudo evaluar el Núcleo.
                      <KeyButton label="Reintentar" tone="ghost" onClick={() => checkCore(p, recipe.core)} />
                    </span>
                  ) : Array.isArray(c) ? (
                    <ul className="m-0 flex list-none flex-col gap-1 p-0 px-1" aria-label="Núcleo respetado">
                      {c.map(k => (
                        <li key={k.id} className="flex items-start gap-2 text-[12px]" title={k.note}>
                          <span className={`type-label shrink-0 ${k.respected ? 'text-confirmed-ink' : 'text-error-ink'}`} aria-label={k.respected ? 'respetada' : 'no respetada'}>
                            {k.respected ? '✓' : '✕'}
                          </span>
                          <span className="min-w-0">
                            <span className="text-ink">{coreOf(k.id)?.name ?? k.id}</span>
                            {k.note && <span className="text-ink-2"> · {k.note}</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <KeyButton label={isApproved ? 'Aprobada' : 'Aprobar'} tone={isApproved ? 'line' : 'core'} onClick={() => toggleApprove(p)} />
                    <KeyButton label="Otra variante" onClick={() => generate(1)} disabled={busy !== null} />
                    <a
                      href={p.imageUrl || undefined}
                      download={`${system.name.replace(/\s+/g, '_')}_${p.pieceType}_${p.id}.png`}
                      className="type-label inline-flex items-center border-2 border-transparent px-2 py-[5px] text-[11px] text-ink-2 hover:border-line-strong hover:text-ink"
                    >
                      Descargar
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <ShortcutBar
        items={[{ keys: 'ESC · ESPACIO', label: 'Volver al sistema' }]}
      />
      <LightboxModal
        reference={zoomPiece ? { id: zoomPiece.id, name: `${pieceTypeInfo(zoomPiece.pieceType).label} · ${zoomPiece.mode === 'direct' ? 'directo' : 'con el sistema'}`, image: zoomPiece.imageUrl, createdAt: '' } : null}
        onClose={() => setZoomId(null)}
      />
    </div>
  );
}

