import { useCallback, useEffect, useRef, useState } from 'react';
import { LogItem, LogKind, Moment, Pattern, Project, Reference, ReferenceBreakdown } from './types';
import { loadStoredProjects, saveProjects } from './utils/projectStore';
import { createEmptyProject } from './data/emptyProject';
import { compressImageString } from './utils/imageCompressor';
import { deleteProjectPieces } from './utils/pieceStore';
import { buildBackup, downloadBackup, restoreBackup } from './utils/backup';
import { clearBreakdownCache, clearCachedBreakdown, clearProjectBreakdowns, getCachedBreakdown, setCachedBreakdown } from './utils/inspectorCache';
import { downloadProjectMarkdown } from './utils/exportHelpers';
import { filesToReferences, makeFeedback, makeLog, migrateProject, withLog } from './utils/project';
import { corpusRefs } from './utils/layers';
import { stackOrder } from './utils/layerRules';
import { applyLayerColors, computeLayerColors } from './utils/camaleon';
import { useShortcuts } from './hooks/useAuditShortcuts';

import { Button, Tone } from './components/ui';
import { TopBar } from './components/shell/TopBar';
import { UploadModal } from './components/UploadModal';
import { AboutView } from './components/AboutView';
import { ProbarScreen } from './screens/ProbarScreen';
import { LogDrawer } from './components/LogDrawer';
import { Modal } from './components/shell/Modal';

import { ActionResult, MIN_REFS, livePieces, mergeAnalysis } from './pieces/model';
import { buildAnalysisBody, friendlyError, requestSplit } from './pieces/analyze';
import { AnalysisState, MoodboardScreen } from './screens/MoodboardScreen';
import { SystemScreen } from './screens/SystemScreen';
import { ExampleBanner, Guide, guideDone } from './screens/Guide';

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

/** Aviso breve: se muestra como franja sobre la barra de atajos. */
interface Toast {
  id: number;
  message: string;
  tone?: Tone;
}

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
      if (projects.length) {
        const list = projects.map(migrateProject);
        setBoot({ projects: list, activeId: activeId && list.some(p => p.id === activeId) ? activeId : list[0].id });
        return;
      }
      try {
        const { project } = await restoreBackup(await fetchExample(), []);
        const example = { ...project, example: true, moment: 'moodboard' as Moment };
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

function Workspace({ boot }: { boot: Boot }) {
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

  /* Guardado en IndexedDB: solo lo que cambió, medio segundo después del último cambio. */
  const [saveFailed, setSaveFailed] = useState(false);
  const saved = useRef(new Map<string, Project>());
  useEffect(() => {
    const t = setTimeout(() => {
      const changed = new Set(projectsList.filter(p => saved.current.get(p.id) !== p).map(p => p.id));
      saveProjects(projectsList, activeProjectId, changed)
        .then(() => {
          saved.current = new Map(projectsList.map(p => [p.id, p]));
          setSaveFailed(false);
        })
        .catch(e => {
          console.warn('No se pudo guardar el proyecto', e);
          setSaveFailed(true);
        });
    }, 500);
    return () => clearTimeout(t);
  }, [projectsList, activeProjectId]);

  /* ========== Pantalla ========== */
  const screen: Moment = project.moment ?? 'moodboard';
  const setScreen = (m: Moment) => updateProject(p => ({ ...p, moment: m }));
  // 03 PROBAR queda montada (oculta) una vez abierta: si cambiás de pestaña con una generación en curso, no se corta ni se pierde el resultado.
  const [probarSeen, setProbarSeen] = useState<string | null>(null);
  useEffect(() => {
    if (screen === 'probar') setProbarSeen(project.id);
  }, [screen, project.id]);

  /* ========== UI ========== */
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [deleteRequest, setDeleteRequest] = useState<null | 'current' | 'all'>(null);
  /** Pedido de abrir el brief desde el menú del proyecto (cambia el número). */
  const [briefRequest, setBriefRequest] = useState(0);
  /** Guía de 3 carteles: la primera vez que se llega a 01 MOODBOARD con piezas, o desde AYUDA. */
  const [guideOpen, setGuideOpen] = useState(false);
  useEffect(() => {
    if (screen === 'moodboard' && livePieces(project).length && !guideDone()) setGuideOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, project.id]);

  /* ========== Avisos ========== */
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((t: Omit<Toast, 'id'>, ms = 3000) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ ...t, id: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);
  useEffect(() => {
    if (saveFailed) showToast({ message: 'No se pudo guardar el proyecto en este navegador: descargá el respaldo desde el menú del proyecto.', tone: 'discarded' }, 12000);
  }, [saveFailed, showToast]);

  /** Agrega entradas a la bitácora del proyecto. */
  const addLog = useCallback(
    (kind: LogKind, targetId: string, label: string, reason?: string, opts: { feedbackId?: string; projectId?: string } = {}): LogItem => {
      const item = makeLog(kind, targetId, label, reason, opts.feedbackId);
      updateProject(p => ({ ...p, log: [...(p.log ?? []), item] }), opts.projectId);
      return item;
    },
    [updateProject],
  );

  /** Aplica una acción sobre el proyecto más reciente, con su bitácora en el mismo cambio. */
  const apply = (fn: (p: Project) => ActionResult): ActionResult => {
    const current = projectRef.current;
    const r = fn(current);
    if (r.project === current && !r.log.length) {
      if (r.message) showToast({ message: r.message });
      return r;
    }
    const next = withLog(r.project, ...r.log.map(l => makeLog(l.kind, l.targetId, l.label, l.reason)));
    projectRef.current = next;
    updateProject(() => next, current.id);
    if (r.message) showToast({ message: r.message });
    return r;
  };

  /* ========== Proyectos: acciones ========== */
  const analysisAbort = useRef<AbortController | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisState>({ status: 'idle' });
  const resetUi = () => {
    analysisAbort.current?.abort();
    setOverlay(null);
    setAnalysis({ status: 'idle' });
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
    showToast({ message: 'Preparando el respaldo…' }, 60000);
    try {
      const { backup, webMissing } = await buildBackup(p);
      const at = backup.exportedAt;
      downloadBackup({ ...backup, project: { ...backup.project, lastBackupAt: at } });
      updateProject(x => ({ ...x, lastBackupAt: at }), p.id);
      showToast({ message: `Respaldo descargado · ${p.references.length} referencias${webMissing ? ` · ${webMissing} de la web quedaron como link` : ''}` }, 5000);
    } catch (err: any) {
      showToast({ message: `No se pudo armar el respaldo: ${err?.message || err}` }, 6000);
    }
  };

  const importBackupText = async (text: string, example = false) => {
    const { project: imported } = await restoreBackup(text, projectsList.map(x => x.id));
    const p = example ? { ...imported, example: true, moment: 'moodboard' as Moment } : imported;
    // Un proyecto vacío de relleno se reemplaza por el importado.
    const isBlank = (x: Project) => !x.name.trim() && !x.intent?.trim() && !x.references.length && !x.patterns.length;
    setProjectsList(list => [...list.filter(x => !isBlank(x)), p]);
    setActiveProjectId(p.id);
    resetUi();
    showToast({ message: `Proyecto abierto · ${p.name || 'sin nombre'} · ${p.references.length} referencias` }, 4000);
  };

  const handleImportBackup = async (file: File) => {
    try {
      await importBackupText(await file.text());
    } catch (err: any) {
      showToast({ message: err?.message || 'No se pudo importar el respaldo' }, 6000);
    }
  };

  const handleLoadExample = async () => {
    showToast({ message: 'Abriendo el proyecto de ejemplo…' }, 60000);
    try {
      await importBackupText(await fetchExample(), true);
    } catch (err: any) {
      showToast({ message: err?.message || 'No se pudo abrir el ejemplo' }, 6000);
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
    showToast({ message: ids.length === 1 ? 'Proyecto eliminado' : `${ids.length} proyectos eliminados` });
  };

  /* ========== 01 · SUBIR ========== */
  const [briefBusy, setBriefBusy] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  /** El agente redacta el brief a partir de la frase. Queda como borrador editable. */
  const handleSubmitIntent = async (intent: string) => {
    const projectId = projectRef.current.id;
    updateProject(p => ({ ...p, intent, name: p.name.trim() ? p.name : intent, objective: p.objective.trim() ? p.objective : intent }), projectId);
    addLog('brief', 'brief', 'Frase de intención', intent, { projectId });
    setBriefBusy(true);
    setBriefError(null);
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
      addLog('brief', 'brief', 'Brief redactado por el agente', 'Borrador: el diseñador lo puede editar', { projectId });
    } catch (err: any) {
      const raw = String(err?.message || err);
      setBriefError(`El brief queda para después: ${friendlyError(err instanceof TypeError ? 'failed to fetch' : raw).replace('No se pudo analizar. ', '')}`);
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
      updateProject(p => ({ ...p, references: [...p.references, ...refs] }));
      showToast({ message: refs.length === 1 ? 'Referencia agregada' : `${refs.length} referencias agregadas` });
    },
    [updateProject, showToast],
  );

  const handleAddFiles = useCallback(
    async (files: File[]) => {
      const refs = await filesToReferences(files, projectRef.current.references);
      if (!refs.length) {
        showToast({ message: 'Solo se aceptan imágenes' });
        return;
      }
      handleAddReferences(refs);
    },
    [handleAddReferences, showToast],
  );

  /** Quita una referencia: sale de las piezas que la citaban. */
  const handleDeleteReference = (id: string) => {
    const p = projectRef.current;
    const ref = p.references.find(r => r.id === id);
    if (!ref) return;
    apply(cur => ({
      project: {
        ...cur,
        references: cur.references.filter(r => r.id !== id),
        patterns: cur.patterns.map(x => ({ ...x, evidence: x.evidence.filter(e => e !== id), cover: x.cover?.refId === id ? undefined : x.cover })),
        systems: cur.systems.map(s => ({ ...s, referenceIds: s.referenceIds.filter(r => r !== id) })),
      },
      log: [{ kind: 'discard', targetId: id, label: `Referencia quitada · ${ref.name}` }],
      message: `Referencia quitada · ${ref.name}`,
    }));
    clearCachedBreakdown(p.id, id);
  };

  /* ---------- ANALIZAR: una sola llamada que recorta, junta, cuenta y sugiere hoja ---------- */
  const handleAnalyze = async () => {
    const p = projectRef.current;
    if (analysis.status === 'preparing' || analysis.status === 'reading') return;
    if (corpusRefs(p).length < MIN_REFS) return;
    const controller = new AbortController();
    analysisAbort.current = controller;
    setAnalysis({ status: 'preparing', done: 0, total: corpusRefs(p).length });
    try {
      const body = await buildAnalysisBody(p, (done, total) => setAnalysis({ status: 'preparing', done, total }), controller.signal);
      setAnalysis({ status: 'reading', total: body.references.length, since: Date.now() });
      const res = await fetch('/api/analyze-references', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify(body) });
      const text = await res.text();
      let result: any;
      try {
        result = JSON.parse(text);
      } catch {
        throw serverError(text, res.status);
      }
      if (!res.ok || !result.success) throw Object.assign(new Error(result.error || result.details || 'El agente no respondió'), { detail: result.error || result.details });
      const detected: any[] = result.data?.patterns ?? [];
      apply(cur => {
        const m = mergeAnalysis(cur, detected);
        return {
          project: { ...m.project, moment: 'moodboard' },
          log: [{ kind: 'induce', targetId: 'referencias', label: `Análisis · ${corpusRefs(cur).length} referencias`, reason: `${m.added} piezas nuevas · ${m.updated} actualizadas` }],
          message: m.added ? `El agente ubicó ${m.added} piezas como sugerencias. Confirmá, subí o bajá.` : 'Análisis actualizado',
        };
      });
      setAnalysis({ status: 'idle' });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setAnalysis({ status: 'idle' });
        showToast({ message: 'Análisis cancelado. No cambió nada.' });
        return;
      }
      const raw = String(err?.detail || err?.message || err);
      setAnalysis({ status: 'error', message: friendlyError(err instanceof TypeError ? 'failed to fetch' : raw), detail: raw });
    } finally {
      analysisAbort.current = null;
    }
  };

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
  const handleCompletePalette = async () => {
    if (paletteBusy) return;
    setPaletteBusy(true);
    let failed = 0;
    const missing = paletteMissing;
    try {
      for (let i = 0; i < missing.length; i++) {
        showToast({ message: `Leyendo colores · ${i + 1} de ${missing.length}` }, 60000);
        try {
          await inspectReference(missing[i]);
        } catch {
          failed++;
        }
      }
      showToast({ message: failed ? `Paleta completada · ${failed} referencias no se pudieron leer` : 'Paleta completada desde tus referencias' }, 4000);
    } finally {
      setPaletteBusy(false);
    }
  };

  /* ========== Color camaleón ========== */
  // Los colores de capa salen de la paleta del proyecto. Se recalculan cuando cambia qué hay en cada capa.
  const colorSig = livePieces(project).map(x => `${x.id}:${x.layer}`).join('|') + `#${project.references.filter(r => r.breakdown).length}`;
  useEffect(() => {
    applyLayerColors(project.layerColors);
  }, [project.layerColors, project.id]);
  useEffect(() => {
    if (analysis.status === 'preparing' || analysis.status === 'reading') return;
    let cancelled = false;
    const pid = project.id;
    const t = setTimeout(async () => {
      const colors = await computeLayerColors(projectRef.current);
      if (cancelled) return;
      updateProject(p => (JSON.stringify(p.layerColors ?? null) === JSON.stringify(colors) ? p : { ...p, layerColors: colors ?? undefined }), pid);
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorSig, project.id, analysis.status]);

  const enabled = !overlay && !isUploadOpen && !deleteRequest && !isLogOpen && !guideOpen;
  const toastText = toast?.message ?? null;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-bg text-ink print:h-auto print:overflow-visible">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:bg-ink focus:px-3 focus:py-2 focus:text-bg">
        Saltar al contenido
      </a>
      <TopBar
        project={project}
        projects={projectsList}
        onSelectProject={handleSelectProject}
        onNewProject={handleNewProject}
        onEditBrief={() => {
          setScreen('moodboard');
          setBriefRequest(n => n + 1);
        }}
        onDeleteProject={() => setDeleteRequest('current')}
        onDeleteAllProjects={() => setDeleteRequest('all')}
        onExportBackup={handleExportBackup}
        onImportBackup={handleImportBackup}
        onLoadExample={handleLoadExample}
        onDownloadDossier={() => downloadProjectMarkdown(project)}
        onOpenLog={() => setIsLogOpen(true)}
        onOpenAbout={() => setOverlay({ kind: 'about' })}
        onOpenHelp={() => {
          setScreen('moodboard');
          setGuideOpen(true);
        }}
        moment={screen}
        onSelectMoment={setScreen}
      />
      {project.example && <ExampleBanner onStart={handleNewProject} />}

      <main id="main" tabIndex={-1} className={`relative min-h-0 flex-1 outline-none print:overflow-visible ${overlay ? 'print:hidden' : ''}`}>
        {screen === 'moodboard' && (
          <MoodboardScreen
            key={project.id}
            project={project}
            enabled={enabled}
            apply={apply}
            toast={toastText}
            onSubmitIntent={handleSubmitIntent}
            briefBusy={briefBusy}
            briefError={briefError}
            onSaveBrief={handleSaveBrief}
            briefRequest={briefRequest}
            onAddFiles={handleAddFiles}
            onOpenUpload={() => setIsUploadOpen(true)}
            onDeleteRef={handleDeleteReference}
            analysis={analysis}
            onAnalyze={handleAnalyze}
            onCancelAnalysis={() => analysisAbort.current?.abort()}
            onGoSystem={() => setScreen('sistema')}
            split={piece => requestSplit(projectRef.current, piece)}
          />
        )}
        {screen === 'sistema' && (
          <SystemScreen
            key={project.id}
            project={project}
            enabled={enabled}
            toast={toastText}
            onBack={() => setScreen('moodboard')}
            onGenerate={() => setScreen('probar')}
            onNotice={text => showToast({ message: text })}
            paletteMissing={paletteMissing.length}
            paletteBusy={paletteBusy}
            onCompletePalette={handleCompletePalette}
          />
        )}
        {(screen === 'probar' || probarSeen === project.id) && (
          <div className={screen === 'probar' ? 'h-full' : 'hidden'}>
            <ProbarScreen
              key={project.id}
              project={project}
              enabled={enabled && screen === 'probar'}
              session={project.applications?.stack}
              onSaveSession={session => {
                const pid = project.id;
                updateProject(x => ({ ...x, applications: { ...(x.applications ?? {}), stack: session } }), pid);
              }}
              onBack={() => setScreen('sistema')}
            />
          </div>
        )}
      </main>

      {guideOpen && <Guide onClose={() => setGuideOpen(false)} />}
      <UploadModal isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} existing={project.references} onAddFiles={files => handleAddFiles(files)} onAddReferences={handleAddReferences} />
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
          showToast({ message: 'Regla guardada · el agente la usa en el próximo análisis' });
        }}
      />

      {overlay?.kind === 'about' && <AboutView onBack={() => setOverlay(null)} />}
    </div>
  );
}
