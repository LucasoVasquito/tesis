import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ApplicationSession, CoreCheck, GeneratedPiece, GenerationRound, Layer, Pattern, PieceType, Project } from '../types';
import { useShortcuts } from '../hooks/useAuditShortcuts';
import { LightboxModal } from '../components/LightboxModal';
import { loadPieceImage, savePieceImage, toDataUrl } from '../utils/pieceStore';
import { compressImageString } from '../utils/imageCompressor';
import { cropImage } from '../utils/parts';
import { ImageColor, paletteFromImage } from '../utils/imagePalette';
import { stackSystem, systemPalette as toSystemPalette } from '../utils/stackExport';
import { useColors } from './colorContext';
import { useClima } from './climaContext';
import { fullRule } from '../utils/layerRules';
import { SHEET_NAME, sheetLabel } from '../pieces/model';
import { MAX_CORE_IMAGES, MAX_DECISIONS, PIECE_TYPES, PromptInput, Selection, buildProbarPrompt, buildRecipe, pieceTypeInfo, selectDecisions } from '../utils/probar';
import { BarButton, BottomBar, Primary } from '../components/shell/BottomBar';
import { Desk, DeskQuestion, Shelf } from '../components/shell/Desk';
import { ExportMenu } from '../components/ExportMenu';
import { KeyButton, PieceImage } from './common';
import { Notify } from './types';
import { useViewport } from '../hooks/useViewport';
import { logEvent } from '../utils/testLog';

interface ProbarScreenProps {
  project: Project;
  enabled: boolean;
  session?: ApplicationSession;
  onSaveSession: (session: ApplicationSession) => void;
  onNotify: Notify;
  /** Lo que el sistema está haciendo ahora (línea de estado de la barra superior). */
  onActivity: (text: string | null) => void;
  /** Registra cómo deshacer lo último en el historial global (Ctrl+Z). */
  onUndoable: (undo: () => void) => void;
  /** Informa qué tipo de pieza se está probando (línea de estado). */
  onType: (label: string) => void;
  onBlocked: (reason: string) => void;
  /** Es la etapa abierta (la pantalla queda montada oculta para no cortar una generación). */
  active: boolean;
  /** Subpaso: 0 pieza · 1 texto y pedido · 2 comparar · 3 listo. */
  sub: number;
  onSub: (i: number) => void;
  /** Abre la pieza aprobada en Resultados para evaluarla y anotarla, igual que una importada. */
  onEvaluate?: (pieceId: string, label: string) => void;
  /** Se empieza otra pieza: los ✓ del riel vuelven a cero. */
  onNewPiece?: () => void;
}

type Piece = GeneratedPiece & { imageUrl: string };

/** Tipos de pieza que se ofrecen en el paso 1. */
const CHIPS: PieceType[] = ['logo', 'facade', 'packaging', 'poster', 'post'];
const GREEN = 'var(--cc-ok)';

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
  if (piece.origin === 'user') return <span className="type-label shrink-0 bg-bone px-1 text-[0.75rem] text-void">USUARIO</span>;
  return <span className="type-label shrink-0 text-[0.75rem] text-ink-2">Agente</span>;
}

const StepLabel = ({ children }: { children: React.ReactNode }) => <span className="type-label text-[0.75rem] text-ink-2">{children}</span>;

/**
 * 05 · PROBAR. Aplica el sistema a una pieza concreta. Dos columnas: a la izquierda la pieza (paso 1) y la receta
 * (paso 2, sale sola de las capas); a la derecha el resultado (paso 3): dos variantes que se revisan contra el Primario.
 */
export function ProbarScreen({ project, enabled, session, onSaveSession, onNotify, onActivity, onUndoable, onType, onBlocked, active, sub, onSub, onEvaluate, onNewPiece }: ProbarScreenProps) {
  const system = useMemo(() => stackSystem(project), [project]);
  const [pieceType, setPieceType] = useState<PieceType>('logo');
  const [direct, setDirect] = useState(false);
  const [brandText, setBrandText] = useState(() => session?.brandText ?? project.name.split(/\s[—–-]\s/)[0].trim());
  const [requests, setRequests] = useState<Partial<Record<PieceType, string>>>(() => session?.requests ?? {});
  const [transparent, setTransparent] = useState(false);
  const [useLogo, setUseLogo] = useState(true);
  const [editing, setEditing] = useState(false);
  /** Lo que el usuario marcó o desmarcó a mano en la receta, por tipo de pieza. */
  const [overrides, setOverrides] = useState<Partial<Record<PieceType, Record<string, boolean>>>>({});
  const [rounds, setRounds] = useState<GenerationRound[]>(() => session?.rounds ?? []);
  const [images, setImages] = useState<Record<string, string>>({});
  const [approved, setApproved] = useState<Partial<Record<PieceType, string>>>(() => session?.approved ?? {});
  const [checks, setChecks] = useState<Record<string, CoreCheck[] | 'loading' | 'error'>>(() => session?.coreChecks ?? {});
  /** Las dos variantes de la tanda que se está mirando (null = se toma de la última tanda del tipo). */
  const [slotIds, setSlotIds] = useState<(string | null)[] | null>(null);
  const [slotErrs, setSlotErrs] = useState<({ message: string; detail?: string } | null)[]>([null, null]);
  const [busySlots, setBusySlots] = useState<number[]>([]);
  const [genStage, setGenStage] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [zoomId, setZoomId] = useState<string | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const busy = busySlots.length > 0;
  const mobile = useViewport() === 'mobile';
  const [recipeOpen, setRecipeOpen] = useState(false);

  useEffect(() => onType(pieceTypeInfo(pieceType).label.toLowerCase()), [pieceType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Con una generación en curso, cerrar o recargar la pestaña la perdería (y se cobra igual): el navegador avisa.
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

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
  const byId = (id?: string | null) => allPieces.find(p => p.id === id) ?? null;
  const approvedLogo = byId(approved.logo);
  const anchor = pieceType !== 'logo' && useLogo ? approvedLogo : null;
  const info = pieceTypeInfo(pieceType);
  const details = requests[pieceType] ?? '';

  /* ---------- Receta ---------- */
  const recipe = useMemo(() => buildRecipe(project, pieceType), [project, pieceType]);
  const isOn = (id: string) => overrides[pieceType]?.[id] ?? recipe.suggested.has(id);
  const [limitNote, setLimitNote] = useState(false);
  /** Paleta de una imagen de referencia (si el usuario la eligió): reemplaza a la del sistema en el pedido. */
  const [refPalette, setRefPalette] = useState<null | { name: string; image: string; colors: ImageColor[] }>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [paletteBusy, setPaletteBusy] = useState(false);
  const [paletteError, setPaletteError] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const usePaletteOf = async (name: string, image: string) => {
    setPaletteBusy(true);
    setPaletteError(null);
    try {
      const colors = await paletteFromImage(image, 6);
      setRefPalette({ name, image, colors });
      setPickerOpen(false);
    } catch (err: any) {
      setPaletteError(err?.message || 'No se pudo leer la paleta de esa imagen.');
    } finally {
      setPaletteBusy(false);
    }
  };
  // La paleta del sistema es la misma de Capas y Sistema (los colores de la interfaz), no una inferida aparte.
  const colorCtx = useColors();
  const systemKey = `${colorCtx.palette.primary}|${colorCtx.palette.secondary}|${colorCtx.palette.accent}`;
  const systemPalette = useMemo(() => toSystemPalette([colorCtx.palette.primary, colorCtx.palette.secondary, colorCtx.palette.accent]), [systemKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (x: Pattern, layer: 1 | 2 | 3) => {
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

  const promptInput = (): PromptInput => ({ type: pieceType, sel, direct, text: brandText, request: details, transparent: pieceType === 'logo' && transparent, palette: refPalette?.colors ?? systemPalette });
  const prompt = useMemo(
    () => buildProbarPrompt(project, promptInput()),
    [project, sel, direct, brandText, details, pieceType, transparent, refPalette, systemPalette], // eslint-disable-line react-hooks/exhaustive-deps
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

  /** Imágenes de las piezas del Primario (como máximo 3, priorizando las del usuario): recorte de la portada o primera referencia. */
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

  /** ¿La pieza generada respeta cada pieza del Primario? Lo mira el agente con visión. */
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

  /** Las dos variantes que se muestran: las de la última tanda del tipo, salvo que se haya generado algo nuevo. */
  const lastOfType = [...rounds].reverse().find(r => r.pieces[0]?.pieceType === pieceType);
  const baseIds = lastOfType ? lastOfType.pieces.slice(0, 2).map(p => p.id) : [];
  const slots: (string | null)[] = [0, 1].map(i => (slotIds ? slotIds[i] : baseIds[i] ?? null));

  // Cada tipo de pieza muestra sus propias variantes.
  useEffect(() => {
    if (!busy) {
      setSlotIds(null);
      setSlotErrs([null, null]);
    }
  }, [pieceType]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Genera `targets.length` variantes y las pone en esos lugares. Si una falla, solo esa se reintenta. */
  const generateRef = useRef<(targets: number[]) => Promise<void>>(async () => {});
  const generate = async (targets: number[]) => {
    if (busy) return;
    const count = targets.length;
    setBusySlots(targets);
    setGenStage(0);
    setElapsed(0);
    setSlotErrs(e => e.map((x, i) => (targets.includes(i) ? null : x)));
    const timers = [setTimeout(() => setGenStage(1), 1500), setTimeout(() => setGenStage(2), 30000)];
    const label = targets.length === 1 ? `la variante ${targets[0] + 1}` : 'las variantes';
    const reportFail = (message: string, detail: string | undefined, failed: number[]) => {
      onNotify(failed.length === 1 ? `No pudimos generar la variante ${failed[0] + 1}.` : `No pudimos generar ${label}.`, {
        tone: 'error',
        detail: message,
        action: { label: 'Reintentar', run: () => void generateRef.current(failed) },
      });
      void detail;
    };
    try {
      const refs = direct ? [] : await coreImages();
      const anchorImageUrl = anchor?.imageUrl ? await toDataUrl(anchor.imageUrl) : undefined;
      const data = await post('/api/generate-application', {
        system,
        project: { name: project.name, objective: project.objective, description: project.intent || '' },
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
      const next: (string | null)[] = targets.length === 2 ? [null, null] : [...slots];
      const failed: number[] = [];
      targets.forEach((slot, k) => {
        if (pieces[k]) next[slot] = pieces[k].id;
        else failed.push(slot);
      });
      setSlotIds(next);
      if (failed.length) {
        const message = data.failureMessage || 'El modelo no devolvió la imagen.';
        setSlotErrs(e => e.map((x, i) => (failed.includes(i) ? { message } : x)));
        reportFail(message, undefined, failed);
      }
      pieces.forEach(p => void checkCore(p, core));
    } catch (err: any) {
      const message = err?.message || String(err);
      setSlotIds(targets.length === 2 ? [null, null] : [...slots]);
      setSlotErrs(e => e.map((x, i) => (targets.includes(i) ? { message, detail: err?.detail } : x)));
      reportFail(message, err?.detail, targets);
    } finally {
      timers.forEach(clearTimeout);
      setBusySlots([]);
    }
  };
  generateRef.current = generate;

  // Lo que el sistema está haciendo, para la línea de estado.
  const checking = Object.values(checks).some(v => v === 'loading');
  const activity = busy
    ? genStage === 0
      ? 'Armando la receta con tus capas…'
      : busySlots.length === 2
        ? `Generando la variante ${genStage === 1 ? 1 : 2} de 2…`
        : `Generando la variante ${busySlots[0] + 1} de 2…`
    : checking
      ? 'Revisando que el Primario esté presente…'
      : null;
  useEffect(() => onActivity(activity), [activity]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onActivity(null), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!busy) return;
    const t0 = Date.now();
    const id = setInterval(() => setElapsed((Date.now() - t0) / 1000), 500);
    return () => clearInterval(id);
  }, [busy]);

  const clima = useClima();
  const toggleApprove = (p: Piece, n: number) => {
    const before = approved;
    const wasApproved = approved[p.pieceType] === p.id;
    setApproved(a => ({ ...a, [p.pieceType]: wasApproved ? undefined : p.id }));
    onUndoable(() => setApproved(before));
    if (!wasApproved) logEvent('approve', { kind: p.pieceType, variant: n });
    // Clima: por 2 s el fondo toma los colores de la variante aprobada y vuelve.
    if (!wasApproved && p.imageUrl)
      paletteFromImage(p.imageUrl, 3)
        .then(cols => clima.flash(cols.map(c => c.hex)))
        .catch(() => {});
    if (!wasApproved) onNotify(`Aprobaste ${pieceTypeInfo(p.pieceType).label.toLowerCase()} · variante ${n}.`, { undo: true });
  };

  const zoomPiece = allPieces.find(p => p.id === zoomId) || null;
  const hasResult = slots.some(Boolean);
  const genPrimary =
    busy
      ? { label: 'Generando…', blocked: 'Hay una generación en curso: puede tardar hasta 90 segundos.', blockedLabel: 'Generando…', onClick: () => {}, onBlockedClick: onBlocked }
      : !direct && !sel.core.length
        ? { label: 'Generar 2 variantes', blocked: 'Necesita al menos una pieza en Primario: marcala en la receta (Editar).', blockedLabel: 'Primario vacío', onClick: () => {}, onBlockedClick: onBlocked }
        : { label: 'Generar 2 variantes', kbd: '⏎', onClick: () => void generate([0, 1]) };

  /* ---------- Receta: el detalle que se abre con «Editar» ---------- */
  const layerBlock = (layer: Layer, note: string, items: Pattern[], body: (x: Pattern) => React.ReactNode, emptyText: string) => (
    <section className={`layer-${layer} flex flex-col gap-2`} aria-label={sheetLabel(layer)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="type-label text-[0.75rem] tracking-[0.08em]" style={{ color: 'var(--layer-text)' }}>
          {sheetLabel(layer)}
        </span>
        <span className="type-label text-[0.75rem] text-ink-2">{note}</span>
      </div>
      <div className="layer-rule" />
      {items.length === 0 && <span className="text-[0.875rem] text-ink-3">{emptyText}</span>}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">{items.map(x => body(x))}</ul>
    </section>
  );

  const item = (x: Pattern, control: React.ReactNode, state: 'on' | 'off' | 'out') => (
    <li key={x.id} className="flex items-center gap-3 p-1" style={{ opacity: state === 'off' ? 0.75 : 1, outline: state === 'on' ? '1px solid color-mix(in oklab, var(--layer-color) 55%, transparent)' : undefined }}>
      <PieceImage piece={x} project={project} className="size-[44px] shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="type-name text-[1.125rem] leading-[0.95]">{x.name}</span>
        <span className="flex items-center gap-2">
          <OriginTag piece={x} />
          {state === 'out' && <span className="font-mono text-[0.875rem] text-ink-2">{`FUERA DEL PEDIDO · LÍMITE ${MAX_DECISIONS}`}</span>}
        </span>
      </div>
      {control}
    </li>
  );

  const check = (on: boolean, label: string, onClick?: () => void) => (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className="flex size-[24px] shrink-0 items-center justify-center rounded-[3px] border-2 text-[0.9375rem] leading-none"
      style={{ borderColor: 'var(--layer-color)', background: on ? 'var(--layer-color)' : 'transparent', color: 'var(--layer-ink)' }}
    >
      {on ? '✓' : ''}
    </button>
  );

  const stateOf = (x: Pattern) => (omittedIds.has(x.id) ? 'out' : isOn(x.id) ? 'on' : 'off');

  /** Qué dice la receta de una capa sin piezas en el pedido: si la capa está vacía o si esta pieza no la usa. */
  const ARTICLE: Record<PieceType, string> = { logo: 'un logotipo', facade: 'una fachada', packaging: 'un packaging', poster: 'un afiche', post: 'un post', story: 'una story', web: 'una web', other: 'esta pieza' };
  const emptyRecipe = (layer: Layer) => {
    const all = layer === 1 ? recipe.core : layer === 2 ? recipe.support : recipe.accent;
    if (!all.length) return 'No hay piezas en esta capa';
    return `No se usa en ${ARTICLE[pieceType]} · ${all.length} ${all.length === 1 ? 'pieza disponible' : 'piezas disponibles'}`;
  };
  const recipeRow = (layer: Layer, tag: string, names: string[]) => (
    <li key={layer} className={`layer-${layer} flex items-start gap-3 py-2`}>
      <span aria-hidden="true" className="mt-[7px] size-2 shrink-0 rounded-full" style={{ background: 'var(--layer-color)' }} />
      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-[0.875rem] font-semibold">{SHEET_NAME[layer]}</span>
          <span className="font-mono text-[0.75rem] tracking-[0.06em] text-ink-2">{tag}</span>
        </span>
        <span className="text-[0.875rem] leading-snug text-ink-2">{names.length ? names.join(' · ') : emptyRecipe(layer)}</span>
      </span>
    </li>
  );

  /** Proporción de la pieza elegida: los marcos de las variantes la respetan. */
  const ratio = info.format === 'auto' ? '1 / 1' : info.format.replace(':', ' / ');
  const palettePreview = (refPalette ? refPalette.colors : systemPalette).slice(0, 5);
  const approvedPiece = byId(approved[pieceType]);
  const anyApproved = Object.values(approved).some(Boolean);

  const variantCard = (slot: number) => {
    const id = slots[slot];
    const p = byId(id);
    const err = slotErrs[slot];
    const generating = busySlots.includes(slot);
    const letter = slot === 0 ? 'A' : 'B';
    // En pantallas anchas el marco crece hasta llenar el alto disponible; en angostas respeta la proporción de la pieza.
    const frame = 'relative w-full overflow-hidden rounded-[4px] bg-surface min-[1100px]:!aspect-auto min-[1100px]:!max-h-none min-[1100px]:min-h-[280px] min-[1100px]:flex-1';
    const frameStyle: React.CSSProperties = { aspectRatio: ratio, maxHeight: 'calc(100vh - 330px)' };

    let body: React.ReactNode;
    let caption: React.ReactNode = null;

    if (generating) {
      // Esqueleto: el punto del agente late y se dice qué se está componiendo.
      body = (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center" role="status" aria-busy="true">
          <span aria-hidden="true" className="size-3 rounded-full motion-safe:animate-pulse" style={{ background: 'var(--cc-l0)' }} />
          <span className="text-[1.0625rem] font-semibold">{direct ? 'Componiendo con tu pedido…' : 'Componiendo con el Primario…'}</span>
        </div>
      );
    } else if (err) {
      body = (
        <div className="absolute inset-0 flex flex-col justify-center gap-3 overflow-y-auto p-5" role="alert" style={{ outline: '1px solid var(--cc-error)', outlineOffset: -1 }}>
          <span className="text-[1rem] font-semibold">No pudimos generar la variante {letter}.</span>
          <span className="text-[0.875rem] leading-snug text-ink-2">{err.message}</span>
          {err.detail && (
            <details className="text-[0.875rem] text-ink-2">
              <summary className="cursor-pointer">Detalle técnico</summary>
              <pre className="m-0 mt-1 max-h-32 overflow-auto whitespace-pre-wrap font-mono">{err.detail}</pre>
            </details>
          )}
          <div>
            <KeyButton label="Reintentar" tone="bone" disabled={busy} onClick={() => void generate([slot])} />
          </div>
        </div>
      );
    } else if (p) {
      const c = checks[p.id];
      const isApproved = approved[p.pieceType] === p.id;
      const dim = !!approvedPiece && !isApproved;
      const coreOf = (cid: string) => project.patterns.find(x => x.id === cid);
      body = (
        <button type="button" onClick={() => setZoomId(p.id)} aria-label={`Ampliar variante ${letter}`} className="absolute inset-0 block p-0">
          <img
            src={p.imageUrl || undefined}
            alt={`${info.label}, ${directionLabel(p) || `variante ${letter}`}`}
            className={`size-full object-contain transition-[filter] duration-300 ${p.pieceType === 'logo' && transparent ? 'bg-[repeating-conic-gradient(#222_0_25%,#2c2c2c_0_50%)] bg-[length:16px_16px]' : ''}`}
            style={{ filter: dim ? 'grayscale(0.7)' : undefined }}
          />
        </button>
      );
      caption = (
        <div className="flex flex-col gap-2" style={{ opacity: dim ? 0.75 : 1 }}>
          <span className="flex flex-wrap items-center gap-x-2 text-[0.875rem] text-ink-2">
            <span className="font-semibold text-ink">Variante {letter}</span>
            <span>· {directionLabel(p) || (p.mode === 'direct' ? 'directo' : 'con el sistema')}</span>
          </span>
          {p.mode === 'direct' ? (
            <span className="text-[0.875rem] text-ink-2">Modo directo: sin control del Primario.</span>
          ) : c === 'loading' ? (
            <span className="flex items-center gap-2 text-[0.875rem] text-ink-2">
              <span className="spinner text-core" /> Revisando si respeta el Primario…
            </span>
          ) : c === 'error' ? (
            <span className="flex items-center gap-2 text-[0.875rem] text-ink-2">
              No se pudo evaluar el Primario.
              <KeyButton label="Reintentar" tone="ghost" onClick={() => void checkCore(p, recipe.core)} />
            </span>
          ) : Array.isArray(c) ? (
            <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label="Primario respetado">
              {c.map(k => (
                <li key={k.id} className="flex items-start gap-2 text-[0.875rem]" title={k.note}>
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
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => toggleApprove(p, slot + 1)}
              className="inline-flex h-11 items-center rounded-full px-6 text-[0.875rem] font-bold"
              style={isApproved ? { background: GREEN, color: 'var(--cc-bg)' } : { background: 'var(--cc-text)', color: 'var(--cc-bg)' }}
            >
              {isApproved ? '✓ Aprobada' : 'Aprobar esta'}
            </button>
          </div>
        </div>
      );
    } else {
      // Vacío: los marcos anticipan lo que se va a usar (colores y tipografía) en lugar de verse rotos.
      body = (
        <div aria-hidden="true" className="absolute inset-0 flex flex-col justify-between p-5">
          <div className="flex h-[34%] gap-2">
            {palettePreview.length ? palettePreview.map(c => <span key={c.hex} className="flex-1 rounded-[3px]" style={{ background: c.hex, opacity: 0.4 }} />) : <span className="flex-1 rounded-[3px] bg-ink/10" />}
          </div>
          <div className="flex flex-col gap-1">
            <span className="type-name line-clamp-2 text-[clamp(2rem,3.6vw,3.5rem)] leading-[0.9] text-ink-2">{brandText.trim() || 'Aa'}</span>
            <span className="text-[0.875rem] text-ink-2">Variante {letter}</span>
          </div>
        </div>
      );
    }

    return (
      <li key={slot} className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <div className={frame} style={frameStyle}>
          {body}
        </div>
        {caption}
      </li>
    );
  };

  const progress = busy ? Math.min(0.94, 1 - Math.exp(-elapsed / 35)) : 0;
  const noun = info.label.toLowerCase();

  /* ---------- Acción de cada subpaso ---------- */
  const approvedHere = approvedPiece;
  const anyApprovedPiece = approvedHere ?? CHIPS.map(t => byId(approved[t])).find(Boolean) ?? null;
  const primary: Primary =
    sub === 0
      ? { label: 'Siguiente →', kbd: '⏎', onClick: () => onSub(1) }
      : sub === 1
        ? genPrimary.blocked
          ? genPrimary
          : { ...genPrimary, onClick: () => {
              onSub(2);
              void generate([0, 1]);
            } }
        : sub === 2
          ? busy
            ? genPrimary
            : approvedHere
              ? { label: 'Ver la aprobada →', kbd: '⏎', onClick: () => onSub(3) }
              : { label: 'Ver la aprobada →', blocked: 'Aprobá una de las dos variantes para seguir.', blockedLabel: 'Aprobá una variante', onClick: () => {}, onBlockedClick: onBlocked }
          : { label: 'Probar otra pieza →', kbd: '⏎', onClick: () => {
            onNewPiece?.();
            onSub(0);
          } };
  useShortcuts(enabled, { enter: () => (primary.blocked ? primary.onBlockedClick?.(primary.blocked) : primary.onClick()) });

  /* ---------- Estante: la receta ---------- */
  const shelves: Shelf[] =
    sub === 1 || sub === 2
      ? [
          {
            id: 'receta',
            label: 'Receta',
            side: 'left',
            content: (
              <div className="flex flex-col gap-3">
          <section aria-label="La receta" className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <StepLabel>LA RECETA</StepLabel>
              <button type="button" onClick={() => setEditing(v => !v)} aria-expanded={editing} className="text-[0.875rem] text-ink-2 underline underline-offset-2 hover:text-ink">
                {editing ? 'Listo' : 'Editar'}
              </button>
            </div>
            <p className="m-0 text-[0.875rem] text-ink-2">Sale sola de tus capas.</p>
            {mobile && !recipeOpen && !editing ? (
              <button type="button" onClick={() => setRecipeOpen(true)} className="flex min-h-[44px] items-center justify-between rounded-[4px] px-3 text-left text-[0.875rem] text-ink-2">
                <span>Receta automática</span>
                <span className="text-ink underline underline-offset-2">Ver</span>
              </button>
            ) : direct ? (
              <p className="m-0 text-[0.875rem] text-ink-2">Modo directo: no usa el sistema, solo el pedido, el texto y la paleta.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
                {recipeRow(1, 'OBLIGATORIO', sel.core.map(x => x.name))}
                {recipeRow(2, 'AUTOMÁTICO', sel.support.map(x => x.name))}
                {recipeRow(3, 'AUTOMÁTICO', sel.accent ? [sel.accent.name] : [])}
              </ul>
            )}

            {editing && (
              <div className="mt-2 flex flex-col gap-6 border-t border-line pt-4">
                <div role="radiogroup" aria-label="Cómo pedirla" className="flex w-fit overflow-hidden bg-ink/10">
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
                      className={`type-label px-3 py-1 text-[0.75rem] ${direct === v ? 'bg-bone text-void' : 'text-ink-2 hover:text-ink'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="m-0 text-[0.875rem] text-ink-2">
                  {limitNote ? `Ya hay ${MAX_DECISIONS} decisiones, el máximo: desmarcá una para sumar otra.` : `Marcá o desmarcá lo que entra. ${decisions} de ${MAX_DECISIONS} decisiones.`}
                </p>
                <div className="flex flex-col gap-5" style={{ opacity: direct ? 0.75 : 1, pointerEvents: direct ? 'none' : undefined }}>
                  {layerBlock(1, 'las 3 de más peso vienen marcadas', recipe.core, x => item(x, check(isOn(x.id) && !omittedIds.has(x.id), `${x.name}: usar en el pedido`, () => toggle(x, 1)), stateOf(x)), 'El Primario está vacío: ubicá piezas en la Capa 1.')}
                  {layerBlock(2, 'se preseleccionó lo que aplica', recipe.support, x => item(x, check(isOn(x.id) && !omittedIds.has(x.id), `${x.name}: usar en el pedido`, () => toggle(x, 2)), stateOf(x)), 'No hay piezas de Secundario.')}
                  {layerBlock(3, 'detalle · una sola', recipe.accent, x => item(x, check(isOn(x.id) && !omittedIds.has(x.id), `${x.name}: usar como detalle`, () => toggle(x, 3)), stateOf(x)), 'No hay piezas de Acento.')}
                </div>

                {/* Paleta del pedido: la del sistema o la de una imagen de referencia */}
                <div className="flex flex-col gap-2">
                  <span className="font-mono text-[0.75rem] tracking-[0.06em] text-ink-2">PALETA DEL PEDIDO</span>
                  <div className="flex h-[22px] overflow-hidden bg-ink/10" aria-label="Colores de la paleta">
                    {(refPalette ? refPalette.colors : systemPalette).map(c => (
                      <span key={c.hex} title={c.hex.toUpperCase()} style={{ background: c.hex, flexGrow: Math.max(0.05, c.share ?? 0.1) }} />
                    ))}
                    {!(refPalette ? refPalette.colors : systemPalette).length && <span className="px-2 text-[0.875rem] text-ink-3">sin colores todavía</span>}
                  </div>
                  <span className="text-[0.875rem] leading-snug text-ink-2">{refPalette ? `De la imagen «${refPalette.name}».` : 'La del sistema: Primario, Secundario y Acento.'}</span>
                  <div className="flex flex-wrap gap-2">
                    <KeyButton label={refPalette ? 'Cambiar imagen' : 'Usar la de una imagen'} onClick={() => setPickerOpen(o => !o)} />
                    {refPalette && <KeyButton label="Volver a la del sistema" tone="ghost" onClick={() => setRefPalette(null)} />}
                  </div>
                  {paletteError && (
                    <span role="alert" className="text-[0.875rem] text-error-ink">
                      {paletteError}
                    </span>
                  )}
                  {pickerOpen && (
                    <div className="flex flex-col gap-2 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[0.875rem] text-ink-2">Elegí una referencia o subí una imagen</span>
                        <KeyButton label="Subir imagen" tone="bone" onClick={() => uploadRef.current?.click()} />
                      </div>
                      <div className="grid max-h-48 grid-cols-4 gap-1 overflow-y-auto">
                        {project.references.filter(r => r.image).map(r => (
                          <button key={r.id} type="button" disabled={paletteBusy} title={r.name} onClick={() => usePaletteOf(r.name, r.image)} className="p-0 outline-none hover:outline hover:outline-2 hover:outline-bone">
                            <img src={r.image} alt={r.name} loading="lazy" className="aspect-square w-full object-cover" />
                          </button>
                        ))}
                      </div>
                      {paletteBusy && <span className="text-[0.875rem] text-ink-2">Analizando colores…</span>}
                    </div>
                  )}
                  <input
                    ref={uploadRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={e => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => void usePaletteOf(file.name, String(reader.result));
                      reader.readAsDataURL(file);
                    }}
                  />
                </div>

                {pieceType === 'logo' ? (
                  <label className="flex cursor-pointer items-center gap-3 text-[0.875rem]">
                    <input type="checkbox" className="size-4 accent-[var(--cc-text)]" checked={transparent} onChange={e => setTransparent(e.target.checked)} />
                    Fondo transparente (PNG)
                  </label>
                ) : approvedLogo ? (
                  <label className="flex cursor-pointer items-center gap-3 p-2 text-[0.875rem]">
                    <input type="checkbox" className="size-4 shrink-0 accent-[var(--cc-text)]" checked={useLogo} onChange={e => setUseLogo(e.target.checked)} />
                    <img src={approvedLogo.imageUrl || undefined} alt="" className="size-10 shrink-0 bg-raised object-contain" />
                    <span className="flex flex-col">
                      Usar el logo aprobado
                      <span className="text-[0.875rem] text-ink-2">Se reproduce tal cual, sin rediseñarlo.</span>
                    </span>
                  </label>
                ) : (
                  <p className="m-0 text-[0.875rem] text-ink-2">
                    Sin logo aprobado: el modelo dibuja la marca desde cero.{' '}
                    <button type="button" className="text-ink underline underline-offset-2" onClick={() => setPieceType('logo')}>
                      Empezar por el logo
                    </button>
                  </p>
                )}

                <details open={promptOpen} onToggle={e => setPromptOpen((e.currentTarget as HTMLDetailsElement).open)} className="rounded-[4px] bg-surface">
                  <summary className="type-label flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[0.75rem] text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
                    <span>VER PEDIDO COMPLETO</span>
                    <span className="font-mono">{promptOpen ? '−' : '+'}</span>
                  </summary>
                  <pre className="m-0 max-h-72 overflow-auto whitespace-pre-wrap border-t border-line p-3 font-mono text-[0.875rem] leading-[1.5] text-ink-2">{prompt}</pre>
                </details>
              </div>
            )}
          </section>
              </div>
            ),
          },
        ]
      : [];

  /* ---------- La mesa según el subpaso ---------- */
  let body: React.ReactNode;
  let width: 'form' | 'wide' | 'full' = 'wide';
  let scroll = true;
  if (sub === 0) {
    body = (
      <div className="flex min-h-full flex-col justify-center gap-2 py-6">
        <DeskQuestion>¿Qué querés probar?</DeskQuestion>
        <div role="radiogroup" aria-label="Tipo de pieza" className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${mobile ? 140 : 190}px, 1fr))` }}>
          {CHIPS.map(id => {
            const t = pieceTypeInfo(id);
            const on = pieceType === id;
            const [w, h] = t.format === 'auto' ? [1, 1] : t.format.split(':').map(Number);
            const shown = approved[id] ? images[approved[id]!] : undefined;
            return (
              <div key={id} className="flex flex-col gap-2">
              <button
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  if (id !== pieceType) onNewPiece?.();
                  setPieceType(id);
                }}
                onDoubleClick={() => {
                  if (id !== pieceType) onNewPiece?.();
                  setPieceType(id);
                  onSub(1);
                }}
                className="flex flex-col gap-3 rounded-[4px] p-4 text-left transition-colors duration-150 hover:bg-ink/5"
                style={{ outline: on ? '2px solid var(--cc-text)' : '1px solid var(--cc-line)', outlineOffset: -1 }}
              >
                {/* La proporción de la pieza, dibujada */}
                <span className="flex h-[150px] items-center justify-center">
                  {shown ? (
                    <img src={shown} alt={`${t.label} aprobado`} className="max-h-full max-w-full rounded-[2px] object-contain" />
                  ) : (
                    <span className="block rounded-[2px]" style={{ aspectRatio: `${w} / ${h}`, height: h >= w ? '100%' : undefined, width: w > h ? '100%' : undefined, maxWidth: '100%', background: on ? 'var(--cc-primary)' : 'color-mix(in srgb, var(--cc-text) 14%, transparent)' }} />
                  )}
                </span>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[1.125rem] font-semibold">{t.label}</span>
                  <span className="type-data text-[0.875rem] text-ink-2">{t.format === 'auto' ? 'libre' : t.format}</span>
                </span>
                {approved[id] && <span className="text-[0.875rem] font-semibold" style={{ color: GREEN }}>✓ Ya tiene una aprobada</span>}
              </button>
              {approved[id] && onEvaluate && (
                <button type="button" onClick={() => onEvaluate(approved[id]!, t.label)} className="self-start px-1 text-[0.875rem] font-bold text-ink underline underline-offset-4 hover:no-underline">
                  Evaluar y anotar →
                </button>
              )}
              </div>
            );
          })}
        </div>
      </div>
    );
  } else if (sub === 1) {
    width = 'form';
    body = (
      <div className="flex min-h-full flex-col justify-center gap-6 py-6">
        <DeskQuestion kicker={info.label}>¿Qué dice y qué pedís?</DeskQuestion>
        <label className="flex flex-col gap-2">
          <span className="type-label text-[0.75rem] tracking-[0.06em] text-ink-2">Texto que aparece · opcional</span>
          <input value={brandText} onChange={e => setBrandText(e.target.value)} className="field-input" style={{ height: 56, fontSize: '1.25rem', fontWeight: 600 }} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="type-label text-[0.75rem] tracking-[0.06em] text-ink-2">Pedido libre · opcional</span>
          <textarea rows={4} placeholder={info.placeholder} value={details} onChange={e => setRequests(r => ({ ...r, [pieceType]: e.target.value }))} className="field-input resize-y" style={{ fontSize: '1rem', lineHeight: 1.6 }} />
        </label>
        <p className="m-0 text-[0.9375rem] text-ink-2">
          La receta sale sola de tus capas: {direct ? 'modo directo (sin el sistema).' : `${sel.core.length} del Primario, ${sel.support.length} del Secundario${sel.accent ? ' y un Acento' : ''}.`} Está en el estante «Receta», a la izquierda.
        </p>
        {genPrimary.blocked && !busy && <p className="m-0 text-[0.875rem] text-ink-2">{genPrimary.blocked}</p>}
      </div>
    );
  } else if (sub === 2) {
    width = 'full';
    scroll = mobile;
    body = (
      <section aria-label="Resultado" aria-busy={busy} className="flex h-full flex-col gap-5 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <DeskQuestion kicker={info.label}>Compará</DeskQuestion>
          {hasResult && <span className="mb-8 text-[0.9375rem] text-ink-2">Aprobá la que mejor respete el Primario{pieceType === 'logo' ? ': el logo aprobado se usa en las demás piezas' : ''}.</span>}
        </div>
        {busy && (
          <div className="-mt-4 flex flex-col gap-2" role="status">
            <div className="h-[3px] w-full overflow-hidden bg-white/10">
              <div className="h-full bg-bone transition-[width] duration-500" style={{ width: `${progress * 100}%` }} />
            </div>
            <span className="text-[0.875rem] text-ink-2">Puede tardar entre 30 y 90 segundos. No cierres la pestaña.</span>
          </div>
        )}
        <ul className="m-0 flex min-h-0 flex-1 list-none gap-6 p-0 max-md:flex-col">{[0, 1].map(variantCard)}</ul>
      </section>
    );
  } else {
    const p = anyApprovedPiece;
    body = (
      <div className="flex flex-col gap-8 pb-8">
        <DeskQuestion kicker={p ? pieceTypeInfo(p.pieceType).label : undefined}>Listo</DeskQuestion>
        {p ? (
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <button type="button" onClick={() => setZoomId(p.id)} aria-label="Ampliar" className="block overflow-hidden rounded-[4px] bg-surface p-0">
              <img src={p.imageUrl || undefined} alt={`${pieceTypeInfo(p.pieceType).label} aprobada`} className="max-h-[58vh] w-full object-contain" />
            </button>
            <div className="flex flex-col gap-4">
              <span className="text-[1.125rem] font-semibold" style={{ color: GREEN }}>✓ Aprobada</span>
              <span className="text-[1rem] text-ink-2">{directionLabel(p) || (p.mode === 'direct' ? 'Modo directo' : 'Con el sistema')}</span>
              <span className="type-label mt-4 text-[0.75rem] text-ink-2">Exportar</span>
              <ExportMenu project={project} notify={onNotify} inline />
            </div>
          </div>
        ) : (
          <p className="m-0 text-[1.0625rem] text-ink-2">Todavía no aprobaste ninguna variante.</p>
        )}
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <Desk stepKey={`probar-${sub}`} width={width} scroll={scroll} shelves={shelves}>
        {body}
      </Desk>

      {active && (
        <BottomBar
          actions={
            sub === 2 ? (
              <BarButton onClick={() => void generate([0, 1])} disabled={busy || (!direct && !sel.core.length)}>
                Generar otras 2
              </BarButton>
            ) : undefined
          }
          extra={sub === 2 ? <ExportMenu project={project} notify={onNotify} disabled={anyApproved ? undefined : 'Aprobá una variante para exportar'} /> : undefined}
          primary={primary}
        />
      )}

      <LightboxModal
        reference={zoomPiece ? { id: zoomPiece.id, name: `${pieceTypeInfo(zoomPiece.pieceType).label} · ${zoomPiece.mode === 'direct' ? 'directo' : 'con el sistema'}`, image: zoomPiece.imageUrl, createdAt: '' } : null}
        onClose={() => setZoomId(null)}
      />
    </div>
  );
}
