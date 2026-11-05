import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Layer, LayerPosition, Pattern, PatternGroup, Project, Reference } from '../types';
import { useShortcuts } from '../hooks/useAuditShortcuts';
import { Shortcut, ShortcutBar } from '../components/shell/ShortcutBar';
import { corpusRefs, isLayer, layerInfo } from '../utils/layers';
import { Crop } from '../space/Crop';
import {
  ActionResult,
  MIN_REFS,
  SHEET_NAME,
  SplitPart,
  applySplit,
  confirm,
  confirmRef,
  confirmSheet,
  createGroup,
  evidenceText,
  groupsIn,
  isSuggestion,
  livePieces,
  merge,
  move,
  moveGroup,
  moveRefLayer,
  notices,
  outPieces,
  panelRefs,
  piecesIn,
  pieceWeight,
  place,
  placeRef,
  refsIn,
  rename,
  reorderPiece,
  addRefParts,
  renameGroup,
  restore,
  returnRef,
  setCover,
  setRefPosition,
  sheetLabel,
  takeOut,
  ungroup,
} from '../pieces/model';
import { BigButton, BriefPanel, KeyButton, NoticeStrip, PieceImage, Toast } from './common';
import { CropDialog, MergeDialog, SplitDialog } from './PieceDialogs';
import { cropImage } from '../utils/parts';
import { nextReferenceIds } from '../utils/project';

export type AnalysisState =
  | { status: 'idle' }
  | { status: 'preparing'; done: number; total: number }
  | { status: 'reading'; total: number; since: number }
  | { status: 'error'; message: string; detail?: string };

interface MoodboardScreenProps {
  project: Project;
  enabled: boolean;
  apply: (fn: (p: Project) => ActionResult) => ActionResult;
  toast: string | null;
  onSubmitIntent: (intent: string) => void;
  briefBusy: boolean;
  briefError: string | null;
  onSaveBrief: (text: string) => void;
  briefRequest: number;
  onAddFiles: (files: File[]) => void;
  onOpenUpload: () => void;
  onDeleteRef: (id: string) => void;
  analysis: AnalysisState;
  onAnalyze: () => void;
  onCancelAnalysis: () => void;
  onGoSystem: () => void;
  /** Pide al agente cómo separar una pieza (no cambia nada hasta confirmar). */
  split: (piece: Pattern) => Promise<SplitPart[]>;
}

const ROLE: Record<Layer, string> = {
  1: 'Lo que define el sistema. Lo más importante va acá.',
  2: 'Lo que acompaña al núcleo.',
  3: 'Detalles que aparecen poco y dan carácter.',
};

/* ---------- Escena: tres capas, la activa de frente ---------- */

/** Margen de la capa activa dentro de la escena: arriba queda el lugar para las que asoman; a la derecha, el indicador de profundidad. */
const ACTIVE_INSET = { top: 120, right: 64, bottom: 8, left: 8 };

interface SlotStyle {
  transform: string;
  transformOrigin: string;
  zIndex: number;
  blur: number;
  opacity: number;
}

/** Posición de cada capa: la activa al frente; las otras dos asoman desplazadas y difuminadas, nunca tapadas del todo. */
function slotStyle(slot: 0 | 1 | 2): SlotStyle {
  if (slot === 0) return { transform: 'none', transformOrigin: 'top left', zIndex: 10, blur: 0, opacity: 1 };
  if (slot === 1) return { transform: 'translate(0, -64px) scale(0.85)', transformOrigin: 'top left', zIndex: 6, blur: 3, opacity: 0.55 };
  return { transform: 'translate(0, -108px) scale(0.7)', transformOrigin: 'top right', zIndex: 3, blur: 5, opacity: 0.35 };
}

/** Qué lugar ocupa cada capa según cuál es la activa: 0 = al frente, 1 = la más cercana detrás, 2 = la más lejana. */
function slotOf(l: Layer, active: Layer): 0 | 1 | 2 {
  if (l === active) return 0;
  const others = ([1, 2, 3] as Layer[]).filter(x => x !== active).sort((a, b) => Math.abs(a - active) - Math.abs(b - active) || a - b);
  return others[0] === l ? 1 : 2;
}

/** Qué hay bajo el puntero al soltar: el panel, el borde de otra capa que asoma, o la capa activa (no cambia nada). */
type DropTarget = { kind: 'panel' } | { kind: 'layer'; layer: Layer } | null;
function dropTargetAt(x: number, y: number): DropTarget {
  for (const el of document.elementsFromPoint(x, y) as HTMLElement[]) {
    if (el.dataset?.panel === 'true') return { kind: 'panel' };
    if (el.dataset?.layerActive === 'true') return null;
    if (el.dataset?.layerDrop) return { kind: 'layer', layer: Number(el.dataset.layerDrop) as Layer };
  }
  return null;
}

const REF_MIME = 'text/camaleon-ref';

/* ---------- Etiquetas de origen ---------- */

function OriginTag({ origin, confirmed }: { origin?: 'agent' | 'user'; confirmed?: boolean }) {
  if (origin === 'user') return <span className="type-label shrink-0 bg-bone px-1 text-[10px] text-void">USUARIO</span>;
  if (confirmed) return <span className="type-label shrink-0 border border-ink-3 px-1 text-[10px] text-ink-2">AGENTE</span>;
  return <span className="type-label shrink-0 border border-dashed border-ink-3 px-1 text-[10px] text-ink-2">AGENTE · SUGERENCIA</span>;
}

/* ---------- Pantalla ---------- */

/**
 * 01 · MOODBOARD. Tres capas apiladas más un panel de referencias. Subir y ordenar en una sola pantalla.
 * El usuario ubica; el agente analiza y completa lo que quedó sin ubicar, siempre como sugerencia.
 */
export function MoodboardScreen(props: MoodboardScreenProps) {
  const { project, apply, analysis } = props;
  const [layer, setLayer] = useState<Layer>(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [renamingGroup, setRenamingGroup] = useState<{ id: string; value: string } | null>(null);
  const [dialog, setDialog] = useState<null | { kind: 'merge' | 'crop'; id: string } | { kind: 'split'; id: string; parts: SplitPart[] | null; error?: string }>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [outOpen, setOutOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [dropLayer, setDropLayer] = useState<Layer | null>(null);
  /** Mientras se arrastra una referencia, el panel avisa que ahí vuelve. */
  const [panelHint, setPanelHint] = useState(false);
  /** Referencia que el agente está desglosando. */
  const [splittingRef, setSplittingRef] = useState<string | null>(null);
  /** Pieza que se está arrastrando para cambiar su prioridad y dónde caería. */
  const [pieceDrag, setPieceDrag] = useState<string | null>(null);
  const [pieceDrop, setPieceDrop] = useState<{ id: string; side: 'left' | 'right' } | null>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /* Frase de intención y brief */
  const [intent, setIntent] = useState(project.intent ?? '');
  const [editingIntent, setEditingIntent] = useState(!project.intent);
  const [briefOpen, setBriefOpen] = useState(false);
  const intentRef = useRef<HTMLInputElement>(null);
  useEffect(() => setIntent(project.intent ?? ''), [project.intent]);
  useEffect(() => {
    if (editingIntent) intentRef.current?.focus();
  }, [editingIntent]);
  const firstBrief = useRef(props.briefRequest);
  useEffect(() => {
    if (props.briefRequest !== firstBrief.current) setBriefOpen(true);
  }, [props.briefRequest]);

  const refs = corpusRefs(project);
  const hasIntent = !!project.intent?.trim();
  const busy = analysis.status === 'preparing' || analysis.status === 'reading';
  const missing = Math.max(0, MIN_REFS - refs.length);
  const canAnalyze = hasIntent && missing === 0 && !busy;
  const analyzed = livePieces(project).length > 0;
  const newRefs = refs.filter(r => r.isNew).length;

  /* Qué hay en cada lugar */
  const panel = panelRefs(project);
  const pieces = piecesIn(project, layer);
  const layerRefs = refsIn(project, layer);
  const groups = groupsIn(project, layer);
  const grouped = new Set(groups.flatMap(g => g.memberIds));
  const freeRefs = layerRefs.filter(r => r.origin === 'user' && !grouped.has(r.id));
  const agentRefs = layerRefs.filter(r => r.origin !== 'user' && !grouped.has(r.id));
  const loosePieces = pieces.filter(x => !grouped.has(x.id));

  const refById = useMemo(() => new Map(project.references.map(r => [r.id, r])), [project.references]);
  const pieceById = useMemo(() => new Map(project.patterns.map(x => [x.id, x])), [project.patterns]);

  const primary = selected[selected.length - 1] ?? null;
  const selPiece = primary ? pieceById.get(primary) ?? null : null;
  const selRef = primary && !selPiece ? refById.get(primary) ?? null : null;
  const lit = useMemo(() => {
    if (selPiece) return new Set(selPiece.evidence);
    if (selRef) return new Set([selRef.id]);
    return null;
  }, [selPiece, selRef]);
  const notice = notices(project, selPiece?.id ?? null).find(n => !dismissed.includes(n.key)) ?? null;

  // Lo que sale de la capa visible (y del panel) sale de la selección.
  useEffect(() => {
    const visible = new Set([...pieces.map(x => x.id), ...layerRefs.map(r => r.id), ...panel.map(r => r.id)]);
    if (selected.some(id => !visible.has(id))) setSelected(s => s.filter(id => visible.has(id)));
  }, [project, layer]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- Acciones ---------- */
  const goLayer = (l: Layer) => {
    setLayer(l);
    setMenuFor(null);
  };
  const stepLayer = (dir: 1 | -1) => goLayer(Math.min(3, Math.max(1, layer + dir)) as Layer);

  const select = (id: string, additive: boolean) => {
    setMenuFor(null);
    setSelected(s => (additive ? (s.includes(id) ? s.filter(x => x !== id) : [...s, id]) : [id]));
  };

  /** Manda lo elegido a una capa: es una decisión del usuario (pesa más que lo del agente). */
  const sendTo = (ids: string[], l: Layer) => {
    if (!ids.length) return;
    apply(p => {
      let project = p;
      const log: ActionResult['log'] = [];
      for (const id of ids) {
        const r = project.patterns.some(x => x.id === id) ? place(project, id, l) : placeRef(project, id, l);
        project = r.project;
        log.push(...r.log);
      }
      return { project, log, message: ids.length === 1 ? log[0]?.label : `${ids.length} elementos → ${SHEET_NAME[l]}` };
    });
  };

  const stepDepth = (id: string, dir: 1 | -1) => {
    if (pieceById.has(id)) {
      const r = apply(p => move(p, id, dir)) as ActionResult & { to?: Layer };
      if (r.to) {
        setLayer(r.to);
        setSelected([id]);
      }
    } else if (refById.get(id)?.layer) {
      const r = apply(p => moveRefLayer(p, id, dir)) as ActionResult & { to?: Layer };
      if (r.to) {
        setLayer(r.to);
        setSelected([id]);
      }
    }
  };

  const dropOut = (id: string) => {
    if (pieceById.has(id)) apply(p => takeOut(p, id));
    else if (isLayer(refById.get(id)?.layer)) apply(p => returnRef(p, id));
    setSelected(s => s.filter(x => x !== id));
  };

  const confirmSelected = () => {
    const ids = selected.filter(id => {
      const x = pieceById.get(id) ?? refById.get(id);
      return x && isSuggestion(x);
    });
    if (!ids.length) return false;
    apply(p => {
      let project = p;
      const log: ActionResult['log'] = [];
      for (const id of ids) {
        const r = project.patterns.some(x => x.id === id) ? confirm(project, [id]) : confirmRef(project, id);
        project = r.project;
        log.push(...r.log);
      }
      return { project, log, message: ids.length === 1 ? log[0]?.label : `${ids.length} confirmadas` };
    });
  };

  const makeGroup = () => {
    const ids = selected.filter(id => pieceById.get(id)?.layer === layer || refById.get(id)?.layer === layer);
    const r = apply(p => createGroup(p, ids, layer)) as ActionResult & { groupId?: string };
    if (r.groupId) {
      setRenamingGroup({ id: r.groupId, value: (r.project.patternGroups ?? []).find(g => g.id === r.groupId)?.name ?? '' });
      setSelected([]);
    }
  };

  /** Elementos que se pueden recorrer con ← →: la capa activa y, después, el panel. */
  const navIds = [...loosePieces.map(x => x.id), ...agentRefs.map(r => r.id), ...freeRefs.map(r => r.id), ...groups.flatMap(g => g.memberIds), ...panel.map(r => r.id)];
  const stepElement = (dir: 1 | -1) => {
    if (!navIds.length) return;
    const i = navIds.indexOf(primary ?? '');
    setSelected([navIds[i === -1 ? (dir === 1 ? 0 : navIds.length - 1) : (i + dir + navIds.length) % navIds.length]]);
  };

  const typingBusy = !!dialog || !!renaming || !!renamingGroup || briefOpen || editingIntent || outOpen;
  useShortcuts(props.enabled && !typingBusy, {
    w: () => stepLayer(1),
    s: () => stepLayer(-1),
    arrowleft: () => stepElement(-1),
    arrowright: () => stepElement(1),
    enter: () => {
      if (selected.length && confirmSelected() !== false) return;
      if (!canAnalyze) return false;
      props.onAnalyze();
    },
    '1': () => (selected.length ? sendTo(selected, 1) : false),
    '2': () => (selected.length ? sendTo(selected, 2) : false),
    '3': () => (selected.length ? sendTo(selected, 3) : false),
    arrowup: () => (primary ? stepDepth(primary, 1) : false),
    arrowdown: () => (primary ? stepDepth(primary, -1) : false),
    x: () => (primary ? dropOut(primary) : false),
    g: () => makeGroup(),
    ' ': () => props.onGoSystem(),
    escape: () => {
      if (busy) return props.onCancelAnalysis();
      if (menuFor) return setMenuFor(null);
      if (selected.length) return setSelected([]);
      return false;
    },
  });

  // ⌘V: pegar imágenes. Caen al panel.
  useEffect(() => {
    if (!props.enabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter(f => f.type.startsWith('image/'));
      if (!files.length) return;
      e.preventDefault();
      props.onAddFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [props.enabled, props.onAddFiles]);

  /* ---------- Arrastre: del panel a una capa ---------- */
  const draggedRef = (e: React.DragEvent) => e.dataTransfer.getData(REF_MIME) || null;
  const hasRefDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes(REF_MIME);

  const dropOnCanvas = (e: React.DragEvent) => {
    const id = draggedRef(e);
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();
    setDropLayer(null);
    const rect = canvasRef.current?.getBoundingClientRect();
    const w = 0.16;
    const h = 0.24;
    const position: LayerPosition | undefined =
      rect && e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom
        ? {
            x: Math.min(1 - w, Math.max(0, (e.clientX - rect.left) / rect.width - w / 2)),
            y: Math.min(1 - h, Math.max(0, (e.clientY - rect.top) / rect.height - h / 2)),
            w,
            h,
          }
        : undefined;
    apply(p => placeRef(p, id, layer, position));
    setSelected([id]);
  };

  const dropOnLayer = (e: React.DragEvent, l: Layer) => {
    const id = draggedRef(e);
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();
    setDropLayer(null);
    sendTo([id], l);
  };

  const dropOnPanel = (e: React.DragEvent) => {
    const id = draggedRef(e);
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();
    if (isLayer(refById.get(id)?.layer)) apply(p => returnRef(p, id));
  };

  /* ---------- Textos ---------- */
  const suggestions = pieces.filter(isSuggestion).length + layerRefs.filter(isSuggestion).length;
  let status = '';
  if (analysis.status === 'preparing') status = `Analizando ${analysis.done} de ${analysis.total}…`;
  if (analysis.status === 'reading') status = `El agente está leyendo las ${analysis.total} referencias… (suele tardar 1 o 2 minutos)`;

  const onlyPanelSel = selected.length > 0 && selected.every(id => panel.some(r => r.id === id));
  const shortcuts: Shortcut[] = selPiece || (selRef && isLayer(selRef.layer))
    ? [
        ...(selected.some(id => { const x = pieceById.get(id) ?? refById.get(id); return x && isSuggestion(x); }) ? [{ keys: '⏎', label: 'Confirmar' }] : []),
        { keys: '↑↓', label: 'Mover de capa' },
        { keys: 'X', label: selPiece ? 'Sacar' : 'Al panel' },
        { keys: 'G', label: 'Crear patrón' },
        { keys: 'ESPACIO', label: 'Ver sistema' },
      ]
    : onlyPanelSel
      ? [
          { keys: '1 2 3', label: 'Mandar a capa' },
          { keys: '←→', label: 'Elegir' },
          { keys: '⏎', label: 'Analizar' },
          { keys: 'ESPACIO', label: 'Ver sistema' },
        ]
      : [
          { keys: 'W S', label: 'Cambiar de capa' },
          { keys: '←→', label: 'Elegir' },
          { keys: '⏎', label: 'Analizar' },
          { keys: 'ESPACIO', label: 'Ver sistema' },
        ];

  const submitIntent = () => {
    const v = intent.trim();
    if (!v) return;
    setEditingIntent(false);
    if (v !== project.intent) props.onSubmitIntent(v);
  };

  /** Desglosar una referencia: el agente propone sus partes y pasan a ser piezas tuyas, en la misma capa. */
  const desglosar = async (r: Reference) => {
    if (splittingRef) return;
    setSplittingRef(r.id);
    try {
      const stand: Pattern = { id: r.id, name: r.name, category: 'composition', description: '', evidence: [r.id], confidence: 1, status: 'detected', relatedObservations: [] };
      const parts = (await props.split(stand)).filter(x => x.cover?.refId === r.id && x.cover.crop);
      if (!parts.length) throw new Error('El agente no encontró partes recortables en esta referencia.');
      const crops = await cropImage(r.image, parts.map(x => x.cover!.crop!), 720);
      const ids = nextReferenceIds(project.references, crops.length);
      apply(p =>
        addRefParts(
          p,
          r.id,
          crops.map((c, i) => ({ id: ids[i], name: parts[i].name, image: c.image, aspectRatio: c.aspectRatio })),
        ),
      );
    } catch (err: any) {
      apply(p => ({ project: p, log: [], message: err?.message || 'No se pudo desglosar la referencia' }));
    } finally {
      setSplittingRef(null);
    }
  };

  /** Soltar una pieza sobre otra: a la izquierda de ella (más importante) o a su derecha. */
  const dropPiece = (targetId: string, side: 'left' | 'right', order: Pattern[]) => {
    const id = pieceDrag;
    setPieceDrag(null);
    setPieceDrop(null);
    if (!id || id === targetId) return;
    const ids = order.map(x => x.id).filter(i => i !== id);
    const at = ids.indexOf(targetId);
    const before = side === 'left' ? targetId : ids[at + 1] ?? null;
    apply(p => reorderPiece(p, id, before));
  };

  const pieceCardProps = (x: Pattern, order: Pattern[] = []) => ({
    drag: {
      draggable: true,
      mark: pieceDrop?.id === x.id ? pieceDrop.side : null,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.setData('text/camaleon-piece', x.id);
        e.dataTransfer.effectAllowed = 'move';
        setPieceDrag(x.id);
      },
      onDragEnd: () => {
        setPieceDrag(null);
        setPieceDrop(null);
      },
      onDragOver: (e: React.DragEvent) => {
        if (!pieceDrag || pieceDrag === x.id) return;
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        const side = e.clientX < r.left + r.width / 2 ? 'left' : 'right';
        setPieceDrop(d => (d?.id === x.id && d.side === side ? d : { id: x.id, side }));
      },
      onDrop: (e: React.DragEvent) => {
        if (!pieceDrag) return;
        e.preventDefault();
        e.stopPropagation();
        dropPiece(x.id, pieceDrop?.id === x.id ? pieceDrop.side : 'left', order);
      },
    },
    piece: x,
    project,
    layer,
    selected: selected.includes(x.id),
    lit: lit ? lit.has(x.id) || (selPiece?.id === x.id) : null,
    menuOpen: menuFor === x.id,
    renaming: renaming?.id === x.id ? renaming.value : null,
    onSelect: (additive: boolean) => select(x.id, additive),
    onConfirm: () => apply(p => confirm(p, [x.id])),
    onUp: () => stepDepth(x.id, 1),
    onDown: () => stepDepth(x.id, -1),
    onOut: () => dropOut(x.id),
    onMenu: () => setMenuFor(m => (m === x.id ? null : x.id)),
    onRenameChange: (v: string) => setRenaming({ id: x.id, value: v }),
    onRenameDone: (commit: boolean) => {
      if (commit && renaming) apply(p => rename(p, x.id, renaming.value));
      setRenaming(null);
    },
    onAction: (a: MenuAction) => {
      setMenuFor(null);
      if (a === 'rename') setRenaming({ id: x.id, value: x.name });
      if (a === 'merge') setDialog({ kind: 'merge', id: x.id });
      if (a === 'crop') setDialog({ kind: 'crop', id: x.id });
      if (a === 'split') {
        setDialog({ kind: 'split', id: x.id, parts: null });
        props
          .split(x)
          .then(parts => setDialog(dg => (dg?.kind === 'split' && dg.id === x.id ? { ...dg, parts } : dg)))
          .catch(err => setDialog(dg => (dg?.kind === 'split' && dg.id === x.id ? { ...dg, parts: [], error: err?.message || String(err) } : dg)));
      }
    },
  });

  /* ---------- Cuerpo de una capa ---------- */
  const layerBody = (l: Layer, active: boolean) => {
    const lPieces = active ? loosePieces : piecesIn(project, l);
    const lRefs = refsIn(project, l);
    const lGroups = groupsIn(project, l);
    const lGrouped = new Set(lGroups.flatMap(g => g.memberIds));
    const lFree = lRefs.filter(r => r.origin === 'user' && !lGrouped.has(r.id));
    const lAgent = lRefs.filter(r => r.origin !== 'user' && !lGrouped.has(r.id));
    const lLoose = active ? lPieces : lPieces.filter(x => !lGrouped.has(x.id));
    const nothing = !lLoose.length && !lAgent.length && !lFree.length && !lGroups.length;
    return (
      <div className="flex min-h-0 flex-1">
        {/* Tu espacio: las referencias del usuario, libres */}
        <div
          ref={active ? canvasRef : undefined}
          data-canvas={active ? 'true' : undefined}
          onDragOver={active ? e => hasRefDrag(e) && (e.preventDefault(), setDropLayer(l)) : undefined}
          onDragLeave={active ? () => setDropLayer(null) : undefined}
          onDrop={active ? dropOnCanvas : undefined}
          onClick={active ? () => setSelected([]) : undefined}
          className="relative min-w-0 flex-[1.35] overflow-hidden border-r border-dashed"
          style={{ borderColor: 'color-mix(in oklab, var(--layer-color) 40%, transparent)', background: dropLayer === l && active ? 'color-mix(in oklab, var(--layer-color) 8%, transparent)' : undefined }}
        >
          {active && lFree.length > 0 && (
            <span className="pointer-events-none absolute bottom-1 left-2 z-10 bg-void/80 px-1 text-[11px] text-ink-3">
              Arrastrá para mover · esquina para agrandar · ⇧ + clic para elegir varias y G para agruparlas · soltar sobre el panel la devuelve
            </span>
          )}
          {lFree.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 p-6 text-center">
              <span className="type-label text-[12px] text-ink-3">TU ESPACIO</span>
              <span className="max-w-[260px] text-[13px] leading-snug text-ink-3">
                {active ? `Arrastrá referencias del panel a ${SHEET_NAME[l]}. Acá las movés y las agrandás como quieras.` : ''}
              </span>
            </div>
          )}
          {lFree.map(r =>
            active ? (
              <FreeRef
                key={r.id}
                reference={r}
                selected={selected.includes(r.id)}
                lit={lit ? lit.has(r.id) : null}
                canvasRef={canvasRef}
                onSelect={additive => select(r.id, additive)}
                onCommit={pos => apply(p => setRefPosition(p, r.id, pos))}
                onReturn={() => apply(p => returnRef(p, r.id))}
                onToLayer={to => sendTo([r.id], to)}
                onTarget={t => setDropLayer(t?.kind === 'layer' ? t.layer : null)}
                onPanelHint={setPanelHint}
                onSplit={() => desglosar(r)}
                splitting={splittingRef === r.id}
              />
            ) : (
              <FreeRef key={r.id} reference={r} selected={false} lit={null} canvasRef={canvasRef} inert />
            ),
          )}
        </div>

        {/* Piezas, patrones y lo que ubicó el agente */}
        <div data-scroll className="min-w-0 flex-1 overflow-y-auto p-3" style={{ pointerEvents: active ? undefined : 'none' }}>
          {lGroups.map(g => (
            <GroupBox
              key={g.id}
              group={g}
              layer={l}
              project={project}
              editing={renamingGroup?.id === g.id ? renamingGroup.value : null}
              menuOpen={menuFor === g.id}
              onEdit={v => setRenamingGroup({ id: g.id, value: v })}
              onEditDone={commit => {
                if (commit && renamingGroup) apply(p => renameGroup(p, g.id, renamingGroup.value));
                setRenamingGroup(null);
              }}
              onMenu={() => setMenuFor(m => (m === g.id ? null : g.id))}
              onUngroup={() => {
                setMenuFor(null);
                apply(p => ungroup(p, g.id));
              }}
              onMoveTo={to => {
                setMenuFor(null);
                apply(p => moveGroup(p, g.id, to));
                setLayer(to);
              }}
              renderMember={id => {
                const piece = pieceById.get(id);
                if (piece) return <PieceCard key={piece.id} {...pieceCardProps(piece)} />;
                const ref = refById.get(id);
                return ref ? <RefTile reference={ref} selected={selected.includes(id)} lit={lit ? lit.has(id) : null} onSelect={additive => select(id, additive)} /> : null;
              }}
            />
          ))}
          {lLoose.length > 0 && (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
              {lLoose.map(x => (active ? <PieceCard key={x.id} {...pieceCardProps(x, lLoose)} /> : <PieceThumb key={x.id} piece={x} project={project} />))}
            </div>
          )}
          {lAgent.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              <span className="type-label text-[11px] text-ink-2">REFERENCIAS · AGENTE · SUGERENCIA</span>
              <div className="flex flex-wrap gap-2">
                {lAgent.map(r => (
                  <RefTile key={r.id} reference={r} selected={selected.includes(r.id)} lit={lit ? lit.has(r.id) : null} onSelect={additive => select(r.id, additive)} />
                ))}
              </div>
            </div>
          )}
          {nothing && (
            <div className="flex flex-col gap-2 border border-dashed p-4" style={{ borderColor: 'color-mix(in oklab, var(--layer-color) 40%, transparent)' }}>
              <span className="type-name text-[20px]">NADA EN {SHEET_NAME[l].toUpperCase()} TODAVÍA</span>
              <span className="text-[13px] text-ink-2">
                {analyzed ? 'Mandá algo con 1 / 2 / 3, o bajalo con ↓ desde la capa de arriba.' : 'Ubicá referencias acá y apretá ANALIZAR: el agente completa el resto.'}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className="relative flex h-full flex-col"
      onDragOver={e => {
        if (!Array.from(e.dataTransfer.types).includes('Files')) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={e => !e.currentTarget.contains(e.relatedTarget as Node) && setDragOver(false)}
      onDrop={e => {
        setDragOver(false);
        const files = Array.from(e.dataTransfer.files || []).filter(f => f.type.startsWith('image/'));
        if (!files.length) return;
        e.preventDefault();
        props.onAddFiles(files);
      }}
    >
      {/* Frase de intención */}
      <header className="flex min-h-[48px] shrink-0 flex-wrap items-center gap-x-5 gap-y-1 px-5 pt-3">
        {editingIntent || !hasIntent ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-3"
            onSubmit={e => {
              e.preventDefault();
              submitIntent();
            }}
          >
            <span className="layer-tag layer-3 shrink-0">QUÉ QUERÉS QUE SEA</span>
            <input
              ref={intentRef}
              aria-label="Frase de intención"
              placeholder="HAMBURGUESERÍA CRUDA, DE BARRIO"
              value={intent}
              onChange={e => setIntent(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape' && hasIntent) {
                  setIntent(project.intent ?? '');
                  setEditingIntent(false);
                }
              }}
              className="type-name min-w-0 flex-1 border-b-2 border-bone bg-transparent text-[28px] text-ink outline-none placeholder:text-ink-3"
            />
            <button type="submit" disabled={!intent.trim()} className="type-label h-[36px] shrink-0 bg-bone px-4 text-[13px] text-void hover:bg-core disabled:bg-raised disabled:text-ink-3">
              CONTINUAR <kbd className="font-mono text-[11px] opacity-70">[⏎]</kbd>
            </button>
          </form>
        ) : (
          <>
            <button type="button" onClick={() => setEditingIntent(true)} title="Cambiar la frase" className="type-name min-w-0 truncate text-left text-[28px] text-ink hover:text-core">
              {project.intent}
            </button>
            <button type="button" onClick={() => setBriefOpen(true)} className="type-label text-[11px] text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink">
              {props.briefBusy ? 'EL AGENTE REDACTA EL BRIEF…' : 'VER BRIEF'}
            </button>
            {props.briefError && <span className="text-[12px] text-error-ink">{props.briefError}</span>}
          </>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Escena */}
        <div ref={sceneRef} className="relative min-h-[420px] min-w-0 flex-1 overflow-hidden" aria-label="Capas">
          {([1, 2, 3] as Layer[]).map(l => {
            const info = layerInfo(l);
            const slot = slotOf(l, layer);
            const s = slotStyle(slot);
            const active = slot === 0;
            return (
              <section
                key={l}
                aria-label={sheetLabel(l)}
                aria-hidden={!active}
                data-layer-drop={active ? undefined : l}
                data-layer-active={active ? 'true' : undefined}
                className={`scene-layer ${info.className} absolute`}
                style={{
                  top: ACTIVE_INSET.top,
                  right: ACTIVE_INSET.right,
                  bottom: ACTIVE_INSET.bottom,
                  left: ACTIVE_INSET.left,
                  transform: s.transform,
                  transformOrigin: s.transformOrigin,
                  zIndex: s.zIndex,
                  cursor: active ? undefined : 'pointer',
                }}
                onClick={active ? undefined : () => goLayer(l)}
                onDragOver={active ? undefined : e => hasRefDrag(e) && (e.preventDefault(), setDropLayer(l))}
                onDragLeave={active ? undefined : () => setDropLayer(null)}
                onDrop={active ? undefined : e => dropOnLayer(e, l)}
              >
                <div
                  className="scene-layer-body absolute inset-0 flex flex-col bg-void"
                  style={{
                    filter: s.blur ? `blur(${s.blur}px)` : undefined,
                    opacity: s.opacity,
                    border: `2px solid color-mix(in oklab, var(--layer-color) ${active ? 70 : 45}%, transparent)`,
                    outline: dropLayer === l && !active ? '3px solid var(--layer-color)' : undefined,
                    pointerEvents: active ? undefined : 'none',
                  }}
                >
                  {active ? (
                    <div className="flex shrink-0 flex-wrap items-center gap-3 px-4 pt-3">
                      <span className="type-name text-[30px] leading-none" style={{ color: 'var(--layer-color)' }}>
                        {sheetLabel(l)}
                      </span>
                      <span className="min-w-0 flex-1 text-[13px] text-ink-2">{ROLE[l]}</span>
                      <div className="flex items-center gap-2">
                        {selected.length > 1 && <KeyButton k="G" label={`Crear patrón (${selected.length})`} tone="bone" onClick={makeGroup} />}
                        {selected.length > 1 && selected.every(id => pieceById.has(id)) && (
                          <KeyButton
                            label={`Unir ${selected.length}`}
                            onClick={() => {
                              apply(p => merge(p, selected));
                              setSelected([selected[0]]);
                            }}
                          />
                        )}
                        {suggestions > 0 && (
                          <KeyButton
                            label={suggestions === 1 ? "Confirmar 1 sugerencia" : `Confirmar ${suggestions} sugerencias`}
                            tone="core"
                            onClick={() =>
                              apply(p => {
                                let project = confirmSheet(p, l).project;
                                const log = confirmSheet(p, l).log;
                                for (const r of refsIn(project, l).filter(isSuggestion)) {
                                  const c = confirmRef(project, r.id);
                                  project = c.project;
                                  log.push(...c.log);
                                }
                                return { project, log, message: `${suggestions} sugerencias confirmadas` };
                              })
                            }
                          />
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="h-[44px] shrink-0" />
                  )}
                  <div className="layer-rule mx-4 mt-2 shrink-0" />
                  <div className="mt-2 flex min-h-0 flex-1 flex-col">{layerBody(l, active)}</div>
                </div>
                {/* El rótulo de las capas de atrás nunca se difumina */}
                {!active && (
                  <button
                    type="button"
                    onClick={() => goLayer(l)}
                    aria-label={`Ir a ${sheetLabel(l)}`}
                    className="layer-tag absolute left-3 top-2 z-10 cursor-pointer text-[14px]"
                    style={{ pointerEvents: 'auto' }}
                  >
                    {sheetLabel(l)}
                  </button>
                )}
              </section>
            );
          })}

          {/* Indicador de profundidad */}
          <nav aria-label="Profundidad" className="absolute right-1 top-[130px] z-20 flex w-[48px] flex-col items-center gap-2">
            {([1, 2, 3] as Layer[]).map(l => {
              const on = layer === l;
              return (
                <button
                  key={l}
                  type="button"
                  aria-current={on ? 'true' : undefined}
                  aria-label={sheetLabel(l)}
                  title={sheetLabel(l)}
                  onClick={() => goLayer(l)}
                  className={`${layerInfo(l).className} type-name flex size-[40px] items-center justify-center text-[22px] transition-colors duration-120`}
                  style={on ? { background: 'var(--layer-color)', color: 'var(--layer-ink)' } : { boxShadow: 'inset 0 0 0 2px color-mix(in oklab, var(--layer-color) 55%, transparent)', color: 'var(--layer-color)' }}
                >
                  {l}
                </button>
              );
            })}
            <button type="button" onClick={() => setOutOpen(true)} className="type-label mt-3 text-center text-[9px] leading-tight text-ink-2 hover:text-ink" title="Lo que sacaste del sistema">
              FUERA ({outPieces(project).length})
            </button>
          </nav>

          {outOpen && (
            <OutSheet
              project={project}
              onRestore={id => apply(p => restore(p, id))}
              onClose={() => setOutOpen(false)}
            />
          )}
        </div>

        {/* Panel de referencias */}
        <aside
          aria-label="Panel de referencias"
          data-panel="true"
          className="flex w-[320px] shrink-0 flex-col border-l border-line"
          style={panelHint ? { boxShadow: 'inset 0 0 0 3px var(--color-bone)' } : undefined}
          onDragOver={e => hasRefDrag(e) && e.preventDefault()}
          onDrop={dropOnPanel}
        >
          <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 pb-2 pt-4">
            <span className="type-name text-[22px]">REFERENCIAS · {panel.length}</span>
            <div className="ml-auto flex gap-2">
              <KeyButton label="+ Imágenes" tone="bone" onClick={() => fileRef.current?.click()} />
              <KeyButton label="Por URL" onClick={props.onOpenUpload} />
            </div>
          </div>
          <div data-scroll className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
            {panel.length === 0 ? (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex h-[150px] w-full flex-col items-center justify-center gap-1 border-2 border-dashed border-bone/40 px-4 text-center hover:border-bone"
              >
                <span className="type-name text-[20px]">{refs.length ? 'TODO UBICADO' : 'SOLTÁ IMÁGENES ACÁ'}</span>
                <span className="text-[12px] leading-snug text-ink-2">
                  {refs.length ? 'Sumá más con + IMÁGENES, ⌘V o arrastrando. Caen acá.' : `Arrastrá, pegá con ⌘V o usá + IMÁGENES. Al menos ${MIN_REFS}.`}
                </span>
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {panel.map(r => {
                  const on = selected.includes(r.id);
                  const dim = lit ? !lit.has(r.id) : false;
                  return (
                    <figure
                      key={r.id}
                      className="group relative m-0 cursor-grab"
                      draggable
                      onDragStart={e => {
                        e.dataTransfer.setData(REF_MIME, r.id);
                        e.dataTransfer.effectAllowed = 'move';
                        if (!selected.includes(r.id)) setSelected([r.id]);
                      }}
                      onClick={e => select(r.id, e.shiftKey)}
                      style={{ opacity: dim ? 0.3 : 1, transition: 'opacity 250ms' }}
                    >
                      <Crop image={r.image} fit="cover" alt={r.name} className="aspect-square w-full" style={{ outline: on ? '3px solid var(--color-bone)' : lit && !dim ? '2px solid var(--color-bone)' : undefined, outlineOffset: on ? 2 : 0 }} />
                      {r.isNew && analyzed && <span className="layer-tag layer-3 absolute left-1 top-1 text-[10px]">NUEVA</span>}
                      <button
                        type="button"
                        aria-label={`Quitar ${r.name}`}
                        onClick={e => {
                          e.stopPropagation();
                          props.onDeleteRef(r.id);
                        }}
                        className="type-label absolute right-1 top-1 bg-void/85 px-2 py-[2px] text-[11px] text-ink opacity-0 focus:opacity-100 group-hover:opacity-100"
                      >
                        QUITAR
                      </button>
                      <span className="pointer-events-none absolute bottom-1 left-1 hidden gap-[2px] group-hover:flex">
                        {([1, 2, 3] as Layer[]).map(l => (
                          <button
                            key={l}
                            type="button"
                            aria-label={`Mandar a ${sheetLabel(l)}`}
                            title={`Mandar a ${sheetLabel(l)} [${l}]`}
                            onClick={e => {
                              e.stopPropagation();
                              sendTo([r.id], l);
                            }}
                            className={`${layerInfo(l).className} layer-tag pointer-events-auto text-[11px]`}
                          >
                            {l}
                          </button>
                        ))}
                      </span>
                    </figure>
                  );
                })}
              </div>
            )}
          </div>

          {/* Qué es lo elegido */}
          {(selPiece || selRef) && detailOpen && (
            <Detail piece={selPiece} reference={selRef} project={project} onClose={() => setDetailOpen(false)} />
          )}
          {(selPiece || selRef) && !detailOpen && (
            <button type="button" onClick={() => setDetailOpen(true)} className="type-label shrink-0 border-t border-line px-4 py-2 text-left text-[11px] text-ink-2 hover:text-ink">
              ▸ DE DÓNDE SALE
            </button>
          )}

          <div className="flex shrink-0 flex-col gap-2 border-t border-line px-4 py-3" aria-live="polite">
            {busy && (
              <div className="flex items-center gap-3">
                <span className="spinner text-core" />
                <span className="min-w-0 flex-1 text-[13px] leading-snug">{status}</span>
                <KeyButton k="ESC" label="Cancelar" tone="ghost" onClick={props.onCancelAnalysis} />
              </div>
            )}
            {analysis.status === 'error' && (
              <div role="alert" className="flex flex-col gap-1">
                <span className="text-[13px]">{analysis.message}</span>
                {analysis.detail && (
                  <details className="text-[11px] text-ink-2">
                    <summary className="cursor-pointer">Detalle técnico</summary>
                    <pre className="m-0 mt-1 max-h-24 overflow-auto whitespace-pre-wrap font-mono">{analysis.detail}</pre>
                  </details>
                )}
              </div>
            )}
            <BigButton
              k="⏎"
              label={analysis.status === 'error' ? 'REINTENTAR' : analyzed ? (newRefs ? `ANALIZAR ${newRefs} NUEVAS` : 'ANALIZAR DE NUEVO') : 'ANALIZAR REFERENCIAS'}
              onClick={props.onAnalyze}
              disabled={!canAnalyze}
              hint={!hasIntent ? 'Primero escribí la frase' : missing ? `Subí al menos ${MIN_REFS} referencias (faltan ${missing})` : undefined}
            />
          </div>
        </aside>
      </div>

      {/* Avisos: uno a la vez, arriba de la barra de atajos */}
      {notice ? (
        <NoticeStrip
          notice={notice}
          onDismiss={() => setDismissed(d => [...d, notice.key])}
          onAction={
            notice.action
              ? () => {
                  apply(p => place(p, notice.pieceId, notice.action!.layer));
                  setLayer(notice.action!.layer);
                  setSelected([notice.pieceId]);
                }
              : undefined
          }
        />
      ) : (
        props.toast && <Toast text={props.toast} />
      )}
      {notice && props.toast && <Toast text={props.toast} />}

      <div className="flex shrink-0 items-end gap-4 px-3 pb-3 pt-1">
        <div className="min-w-0 flex-1 [&>div]:p-0">
          <ShortcutBar items={shortcuts.slice(0, 5)} />
        </div>
        <BigButton k="ESPACIO" label="VER SISTEMA" onClick={props.onGoSystem} />
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={e => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) props.onAddFiles(files);
          e.target.value = '';
        }}
      />
      {briefOpen && <BriefPanel brief={project.brief ?? ''} onSave={props.onSaveBrief} onClose={() => setBriefOpen(false)} />}
      {dragOver && (
        <div className="pointer-events-none absolute inset-4 z-30 flex items-center justify-center border-2 border-dashed border-bone bg-void/70">
          <span className="type-name text-[34px]">SOLTÁ · CAEN AL PANEL DE REFERENCIAS</span>
        </div>
      )}

      {dialog?.kind === 'merge' && (
        <MergeDialog
          project={project}
          pieceId={dialog.id}
          onMerge={otherId => {
            apply(p => merge(p, [dialog.id, otherId]));
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'crop' && (
        <CropDialog
          project={project}
          pieceId={dialog.id}
          onSave={(refId, crop) => {
            apply(p => setCover(p, dialog.id, refId, crop));
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'split' && (
        <SplitDialog
          project={project}
          pieceId={dialog.id}
          parts={dialog.parts}
          error={dialog.error}
          onConfirm={parts => {
            apply(p => applySplit(p, dialog.id, parts));
            setDialog(null);
            setSelected([]);
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

/* ---------- Referencia libre en la capa activa (mover y redimensionar) ---------- */

const DEFAULT_POS: LayerPosition = { x: 0.05, y: 0.1, w: 0.16, h: 0.24 };

function FreeRef(props: {
  reference: Reference;
  selected: boolean;
  lit: boolean | null;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  inert?: boolean;
  onSelect?: (additive: boolean) => void;
  onCommit?: (pos: LayerPosition) => void;
  onReturn?: () => void;
  onToLayer?: (l: Layer) => void;
  onTarget?: (t: DropTarget) => void;
  onPanelHint?: (on: boolean) => void;
  onSplit?: () => void;
  splitting?: boolean;
}) {
  const { reference: r, selected } = props;
  const base = r.position ?? DEFAULT_POS;
  const [live, setLive] = useState<LayerPosition | null>(null);
  const drag = useRef<null | { mode: 'move' | 'resize'; px: number; py: number; pos: LayerPosition; moved: boolean }>(null);
  const pos = live ?? base;

  const start = (e: React.PointerEvent, mode: 'move' | 'resize') => {
    if (props.inert || e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, px: e.clientX, py: e.clientY, pos: base, moved: false };
  };
  const moveTo = (e: React.PointerEvent) => {
    const d = drag.current;
    const rect = props.canvasRef.current?.getBoundingClientRect();
    if (!d || !rect) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    if (d.mode === 'move') {
      const t = dropTargetAt(e.clientX, e.clientY);
      props.onTarget?.(t);
      props.onPanelHint?.(t?.kind === 'panel');
    }
    if (d.mode === 'move') {
      setLive({ ...d.pos, x: Math.min(1 - d.pos.w, Math.max(0, d.pos.x + dx / rect.width)), y: Math.min(1 - d.pos.h, Math.max(0, d.pos.y + dy / rect.height)) });
    } else {
      setLive({
        ...d.pos,
        w: Math.min(1 - d.pos.x, Math.max(0.06, d.pos.w + dx / rect.width)),
        h: Math.min(1 - d.pos.y, Math.max(0.08, d.pos.h + dy / rect.height)),
      });
    }
  };
  const end = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const final = live;
    setLive(null);
    if (!d.moved) {
      if (d.mode === 'move') props.onSelect?.(e.shiftKey);
      return;
    }
    if (d.mode === 'move') {
      // Soltada sobre el panel vuelve a él; sobre el borde o rótulo de otra capa, se muda a esa capa.
      props.onTarget?.(null);
      props.onPanelHint?.(false);
      const t = dropTargetAt(e.clientX, e.clientY);
      if (t?.kind === 'panel') return props.onReturn?.();
      if (t?.kind === 'layer') return props.onToLayer?.(t.layer);
    }
    if (final) props.onCommit?.(final);
  };

  return (
    <div
      role="button"
      tabIndex={props.inert ? -1 : 0}
      aria-pressed={selected}
      aria-label={`${r.name}, USUARIO`}
      onPointerDown={e => start(e, 'move')}
      onPointerMove={moveTo}
      onPointerUp={end}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => e.key === 'Enter' && props.onSelect?.(false)}
      className="group absolute touch-none select-none outline-none"
      style={{
        left: `${pos.x * 100}%`,
        top: `${pos.y * 100}%`,
        width: `${pos.w * 100}%`,
        height: `${pos.h * 100}%`,
        zIndex: selected || live ? 5 : 1,
        cursor: props.inert ? undefined : live ? 'grabbing' : 'grab',
        border: '2px solid var(--layer-color)',
        outline: selected ? '3px solid var(--color-bone)' : undefined,
        outlineOffset: 2,
        opacity: props.lit === false ? 0.3 : 1,
        background: 'var(--color-void)',
      }}
    >
      <Crop image={r.image} fit="cover" alt={r.name} className="size-full" />
      <span className="type-label pointer-events-none absolute bottom-0 left-0 bg-bone px-1 text-[10px] text-void">USUARIO</span>
      {!props.inert && (
        <>
          <button
            type="button"
            aria-label={`Devolver ${r.name} al panel`}
            title="Devolver al panel [X]"
            onPointerDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation();
              props.onReturn?.();
            }}
            className="type-label absolute right-0 top-0 bg-void/85 px-[6px] py-[1px] text-[12px] text-ink opacity-0 focus:opacity-100 group-hover:opacity-100"
          >
            X
          </button>
          <button
            type="button"
            aria-label={`Desglosar ${r.name}`}
            title="El agente propone sus partes y las vuelve piezas"
            disabled={props.splitting}
            onPointerDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation();
              props.onSplit?.();
            }}
            className="type-label absolute left-0 top-0 bg-void/85 px-[6px] py-[1px] text-[10px] text-ink opacity-0 focus:opacity-100 group-hover:opacity-100"
          >
            {props.splitting ? 'DESGLOSANDO…' : 'DESGLOSAR'}
          </button>
          <span
            aria-hidden="true"
            onPointerDown={e => start(e, 'resize')}
            className="absolute bottom-0 right-0 size-[14px] cursor-nwse-resize bg-bone opacity-0 group-hover:opacity-90"
            style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}
          />
        </>
      )}
    </div>
  );
}

/* ---------- Miniatura de referencia (en la capa) ---------- */

function RefTile({ reference: r, selected, lit, onSelect }: { reference: Reference; selected: boolean; lit: boolean | null; onSelect: (additive: boolean) => void }) {
  const suggestion = isSuggestion(r);
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${r.name}, ${r.origin === 'user' ? 'USUARIO' : suggestion ? 'AGENTE · SUGERENCIA' : 'AGENTE'}`}
      onClick={e => {
        e.stopPropagation();
        onSelect(e.shiftKey);
      }}
      className="relative size-[64px] shrink-0 p-0 outline-none"
      style={{
        border: `${r.origin === 'user' ? 2 : 1}px ${suggestion ? 'dashed' : 'solid'} var(--layer-color)`,
        outline: selected ? '3px solid var(--color-bone)' : undefined,
        outlineOffset: 2,
        opacity: lit === false ? 0.3 : 1,
      }}
    >
      <Crop image={r.image} fit="cover" alt={r.name} className="size-full" />
      {r.origin === 'user' && <span className="type-label absolute bottom-0 left-0 bg-bone px-[3px] text-[8px] text-void">USUARIO</span>}
    </button>
  );
}

/** Pieza en una capa de atrás: solo la imagen. */
function PieceThumb({ piece, project }: { piece: Pattern; project: Project }) {
  return <PieceImage piece={piece} project={project} className="aspect-[4/3] w-full" />;
}

/* ---------- Patrón (grupo con nombre) ---------- */

function GroupBox(props: {
  group: PatternGroup;
  layer: Layer;
  project: Project;
  editing: string | null;
  menuOpen: boolean;
  onEdit: (v: string) => void;
  onEditDone: (commit: boolean) => void;
  onMenu: () => void;
  onUngroup: () => void;
  onMoveTo: (l: Layer) => void;
  renderMember: (id: string) => React.ReactNode;
}) {
  const { group: g } = props;
  return (
    <section aria-label={`Patrón ${g.name}`} className="relative mb-3 flex flex-col gap-2 p-2" style={{ border: '2px solid var(--layer-color)' }}>
      <div className="flex items-center gap-2">
        {props.editing !== null ? (
          <input
            autoFocus
            aria-label="Nombre del patrón"
            value={props.editing}
            onChange={e => props.onEdit(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') props.onEditDone(true);
              if (e.key === 'Escape') props.onEditDone(false);
            }}
            onBlur={() => props.onEditDone(true)}
            className="type-name min-w-0 flex-1 border-b-2 border-bone bg-transparent text-[20px] text-ink outline-none"
          />
        ) : (
          <button type="button" onClick={() => props.onEdit(g.name)} title="Renombrar" className="type-name min-w-0 flex-1 truncate text-left text-[20px] hover:text-core">
            {g.name}
          </button>
        )}
        <OriginTag origin={g.origin} confirmed />
        <KeyButton label="···" tone="ghost" title="Más opciones" onClick={props.onMenu} />
      </div>
      <span className="font-mono text-[11px] text-ink-2">
        PATRÓN · {g.memberIds.length} elementos · {g.evidence.length} referencias
      </span>
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
        {g.memberIds.map(id => (
          <React.Fragment key={id}>{props.renderMember(id)}</React.Fragment>
        ))}
      </div>
      {props.menuOpen && (
        <ul role="menu" aria-label={`Opciones de ${g.name}`} className="absolute right-2 top-9 z-20 m-0 flex w-[200px] list-none flex-col border-2 border-bone bg-void p-1">
          <li role="none">
            <button type="button" role="menuitem" autoFocus onClick={() => props.onEdit(g.name)} className="type-label w-full px-2 py-2 text-left text-[12px] hover:bg-bone hover:text-void focus:bg-bone focus:text-void">
              Renombrar
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" onClick={props.onUngroup} className="type-label w-full px-2 py-2 text-left text-[12px] hover:bg-bone hover:text-void focus:bg-bone focus:text-void">
              Desagrupar
            </button>
          </li>
          {([1, 2, 3] as Layer[])
            .filter(l => l !== g.layer)
            .map(l => (
              <li key={l} role="none">
                <button type="button" role="menuitem" onClick={() => props.onMoveTo(l)} className="type-label w-full px-2 py-2 text-left text-[12px] hover:bg-bone hover:text-void focus:bg-bone focus:text-void">
                  Mover a {SHEET_NAME[l]}
                </button>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}

/* ---------- Detalle del elemento elegido ---------- */

function Detail({ piece, reference, project, onClose }: { piece: Pattern | null; reference: Reference | null; project: Project; onClose: () => void }) {
  const name = piece?.name ?? reference?.name ?? '';
  const origin = piece ? piece.origin : reference?.origin;
  const confirmed = piece ? piece.confirmed : reference?.confirmed;
  const layer = piece?.layer ?? reference?.layer;
  const sources = piece ? piece.evidence.map(id => project.references.find(r => r.id === id)).filter((r): r is Reference => !!r) : [];
  return (
    <section aria-label={`Detalle de ${name}`} className="flex max-h-[44%] shrink-0 flex-col gap-2 overflow-y-auto border-t border-line px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <span className="type-name text-[22px] leading-[0.95]">{name}</span>
        <button type="button" aria-label="Cerrar detalle" onClick={onClose} className="type-label text-[16px] text-ink-2 hover:text-ink">
          ×
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {origin ? <OriginTag origin={origin} confirmed={confirmed} /> : <span className="font-mono text-[11px] text-ink-2">SIN UBICAR</span>}
        {isLayer(layer) && <span className="font-mono text-[11px] text-ink-2">{sheetLabel(layer)}</span>}
        {piece && isLayer(piece.layer) && <span className="font-mono text-[11px] text-ink-2">PESO {pieceWeight(piece)}</span>}
      </div>
      {piece && <span className="font-mono text-[12px] text-ink-2">{evidenceText(piece, project)}</span>}
      {piece?.description && <p className="m-0 text-[13px] leading-[1.4] text-ink-2">{piece.description}</p>}
      {sources.length > 0 && (
        <>
          <span className="type-label text-[11px] text-ink-2">DE DÓNDE SALE</span>
          <div className="grid grid-cols-4 gap-1">
            {sources.map(r => (
              <Crop key={r.id} image={r.image} fit="cover" alt={r.name} className="aspect-square w-full" />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/* ---------- Fuera del sistema ---------- */

function OutSheet({ project, onRestore, onClose }: { project: Project; onRestore: (id: string) => void; onClose: () => void }) {
  const out = outPieces(project);
  return (
    <div className="absolute inset-y-0 left-0 right-[64px] z-30 flex flex-col overflow-y-auto bg-void p-5" role="region" aria-label="Fuera del sistema">
      <div className="mb-4 flex items-baseline gap-3">
        <span className="type-name text-[30px]">FUERA DEL SISTEMA</span>
        <span className="text-[14px] text-ink-2">Lo que sacaste. Se puede recuperar.</span>
        <span className="ml-auto">
          <KeyButton label="Cerrar" onClick={onClose} />
        </span>
      </div>
      {!out.length && <span className="text-[15px] text-ink-2">Nada por ahora.</span>}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        {out.map(x => (
          <div key={x.id} className="flex flex-col gap-2 border-2 border-line-strong p-2 opacity-80">
            <PieceImage piece={x} project={project} className="aspect-[4/3] w-full" style={{ filter: 'grayscale(1)' }} />
            <span className="type-name text-[20px]">{x.name}</span>
            <span className="font-mono text-[12px] text-ink-2">{evidenceText(x, project)}</span>
            <KeyButton label="Recuperar" onClick={() => onRestore(x.id)} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Tarjeta de pieza ---------- */

type MenuAction = 'merge' | 'split' | 'rename' | 'crop';

interface PieceCardProps {
  drag?: {
    draggable: boolean;
    mark: 'left' | 'right' | null;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: () => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
  piece: Pattern;
  project: Project;
  layer: Layer;
  selected: boolean;
  lit: boolean | null;
  menuOpen: boolean;
  renaming: string | null;
  onSelect: (additive: boolean) => void;
  onConfirm: () => void;
  onUp: () => void;
  onDown: () => void;
  onOut: () => void;
  onMenu: () => void;
  onRenameChange: (v: string) => void;
  onRenameDone: (commit: boolean) => void;
  onAction: (a: MenuAction) => void;
}

function PieceCard(props: PieceCardProps) {
  const { piece, project, layer, selected } = props;
  const suggestion = isSuggestion(piece);
  const user = piece.origin === 'user';
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${piece.name}, ${user ? 'USUARIO' : suggestion ? 'AGENTE · SUGERENCIA' : 'AGENTE'}, ${evidenceText(piece, project)}`}
      onClick={e => {
        e.stopPropagation();
        props.onSelect(e.shiftKey);
      }}
      onKeyDown={e => {
        if (e.key === 'Enter' && e.target === e.currentTarget && !selected) {
          e.preventDefault();
          props.onSelect(false);
        }
      }}
      className="group relative flex flex-col gap-1 p-2 text-left outline-none"
      draggable={props.drag?.draggable}
      onDragStart={props.drag?.onDragStart}
      onDragEnd={props.drag?.onDragEnd}
      onDragOver={props.drag?.onDragOver}
      onDrop={props.drag?.onDrop}
      title={props.drag ? 'Arrastrá a izquierda o derecha para cambiar su prioridad' : undefined}
      style={{
        boxShadow: props.drag?.mark === 'left' ? '-6px 0 0 0 var(--color-bone)' : props.drag?.mark === 'right' ? '6px 0 0 0 var(--color-bone)' : undefined,
        // USUARIO: borde lleno. AGENTE · SUGERENCIA: borde fino punteado.
        border: `${user ? 3 : suggestion ? 1 : 2}px ${suggestion ? 'dashed' : 'solid'} ${suggestion ? 'color-mix(in oklab, var(--layer-color) 75%, transparent)' : 'var(--layer-color)'}`,
        outline: selected ? '3px solid var(--color-bone)' : undefined,
        outlineOffset: 3,
        opacity: props.lit === false ? 0.4 : 1,
      }}
    >
      <PieceImage piece={piece} project={project} className="aspect-[4/3] w-full" style={suggestion ? { opacity: 0.85 } : undefined} />
      <div className="flex items-start justify-between gap-1">
        {props.renaming !== null ? (
          <input
            autoFocus
            aria-label="Nuevo nombre"
            value={props.renaming}
            onClick={e => e.stopPropagation()}
            onChange={e => props.onRenameChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') props.onRenameDone(true);
              if (e.key === 'Escape') props.onRenameDone(false);
            }}
            onBlur={() => props.onRenameDone(true)}
            className="type-name w-full border-b-2 border-bone bg-transparent text-[18px] text-ink outline-none"
          />
        ) : (
          <span className="type-name text-[18px] leading-[0.95]">{piece.name}</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <OriginTag origin={piece.origin} confirmed={piece.confirmed} />
        <span className="font-mono text-[11px] text-ink-2">{evidenceText(piece, project)}</span>
      </div>

      {/* Acciones visibles: al pasar el mouse o con la pieza elegida */}
      <div className={`flex flex-wrap gap-1 ${selected ? '' : 'hidden group-hover:flex group-focus-within:flex'}`}>
        {suggestion && <KeyButton k="⏎" label="Confirmar" tone="core" onClick={props.onConfirm} />}
        <KeyButton k="↑" label="Subir" onClick={props.onUp} disabled={layer === 1} />
        <KeyButton k="↓" label="Bajar" onClick={props.onDown} disabled={layer === 3} />
        <KeyButton k="X" label="Sacar" tone="ghost" onClick={props.onOut} />
        <KeyButton label="···" tone="ghost" title="Más opciones" onClick={props.onMenu} />
      </div>
      {props.menuOpen && (
        <ul role="menu" aria-label={`Opciones de ${piece.name}`} className="absolute bottom-2 right-2 z-20 m-0 flex w-[200px] list-none flex-col border-2 border-bone bg-void p-1">
          {(
            [
              ['merge', 'Unir con…'],
              ['split', 'Separar (el agente propone)'],
              ['rename', 'Renombrar'],
              ['crop', 'Recortar de nuevo'],
            ] as [MenuAction, string][]
          ).map(([a, label]) => (
            <li key={a} role="none">
              <button
                type="button"
                role="menuitem"
                autoFocus={a === 'merge'}
                onClick={e => {
                  e.stopPropagation();
                  props.onAction(a);
                }}
                className="type-label w-full px-2 py-2 text-left text-[12px] hover:bg-bone hover:text-void focus:bg-bone focus:text-void"
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
