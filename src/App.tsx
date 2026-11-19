import { useCallback, useEffect, useRef, useState } from 'react';
import { Layer, LogItem, LogKind, Moment, Project, Reference, ReferenceBreakdown } from './types';
import { loadStoredProjects, saveProjects } from './utils/projectStore';
import { createEmptyProject } from './data/emptyProject';
import { compressImageString } from './utils/imageCompressor';
import { deleteProjectPieces } from './utils/pieceStore';
import { buildBackup, downloadBackup, restoreBackup } from './utils/backup';
import { clearBreakdownCache, clearCachedBreakdown, clearProjectBreakdowns, getCachedBreakdown, setCachedBreakdown } from './utils/inspectorCache';
import { downloadProjectMarkdown } from './utils/exportHelpers';
import { filesToReferences, makeFeedback, makeLog, migrateProject, nextReferenceIds, withLog } from './utils/project';
import { corpusRefs } from './utils/layers';
import { stackOrder } from './utils/layerRules';
import { applyTheme } from './utils/camaleon';
import { DEFAULT_PALETTE, DetectedColor, buildTheme, colorName, derivePalette, oklchToHex, parseColor } from './utils/derivePalette';
import { RefColorMap, colorPieces, detectColors, pieceBaseColor } from './utils/detectColors';
import { ColorContext, ColorCtx, RoleColor, RoleKey } from './screens/colorContext';
import { useShortcuts } from './hooks/useAuditShortcuts';

import { Button } from './components/ui';
import { SaveState, StatusBar, StatusLine, TopBar } from './components/shell/TopBar';
import { StepRail, StageNav } from './components/shell/StepRail';
import { NoticeData, Notices } from './components/shell/Notices';
import { UploadModal } from './components/UploadModal';
import { AboutView } from './components/AboutView';
import { ProbarScreen } from './screens/ProbarScreen';
import { LogDrawer } from './components/LogDrawer';
import { Modal } from './components/shell/Modal';

import { ActionResult, MIN_REFS, livePieces, mergeAnalysis, suggestions } from './pieces/model';
import { AnalysisState, buildAnalysisBody, canOpen, friendlyError } from './pieces/analyze';
import { ReferencesScreen } from './screens/ReferencesScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { LayersScreen } from './screens/LayersScreen';
import { SystemScreen } from './screens/SystemScreen';
import { ExampleBanner, Guide, guideDone } from './screens/Guide';
import { BriefPanel } from './screens/common';
import { MutateOptions, NotifyOptions } from './screens/types';
import { DEMO_ID, buildDemo, demoRequested } from './utils/demo';
import { clearTestLog, downloadTestLog, logEvent, setLogStage, testMode } from './utils/testLog';
import { useViewport } from './hooks/useViewport';
import { STEPS, blockReason, isAnalyzed, locationText, stepIndex, stepLabel } from './utils/steps';

/** Claves viejas de localStorage que ya no se usan (los proyectos pasaron a IndexedDB). */
const DISCARDED_KEYS = [
  'emergent_projects_list_v4',
  'emergent_active_project_v4',
  'emergent_visual_system_project_v3',
  'emergent_visual_system_project_v2',
  'emergent_visual_system_project_v1',
  'emergent_visual_system_project',
  'emergent_user_brief_confirmed',
  'emergent_visual_system_projects_store_v4',
  'tesis_legacy_view',
];

type Overlay = null | { kind: 'about' };

interface Boot {
  projects: Project[];
  activeId: string;
}

/** Proyecto de ejemplo (Badder): el archivo estático o, si no está, el backend local. */
async function fetchExample(): Promise<string> {
  let res = await fetch('/ejemplo.json');
  if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) res = await fetch('/api/example-project');
  if (!res.ok) throw new Error('No se encontró el proyecto de ejemplo');
  return res.text();
}

/**
 * Carga los proyectos de IndexedDB antes de mostrar la app.
 * Si no hay ninguno (primera vez), abre el ejemplo ya analizado, en 02 ORDENAR.
 */
export default function App() {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { projects, activeId } = await loadStoredProjects();
      try {
        if (DISCARDED_KEYS.some(k => localStorage.getItem(k) !== null)) {
          DISCARDED_KEYS.forEach(k => localStorage.removeItem(k));
          clearBreakdownCache();
        }
      } catch {
        /* sin localStorage: no hay nada viejo que limpiar */
      }
      if (demoRequested()) {
        // ?demo=badder: todos los participantes empiezan igual. Si ya hay una sesión de demo, se sigue en ella.
        const list = projects.map(migrateProject);
        if (!list.some(p => p.id === DEMO_ID)) {
          try {
            list.push(await buildDemo(await fetchExample()));
          } catch {
            /* sin ejemplo: se sigue con lo que haya */
          }
        }
        if (list.length) {
          setBoot({ projects: list, activeId: list.some(p => p.id === DEMO_ID) ? DEMO_ID : list[0].id });
          return;
        }
      }
      if (projects.length) {
        const list = projects.map(migrateProject);
        setBoot({ projects: list, activeId: activeId && list.some(p => p.id === activeId) ? activeId : list[0].id });
        return;
      }
      try {
        const { project } = await restoreBackup(await fetchExample(), []);
        const example = { ...project, example: true, moment: 'referencias' as Moment };
        setBoot({ projects: [example], activeId: example.id });
      } catch {
        const p = createEmptyProject();
        setBoot({ projects: [p], activeId: p.id });
      }
    })().catch(e => setError(String(e?.message || e)));
  }, []);
  if (error) {
    return (
      <div role="alert" className="flex h-full items-center justify-center p-6 text-center text-[15px]">
        No se pudieron leer los proyectos guardados en este navegador ({error}).
      </div>
    );
  }
  if (!boot) return <div className="type-label flex h-full items-center justify-center text-[13px] text-ink-2">CARGANDO…</div>;
  return <Workspace boot={boot} />;
}

const serverError = (text: string, status: number) =>
  Object.assign(new Error(text.trim().startsWith('<') ? 'El servidor corre una versión anterior: reiniciá iniciar.bat.' : `El servidor no respondió (HTTP ${status}).`), { detail: text.slice(0, 600) });

/** Un color (hex u oklch) como hex. */
const asHex = (c: string) => {
  const o = c.startsWith('#') ? null : parseColor(c);
  return o ? oklchToHex(o) : c.toUpperCase();
};

/** Agrega un elemento a una lista sin repetir. */
const addTo = <T,>(list: T[] | undefined, v: T): T[] => (list?.includes(v) ? list : [...(list ?? []), v]);

const MAX_HISTORY = 40;

function Workspace({ boot }: { boot: Boot }) {
  const viewport = useViewport();
  /* ========== Proyectos ========== */
  const [projectsList, setProjectsList] = useState<Project[]>(boot.projects);
  const [activeProjectId, setActiveProjectId] = useState<string>(boot.activeId);
  const project = projectsList.find(p => p.id === activeProjectId) ?? projectsList[0];
  const projectRef = useRef(project);
  projectRef.current = project;

  /** Actualiza un proyecto por ID (por defecto el activo). */
  const updateProject = useCallback(
    (fn: (p: Project) => Project, id?: string) => {
      const target = id ?? activeProjectId;
      setProjectsList(list => list.map(p => (p.id === target ? fn(p) : p)));
    },
    [activeProjectId],
  );

  /* ========== Guardado real (IndexedDB) y su indicador ========== */
  const [saveFailed, setSaveFailed] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const saved = useRef(new Map<string, Project>());
  const firstSave = useRef(true);
  useEffect(() => {
    if (firstSave.current) {
      // Lo que se cargó ya está guardado: no es un cambio.
      firstSave.current = false;
      saved.current = new Map(projectsList.map(p => [p.id, p]));
      return;
    }
    const changed = new Set(projectsList.filter(p => saved.current.get(p.id) !== p).map(p => p.id));
    if (!changed.size) return;
    setSaveState('saving');
    const started = Date.now();
    let cancelled = false;
    const t = setTimeout(() => {
      saveProjects(projectsList, activeProjectId, changed)
        .then(() => {
          saved.current = new Map(projectsList.map(p => [p.id, p]));
          setSaveFailed(false);
          // «Guardando…» se ve al menos 800 ms después del cambio.
          const wait = Math.max(0, 800 - (Date.now() - started));
          setTimeout(() => !cancelled && setSaveState('saved'), wait);
        })
        .catch(e => {
          console.warn('No se pudo guardar el proyecto', e);
          setSaveFailed(true);
          if (!cancelled) setSaveState('error');
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [projectsList, activeProjectId]);

  /* ========== Avisos ========== */
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const undoRef = useRef<() => void>(() => {});
  const notify = useCallback((text: string, o: NotifyOptions = {}) => {
    if (o.tone === 'error') logEvent('error_shown', { message: text });
    const action = o.undo ? { label: 'Deshacer', run: () => undoRef.current() } : o.action;
    setNotice({ id: Date.now() + Math.random(), text, detail: o.detail, tone: o.tone, action });
  }, []);
  useEffect(() => {
    if (saveFailed) notify('No se pudo guardar el proyecto en este navegador: descargá el respaldo desde el menú del proyecto.', { tone: 'error' });
  }, [saveFailed, notify]);

  /* ========== Historial global: deshacer (Ctrl/Cmd+Z), hasta 40 pasos ========== */
  const undoStack = useRef<(() => void)[]>([]);
  const pushUndo = useCallback((fn: () => void) => {
    undoStack.current.push(fn);
    if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
  }, []);
  const undo = useCallback(() => {
    const fn = undoStack.current.pop();
    logEvent('undo', { empty: !fn });
    if (!fn) {
      notify('No hay nada para deshacer.');
      return;
    }
    fn();
  }, [notify]);
  undoRef.current = undo;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      e.preventDefault();
      undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo]);

  /** Deshace un cambio de piezas, referencias o tablero: vuelve a esa instantánea sin tocar lo demás. */
  const restoreFrom = useCallback(
    (snap: Project) => () =>
      updateProject(
        p => ({
          ...p,
          references: snap.references,
          patterns: snap.patterns,
          patternGroups: snap.patternGroups,
          fragments: snap.fragments,
          reviewTotal: snap.reviewTotal,
          done: snap.done,
          stale: snap.stale,
          roleColors: snap.roleColors,
          lastAnalyzedAt: snap.lastAnalyzedAt,
          status: snap.status,
        }),
        snap.id,
      ),
    [updateProject],
  );

  /** Quita de «desactualizadas» la etapa que se acaba de revisitar y marca las visitadas si cambiaron las piezas. */
  const markStale = (p: Project): Project => {
    const stale = (['sistema', 'probar'] as Moment[]).filter(m => p.visited?.includes(m));
    return stale.length ? { ...p, stale: [...new Set([...(p.stale ?? []), ...stale])] } : p;
  };

  /** Todo cambio del proyecto pasa por acá: historial, desactualizadas y aviso con «Deshacer». */
  const commit = useCallback(
    (cur: Project, next: Project, o: MutateOptions = {}) => {
      if (next === cur) return;
      let n = next;
      if (!o.silent && n.patterns !== cur.patterns) n = markStale(n);
      if (o.undoable !== false) pushUndo(restoreFrom(cur));
      projectRef.current = n;
      updateProject(() => n, cur.id);
      if (o.notice) notify(o.notice, { undo: o.undoable !== false });
    },
    [pushUndo, restoreFrom, updateProject, notify],
  );

  const mutate = useCallback((fn: (p: Project) => Project, o: MutateOptions = {}) => commit(projectRef.current, fn(projectRef.current), o), [commit]);

  /** Aplica una acción del modelo (con su bitácora). El aviso lleva «Deshacer». */
  const apply = (fn: (p: Project) => ActionResult, noticeText?: string | false): ActionResult => {
    const current = projectRef.current;
    const r = fn(current);
    if (r.project === current && !r.log.length) {
      if (r.message && noticeText !== false) notify(r.message);
      return r;
    }
    const next = withLog(r.project, ...r.log.map(l => makeLog(l.kind, l.targetId, l.label, l.reason)));
    commit(current, next, { notice: noticeText === false ? undefined : noticeText ?? r.message });
    return r;
  };

  /* ========== Etapas ========== */
  const screen: Moment = STEPS.some(s => s.id === project.moment) ? (project.moment as Moment) : 'referencias';
  const screenRef = useRef(screen);
  screenRef.current = screen;
  useEffect(() => {
    setLogStage(screen);
    logEvent('stage_enter', { from: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /** Entra a una etapa: recuerda la más avanzada, la marca visitada y limpia su aviso de «desactualizada». */
  const enter = (m: Moment, markDone?: Moment) => {
    if (m !== screenRef.current) {
      logEvent('stage_leave', { to: m });
      setLogStage(m);
      logEvent('stage_enter', { from: screenRef.current });
    }
    updateProject(p => ({
      ...p,
      moment: m,
      reached: Math.max(p.reached ?? 0, stepIndex(m)),
      visited: addTo(p.visited, m),
      stale: (p.stale ?? []).filter(s => s !== m),
      done: markDone && (markDone === 'capas' || markDone === 'sistema') ? addTo(p.done, markDone) : p.done,
    }));
  };
  const go = (m: Moment, markDone?: Moment) => {
    const why = blockReason(projectRef.current, m);
    if (why) {
      notify(why);
      return;
    }
    enter(m, markDone);
  };
  // 05 PROBAR queda montada (oculta) una vez abierta: si cambiás de etapa con una generación en curso, no se corta ni se pierde el resultado.
  const [probarSeen, setProbarSeen] = useState<string | null>(null);
  useEffect(() => {
    if (screen === 'probar') setProbarSeen(project.id);
  }, [screen, project.id]);
  // La etapa en la que se abre el proyecto también cuenta como visitada.
  useEffect(() => {
    updateProject(p => (p.visited?.includes(screen) && (p.reached ?? 0) >= stepIndex(screen) ? p : { ...p, reached: Math.max(p.reached ?? 0, stepIndex(screen)), visited: addTo(p.visited, screen) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  /* ========== UI ========== */
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [deleteRequest, setDeleteRequest] = useState<null | 'current' | 'all'>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [focusRef, setFocusRef] = useState<{ id: string; n: number } | null>(null);
  const [capaName, setCapaName] = useState('Núcleo');
  const [goLayer, setGoLayer] = useState<{ layer: Layer; n: number } | null>(null);
  const [probarType, setProbarType] = useState('logotipo');
  const [probarActivity, setProbarActivity] = useState<string | null>(null);
  useEffect(() => {
    if (screen === 'referencias' && project.references.length && !guideDone()) setGuideOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, project.id]);

  /** Agrega entradas a la bitácora del proyecto. */
  const addLog = useCallback(
    (kind: LogKind, targetId: string, label: string, reason?: string, opts: { feedbackId?: string; projectId?: string } = {}): LogItem => {
      const item = makeLog(kind, targetId, label, reason, opts.feedbackId);
      updateProject(p => ({ ...p, log: [...(p.log ?? []), item] }), opts.projectId);
      return item;
    },
    [updateProject],
  );

  /* ========== Proyectos: acciones ========== */
  const analysisAbort = useRef<AbortController | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisState>({ status: 'idle' });
  const resetUi = () => {
    analysisAbort.current?.abort();
    setOverlay(null);
    setAnalysis({ status: 'idle' });
    undoStack.current = [];
    setNotice(null);
    setBriefOpen(false);
    setProbarActivity(null);
  };

  const handleSelectProject = (id: string) => {
    if (!projectsList.some(x => x.id === id)) return;
    setActiveProjectId(id);
    resetUi();
  };

  const handleNewProject = () => {
    const p = createEmptyProject();
    setProjectsList(list => [...list, p]);
    setActiveProjectId(p.id);
    resetUi();
  };

  const handleExportBackup = async () => {
    const p = projectRef.current;
    notify('Preparando el respaldo…');
    try {
      const { backup, webMissing } = await buildBackup(p);
      const at = backup.exportedAt;
      downloadBackup({ ...backup, project: { ...backup.project, lastBackupAt: at } });
      updateProject(x => ({ ...x, lastBackupAt: at }), p.id);
      notify(`Respaldo descargado · ${p.references.length} referencias${webMissing ? ` · ${webMissing} de la web quedaron como link` : ''}`);
    } catch (err: any) {
      notify(`No se pudo armar el respaldo: ${err?.message || err}`, { tone: 'error' });
    }
  };

  const importBackupText = async (text: string, example = false) => {
    const { project: imported } = await restoreBackup(text, projectsList.map(x => x.id));
    const p = example ? { ...imported, example: true, moment: 'referencias' as Moment } : imported;
    // Un proyecto vacío de relleno se reemplaza por el importado.
    const isBlank = (x: Project) => !x.name.trim() && !x.intent?.trim() && !x.references.length && !x.patterns.length;
    setProjectsList(list => [...list.filter(x => !isBlank(x)), p]);
    setActiveProjectId(p.id);
    resetUi();
    notify(`Proyecto abierto · ${p.name || 'sin nombre'} · ${p.references.length} referencias`);
  };

  const handleImportBackup = async (file: File) => {
    try {
      await importBackupText(await file.text());
    } catch (err: any) {
      notify(err?.message || 'No se pudo importar el respaldo', { tone: 'error' });
    }
  };

  const handleLoadExample = async () => {
    notify('Abriendo el proyecto de ejemplo…');
    try {
      await importBackupText(await fetchExample(), true);
    } catch (err: any) {
      notify(err?.message || 'No se pudo abrir el ejemplo', { tone: 'error' });
    }
  };

  const handleDeleteProjects = (ids: string[]) => {
    const remaining = projectsList.filter(p => !ids.includes(p.id));
    const next = remaining.length ? remaining : [createEmptyProject()];
    ids.forEach(clearProjectBreakdowns);
    ids.forEach(deleteProjectPieces);
    setProjectsList(next);
    if (ids.includes(activeProjectId)) {
      setActiveProjectId(next[0].id);
      resetUi();
    }
    setDeleteRequest(null);
    notify(ids.length === 1 ? 'Proyecto eliminado' : `${ids.length} proyectos eliminados`);
  };

  /* ========== 01 · REFERENCIAS ========== */
  const [briefBusy, setBriefBusy] = useState(false);
  /** El agente redacta el brief a partir de la frase. Queda como borrador editable. */
  const handleSubmitIntent = async (intent: string) => {
    const projectId = projectRef.current.id;
    updateProject(p => ({ ...p, intent, name: p.name.trim() ? p.name : intent, objective: p.objective.trim() ? p.objective : intent }), projectId);
    addLog('brief', 'brief', 'Frase de intención', intent, { projectId });
    setBriefBusy(true);
    try {
      const res = await fetch('/api/draft-brief', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ intent }) });
      const text = await res.text();
      let result: any;
      try {
        result = JSON.parse(text);
      } catch {
        throw serverError(text, res.status);
      }
      if (!res.ok || !result.success) throw new Error(result.details || result.error || 'No se pudo redactar el brief');
      const d = result.data;
      updateProject(p => ({ ...p, name: p.name.trim() && p.name !== intent ? p.name : d.name || intent, objective: d.objective || p.objective, description: d.brief || p.description, brief: d.brief || p.brief }), projectId);
      addLog('brief', 'brief', 'Brief redactado por el sistema', 'Borrador: el diseñador lo puede editar', { projectId });
    } catch (err: any) {
      const raw = String(err?.message || err);
      notify('El brief queda para después.', { tone: 'error', detail: friendlyError(err instanceof TypeError ? 'failed to fetch' : raw).replace('No se pudo analizar. ', '') });
    } finally {
      setBriefBusy(false);
    }
  };

  const handleSaveBrief = (text: string) => {
    updateProject(p => ({ ...p, brief: text, description: text }));
    addLog('brief', 'brief', 'Brief editado por el diseñador');
  };

  const handleAddReferences = useCallback(
    (refs: Reference[]) => {
      if (!refs.length) return;
      mutate(p => ({ ...p, references: [...p.references, ...refs] }), { notice: refs.length === 1 ? 'Agregaste una referencia.' : `Agregaste ${refs.length} referencias.` });
    },
    [mutate],
  );

  const handleAddFiles = useCallback(
    async (files: File[]) => {
      const refs = await filesToReferences(files, projectRef.current.references);
      if (!refs.length) {
        notify('Solo se aceptan imágenes.');
        return;
      }
      handleAddReferences(refs);
    },
    [handleAddReferences, notify],
  );

  /** Una imagen por URL: se prueba antes de sumarla. Si no abre, se avisa y se puede reintentar. */
  const addUrlRef = useRef<(url: string, extra?: { name?: string; tags?: string[]; notes?: string }) => Promise<void>>(async () => {});
  const handleAddUrl = async (url: string, extra: { name?: string; tags?: string[]; notes?: string } = {}) => {
    if (!(await canOpen(url))) {
      notify('No pudimos abrir esa dirección.', { tone: 'error', detail: 'Revisá que sea el link directo a una imagen (termina en .jpg, .png o .webp).', action: { label: 'Reintentar', run: () => void addUrlRef.current(url, extra) } });
      return;
    }
    const [id] = nextReferenceIds(projectRef.current.references, 1);
    const last = decodeURIComponent(url.split('?')[0].split('/').pop() || '').replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim();
    handleAddReferences([
      {
        id,
        name: extra.name?.trim() || last || `Referencia web ${id.replace('ref_', '')}`,
        image: url,
        createdAt: new Date().toISOString(),
        tags: extra.tags?.length ? extra.tags : ['Web'],
        notes: extra.notes?.trim() || undefined,
        isNew: true,
      },
    ]);
  };
  addUrlRef.current = handleAddUrl;

  /** Quita una referencia: sale de las piezas que la citaban. Se puede deshacer. */
  const handleDeleteReference = (id: string) => {
    const p = projectRef.current;
    const ref = p.references.find(r => r.id === id);
    if (!ref) return;
    apply(
      cur => ({
        project: {
          ...cur,
          references: cur.references.filter(r => r.id !== id),
          patterns: cur.patterns.map(x => ({ ...x, evidence: x.evidence.filter(e => e !== id), cover: x.cover?.refId === id ? undefined : x.cover })),
          systems: cur.systems.map(s => ({ ...s, referenceIds: s.referenceIds.filter(r => r !== id) })),
        },
        log: [{ kind: 'discard', targetId: id, label: `Referencia quitada · ${ref.name}` }],
      }),
      'Borraste una referencia.',
    );
    clearCachedBreakdown(p.id, id);
  };

  /* ---------- ANALIZAR: una sola llamada que recorta, junta, cuenta y sugiere hoja ---------- */
  const analyzeRef = useRef<() => Promise<void>>(async () => {});
  const handleAnalyze = async () => {
    const p = projectRef.current;
    if (analysis.status === 'preparing' || analysis.status === 'reading') return;
    if (corpusRefs(p).length < MIN_REFS) {
      notify(`Para analizar hacen falta al menos ${MIN_REFS} referencias.`);
      return;
    }
    const controller = new AbortController();
    analysisAbort.current = controller;
    setAnalysis({ status: 'preparing', done: 0, total: corpusRefs(p).length });
    try {
      const { skipped, ...body } = await buildAnalysisBody(p, (done, total) => setAnalysis({ status: 'preparing', done, total }), controller.signal);
      if (!body.references.length) throw new Error('Ninguna de las imágenes se pudo leer.');
      setAnalysis({ status: 'reading', total: body.references.length, since: Date.now() });
      const res = await fetch('/api/analyze-references', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify(body) });
      const text = await res.text();
      let result: any;
      try {
        result = JSON.parse(text);
      } catch {
        throw serverError(text, res.status);
      }
      if (!res.ok || !result.success) throw Object.assign(new Error(result.error || result.details || 'El servicio de análisis no respondió'), { detail: result.error || result.details });
      const detected: any[] = result.data?.patterns ?? [];
      const bad = new Set(skipped);
      let pieces = 0;
      apply(cur => {
        const m = mergeAnalysis(cur, detected);
        pieces = suggestions(m.project).length;
        return {
          project: {
            ...m.project,
            moment: 'referencias',
            reviewTotal: pieces,
            references: m.project.references.map(r => (bad.has(r.id) ? { ...r, broken: true } : r.broken ? { ...r, broken: undefined } : r)),
          },
          log: [{ kind: 'induce', targetId: 'referencias', label: `Análisis · ${corpusRefs(cur).length} referencias`, reason: `${m.added} piezas nuevas · ${m.updated} actualizadas` }],
        };
      }, false);
      setAnalysis({ status: 'idle' });
      if (bad.size) {
        const first = skipped[0];
        notify(`Se encontraron ${pieces} ${pieces === 1 ? 'pieza' : 'piezas'}. ${bad.size} ${bad.size === 1 ? 'imagen no se pudo leer' : 'imágenes no se pudieron leer'} (archivo dañado).`, {
          action: {
            label: 'Ver cuál',
            run: () => {
              enter('referencias');
              setFocusRef({ id: first, n: Date.now() });
            },
          },
        });
      } else {
        notify(`Se encontraron ${pieces} ${pieces === 1 ? 'pieza' : 'piezas'} para revisar.`, { action: { label: 'Ir a Revisar', run: () => go('revisar') } });
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setAnalysis({ status: 'idle' });
        notify('Análisis cancelado. No cambió nada.');
        return;
      }
      const raw = String(err?.detail || err?.message || err);
      const message = friendlyError(err instanceof TypeError ? 'failed to fetch' : raw);
      setAnalysis({ status: 'error', message, detail: raw });
      notify('El análisis se cortó.', { tone: 'error', detail: `${message} Tus referencias siguen acá.`, action: { label: 'Reintentar', run: () => void analyzeRef.current() } });
    } finally {
      analysisAbort.current = null;
    }
  };
  analyzeRef.current = handleAnalyze;

  /** Volver a analizar pide confirmar: se reinicia la revisión de sugerencias. */
  const requestReanalyze = () =>
    notify('Si volvés a analizar, se reinicia tu revisión de sugerencias. Tus capas no cambian.', { action: { label: 'Analizar igual', run: () => void analyzeRef.current() } });

  /* ---------- Paleta del corpus (lee los colores de la evidencia que falta) ---------- */
  const inspectReference = async (ref: Reference): Promise<ReferenceBreakdown | null> => {
    const projectId = projectRef.current.id;
    const cached = ref.breakdown ?? getCachedBreakdown(projectId, ref.id);
    if (cached) {
      if (!ref.breakdown) updateProject(p => ({ ...p, references: p.references.map(r => (r.id === ref.id ? { ...r, breakdown: cached } : r)) }), projectId);
      return cached;
    }
    const image = await compressImageString(ref.image, { maxWidth: 1024, maxHeight: 1024, quality: 0.8 });
    const res = await fetch('/api/inspect-reference', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reference: { ...ref, image } }) });
    const text = await res.text();
    let result: any;
    try {
      result = JSON.parse(text);
    } catch {
      throw serverError(text, res.status);
    }
    if (!res.ok || !result.success) throw new Error(result.error || result.details || 'Error al leer la referencia');
    setCachedBreakdown(projectId, ref.id, result.data);
    updateProject(p => ({ ...p, references: p.references.map(r => (r.id === ref.id ? { ...r, breakdown: result.data } : r)) }), projectId);
    return result.data as ReferenceBreakdown;
  };

  const paletteMissing = (() => {
    const ids = new Set(stackOrder(project).flatMap(x => x.pattern.evidence));
    return project.references.filter(r => ids.has(r.id) && !r.breakdown);
  })();
  const [paletteBusy, setPaletteBusy] = useState(false);
  const [paletteActivity, setPaletteActivity] = useState<string | null>(null);
  const handleCompletePalette = async () => {
    if (paletteBusy) return;
    setPaletteBusy(true);
    let failed = 0;
    const missing = paletteMissing;
    try {
      for (let i = 0; i < missing.length; i++) {
        setPaletteActivity(`Analizando colores · ${i + 1} de ${missing.length}…`);
        try {
          await inspectReference(missing[i]);
        } catch {
          failed++;
        }
      }
      notify(failed ? `Paleta completada · ${failed} referencias no se pudieron leer` : 'Paleta completada desde tus referencias');
    } finally {
      setPaletteActivity(null);
      setPaletteBusy(false);
    }
  };

  /* ========== Motor Camaleón: la interfaz toma los colores del proyecto ========== */
  const [detection, setDetection] = useState<{ pid: string; detected: DetectedColor[]; byRef: RefColorMap } | null>(null);
  /** Color que se está probando en el selector (en vivo, sin entrar al historial). */
  const [liveColors, setLiveColors] = useState<Record<string, string>>({});
  /** Color de un rol (primario, secundario, acento) que se está probando en el selector. */
  const [liveRoles, setLiveRoles] = useState<Partial<Record<RoleKey, string>>>({});
  const detectSig = project.references.map(r => r.id + r.image.length).join('|') + '#' + project.references.filter(r => r.breakdown).length + '#' + livePieces(project).filter(x => x.category === 'color').map(x => x.id + x.origin).join(',');
  useEffect(() => {
    let cancelled = false;
    const pid = project.id;
    const t = setTimeout(async () => {
      const d = await detectColors(projectRef.current);
      if (!cancelled) setDetection({ pid, ...d });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectSig, project.id]);

  const det = detection && detection.pid === project.id ? detection : null;
  const { palette, colorCtx } = (() => {
    const pieces = det ? colorPieces(project, det.byRef) : [];
    const overrides: Record<string, string> = {};
    project.patterns.forEach(x => x.colorOverride && (overrides[x.id] = x.colorOverride));
    Object.assign(overrides, liveColors);
    const byPiece: ColorCtx['byPiece'] = {};
    livePieces(project)
      .filter(x => x.category === 'color')
      .forEach(x => {
        const base = det ? pieceBaseColor(x, det.byRef) : null;
        const hex = overrides[x.id] || base;
        if (hex) byPiece[x.id] = { hex, base, overridden: !!overrides[x.id] && overrides[x.id] !== base };
      });
    const rank = det ? [...new Set(det.detected.sort((p, q) => q.weight - p.weight).map(c => c.hex))].slice(0, 8) : [];
    const saved = project.layerColors;
    const fallback = saved ? { primary: saved[0], secondary: saved[1], accent: saved[2] } : DEFAULT_PALETTE;
    const derived = det ? derivePalette(det.detected, pieces, overrides) : fallback;
    // Los colores elegidos a mano para un rol mandan sobre lo detectado.
    const manual = { ...(project.roleColors ?? {}), ...liveRoles };
    const final = { primary: manual.primary ?? derived.primary, secondary: manual.secondary ?? derived.secondary, accent: manual.accent ?? derived.accent };
    const keys: RoleKey[] = ['primary', 'secondary', 'accent'];
    const labels = ['Primario', 'Secundario', 'Acento'];
    const roles: RoleColor[] = keys.map((key, i) => {
      const layer = (i + 1) as 1 | 2 | 3;
      const piece = pieces.filter(q => q.layer === layer && (overrides[q.id] || q.hex)).sort((a, b) => b.frequency - a.frequency)[0];
      const name = piece ? project.patterns.find(x => x.id === piece.id)?.name : undefined;
      const overridden = !!manual[key];
      return {
        key,
        label: labels[i],
        layer,
        hex: asHex(final[key]),
        detected: asHex(derived[key]),
        overridden,
        source: overridden ? 'Elegido por vos' : name ? `De la pieza «${name}»` : det ? 'Color más presente en tus referencias' : 'Color por defecto',
      };
    });
    return { palette: final, colorCtx: { roles, byPiece, detected: rank, palette: final } as ColorCtx };
  })();
  const theme = buildTheme(palette);
  const themeKey = JSON.stringify(palette);
  useEffect(() => {
    applyTheme(buildTheme(palette));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeKey]);
  useEffect(() => () => applyTheme(null), []);
  // La paleta se guarda con el proyecto (al abrirlo, la interfaz ya tiene sus colores).
  useEffect(() => {
    if (!det) return;
    const next: [string, string, string] = [palette.primary, palette.secondary, palette.accent];
    if (JSON.stringify(projectRef.current.layerColors ?? null) === JSON.stringify(next)) return;
    const pid = project.id;
    const t = setTimeout(() => updateProject(p => ({ ...p, layerColors: next }), pid), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeKey, !!det]);
  // Cuando cambia el primario: "La interfaz ahora usa Azul cobalto como primario." con Deshacer.
  const prevPrimary = useRef<{ pid: string; primary: string } | null>(null);
  const suppressPaletteNotice = useRef(0);
  useEffect(() => {
    if (!det) return;
    const prev = prevPrimary.current;
    if (!prev || prev.pid !== project.id) {
      prevPrimary.current = { pid: project.id, primary: palette.primary };
      return;
    }
    if (prev.primary === palette.primary) return;
    const was = prev.primary;
    const t = setTimeout(() => {
      prevPrimary.current = { pid: project.id, primary: palette.primary };
      if (Date.now() - suppressPaletteNotice.current < 4000 || Object.keys(liveColors).length) return;
      if (colorName(was) !== colorName(palette.primary)) notify(`La interfaz ahora usa ${colorName(palette.primary)} como primario.`, { undo: true });
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palette.primary, !!det]);
  void theme;

  /** Edición de color de una pieza (desde Capas): en vivo mientras se arrastra, una sola entrada en el historial al cerrar. */
  const handleColorLive = useCallback((id: string, hex: string | null) => {
    setLiveColors(c => {
      const n = { ...c };
      if (hex) n[id] = hex;
      else delete n[id];
      return n;
    });
  }, []);
  const handleRoleLive = useCallback((key: RoleKey, hex: string | null) => {
    setLiveRoles(c => {
      const n = { ...c };
      if (hex) n[key] = hex;
      else delete n[key];
      return n;
    });
  }, []);
  /** Cuentagotas: lleva al lienzo de Referencias a elegir un color para un rol y, al elegirlo, vuelve a donde estabas. */
  const [eyedropper, setEyedropper] = useState<{ role: RoleKey; from: Moment } | null>(null);
  const startEyedropper = (role: RoleKey) => {
    const from = screenRef.current;
    logEvent('eyedropper_start', { role, from });
    setEyedropper({ role, from });
    if (from !== 'referencias') enter('referencias');
  };
  const finishEyedropper = (hex: string | null, back = true) => {
    const cur = eyedropper;
    setEyedropper(null);
    if (!cur) return;
    if (hex) handleRoleCommit(cur.role, hex);
    if (back && cur.from !== 'referencias') enter(cur.from);
  };
  // Si se sale del lienzo con el cuentagotas activo (por ejemplo desde la barra de pasos), se cancela sin volver.
  const eyeArmed = useRef(false);
  useEffect(() => {
    if (!eyedropper) {
      eyeArmed.current = false;
    } else if (screen === 'referencias') {
      eyeArmed.current = true;
    } else if (eyeArmed.current) {
      eyeArmed.current = false;
      setEyedropper(null);
    }
  }, [eyedropper, screen]);
  const handleRoleCommit = (key: RoleKey, hex: string | null) => {
    const cur = projectRef.current.roleColors?.[key] ?? null;
    suppressPaletteNotice.current = Date.now();
    setLiveRoles(c => {
      const n = { ...c };
      delete n[key];
      return n;
    });
    if (cur === (hex ?? null)) return;
    const names: Record<RoleKey, string> = { primary: 'primario', secondary: 'secundario', accent: 'acento' };
    logEvent('color_edit', { role: key, hex });
    mutate(
      p => {
        const next = { ...(p.roleColors ?? {}) };
        if (hex) next[key] = hex;
        else delete next[key];
        return { ...p, roleColors: Object.keys(next).length ? next : undefined };
      },
      { silent: true, notice: hex ? `Cambiaste el color ${names[key]} a ${hex.toUpperCase()}.` : `Se restauró el color ${names[key]} detectado.` },
    );
  };
  const handleColorCommit = (id: string, hex: string | null) => {
    const x = projectRef.current.patterns.find(q => q.id === id);
    if (!x) return;
    suppressPaletteNotice.current = Date.now();
    setLiveColors(c => {
      const n = { ...c };
      delete n[id];
      return n;
    });
    if ((x.colorOverride ?? null) === (hex ?? null)) return;
    logEvent('color_edit', { piece: x.name, hex });
    mutate(p => ({ ...p, patterns: p.patterns.map(q => (q.id === id ? { ...q, colorOverride: hex ?? undefined } : q)) }), {
      notice: hex ? `Cambiaste «${x.name}» a ${hex.toUpperCase()}.` : `Se restauró el color detectado de «${x.name}».`,
    });
  };

  /* ========== Línea de estado (barra superior) ========== */
  // Mientras el agente lee, los mensajes avanzan solos; con el análisis real se muestra el avance de la preparación.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (analysis.status !== 'reading') return;
    const id = setInterval(() => setTick(n => n + 1), 400);
    return () => clearInterval(id);
  }, [analysis.status]);
  const analysisActivity = (() => {
    if (analysis.status === 'preparing') return `Analizando colores · ${Math.min(analysis.total, analysis.done + 1)} de ${analysis.total}…`;
    if (analysis.status === 'reading') {
      void tick;
      const s = (Date.now() - analysis.since) / 1000;
      const n = suggestions(project).length;
      return s < 6 ? 'Detectando tipografías…' : s < 14 ? 'Buscando lo que se repite…' : n ? `Armando ${n} sugerencias…` : 'Armando las sugerencias…';
    }
    return null;
  })();
  const activity = analysisActivity ?? paletteActivity ?? probarActivity;
  const reached = project.reached ?? 0;
  const status: StatusLine = activity
    ? { mode: 'activity', text: activity }
    : stepIndex(screen) < reached
      ? { mode: 'back', text: `Volviste a ${stepLabel(screen)}`, action: { label: `Seguir en ${stepLabel(STEPS[reached].id)} →`, run: () => go(STEPS[reached].id) } }
      : { mode: 'location', text: locationText(project, screen, screen === 'capas' ? capaName : screen === 'probar' ? probarType : undefined) };

  /** Ctrl+Shift+R: vuelve a armar el proyecto de ejemplo (con confirmación). Ctrl+Shift+E: descarga el registro de test. */
  const resetDemo = async () => {
    if (!window.confirm('¿Reiniciar el proyecto de ejemplo? Se pierde todo lo hecho en él.')) return;
    try {
      const fresh = await buildDemo(await fetchExample());
      deleteProjectPieces(DEMO_ID);
      setProjectsList(list => [...list.filter(p => p.id !== DEMO_ID), fresh]);
      setActiveProjectId(DEMO_ID);
      resetUi();
      clearTestLog();
      notify('Se reinició el proyecto de ejemplo.');
    } catch (err: any) {
      notify(`No se pudo reiniciar el ejemplo: ${err?.message || err}`, { tone: 'error' });
    }
  };
  const resetDemoRef = useRef(resetDemo);
  resetDemoRef.current = resetDemo;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return;
      const k = e.key.toLowerCase();
      if (k === 'e' && testMode) {
        e.preventDefault();
        const name = downloadTestLog();
        notify(`Se descargó ${name}`);
      } else if (k === 'r' && demoRequested()) {
        e.preventDefault();
        void resetDemoRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [notify]);

  /** Ir a una etapa desde la barra de etapas: si está bloqueada, avisa por qué. */
  const goStage = (id: Moment, blocked: string | null) => {
    if (blocked) {
      logEvent('blocked_click', { target: id, reason: blocked });
      notify(`${stepLabel(id)} · ${blocked}`);
    } else enter(id);
  };

  const enabled = !overlay && !isUploadOpen && !deleteRequest && !isLogOpen && !guideOpen && !briefOpen;
  const notifyBlocked = useCallback((reason: string) => notify(reason), [notify]);

  return (
    <ColorContext.Provider value={{ ...colorCtx, eyedrop: startEyedropper }}>
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-bg text-ink print:h-auto print:overflow-visible">
      {/* Un solo brillo por pantalla, con el color del Núcleo. En Referencias arranca neutro y se enciende al detectar el primer patrón. */}
      <div aria-hidden="true" className="no-print pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div
          className="glow"
          data-neutral={screen === 'referencias' && !isAnalyzed(project)}
          style={
            screen === 'revisar'
              ? { left: '-22vmax', bottom: '-30vmax' }
              : screen === 'probar'
                ? { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
                : { right: '-24vmax', top: '-34vmax' }
          }
        />
      </div>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:bg-ink focus:px-3 focus:py-2 focus:text-bg">
        Saltar al contenido
      </a>
      <TopBar
        project={project}
        projects={projectsList}
        onSelectProject={handleSelectProject}
        onNewProject={handleNewProject}
        onEditBrief={() => setBriefOpen(true)}
        onDeleteProject={() => setDeleteRequest('current')}
        onDeleteAllProjects={() => setDeleteRequest('all')}
        onExportBackup={handleExportBackup}
        onImportBackup={handleImportBackup}
        onLoadExample={handleLoadExample}
        onDownloadDossier={() => downloadProjectMarkdown(project)}
        onOpenLog={() => setIsLogOpen(true)}
        onOpenAbout={() => setOverlay({ kind: 'about' })}
        onOpenHelp={() => {
          logEvent('help_open');
          enter('referencias');
          setGuideOpen(true);
        }}
        status={status}
        save={saveState}
        nav={viewport === 'desktop' ? <StageNav project={project} current={screen} onGo={goStage} /> : undefined}
        onUndo={undo}
        canUndo={undoStack.current.length > 0}
      />
      {project.example && <ExampleBanner onStart={handleNewProject} />}

      <div className={`relative z-[1] flex min-h-0 flex-1 ${viewport === 'mobile' ? 'flex-col' : ''}`}>
        <StepRail project={project} current={screen} viewport={viewport} onGoLayer={l => { const why = blockReason(projectRef.current, 'capas'); if (why) return notify(`Capas · ${why}`); enter('capas'); setGoLayer({ layer: l, n: Date.now() }); }} onGo={goStage} />

        <main id="main" tabIndex={-1} className={`relative min-h-0 min-w-0 flex-1 outline-none print:overflow-visible ${overlay ? 'print:hidden' : ''}`}>
          {screen === 'referencias' && (
            <ReferencesScreen
              key={project.id}
              project={project}
              enabled={enabled}
              mutate={mutate}
              analysis={analysis}
              onAnalyze={handleAnalyze}
              onCancelAnalysis={() => analysisAbort.current?.abort()}
              onRequestReanalyze={requestReanalyze}
              onAddFiles={handleAddFiles}
              onAddUrl={url => void handleAddUrl(url)}
              onOpenUpload={() => setIsUploadOpen(true)}
              onDeleteRef={handleDeleteReference}
              onNext={() => go('revisar')}
              onBlocked={notifyBlocked}
              onSubmitIntent={handleSubmitIntent}
              briefBusy={briefBusy}
              focus={focusRef}
              eyedropper={eyedropper ? { label: eyedropper.role === 'primary' ? 'primario' : eyedropper.role === 'secondary' ? 'secundario' : 'acento', current: colorCtx.roles.find(r => r.key === eyedropper.role)?.hex ?? '#888888' } : null}
              onEyedropperDone={finishEyedropper}
              onNotify={notify}
            />
          )}
          {screen === 'revisar' && <ReviewScreen key={project.id} project={project} enabled={enabled} apply={apply} mutate={mutate} onNext={() => go('capas')} />}
          {screen === 'capas' && <LayersScreen key={project.id} project={project} enabled={enabled} apply={apply} onNext={() => go('sistema', 'capas')} onBlocked={notifyBlocked} onLayer={setCapaName} onColorLive={handleColorLive} onColorCommit={handleColorCommit} onRoleLive={handleRoleLive} onRoleCommit={handleRoleCommit} notify={notify} goLayer={goLayer} />}
          {screen === 'sistema' && (
            <SystemScreen
              key={project.id}
              project={project}
              enabled={enabled}
              onNext={() => go('probar', 'sistema')}
              onBlocked={notifyBlocked}
              notify={notify}
              onRoleLive={handleRoleLive}
              onRoleCommit={handleRoleCommit}
              paletteMissing={paletteMissing.length}
              paletteBusy={paletteBusy}
              onCompletePalette={handleCompletePalette}
            />
          )}
          {(screen === 'probar' || probarSeen === project.id) && (
            <div className={screen === 'probar' ? 'stage-enter h-full' : 'hidden'}>
              <ProbarScreen
                key={project.id}
                project={project}
                enabled={enabled && screen === 'probar'}
                session={project.applications?.stack}
                onSaveSession={session => {
                  const pid = project.id;
                  updateProject(x => ({ ...x, applications: { ...(x.applications ?? {}), stack: session } }), pid);
                }}
                onNotify={notify}
                onActivity={setProbarActivity}
                onUndoable={pushUndo}
                onType={setProbarType}
                onBlocked={notifyBlocked}
              />
            </div>
          )}
          {briefOpen && (
            <BriefPanel
              brief={project.brief || project.description || ''}
              onSave={handleSaveBrief}
              onClose={() => setBriefOpen(false)}
            />
          )}
        </main>
      </div>

      <Notices notice={notice} onClose={() => setNotice(null)} />
      {viewport === 'desktop' && (
        <div className="no-print pointer-events-none fixed bottom-6 left-10 z-[60] max-w-[min(560px,calc(100vw-80px))]">
          <StatusBar status={status} className="pointer-events-auto" />
        </div>
      )}
      {guideOpen && <Guide onClose={() => setGuideOpen(false)} />}
      <UploadModal isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} existing={project.references} onAddFiles={files => handleAddFiles(files)} onAddReferences={handleAddReferences} onAddUrl={(url, extra) => void handleAddUrl(url, extra)} />
      <Modal open={!!deleteRequest} title={deleteRequest === 'all' ? 'Eliminar todos los proyectos' : 'Eliminar proyecto'} meta="No se puede deshacer" width={440} onClose={() => setDeleteRequest(null)}>
        <div className="flex flex-col gap-4 p-5">
          <p className="m-0 text-13 text-ink">
            {deleteRequest === 'all'
              ? `Se borran los ${projectsList.length} proyectos de este navegador.`
              : `Se borra “${project.name.trim() || 'Proyecto sin nombre'}” con sus ${project.references.length} referencias y ${livePieces(project).length} piezas.`}
          </p>
          <p className="m-0 text-13 text-ink-2">Si querés conservar una copia, descargá antes el respaldo completo desde el menú del proyecto.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="discard" data-autofocus onClick={() => handleDeleteProjects(deleteRequest === 'all' ? projectsList.map(p => p.id) : [project.id])}>
              {deleteRequest === 'all' ? 'Eliminar todos' : 'Eliminar proyecto'}
            </Button>
            <Button variant="ghost" onClick={() => setDeleteRequest(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>

      <LogDrawer
        open={isLogOpen}
        project={project}
        onClose={() => setIsLogOpen(false)}
        onAddRule={fb => {
          const item = makeFeedback({ type: fb.type, comment: fb.comment });
          updateProject(p => ({ ...p, feedback: [...p.feedback, item] }));
          addLog('feedback', 'proyecto', fb.type === 'designer_rule' ? 'Regla del diseñador' : 'Ajuste', fb.comment, { feedbackId: item.id });
          notify('Regla guardada · se usa en el próximo análisis');
        }}
      />

      {overlay?.kind === 'about' && <AboutView onBack={() => setOverlay(null)} />}
    </div>
    </ColorContext.Provider>
  );
}
