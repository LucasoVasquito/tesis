import { useCallback, useEffect, useRef, useState } from 'react';
import { loadStoredProjects, saveProjects } from './utils/projectStore';
import { LogItem, LogKind, Moment, Pattern, Project, Reference, ReferenceBreakdown } from './types';
import { createEmptyProject } from './data/emptyProject';
import { compressImageString } from './utils/imageCompressor';
import { deleteProjectPieces } from './utils/pieceStore';
import { buildBackup, downloadBackup, restoreBackup } from './utils/backup';
import { clearBreakdownCache, clearCachedBreakdown, clearProjectBreakdowns, getCachedBreakdown, setCachedBreakdown } from './utils/inspectorCache';
import { downloadProjectMarkdown } from './utils/exportHelpers';
import { filesToReferences, makeFeedback, makeLog, migrateProject, withLog } from './utils/project';
import { corpusRefs } from './utils/layers';
import { stackOrder } from './utils/layerRules';
import { stackPayload, stackSystem } from './utils/stackExport';
import { useShortcuts } from './hooks/useAuditShortcuts';

import { Button, Tone } from './components/ui';
import { TopBar } from './components/shell/TopBar';
import { UploadModal } from './components/UploadModal';
import { LightboxModal } from './components/LightboxModal';
import { AboutView } from './components/AboutView';
import { SystemApplicationView } from './components/SystemApplicationView';
import { LogDrawer } from './components/LogDrawer';
import { TraceMap } from './components/TraceMap';
import { Modal } from './components/shell/Modal';
import { PatternDraft, PatternEditor, draftFromPattern, emptyDraft } from './components/PatternEditor';

import { SpaceView } from './space/SpaceView';
import type { ActionResult } from './space/actions';
import { buildRevealBody, mergeRevealed, needsReveal } from './space/reveal';

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

/** Mínimo de referencias para que la IA recorra el corpus. */
const MIN_REFERENCES = 3;

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

/** Carga los proyectos de IndexedDB antes de mostrar la app. */
export default function App() {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadStoredProjects()
      .then(({ projects, activeId }) => {
        try {
          if (DISCARDED_KEYS.some(k => localStorage.getItem(k) !== null)) {
            DISCARDED_KEYS.forEach(k => localStorage.removeItem(k));
            clearBreakdownCache();
          }
        } catch {
          /* sin localStorage: no hay nada viejo que limpiar */
        }
        const list = projects.length ? projects.map(migrateProject) : [createEmptyProject()];
        setBoot({ projects: list, activeId: activeId && list.some(p => p.id === activeId) ? activeId : list[0].id });
      })
      .catch(e => setError(String(e?.message || e)));
  }, []);
  if (error) {
    return (
      <div role="alert" className="flex h-full items-center justify-center p-6 text-center text-[15px]">
        No se pudieron leer los proyectos guardados en este navegador ({error}).
      </div>
    );
  }
  if (!boot) return <div className="flex h-full items-center justify-center type-label text-[13px] text-ink-2">CARGANDO…</div>;
  return <Workspace boot={boot} />;
}

const serverError = (text: string, status: number) =>
  new Error(
    text.trim().startsWith('<')
      ? 'El servidor corre una versión anterior: reiniciá "npm run server".'
      : `El servidor no respondió (HTTP ${status}). ¿Está corriendo "npm run server"?`,
  );

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

  /* ========== Momento y vista ========== */
  /** 03 · Girar es la vista de frente; Armar y Revelar se miran de costado. */
  const stackView = project.view ?? 'side';
  const sideMoment: Moment = project.moment === 'revelar' ? 'revelar' : 'armar';
  const moment: Moment = stackView === 'front' ? 'girar' : sideMoment;
  const setMoment = (m: Moment) => updateProject(p => (m === 'girar' ? { ...p, view: 'front' } : { ...p, view: 'side', moment: m }));
  const toggleView = () => updateProject(p => ({ ...p, view: (p.view ?? 'side') === 'front' ? 'side' : 'front' }));

  /* ========== UI ========== */
  const [overlay, setOverlay] = useState<Overlay>(null);
  /** Mapa de trazabilidad abierto (reemplaza la pila hasta cerrarlo). */
  const [mapOpen, setMapOpen] = useState(false);
  /** Generación con DALL·E abierta desde Girar (la pila leída como sistema). */
  const [generateOpen, setGenerateOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [deleteRequest, setDeleteRequest] = useState<null | 'current' | 'all'>(null);
  const [lightboxRef, setLightboxRef] = useState<Reference | null>(null);
  /** Pedido de abrir el brief desde el menú del proyecto (cambia el número). */
  const [briefRequest, setBriefRequest] = useState(0);
  /** Editor de patrones propios (desde la generación con DALL·E). */
  const [patternEditor, setPatternEditor] = useState<null | { patternId?: string; draft: PatternDraft; title: string; meta: string }>(null);

  /* ========== Toast ========== */
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((t: Omit<Toast, 'id'>, ms = 3000) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ ...t, id: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);
  useEffect(() => {
    if (saveFailed) showToast({ message: 'No hay espacio para guardar el proyecto: descargá el respaldo ahora o se perderán los últimos cambios', tone: 'discarded' }, 12000);
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

  /* ========== Proyectos: acciones ========== */
  const revealAbort = useRef<AbortController | null>(null);
  const resetUiForProject = () => {
    revealAbort.current?.abort();
    setOverlay(null);
    setMapOpen(false);
    setGenerateOpen(false);
  };

  const handleSelectProject = (id: string) => {
    if (!projectsList.some(x => x.id === id)) return;
    setActiveProjectId(id);
    resetUiForProject();
  };

  const handleNewProject = () => {
    const p = createEmptyProject();
    setProjectsList(list => [...list, p]);
    setActiveProjectId(p.id);
    resetUiForProject();
  };

  /* ---------- Respaldo completo ---------- */
  const handleExportBackup = async () => {
    const p = projectRef.current;
    showToast({ message: 'Preparando el respaldo…', tone: 'pending' }, 60000);
    try {
      const { backup, webMissing } = await buildBackup(p);
      const at = backup.exportedAt;
      downloadBackup({ ...backup, project: { ...backup.project, lastBackupAt: at } });
      updateProject(x => ({ ...x, lastBackupAt: at }), p.id);
      const pieces = Object.keys(backup.pieceImages).length;
      showToast(
        {
          message: `Respaldo descargado · ${p.references.length} referencias, ${pieces} ${pieces === 1 ? 'pieza' : 'piezas'}${webMissing ? ` · ${webMissing} de la web quedaron como link` : ''}`,
          tone: 'confirmed',
        },
        5000,
      );
    } catch (err: any) {
      showToast({ message: `No se pudo armar el respaldo: ${err?.message || err}`, tone: 'discarded' }, 6000);
    }
  };

  const importBackupText = async (text: string) => {
    const { project: imported, pieces } = await restoreBackup(text, projectsList.map(x => x.id));
    // Un proyecto vacío de relleno (sin nombre ni referencias) se reemplaza por el importado.
    const isBlank = (x: Project) => !x.name.trim() && !x.intent?.trim() && !x.references.length && !x.patterns.length;
    setProjectsList(list => [...list.filter(x => !isBlank(x)), imported]);
    setActiveProjectId(imported.id);
    resetUiForProject();
    showToast({ message: `Proyecto importado · ${imported.name || 'sin nombre'} · ${imported.references.length} referencias, ${pieces} ${pieces === 1 ? 'pieza' : 'piezas'}`, tone: 'confirmed' }, 5000);
  };

  const handleImportBackup = async (file: File) => {
    try {
      await importBackupText(await file.text());
    } catch (err: any) {
      showToast({ message: err?.message || 'No se pudo importar el respaldo', tone: 'discarded' }, 6000);
    }
  };

  const handleLoadExample = async () => {
    showToast({ message: 'Cargando el proyecto de ejemplo…', tone: 'pending' }, 60000);
    try {
      // Primero el archivo estático (funciona sin backend, p. ej. en Netlify); si no está, el backend local.
      let res = await fetch('/ejemplo.json');
      if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) res = await fetch('/api/example-project');
      if (!res.ok) throw new Error('No se encontró el proyecto de ejemplo');
      await importBackupText(await res.text());
    } catch (err: any) {
      showToast({ message: err?.message || 'No se pudo cargar el ejemplo', tone: 'discarded' }, 6000);
    }
  };

  /** Elimina proyectos (y sus desgloses en caché). Si no queda ninguno, se crea uno vacío. */
  const handleDeleteProjects = (ids: string[]) => {
    const remaining = projectsList.filter(p => !ids.includes(p.id));
    const next = remaining.length ? remaining : [createEmptyProject()];
    ids.forEach(clearProjectBreakdowns);
    ids.forEach(deleteProjectPieces);
    setProjectsList(next);
    if (ids.includes(activeProjectId)) {
      setActiveProjectId(next[0].id);
      resetUiForProject();
    }
    setDeleteRequest(null);
    showToast({ message: ids.length === 1 ? 'Proyecto eliminado' : `${ids.length} proyectos eliminados`, tone: 'discarded' });
  };

  /* ========== Pila de láminas ========== */
  /**
   * Aplica una acción de la pila sobre el proyecto más reciente. La bitácora va dentro del mismo
   * cambio para que dos acciones seguidas no se pisen.
   */
  const applyStack = (fn: (p: Project) => ActionResult): ActionResult => {
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

  /* ---------- 01 · Armar ---------- */
  const [briefBusy, setBriefBusy] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  /** La IA redacta el brief a partir de la frase. Queda como borrador editable. */
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
      updateProject(
        p => ({
          ...p,
          name: p.name.trim() && p.name !== intent ? p.name : d.name || intent,
          objective: d.objective || p.objective,
          description: d.brief || p.description,
          brief: d.brief || p.brief,
        }),
        projectId,
      );
      addLog('brief', 'brief', 'Brief redactado por la IA', 'Borrador: el diseñador lo puede editar', { projectId });
    } catch (err: any) {
      setBriefError(err instanceof TypeError ? 'Sin conexión con el servidor: el brief queda para después.' : err?.message || String(err));
    } finally {
      setBriefBusy(false);
    }
  };

  const handleSaveBrief = (text: string) => {
    updateProject(p => ({ ...p, brief: text, description: text }));
    addLog('brief', 'brief', 'Brief editado por el diseñador');
  };

  /** Recortes propuestos por la IA para una referencia, con lámina sugerida. */
  const segmentReference = async (ref: Reference): Promise<any[]> => {
    const image = await compressImageString(ref.image, { maxWidth: 1024, maxHeight: 1024, quality: 0.85 });
    const p = projectRef.current;
    const res = await fetch('/api/segment-reference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference: { id: ref.id, image }, objective: p.objective, intent: p.intent }),
    });
    const text = await res.text();
    let result: any;
    try {
      result = JSON.parse(text);
    } catch {
      throw serverError(text, res.status);
    }
    if (!res.ok || !result.success) throw new Error(result.details || result.error || 'No se pudo desglosar la referencia');
    const parts: any[] = result.data?.parts ?? [];
    if (!parts.length) throw new Error('La IA no encontró recortes. Marcalos a mano arrastrando sobre la imagen.');
    return parts;
  };

  /* ---------- Corpus ---------- */
  const handleAddReferences = useCallback(
    (refs: Reference[]) => {
      if (!refs.length) return;
      updateProject(p => ({ ...p, references: [...p.references, ...refs] }));
      showToast({ message: refs.length === 1 ? `Referencia al corpus · ${refs[0].id}` : `${refs.length} referencias al corpus · todavía no pesan` });
    },
    [updateProject, showToast],
  );

  const handleAddFiles = useCallback(
    async (files: File[]) => {
      const refs = await filesToReferences(files, projectRef.current.references);
      if (!refs.length) {
        showToast({ message: 'Solo se aceptan imágenes', tone: 'discarded' });
        return;
      }
      handleAddReferences(refs);
    },
    [handleAddReferences, showToast],
  );

  /** Borra una referencia del corpus con sus fragmentos; sale de la evidencia de todos los patrones. */
  const handleDeleteReference = (id: string) => {
    const p = projectRef.current;
    const ref = p.references.find(r => r.id === id);
    if (!ref) return;
    const frags = new Set((p.fragments ?? []).filter(f => f.refId === id).map(f => f.id));
    applyStack(cur => ({
      project: {
        ...cur,
        references: cur.references.filter(r => r.id !== id),
        fragments: (cur.fragments ?? []).filter(f => !frags.has(f.id)),
        patterns: cur.patterns.map(x => ({ ...x, evidence: x.evidence.filter(e => e !== id), fragmentIds: x.fragmentIds?.filter(f => !frags.has(f)) })),
        systems: cur.systems.map(s => ({ ...s, referenceIds: s.referenceIds.filter(r => r !== id) })),
      },
      log: [{ kind: 'discard', targetId: id, label: `Referencia eliminada · ${ref.name}`, reason: frags.size ? `Con ${frags.size} fragmentos` : undefined }],
      message: `Referencia eliminada · ${id}${frags.size ? ` y ${frags.size} fragmentos` : ''}`,
    }));
    clearCachedBreakdown(p.id, id);
  };

  /** Desglose de colores de una referencia (con caché por proyecto). Lo usa la paleta. */
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
    if (!res.ok || !result.success) throw new Error(result.error || result.details || 'Error al desglosar la referencia');
    setCachedBreakdown(projectId, ref.id, result.data);
    updateProject(p => ({ ...p, references: p.references.map(r => (r.id === ref.id ? { ...r, breakdown: result.data } : r)) }), projectId);
    return result.data as ReferenceBreakdown;
  };

  /** Referencias de evidencia de la pila que todavía no tienen sus colores desglosados. */
  const paletteMissing = (() => {
    const ids = new Set(stackOrder(project).flatMap(x => x.pattern.evidence));
    (project.fragments ?? []).filter(f => f.layer != null).forEach(f => ids.add(f.refId));
    return project.references.filter(r => ids.has(r.id) && !r.breakdown);
  })();

  /** La paleta sale del corpus: desglosa los colores de la evidencia que falta. */
  const [paletteBusy, setPaletteBusy] = useState(false);
  const handleCompletePalette = async () => {
    if (paletteBusy) return;
    setPaletteBusy(true);
    let failed = 0;
    const missing = paletteMissing;
    try {
      for (let i = 0; i < missing.length; i++) {
        showToast({ message: `Desglosando colores · ${i + 1} / ${missing.length}` }, 60000);
        try {
          await inspectReference(missing[i]);
        } catch {
          failed++;
        }
      }
      showToast({ message: failed ? `Paleta completada · ${failed} referencias no se pudieron desglosar` : 'Paleta completada desde el corpus' }, 4000);
    } finally {
      setPaletteBusy(false);
    }
  };

  /* ---------- 02 · Revelar ---------- */
  const [reveal, setReveal] = useState<{ status: 'idle' | 'running' | 'error'; message?: string; tick: number }>({ status: 'idle', tick: 0 });
  useEffect(() => {
    if (reveal.status !== 'running') return;
    const t = setInterval(() => setReveal(r => (r.status === 'running' ? { ...r, tick: r.tick + 1 } : r)), 450);
    return () => clearInterval(t);
  }, [reveal.status]);

  /** La IA recorre el corpus buscando los patrones de la pila y revela los que el diseñador no marcó. */
  const handleReveal = async () => {
    const p = projectRef.current;
    if (reveal.status === 'running') return;
    if (corpusRefs(p).length < MIN_REFERENCES) {
      setReveal({ status: 'error', message: `Hacen falta ${MIN_REFERENCES} referencias o más para revelar.`, tick: 0 });
      return;
    }
    const controller = new AbortController();
    revealAbort.current = controller;
    setReveal({ status: 'running', tick: 0 });
    try {
      const body = await buildRevealBody(p);
      const res = await fetch('/api/analyze-references', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let result: any;
      try {
        result = JSON.parse(text);
      } catch {
        throw serverError(text, res.status);
      }
      if (!res.ok || !result.success) throw new Error(result.error || result.details || 'La IA no respondió');
      const detected: any[] = result.data?.patterns ?? [];
      applyStack(cur => {
        const m = mergeRevealed(cur, detected);
        return {
          project: { ...m.project, suggestedSystems: Array.isArray(result.data?.suggestedSystems) ? result.data.suggestedSystems : cur.suggestedSystems },
          log: [{ kind: 'induce', targetId: 'corpus', label: `Revelar · ${corpusRefs(cur).length} referencias`, reason: `${m.strengthened} patrones tuyos con más evidencia · ${m.revealed} revelados` }, ...m.log],
          message: m.revealed ? `${m.revealed} ${m.revealed === 1 ? 'patrón que no marcaste' : 'patrones que no marcaste'} · ubicalos con 1 2 3` : `Sin patrones nuevos · ${m.strengthened} tuyos con más evidencia`,
        };
      });
      setReveal({ status: 'idle', tick: 0 });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setReveal({ status: 'idle', tick: 0 });
        showToast({ message: 'Búsqueda cancelada. La pila no cambió.' });
        return;
      }
      setReveal({ status: 'error', tick: 0, message: err instanceof TypeError ? 'Sin conexión con el servidor. Verificá que "npm run server" esté corriendo.' : err?.message || String(err) });
    } finally {
      revealAbort.current = null;
    }
  };

  // Al entrar a Revelar, la IA recorre el corpus si hace falta (corpus nuevo o patrones que no vio).
  useEffect(() => {
    if (moment === 'revelar' && needsReveal(projectRef.current) && reveal.status === 'idle') void handleReveal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moment, project.id]);

  /* ---------- Patrones escritos a mano (desde la generación) ---------- */
  const openNewPattern = () => setPatternEditor({ draft: emptyDraft(), title: 'Nuevo patrón propio', meta: 'Lo escribís vos · entra sin lámina' });
  const openEditPattern = (pattern: Pattern) =>
    setPatternEditor({ patternId: pattern.id, draft: draftFromPattern(pattern), title: `Editar · ${pattern.id}`, meta: 'Texto y referencias · la búsqueda en el corpus no pisa tus cambios' });

  const handleSavePattern = (draft: PatternDraft) => {
    const editor = patternEditor;
    setPatternEditor(null);
    if (!editor) return;
    const known = new Set(projectRef.current.references.map(r => r.id));
    const evidence = draft.evidence.filter(id => known.has(id));
    const observations = draft.observations.split('\n').map(s => s.trim()).filter(Boolean);
    if (editor.patternId) {
      const id = editor.patternId;
      updateProject(p => ({
        ...p,
        patterns: p.patterns.map(x => (x.id === id ? { ...x, name: draft.name, category: draft.category, description: draft.description, relatedObservations: observations, evidence, evidenceLocked: true } : x)),
      }));
      addLog('pattern_edit', id, `Patrón editado · ${draft.name}`, `${evidence.length} referencias`);
      showToast({ message: `Patrón actualizado · ${id}`, tone: 'confirmed' });
      return;
    }
    const used = projectRef.current.patterns.map(x => Number(/^pat_u(\d+)$/.exec(x.id)?.[1] ?? 0));
    const id = `pat_u${String(Math.max(0, ...used) + 1).padStart(2, '0')}`;
    const pattern: Pattern = {
      id,
      name: draft.name,
      category: draft.category,
      description: draft.description,
      evidence,
      confidence: 1,
      status: 'confirmed',
      relatedObservations: observations,
      origin: 'designer',
      evidenceLocked: true,
      trend: 'new',
      // Lo escribió el diseñador: no es revelado y nace auditado. La lámina la elige él.
      layer: null,
      aiSuggestedLayer: null,
      audited: true,
      revealed: false,
      fragmentIds: [],
    };
    updateProject(p => ({ ...p, patterns: [...p.patterns, pattern] }));
    addLog('pattern_add', id, `Patrón propio · ${draft.name}`, `${evidence.length} referencias`);
    showToast({ message: `Patrón propio · ${id} · espera lámina en el corpus`, tone: 'confirmed' });
  };

  // Esc cierra la generación con DALL·E y vuelve a la página.
  useShortcuts(generateOpen && !patternEditor && !lightboxRef, { escape: () => setGenerateOpen(false) });

  const spaceEnabled = !overlay && !patternEditor && !isUploadOpen && !lightboxRef && !deleteRequest && !isLogOpen && !generateOpen && !mapOpen;

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
          setMoment('armar');
          setBriefRequest(n => n + 1);
        }}
        onDeleteProject={() => setDeleteRequest('current')}
        onDeleteAllProjects={() => setDeleteRequest('all')}
        onExportBackup={handleExportBackup}
        onImportBackup={handleImportBackup}
        onLoadExample={handleLoadExample}
        onDownloadDossier={() => downloadProjectMarkdown(project)}
        onOpenLog={() => setIsLogOpen(o => !o)}
        onOpenMap={() => setMapOpen(o => !o)}
        isMapOpen={mapOpen}
        onOpenAbout={() => setOverlay({ kind: 'about' })}
        isLogOpen={isLogOpen}
        moment={moment}
        onSelectMoment={setMoment}
      />

      <main id="main" tabIndex={-1} className={`relative min-h-0 flex-1 outline-none print:overflow-visible ${overlay ? 'print:hidden' : ''}`}>
        {mapOpen && <TraceMap project={project} onBack={() => setMapOpen(false)} />}
        {!mapOpen && (
          <SpaceView
            key={project.id}
            project={project}
            enabled={spaceEnabled}
            notice={toast ? { text: toast.message } : null}
            apply={applyStack}
            onAddFiles={handleAddFiles}
            onOpenUpload={() => setIsUploadOpen(true)}
            onDeleteReference={handleDeleteReference}
            onSubmitIntent={handleSubmitIntent}
            briefBusy={briefBusy}
            briefError={briefError}
            onSaveBrief={handleSaveBrief}
            briefRequest={briefRequest}
            segment={segmentReference}
            moment={moment}
            reveal={reveal}
            onReveal={handleReveal}
            onCancelReveal={() => revealAbort.current?.abort()}
            view={stackView}
            onToggleView={toggleView}
            onOpenGenerate={() => setGenerateOpen(true)}
            onNotice={text => showToast({ message: text })}
            paletteMissing={paletteMissing.length}
            paletteBusy={paletteBusy}
            onCompletePalette={handleCompletePalette}
          />
        )}
        {!mapOpen && generateOpen && (
          <div className="absolute inset-0 z-40 flex flex-col bg-void">
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-line px-4">
              <button type="button" className="type-label text-[12px] text-ink-2 hover:text-ink" onClick={() => setGenerateOpen(false)}>
                ← VOLVER A LA PÁGINA · ESC
              </button>
              <span className="font-mono text-[11px] text-ink-2">VERIFICACIÓN EXTERNA · el prompt sigue el orden de las láminas</span>
            </div>
            <div className="min-h-0 flex-1">
              <SystemApplicationView
                project={project}
                system={stackSystem(project)}
                systems={[stackSystem(project)]}
                onSelectSystem={() => {}}
                onOpenGuidelines={() => setGenerateOpen(false)}
                onOpenLightbox={setLightboxRef}
                onNewPattern={openNewPattern}
                onEditPattern={openEditPattern}
                session={project.applications?.stack}
                onSaveSession={session => {
                  const pid = project.id;
                  updateProject(x => ({ ...x, applications: { ...(x.applications ?? {}), stack: session } }), pid);
                }}
                extraBody={{ stack: stackPayload(project) }}
              />
            </div>
          </div>
        )}
      </main>

      <UploadModal isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} existing={project.references} onAddFiles={files => handleAddFiles(files)} onAddReferences={handleAddReferences} />
      <LightboxModal reference={lightboxRef} onClose={() => setLightboxRef(null)} />
      {patternEditor && (
        <PatternEditor
          title={patternEditor.title}
          meta={patternEditor.meta}
          initial={patternEditor.draft}
          references={project.references}
          saveLabel={patternEditor.patternId ? 'Guardar cambios' : 'Crear patrón'}
          onSave={handleSavePattern}
          onClose={() => setPatternEditor(null)}
        />
      )}

      <Modal
        open={!!deleteRequest}
        title={deleteRequest === 'all' ? 'Eliminar todos los proyectos' : 'Eliminar proyecto'}
        meta="No se puede deshacer"
        width={440}
        onClose={() => setDeleteRequest(null)}
      >
        <div className="flex flex-col gap-4 p-5">
          <p className="m-0 text-13 text-ink">
            {deleteRequest === 'all'
              ? `Se borran los ${projectsList.length} proyectos de este navegador, con sus referencias, patrones y bitácora.`
              : `Se borra “${project.name.trim() || 'Proyecto sin nombre'}” con sus ${project.references.length} referencias, ${project.patterns.length} patrones y su bitácora.`}
          </p>
          <p className="m-0 text-13 text-ink-2">
            {deleteRequest === 'all'
              ? 'Si querés conservar copias, descargá antes el respaldo completo de cada proyecto desde el menú del proyecto.'
              : 'Si querés conservar una copia, descargá antes el respaldo completo: incluye referencias, la pila y las piezas generadas.'}
          </p>
          {deleteRequest === 'current' && (
            <div>
              <Button size="sm" variant="secondary" onClick={handleExportBackup}>
                Descargar respaldo completo
              </Button>
            </div>
          )}
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

      <LogDrawer open={isLogOpen} project={project} onClose={() => setIsLogOpen(false)} onAddRule={fb => {
        // Las reglas y ajustes del diseñador se guardan como feedback: la IA los usa la próxima vez que revela.
        const item = makeFeedback({ type: fb.type, comment: fb.comment });
        updateProject(p => ({ ...p, feedback: [...p.feedback, item] }));
        addLog('feedback', 'proyecto', fb.type === 'designer_rule' ? 'Regla del diseñador' : 'Ajuste', fb.comment, { feedbackId: item.id });
        showToast({ message: 'Regla guardada · se usa la próxima vez que la IA revela' });
      }} />

      {overlay?.kind === 'about' && <AboutView onBack={() => setOverlay(null)} />}
    </div>
  );
}
