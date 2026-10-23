import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LogItem, LogKind, Pattern, Project, Reference, ReferenceBreakdown, VisitableStage, VisualSystem } from './types';
import { evidenceReferences, inferPalette } from './utils/palette';
import { SAMPLE_PROJECTS, createEmptyProject } from './data/sampleProjects';
import { compressImageString, compressReferences } from './utils/imageCompressor';
import { clearCachedBreakdown, getCachedBreakdown, setCachedBreakdown } from './utils/inspectorCache';
import { downloadProjectMarkdown, exportProjectAsJSON, parseVisualSystemJSON } from './utils/exportHelpers';
import { filesToReferences, makeFeedback, makeLog, mergeInducedPatterns, migrateProject, uid } from './utils/project';
import { MIN_REFERENCES, STAGE_LABEL, canEnter, initialStage, isBriefComplete, railItems } from './utils/stages';

import { Button } from './components/ui';
import { TopBar } from './components/shell/TopBar';
import { ActionBar, Toast } from './components/shell/ActionBar';
import { DockPanel } from './components/shell/DockPanel';
import { CorpusView } from './components/canvas/CanvasArea';
import { UploadModal } from './components/UploadModal';
import { LightboxModal } from './components/LightboxModal';
import { AboutView } from './components/AboutView';
import { SystemDetail } from './components/synthesis/SystemDetail';
import { SystemApplicationView } from './components/SystemApplicationView';
import { GuidelinesView } from './components/GuidelinesView';
import { LogDrawer } from './components/LogDrawer';

import { BriefDraft, BriefStage } from './stages/BriefStage';
import { CorpusStage, InductionState } from './stages/CorpusStage';
import { AuditFilter, AuditStage, filterPatterns } from './stages/AuditStage';
import { SynthesisStage } from './stages/SynthesisStage';

const LIST_KEY = 'emergent_projects_list_v4';
const ACTIVE_KEY = 'emergent_active_project_v4';
const LEGACY_SINGLE_KEY = 'emergent_visual_system_project_v3';

type Overlay = null | { kind: 'about' } | { kind: 'guidelines'; systemId: string } | { kind: 'apply'; systemId: string };

/** Claves que usaba el onboarding anterior (fuera de React). Ya no se leen. */
const LEGACY_ONBOARDING_KEYS = ['emergent_user_brief_confirmed', 'emergent_visual_system_projects_store_v4'];

function loadProjects(): Project[] {
  try {
    LEGACY_ONBOARDING_KEYS.forEach(k => localStorage.removeItem(k));
    const saved = localStorage.getItem(LIST_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.map(migrateProject);
    }
    const single = localStorage.getItem(LEGACY_SINGLE_KEY);
    if (single) {
      const parsed = JSON.parse(single);
      if (parsed && typeof parsed === 'object') return [migrateProject(parsed)];
    }
  } catch (e) {
    console.error('No se pudo leer la lista de proyectos', e);
  }
  return [createEmptyProject()];
}

const STAGE_NUM: Record<VisitableStage, string> = { brief: '01', corpus: '02', audit: '04', synthesis: '05' };

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

export default function App() {
  /* ========== Proyectos ========== */
  const [projectsList, setProjectsList] = useState<Project[]>(loadProjects);
  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    const saved = localStorage.getItem(ACTIVE_KEY);
    return saved && projectsList.some(p => p.id === saved) ? saved : projectsList[0].id;
  });
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

  useEffect(() => {
    try {
      localStorage.setItem(LIST_KEY, JSON.stringify(projectsList));
      localStorage.setItem(ACTIVE_KEY, activeProjectId);
    } catch (e) {
      console.warn('No se pudo guardar en localStorage (¿espacio lleno?)', e);
    }
  }, [projectsList, activeProjectId]);

  /* ========== UI ========== */

  const [stage, setStage] = useState<VisitableStage>(() => initialStage(project));
  const [view, setView] = useState<CorpusView>('canvas');
  const [selectedRefId, setSelectedRefId] = useState<string | null>(null);
  const [auditIndex, setAuditIndex] = useState(0);
  const [auditFilter, setAuditFilter] = useState<AuditFilter>('pending');
  const [systemDetailId, setSystemDetailId] = useState<string | null>(null);
  const [focusSystemId, setFocusSystemId] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [lightboxRef, setLightboxRef] = useState<Reference | null>(null);
  const [briefDraft, setBriefDraft] = useState<BriefDraft>({ name: project.name, objective: project.objective, description: project.description });

  /* ========== Asincronía ========== */
  const [induction, setInduction] = useState<InductionState>({ status: 'idle', tick: 0 });
  const abortRef = useRef<AbortController | null>(null);
  const [inspectingIds, setInspectingIds] = useState<string[]>([]);
  const [inspectErrors, setInspectErrors] = useState<Record<string, string>>({});
  const [synthesisErrors, setSynthesisErrors] = useState<Record<string, string>>({});
  const [inferringIds, setInferringIds] = useState<string[]>([]);

  /* ========== Toast ========== */
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((t: Omit<Toast, 'id'>, ms = 3000) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ ...t, id: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);
  const dismissToast = useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
  }, []);

  /** Agrega entradas a la bitácora del proyecto. */
  const addLog = useCallback(
    (kind: LogKind, targetId: string, label: string, reason?: string, opts: { feedbackId?: string; projectId?: string } = {}): LogItem => {
      const item = makeLog(kind, targetId, label, reason, opts.feedbackId);
      updateProject(p => ({ ...p, log: [...(p.log ?? []), item] }), opts.projectId);
      return item;
    },
    [updateProject],
  );

  /* ========== Etapas ========== */
  // Persistir la etapa en el proyecto para recuperarla al recargar.
  useEffect(() => {
    if (project.uiStage !== stage) updateProject(p => ({ ...p, uiStage: stage }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, project.id]);

  // Si la etapa actual deja de ser válida (p. ej. se borró el último patrón), volver a una válida.
  useEffect(() => {
    if (!canEnter(project, stage)) setStage(initialStage({ ...project, uiStage: undefined }));
  }, [project, stage]);

  const goToStage = useCallback(
    (s: VisitableStage) => {
      const p = projectRef.current;
      if (!canEnter(p, s) || induction.status === 'running') return;
      if (s === 'brief') setBriefDraft({ name: p.name, objective: p.objective, description: p.description });
      setSystemDetailId(null);
      setStage(s);
    },
    [induction.status],
  );

  const resetUiForProject = (p: Project) => {
    abortRef.current?.abort();
    setInduction({ status: 'idle', tick: 0 });
    setSelectedRefId(null);
    setSystemDetailId(null);
    setAuditIndex(0);
    setAuditFilter('pending');
    setOverlay(null);
    setBriefDraft({ name: p.name, objective: p.objective, description: p.description });
    setStage(initialStage(p));
  };

  /* ========== Proyectos: acciones ========== */
  const handleSelectProject = (id: string) => {
    const p = projectsList.find(x => x.id === id);
    if (!p) return;
    setActiveProjectId(id);
    resetUiForProject(p);
  };

  const handleNewProject = () => {
    const p = createEmptyProject();
    setProjectsList(list => [...list, p]);
    setActiveProjectId(p.id);
    resetUiForProject(p);
  };

  const handleOpenSample = (id: string) => {
    const existing = projectsList.find(p => p.id === id);
    if (existing) return handleSelectProject(id);
    const sample = SAMPLE_PROJECTS.find(s => s.id === id);
    if (!sample) return;
    const copy = migrateProject(structuredClone(sample));
    setProjectsList(list => {
      // Si el proyecto activo está vacío y sin nombre, el ejemplo lo reemplaza.
      const active = list.find(p => p.id === activeProjectId);
      const isBlank = active && !active.name && !active.objective && !active.references.length;
      return isBlank ? list.map(p => (p.id === activeProjectId ? copy : p)) : [...list, copy];
    });
    setActiveProjectId(copy.id);
    resetUiForProject(copy);
  };

  const handleSubmitBrief = () => {
    const d = { name: briefDraft.name.trim(), objective: briefDraft.objective.trim(), description: briefDraft.description.trim() };
    if (!d.name || !d.objective) return;
    const changed = d.name !== project.name || d.objective !== project.objective || d.description !== project.description;
    updateProject(p => ({ ...p, ...d }));
    if (changed) addLog('brief', 'brief', isBriefComplete(project) ? 'Brief actualizado' : 'Brief definido', d.objective);
    setStage('corpus');
  };

  /* ========== Corpus ========== */
  const handleAddReferences = useCallback(
    (refs: Reference[]) => {
      if (!refs.length) return;
      updateProject(p => ({ ...p, references: [...p.references, ...refs] }));
      showToast({ message: refs.length === 1 ? `Referencia agregada · ${refs[0].id}` : `${refs.length} referencias agregadas`, tone: 'pending' });
    },
    [updateProject, showToast],
  );

  const handleAddFiles = useCallback(
    async (files: File[], at?: { x: number; y: number }) => {
      const refs = await filesToReferences(files, projectRef.current.references, { at });
      if (!refs.length) {
        showToast({ message: 'Solo se aceptan imágenes', tone: 'discarded' });
        return;
      }
      handleAddReferences(refs);
      if (refs.length === 1) setSelectedRefId(refs[0].id);
    },
    [handleAddReferences, showToast],
  );

  const handleUpdateReference = useCallback(
    (id: string, updates: Partial<Reference>) => updateProject(p => ({ ...p, references: p.references.map(r => (r.id === id ? { ...r, ...updates } : r)) })),
    [updateProject],
  );

  const handleMoveReference = useCallback((id: string, position: { x: number; y: number }) => handleUpdateReference(id, { position }), [handleUpdateReference]);
  const handleResizeReference = useCallback((id: string, width: number) => handleUpdateReference(id, { width }), [handleUpdateReference]);

  const handleDeleteReference = (id: string) => {
    updateProject(p => ({
      ...p,
      references: p.references.filter(r => r.id !== id),
      patterns: p.patterns.map(pt => ({ ...pt, evidence: pt.evidence.filter(e => e !== id) })),
      systems: p.systems.map(s => ({ ...s, referenceIds: s.referenceIds.filter(r => r !== id) })),
    }));
    clearCachedBreakdown(project.id, id);
    setSelectedRefId(null);
    showToast({ message: `Referencia eliminada · ${id}`, tone: 'discarded' });
  };

  /** Desglose individual con caché por proyecto. `force` ignora el caché. */
  const handleInspectReference = async (ref: Reference, force = false): Promise<ReferenceBreakdown | null> => {
    const projectId = project.id;
    setInspectErrors(e => {
      const { [ref.id]: _, ...rest } = e;
      return rest;
    });
    if (!force) {
      const cached = ref.breakdown ?? getCachedBreakdown(projectId, ref.id);
      if (cached) {
        if (!ref.breakdown) updateProject(p => ({ ...p, references: p.references.map(r => (r.id === ref.id ? { ...r, breakdown: cached } : r)) }), projectId);
        return cached;
      }
    }
    setInspectingIds(ids => [...ids, ref.id]);
    try {
      const image = await compressImageString(ref.image, { maxWidth: 1024, maxHeight: 1024, quality: 0.8 });
      const res = await fetch('/api/inspect-reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference: { ...ref, image } }),
      });
      const text = await res.text();
      let result: any;
      try {
        result = JSON.parse(text);
      } catch {
        throw new Error(`El servidor no devolvió una respuesta válida (HTTP ${res.status}). ¿Está corriendo "npm run server"?`);
      }
      if (!res.ok || !result.success) throw new Error(result.error || result.details || 'Error al desglosar la referencia');
      setCachedBreakdown(projectId, ref.id, result.data);
      updateProject(p => ({ ...p, references: p.references.map(r => (r.id === ref.id ? { ...r, breakdown: result.data } : r)) }), projectId);
      return result.data as ReferenceBreakdown;
    } catch (err: any) {
      setInspectErrors(e => ({ ...e, [ref.id]: err?.message || String(err) }));
      return null;
    } finally {
      setInspectingIds(ids => ids.filter(x => x !== ref.id));
    }
  };

  /* ========== Inducción ========== */
  useEffect(() => {
    if (induction.status !== 'running') return;
    const t = setInterval(() => setInduction(s => (s.status === 'running' ? { ...s, tick: s.tick + 1 } : s)), 900);
    return () => clearInterval(t);
  }, [induction.status]);

  const handleInduce = async () => {
    const p = projectRef.current;
    if (p.references.length < MIN_REFERENCES || induction.status === 'running') return;
    const projectId = p.id;
    const controller = new AbortController();
    abortRef.current = controller;
    setSelectedRefId(null);
    setInduction({ status: 'running', tick: 0 });
    updateProject(x => ({ ...x, status: p.patterns.length ? 'updating' : 'analyzing' }), projectId);

    try {
      const compressed = await compressReferences(p.references, { maxWidth: 1024, maxHeight: 1024, quality: 0.8 });
      const res = await fetch('/api/analyze-references', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          references: compressed,
          projectName: p.name,
          objective: p.objective,
          description: p.description,
          previousPatterns: p.patterns,
          confirmedPatterns: p.patterns.filter(x => x.status === 'confirmed'),
          discardedPatterns: p.patterns.filter(x => x.status === 'discarded'),
          feedback: p.feedback,
        }),
      });
      const text = await res.text();
      let result: any;
      try {
        result = JSON.parse(text);
      } catch {
        throw Object.assign(new Error('El servidor de análisis no devolvió una respuesta válida.'), { code: `HTTP ${res.status}`, detail: text.slice(0, 400) });
      }
      if (!res.ok || !result.success) {
        throw Object.assign(new Error('Gemini no respondió'), { code: `ERROR ${res.status}`, detail: result.error || result.details || 'Error desconocido' });
      }

      const { patterns: detected = [], suggestedSystems = [] } = result.data || {};
      // La fusión se calcula una vez (el corpus está bloqueado durante la inducción).
      const { merged, newCount } = mergeInducedPatterns(projectRef.current.patterns, detected);
      updateProject(prev => {
        return {
          ...prev,
          status: 'analyzed',
          lastAnalyzedAt: new Date().toISOString(),
          patterns: merged,
          // Las propuestas de la IA quedan como sugerencias; no se crean sistemas.
          suggestedSystems: Array.isArray(suggestedSystems) ? suggestedSystems : [],
          references: prev.references.map(r => ({ ...r, isNew: false })),
        };
      }, projectId);

      addLog('induce', 'corpus', `Inducción · ${p.references.length} referencias, ${detected.length} patrones (${newCount} nuevos)`, p.patterns.length ? 'Reinducción con decisiones previas como contexto.' : 'Primera lectura del corpus.', { projectId });
      setInduction({ status: 'idle', tick: 0 });
      if (projectRef.current.id === projectId) {
        setAuditFilter('pending');
        setAuditIndex(0);
        setStage('audit');
        showToast({ message: `Inducción · ${p.references.length} referencias, ${detected.length} patrones`, tone: 'evidence' }, 4000);
      }
    } catch (err: any) {
      updateProject(x => ({ ...x, status: x.patterns.length ? 'analyzed' : 'draft' }), projectId);
      if (err?.name === 'AbortError') {
        setInduction({ status: 'idle', tick: 0 });
        showToast({ message: 'Inducción cancelada. El corpus no cambió.' });
        return;
      }
      const offline = err instanceof TypeError;
      setInduction({
        status: 'error',
        tick: 0,
        error: {
          code: err?.code ?? (offline ? 'SIN CONEXIÓN' : 'ERROR'),
          title: offline ? 'No se pudo conectar con el servidor' : err?.message || 'La inducción falló',
          detail: err?.detail ?? (offline ? 'Verificá que "npm run server" esté corriendo en el puerto 3000.' : String(err?.message || err)),
        },
      });
    } finally {
      abortRef.current = null;
    }
  };

  const handleCancelInduction = () => abortRef.current?.abort();

  /* ========== Auditoría ========== */
  const advanceAfterDecision = (decidedId: string, after: Pattern[]) => {
    const list = filterPatterns(after, auditFilter);
    const pos = list.findIndex(p => p.id === decidedId);
    if (pos === -1) {
      // Salió del filtro (p. ej. "Pendientes"): el índice ya apunta al siguiente.
      setAuditIndex(i => Math.min(i, Math.max(list.length - 1, 0)));
      return;
    }
    for (let k = 1; k <= list.length; k++) {
      const cand = list[(pos + k) % list.length];
      if (cand.status === 'detected') {
        setAuditIndex((pos + k) % list.length);
        return;
      }
    }
  };

  const setPatterns = (fn: (ps: Pattern[]) => Pattern[]) => {
    const next = fn(projectRef.current.patterns);
    updateProject(p => ({ ...p, patterns: fn(p.patterns) }));
    return next;
  };

  /**
   * Deshacer una decisión de auditoría: vuelve el patrón a su estado anterior, devuelve su lugar en los
   * sistemas, quita la entrada de bitácora y el feedback que generó, y vuelve a mostrarlo.
   */
  const undoDecision = (snapshot: Pattern, systemIds: string[], logId: string, feedbackId?: string) => {
    updateProject(p => ({
      ...p,
      patterns: p.patterns.map(x => (x.id === snapshot.id ? snapshot : x)),
      systems: p.systems.map(s => (systemIds.includes(s.id) && !s.patternIds.includes(snapshot.id) ? { ...s, patternIds: [...s.patternIds, snapshot.id] } : s)),
      log: (p.log ?? []).filter(l => l.id !== logId),
      feedback: feedbackId ? p.feedback.filter(f => f.id !== feedbackId) : p.feedback,
    }));
    const list = filterPatterns(projectRef.current.patterns.map(x => (x.id === snapshot.id ? snapshot : x)), auditFilter);
    const idx = list.findIndex(x => x.id === snapshot.id);
    if (idx >= 0) setAuditIndex(idx);
    showToast({ message: `Deshecho · ${snapshot.id} vuelve a ${snapshot.status === 'detected' ? 'pendiente' : snapshot.status}` });
  };

  const handleConfirmPattern = (pattern: Pattern) => {
    const snapshot = projectRef.current.patterns.find(p => p.id === pattern.id) ?? pattern;
    const after = setPatterns(ps => ps.map(p => (p.id === pattern.id ? { ...p, status: 'confirmed' as const } : p)));
    advanceAfterDecision(pattern.id, after);
    const entry = addLog('confirm', pattern.id, `Confirmado · ${pattern.name}`);
    showToast({ message: `Confirmado · ${pattern.id}`, tone: 'confirmed', action: { label: 'Deshacer', onClick: () => undoDecision(snapshot, [], entry.id) } });
  };

  const handleDiscardPattern = (pattern: Pattern, reason: string) => {
    const snapshot = projectRef.current.patterns.find(p => p.id === pattern.id) ?? pattern;
    const inSystems = projectRef.current.systems.filter(s => s.patternIds.includes(pattern.id)).map(s => s.id);
    const fb = makeFeedback({ patternId: pattern.id, type: 'pattern_rejection', comment: `Patrón "${pattern.name}" descartado: ${reason}` });
    const after = pattern.status === 'detected' ? projectRef.current.patterns.map(p => (p.id === pattern.id ? { ...p, status: 'discarded' as const } : p)) : projectRef.current.patterns;
    updateProject(p => ({
      ...p,
      patterns: p.patterns.map(x => (x.id === pattern.id ? { ...x, status: 'discarded' as const, discardReason: reason, assignedSystemId: null } : x)),
      systems: p.systems.map(s => ({ ...s, patternIds: s.patternIds.filter(id => id !== pattern.id) })),
      feedback: [...p.feedback, fb],
    }));
    advanceAfterDecision(pattern.id, after);
    const entry = addLog('discard', pattern.id, `Descartado · ${pattern.name}`, reason, { feedbackId: fb.id });
    showToast({
      message: `Descartado · ${pattern.id}`,
      tone: 'discarded',
      action: { label: 'Deshacer', onClick: () => undoDecision(snapshot, inSystems, entry.id, fb.id) },
    });
  };

  const handleSaveNote = (pattern: Pattern, note: string) => {
    setPatterns(ps => ps.map(p => (p.id === pattern.id ? { ...p, designerNotes: note || undefined } : p)));
    addLog('note', pattern.id, note ? 'Nota del diseñador' : 'Nota borrada', note || undefined);
    showToast({ message: note ? `Nota guardada · ${pattern.id}` : `Nota borrada · ${pattern.id}` });
  };

  const handleRestorePattern = (pattern: Pattern) => {
    updateProject(p => ({
      ...p,
      patterns: p.patterns.map(x => (x.id === pattern.id ? { ...x, status: 'detected' as const, assignedSystemId: null } : x)),
      systems: p.systems.map(s => ({ ...s, patternIds: s.patternIds.filter(id => id !== pattern.id) })),
    }));
    addLog('restore', pattern.id, `Restaurado a pendiente · ${pattern.name}`);
    showToast({ message: `Restaurado a pendiente · ${pattern.id}`, tone: 'pending' });
  };

  /* ========== Síntesis ========== */
  const updateSystem = (id: string, fn: (s: VisualSystem) => VisualSystem) => updateProject(p => ({ ...p, systems: p.systems.map(s => (s.id === id ? fn(s) : s)) }));

  const createSystem = (patternIds: string[] = [], name?: string) => {
    const id = uid('sys');
    const n = projectRef.current.systems.length + 1;
    const sys: VisualSystem = {
      id,
      name: name || `Sistema ${n}`,
      description: '',
      patternIds,
      referenceIds: [],
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    updateProject(p => ({
      ...p,
      systems: [...p.systems, sys],
      patterns: p.patterns.map(x => (patternIds.includes(x.id) ? { ...x, assignedSystemId: id } : x)),
    }));
    setFocusSystemId(id);
    addLog('system_create', id, `Sistema creado · ${sys.name}`, patternIds.length ? `Con ${patternIds.join(', ')}` : undefined);
    return sys;
  };

  const handleAssign = (patternId: string, systemId: string) => {
    const pat = projectRef.current.patterns.find(p => p.id === patternId);
    if (!pat || pat.status !== 'confirmed') return;
    updateProject(p => ({
      ...p,
      systems: p.systems.map(s => (s.id === systemId && !s.patternIds.includes(patternId) ? { ...s, patternIds: [...s.patternIds, patternId] } : s)),
      patterns: p.patterns.map(x => (x.id === patternId ? { ...x, assignedSystemId: systemId } : x)),
    }));
    const sys = projectRef.current.systems.find(s => s.id === systemId);
    addLog('assign', patternId, `Asignado → ${sys?.name ?? systemId}`);
    showToast({ message: `${patternId} → ${sys?.name ?? systemId}`, tone: 'confirmed' });
  };

  const handleUnassign = (patternId: string, systemId: string) => {
    const sysName = projectRef.current.systems.find(s => s.id === systemId)?.name ?? systemId;
    addLog('unassign', patternId, `Quitado de ${sysName}`);
    updateProject(p => {
      const systems = p.systems.map(s => (s.id === systemId ? { ...s, patternIds: s.patternIds.filter(id => id !== patternId) } : s));
      const still = systems.find(s => s.patternIds.includes(patternId));
      return { ...p, systems, patterns: p.patterns.map(x => (x.id === patternId ? { ...x, assignedSystemId: still?.id ?? null } : x)) };
    });
  };

  const handleDeleteSystem = (id: string) => {
    const sys = projectRef.current.systems.find(s => s.id === id);
    updateProject(p => ({
      ...p,
      systems: p.systems.filter(s => s.id !== id),
      patterns: p.patterns.map(x => (x.assignedSystemId === id ? { ...x, assignedSystemId: null } : x)),
    }));
    if (systemDetailId === id) setSystemDetailId(null);
    addLog('system_delete', id, `Sistema eliminado · ${sys?.name ?? id}`);
    showToast({ message: `Sistema eliminado · ${sys?.name ?? id}`, tone: 'discarded' });
  };

  const handleSynthesize = async (systemId: string) => {
    const p = projectRef.current;
    const projectId = p.id;
    const sys = p.systems.find(s => s.id === systemId);
    if (!sys) return;
    const sysPatterns = p.patterns.filter(x => sys.patternIds.includes(x.id) && x.status === 'confirmed');
    const sysRefs = p.references.filter(r => sysPatterns.some(x => x.evidence.includes(r.id)));
    setSynthesisErrors(e => {
      const { [systemId]: _, ...rest } = e;
      return rest;
    });
    updateSystem(systemId, s => ({ ...s, isSynthesizing: true }));
    try {
      // La paleta se infiere del corpus antes de redactar; la IA no la reemplaza.
      if (!sys.colorPalette?.length) await handleInferPalette(systemId, true);
      const res = await fetch('/api/synthesize-system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: sys,
          patterns: sysPatterns,
          references: sysRefs.map(r => ({ id: r.id, name: r.name, notes: r.notes })),
          projectName: p.name,
          projectObjective: p.objective,
          projectDescription: p.description,
        }),
      });
      const result = await res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }));
      if (!result.success || !result.data) throw new Error(result.error || result.details || 'Respuesta vacía');
      const d = result.data;
      updateProject(
        x => ({
          ...x,
          systems: x.systems.map(s =>
            s.id !== systemId
              ? s
              : {
                  ...s,
                  name: s.name,
                  description: d.description || s.description,
                  aestheticPillars: d.aestheticPillars || s.aestheticPillars,
                  // Se conserva la paleta inferida del corpus (con trazabilidad).
                  colorPalette: s.colorPalette,
                  typographyRules: d.typographyRules || s.typographyRules,
                  textureRules: d.textureRules || s.textureRules,
                  compositionRules: d.compositionRules || s.compositionRules,
                  systemDetails: d.systemDetails || s.systemDetails,
                  sources: d.sources || s.sources,
                  isSynthesizing: false,
                  updatedAt: new Date().toISOString(),
                },
          ),
        }),
        projectId,
      );
      addLog('synthesize', systemId, `Redactado con IA · ${sys.name}`, `${sysPatterns.length} patrones, ${sysRefs.length} referencias`, { projectId });
      showToast({ message: `Sistema redactado · ${sys.name}`, tone: 'confirmed' });
    } catch (err: any) {
      updateProject(x => ({ ...x, systems: x.systems.map(s => (s.id === systemId ? { ...s, isSynthesizing: false } : s)) }), projectId);
      setSynthesisErrors(e => ({ ...e, [systemId]: err?.message || String(err) }));
    }
  };

  const handleImportSystemFile = async (file: File) => {
    const data = parseVisualSystemJSON(await file.text());
    if (!data) {
      showToast({ message: 'El archivo no tiene la estructura de un sistema exportado por Emergent', tone: 'discarded' }, 5000);
      return;
    }
    const sysId = uid('sys');
    updateProject(prev => {
      const importedPatterns: Pattern[] = (data.confirmedPatterns || []).map(x => ({
        id: x.id,
        name: x.name,
        category: x.category,
        description: x.description,
        evidence: x.evidence,
        confidence: 0.95,
        status: 'confirmed',
        assignedSystemId: sysId,
        designerNotes: x.designerNotes,
        relatedObservations: ['Importado desde un sistema confirmado'],
        trend: 'strengthened',
      }));
      const importedRefs: Reference[] = (data.supportingReferences || []).map((r, i) => ({
        id: r.id,
        name: r.name,
        image: r.image,
        tags: r.tags || ['Importado'],
        notes: r.notes,
        position: { x: 80 + (i % 4) * 300, y: 80 + Math.floor(i / 4) * 420 },
        width: 260,
        height: 340,
        createdAt: new Date().toISOString(),
      }));
      const patIds = new Set(importedPatterns.map(x => x.id));
      const refIds = new Set(importedRefs.map(x => x.id));
      return {
        ...prev,
        systems: [
          ...prev.systems,
          {
            id: sysId,
            name: data.system.name,
            description: data.system.description,
            patternIds: [...patIds],
            referenceIds: [...refIds],
            aestheticPillars: data.system.aestheticPillars || [],
            colorPalette: data.system.colorPalette,
            typographyRules: data.system.typographyRules,
            textureRules: data.system.textureRules,
            compositionRules: data.system.compositionRules,
            status: 'active',
            createdAt: new Date().toISOString(),
          },
        ],
        patterns: [...prev.patterns.filter(x => !patIds.has(x.id)), ...importedPatterns],
        references: [...prev.references.filter(x => !refIds.has(x.id)), ...importedRefs],
      };
    });
    addLog('import', sysId, `Sistema importado · ${data.system.name}`, `${data.confirmedPatterns?.length || 0} patrones desde .json`);
    if (stage !== 'synthesis') setStage('synthesis');
    showToast({ message: `Sistema importado · ${data.system.name} (${data.confirmedPatterns?.length || 0} patrones)`, tone: 'confirmed' }, 4000);
  };

  /**
   * Paleta inferida del corpus para un sistema. Si a alguna referencia de evidencia
   * le falta el desglose, se pide a /api/inspect-reference antes de calcular.
   */
  const handleInferPalette = async (systemId: string, silent = false) => {
    const p = projectRef.current;
    const projectId = p.id;
    const sys = p.systems.find(s => s.id === systemId);
    if (!sys) return;
    const patterns = p.patterns.filter(x => sys.patternIds.includes(x.id) && x.status === 'confirmed');
    if (!patterns.length) return;
    setInferringIds(ids => [...ids, systemId]);
    try {
      const refs = evidenceReferences(patterns, p.references);
      const withBreakdown: Reference[] = [];
      const missing = refs.filter(r => !r.breakdown && !getCachedBreakdown(projectId, r.id));
      let done = 0;
      for (const r of refs) {
        let b = r.breakdown ?? getCachedBreakdown(projectId, r.id);
        if (!b) {
          done++;
          showToast({ message: `Desglosando ${r.id} para inferir la paleta · ${done} / ${missing.length}`, tone: 'evidence' }, 60000);
          b = await handleInspectReference(r);
        }
        withBreakdown.push(b ? { ...r, breakdown: b } : r);
      }
      const palette = inferPalette(patterns, withBreakdown);
      updateProject(x => ({ ...x, systems: x.systems.map(s => (s.id === systemId ? { ...s, colorPalette: palette, updatedAt: new Date().toISOString() } : s)) }), projectId);
      const failed = missing.filter(r => !withBreakdown.find(w => w.id === r.id)?.breakdown).length;
      if (!palette.length) showToast({ message: 'La evidencia no tiene colores desglosados: no se pudo inferir la paleta', tone: 'discarded' }, 5000);
      else if (failed) showToast({ message: `Paleta inferida con ${palette.length} colores · ${failed} referencias sin desglose`, tone: 'pending' }, 5000);
      else if (!silent || missing.length) showToast({ message: `Paleta inferida · ${palette.length} colores de ${refs.length} referencias`, tone: 'confirmed' });
      return palette;
    } finally {
      setInferringIds(ids => ids.filter(x => x !== systemId));
    }
  };

  /** Adoptar una sugerencia de la IA: crea un sistema real solo con patrones confirmados. */
  const handleAdoptSuggestion = (id: string) => {
    const p = projectRef.current;
    const sug = p.suggestedSystems?.find(s => s.id === id);
    if (!sug) return;
    const names = new Set((sug.associatedPatternNames ?? []).map(n => n.toLowerCase()));
    const patternIds = p.patterns
      .filter(x => x.status === 'confirmed' && (names.has(x.name.toLowerCase()) || x.suggestedSystemName?.toLowerCase() === sug.name.toLowerCase()))
      .map(x => x.id);
    const sysId = uid('sys');
    const sys: VisualSystem = {
      id: sysId,
      name: sug.name,
      description: sug.description,
      patternIds,
      referenceIds: [],
      aestheticPillars: sug.aestheticPillars ?? [],
      systemDetails: sug.systemDetails,
      adoptedFrom: sug.id,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    updateProject(x => ({
      ...x,
      systems: [...x.systems, sys],
      suggestedSystems: (x.suggestedSystems ?? []).filter(s => s.id !== id),
      patterns: x.patterns.map(pt => (patternIds.includes(pt.id) ? { ...pt, assignedSystemId: sysId } : pt)),
    }));
    addLog('system_adopt', sysId, `Sugerencia adoptada · ${sug.name}`, patternIds.length ? `Con ${patternIds.join(', ')}` : 'Sin patrones confirmados asociados');
    showToast({ message: `Sugerencia adoptada · ${sug.name} (${patternIds.length} patrones confirmados)`, tone: 'confirmed' });
    // La paleta se infiere del corpus; no se toma la propuesta por la IA.
    if (patternIds.length) setTimeout(() => handleInferPalette(sysId, true), 0);
  };

  const handleDismissSuggestion = (id: string) => {
    const sug = projectRef.current.suggestedSystems?.find(s => s.id === id);
    updateProject(x => ({ ...x, suggestedSystems: (x.suggestedSystems ?? []).filter(s => s.id !== id) }));
    addLog('system_dismiss', id, `Sugerencia descartada · ${sug?.name ?? id}`);
    showToast({ message: `Sugerencia descartada · ${sug?.name ?? id}` });
  };

  const handleAddRule = (fb: { type: 'designer_rule' | 'scope_refinement' | 'reference_exclusion' | 'pattern_rejection'; comment: string }) => {
    const item = makeFeedback({ type: fb.type, comment: fb.comment });
    updateProject(p => ({ ...p, feedback: [...p.feedback, item] }));
    addLog('feedback', 'proyecto', fb.type === 'designer_rule' ? 'Regla del diseñador' : fb.type === 'scope_refinement' ? 'Ajuste de alcance' : 'Exclusión de referencia', fb.comment, { feedbackId: item.id });
    showToast({ message: 'Regla guardada · se usa en la próxima inducción', tone: 'evidence' });
  };

  /* ========== ActionBar por etapa ========== */
  const counts = useMemo(() => {
    const ps = project.patterns;
    return {
      refs: project.references.length,
      newRefs: project.references.filter(r => r.isNew).length,
      pending: ps.filter(p => p.status === 'detected').length,
      confirmed: ps.filter(p => p.status === 'confirmed').length,
      discarded: ps.filter(p => p.status === 'discarded').length,
    };
  }, [project]);

  let status: React.ReactNode = '';
  let notice: React.ReactNode = null;
  let primary: React.ReactNode = null;
  let secondary: React.ReactNode = null;

  if (stage === 'brief') {
    const ok = !!briefDraft.name.trim() && !!briefDraft.objective.trim();
    const edited =
      briefDraft.name !== project.name || briefDraft.objective !== project.objective || briefDraft.description !== project.description;
    status = !ok ? 'Nombre y objetivo son obligatorios' : edited && isBriefComplete(project) ? 'Cambios sin guardar' : 'Brief listo';
    if (edited && isBriefComplete(project)) {
      secondary = (
        <Button variant="ghost" onClick={() => setBriefDraft({ name: project.name, objective: project.objective, description: project.description })}>
          Descartar cambios
        </Button>
      );
    }
    primary = (
      <Button variant="primary" type="submit" form="brief-form" disabled={!ok}>
        {edited && isBriefComplete(project) ? 'Guardar y continuar' : 'Continuar al corpus'}
      </Button>
    );
  } else if (stage === 'corpus') {
    const running = induction.status === 'running';
    status = `${counts.refs} ${counts.refs === 1 ? 'referencia' : 'referencias'}${counts.newRefs && project.patterns.length ? ` · ${counts.newRefs} ${counts.newRefs === 1 ? 'nueva' : 'nuevas'}` : ''}`;
    const missing = MIN_REFERENCES - counts.refs;
    if (missing > 0) notice = `Faltan ${missing} para inducir`;
    const hasPatterns = project.patterns.length > 0;
    if (running) {
      const n = (induction.tick % Math.max(counts.refs, 1)) + 1;
      primary = (
        <Button variant="primary" loading loadingText={`Induciendo ${n}/${counts.refs}`}>
          Inducir patrones
        </Button>
      );
      secondary = (
        <Button variant="ghost" onClick={handleCancelInduction}>
          Cancelar
        </Button>
      );
    } else if (hasPatterns && counts.newRefs === 0) {
      primary = (
        <Button variant="primary" onClick={() => goToStage('audit')}>
          Continuar a auditoría
        </Button>
      );
      secondary = (
        <Button variant="ghost" onClick={handleInduce} disabled={counts.refs < MIN_REFERENCES}>
          Volver a inducir
        </Button>
      );
    } else {
      primary = (
        <Button variant="primary" onClick={handleInduce} disabled={counts.refs < MIN_REFERENCES}>
          {hasPatterns ? `Reinducir con ${counts.newRefs} ${counts.newRefs === 1 ? 'nueva' : 'nuevas'}` : 'Inducir patrones'}
        </Button>
      );
    }
  } else if (stage === 'audit') {
    status = `${counts.confirmed} ${counts.confirmed === 1 ? 'confirmado' : 'confirmados'} · ${counts.discarded} ${counts.discarded === 1 ? 'descartado' : 'descartados'} · ${counts.pending} ${counts.pending === 1 ? 'pendiente' : 'pendientes'}`;
    if (counts.pending > 0 && counts.confirmed > 0) notice = `Quedan ${counts.pending} sin juzgar`;
    primary = (
      <Button variant="primary" onClick={() => goToStage('synthesis')} disabled={counts.confirmed === 0}>
        Pasar a síntesis
      </Button>
    );
  } else if (stage === 'synthesis') {
    const assigned = new Set(project.systems.flatMap(s => s.patternIds));
    const confirmedIds = project.patterns.filter(p => p.status === 'confirmed').map(p => p.id);
    const assignedCount = confirmedIds.filter(id => assigned.has(id)).length;
    status = `${project.systems.length} ${project.systems.length === 1 ? 'sistema' : 'sistemas'} · ${assignedCount} de ${confirmedIds.length} patrones asignados (${pct(assignedCount, confirmedIds.length)}%)`;
    secondary = (
      <Button variant="ghost" onClick={() => downloadProjectMarkdown(project)}>
        Dossier .md
      </Button>
    );
    primary = (
      <Button variant="primary" onClick={() => createSystem()}>
        Nuevo sistema
      </Button>
    );
  }

  const rail = railItems(project, stage, induction.status === 'running');
  const detailSystem = stage === 'synthesis' ? project.systems.find(s => s.id === systemDetailId) ?? null : null;
  const applySystem = overlay?.kind === 'apply' ? project.systems.find(s => s.id === overlay.systemId) ?? null : null;
  const guidelinesSystem = overlay?.kind === 'guidelines' ? project.systems.find(s => s.id === overlay.systemId) ?? null : null;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-bg text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-ctrl focus:bg-ink focus:px-3 focus:py-2 focus:text-bg">
        Saltar al contenido
      </a>
      <TopBar
        project={project}
        projects={projectsList}
        samples={SAMPLE_PROJECTS}
        rail={rail}
        onSelectStage={id => goToStage(id as VisitableStage)}
        onSelectProject={handleSelectProject}
        onNewProject={handleNewProject}
        onEditBrief={() => goToStage('brief')}
        onOpenSample={handleOpenSample}
        onExportProjectJson={() => exportProjectAsJSON(project)}
        onDownloadDossier={() => downloadProjectMarkdown(project)}
        onOpenLog={() => setIsLogOpen(o => !o)}
        onOpenAbout={() => setOverlay({ kind: 'about' })}
        isLogOpen={isLogOpen}
      />

      <p className="sr-only" aria-live="polite">
        Etapa {STAGE_NUM[stage]} de 05: {STAGE_LABEL[stage]}
      </p>
      <main id="main" tabIndex={-1} className={`relative min-h-0 flex-1 outline-none ${overlay ? 'print:hidden' : ''}`}>
        <div key={`${project.id}-${stage}`} className="stage-enter h-full">
        {stage === 'brief' && (
          <BriefStage
            project={project}
            samples={SAMPLE_PROJECTS}
            draft={briefDraft}
            onDraftChange={setBriefDraft}
            onSubmit={handleSubmitBrief}
            onOpenSample={handleOpenSample}
          />
        )}
        {stage === 'corpus' && (
          <CorpusStage
            key={project.id}
            project={project}
            view={view}
            onViewChange={setView}
            selectedId={selectedRefId}
            onSelect={setSelectedRefId}
            onAdd={() => setIsUploadOpen(true)}
            onMove={handleMoveReference}
            onResize={handleResizeReference}
            onAddFiles={handleAddFiles}
            onUpdateReference={handleUpdateReference}
            onDeleteReference={handleDeleteReference}
            onInspect={handleInspectReference}
            onOpenLightbox={setLightboxRef}
            inspectingIds={inspectingIds}
            inspectErrors={inspectErrors}
            induction={induction}
            onRetryInduction={handleInduce}
            onDismissInductionError={() => setInduction({ status: 'idle', tick: 0 })}
          />
        )}
        {stage === 'audit' && (
          <AuditStage
            key={project.id}
            project={project}
            filter={auditFilter}
            onFilterChange={setAuditFilter}
            index={auditIndex}
            onIndexChange={setAuditIndex}
            onConfirm={handleConfirmPattern}
            onDiscard={handleDiscardPattern}
            onSaveNote={handleSaveNote}
            onRestore={handleRestorePattern}
            onOpenReference={setLightboxRef}
            view={view}
            onViewChange={setView}
          />
        )}
        {stage === 'synthesis' && (
          <div className="flex h-full min-h-0">
            <div className="min-w-0 flex-1">
              <SynthesisStage
                project={project}
                focusSystemId={focusSystemId}
                synthesisErrors={synthesisErrors}
                onRenameSystem={(id, name) => updateSystem(id, s => ({ ...s, name, updatedAt: new Date().toISOString() }))}
                onAssign={handleAssign}
                onUnassign={handleUnassign}
                onCreateSystemWithPattern={pid => createSystem([pid])}
                onSynthesize={handleSynthesize}
                onOpenGuidelines={id => setOverlay({ kind: 'guidelines', systemId: id })}
                onOpenDetail={setSystemDetailId}
                onDeleteSystem={handleDeleteSystem}
                onInferPalette={handleInferPalette}
                onAdoptSuggestion={handleAdoptSuggestion}
                onDismissSuggestion={handleDismissSuggestion}
                onImportFile={handleImportSystemFile}
                inferringIds={inferringIds}
              />
            </div>
            <DockPanel open={!!detailSystem} title={detailSystem?.name ?? ''} meta={detailSystem ? `Sistema · ${detailSystem.id}` : undefined} onClose={() => setSystemDetailId(null)}>
              {detailSystem && (
                <SystemDetail project={project} system={detailSystem} onUpdate={s => updateSystem(s.id, () => s)} onFocusReference={() => {}} />
              )}
            </DockPanel>
          </div>
        )}
        </div>
      </main>

      <ActionBar status={status} notice={notice} toast={toast} onDismissToast={dismissToast} secondary={secondary} primary={primary} />

      <UploadModal isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} existing={project.references} onAddFiles={files => handleAddFiles(files)} onAddReferences={handleAddReferences} />
      <LightboxModal reference={lightboxRef} onClose={() => setLightboxRef(null)} />

      <LogDrawer open={isLogOpen} project={project} onClose={() => setIsLogOpen(false)} onAddRule={handleAddRule} />

      {overlay?.kind === 'about' && <AboutView onBack={() => setOverlay(null)} />}
      {guidelinesSystem && (
        <GuidelinesView
          project={project}
          system={guidelinesSystem}
          onBack={() => setOverlay(null)}
          onTryPiece={() => setOverlay({ kind: 'apply', systemId: guidelinesSystem.id })}
        />
      )}
      {applySystem && (
        <SystemApplicationView
          project={project}
          system={applySystem}
          onBack={() => setOverlay({ kind: 'guidelines', systemId: applySystem.id })}
          onOpenLightbox={setLightboxRef}
        />
      )}
    </div>
  );
}
