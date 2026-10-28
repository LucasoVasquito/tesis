import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GroupHypothesis, LogItem, LogKind, Pattern, Project, RefGroup, Rule, Reference, ReferenceBreakdown, VisitableStage, VisualSystem } from './types';
import { evidenceReferences, inferPalette } from './utils/palette';
import { normalizeRules } from './utils/rules';
import { createEmptyProject } from './data/emptyProject';
import { compressImageString, compressReferences } from './utils/imageCompressor';
import { deleteProjectPieces } from './utils/pieceStore';
import { buildBackup, downloadBackup, restoreBackup } from './utils/backup';
import { clearBreakdownCache, clearCachedBreakdown, clearProjectBreakdowns, getCachedBreakdown, setCachedBreakdown } from './utils/inspectorCache';
import { downloadProjectMarkdown, exportProjectAsJSON, exportVisualSystemAsJSON, parseVisualSystemJSON } from './utils/exportHelpers';
import { filesToReferences, makeFeedback, makeLog, mergeInducedPatterns, migrateProject, uid } from './utils/project';
import { PART_CARD_W, PartDraft, PartProposal, cropImage, nextPartIds, partKindInfo, placeParts, wholeReferences } from './utils/parts';
import { createGroup, dropOnto, addToGroup, freeSpotNear, groupOf, refRect, withoutRefs } from './utils/groups';
import { GroupDrop } from './components/canvas/ReferenceCanvas';
import { MIN_REFERENCES, STAGE_LABEL, canEnter, initialStage, isBriefComplete, railItems } from './utils/stages';

import { Button } from './components/ui';
import { TopBar } from './components/shell/TopBar';
import { ActionBar, Toast } from './components/shell/ActionBar';
import { CorpusView } from './components/canvas/CanvasArea';
import { UploadModal } from './components/UploadModal';
import { LightboxModal } from './components/LightboxModal';
import { AboutView } from './components/AboutView';
import { SystemApplicationView } from './components/SystemApplicationView';
import { GuidelinesView } from './components/GuidelinesView';
import { LogDrawer } from './components/LogDrawer';
import { TraceMap } from './components/TraceMap';
import { Modal } from './components/shell/Modal';

import { BriefDraft, BriefStage } from './stages/BriefStage';
import { CorpusStage, InductionState } from './stages/CorpusStage';
import { AuditFilter, AuditStage, filterPatterns } from './stages/AuditStage';
import { SynthesisStage } from './stages/SynthesisStage';

const LIST_KEY = 'emergent_projects_list_v5';
const ACTIVE_KEY = 'emergent_active_project_v5';

/**
 * Datos de versiones anteriores. Al pasar a v5 se descartan una sola vez
 * (proyectos de prueba y ejemplos) y la app arranca vacía.
 */
const DISCARDED_KEYS = [
  'emergent_projects_list_v4',
  'emergent_active_project_v4',
  'emergent_visual_system_project_v3',
  'emergent_visual_system_project_v2',
  'emergent_visual_system_project_v1',
  'emergent_visual_system_project',
  'emergent_user_brief_confirmed',
  'emergent_visual_system_projects_store_v4',
];

type Overlay = null | { kind: 'about' };

function loadProjects(): Project[] {
  try {
    const saved = localStorage.getItem(LIST_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.map(migrateProject);
    } else if (DISCARDED_KEYS.some(k => localStorage.getItem(k) !== null)) {
      DISCARDED_KEYS.forEach(k => localStorage.removeItem(k));
      clearBreakdownCache();
    }
  } catch (e) {
    console.error('No se pudo leer la lista de proyectos', e);
  }
  return [createEmptyProject()];
}

const STAGE_NUM: Record<VisitableStage, string> = { brief: '01', corpus: '02', audit: '03', synthesis: '04', application: '05' };

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
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  /** Lectura de grupos en curso o con error (por ID de grupo). */
  const [groupReads, setGroupReads] = useState<Record<string, { status: 'loading' } | { status: 'error'; message: string }>>({});
  const [auditIndex, setAuditIndex] = useState(0);
  const [auditFilter, setAuditFilter] = useState<AuditFilter>('pending');
  const [focusSystemId, setFocusSystemId] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  /** Mapa de trazabilidad abierto (reemplaza la etapa hasta que se elija otra). */
  const [mapOpen, setMapOpen] = useState(false);
  /** Lineamientos abiertos dentro de Síntesis (ID del sistema). */
  const [guidelinesId, setGuidelinesId] = useState<string | null>(null);
  /** Sistema que se aplica en la etapa 06 y sistemas ya visitados (sus piezas se mantienen al cambiar de etapa). */
  const [applySystemId, setApplySystemId] = useState<string | null>(null);
  const [visitedApply, setVisitedApply] = useState<string[]>([]);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [deleteRequest, setDeleteRequest] = useState<null | 'current' | 'all'>(null);
  const [lightboxRef, setLightboxRef] = useState<Reference | null>(null);
  const [briefDraft, setBriefDraft] = useState<BriefDraft>({ name: project.name, objective: project.objective, description: project.description });

  /* ========== Asincronía ========== */
  const [induction, setInduction] = useState<InductionState>({ status: 'idle', tick: 0 });
  /** Patrones recién inducidos que se muestran emergiendo en el corpus. */
  const [emergence, setEmergence] = useState<Pattern[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [inspectingIds, setInspectingIds] = useState<string[]>([]);
  const [inspectErrors, setInspectErrors] = useState<Record<string, string>>({});
  /** Partes en revisión por referencia (no se guardan hasta confirmarlas). */
  const [partDrafts, setPartDrafts] = useState<Record<string, PartDraft>>({});
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

  const applySystemRef = useRef<string | null>(null);
  applySystemRef.current = applySystemId;

  // Al abrir la app en la etapa 06 (o si el sistema se borró), se aplica el primer sistema.
  useEffect(() => {
    if (stage !== 'application') return;
    if (applySystemId && project.systems.some(x => x.id === applySystemId)) return;
    const id = project.systems[0]?.id;
    if (!id) return;
    setApplySystemId(id);
    setVisitedApply(v => (v.includes(id) ? v : [...v, id]));
  }, [stage, applySystemId, project.systems]);

  const goToStage = useCallback(
    (s: VisitableStage) => {
      const p = projectRef.current;
      if (!canEnter(p, s) || induction.status === 'running') return;
      if (s === 'brief') setBriefDraft({ name: p.name, objective: p.objective, description: p.description });
      setGuidelinesId(null);
      setMapOpen(false);
      setEmergence(null);
      if (s === 'application') {
        const valid = p.systems.some(x => x.id === applySystemRef.current);
        const id = valid ? applySystemRef.current! : p.systems[0]?.id;
        if (id) {
          setApplySystemId(id);
          setVisitedApply(v => (v.includes(id) ? v : [...v, id]));
        }
      }
      setStage(s);
    },
    [induction.status],
  );

  const resetUiForProject = (p: Project) => {
    abortRef.current?.abort();
    setInduction({ status: 'idle', tick: 0 });
    setSelectedRefId(null);
    setSelectedGroupId(null);
    setAuditIndex(0);
    setAuditFilter('pending');
    setOverlay(null);
    setGuidelinesId(null);
    setMapOpen(false);
    setEmergence(null);
    setApplySystemId(null);
    setVisitedApply([]);
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

  const handleImportBackup = async (file: File) => {
    try {
      const { project: imported, pieces } = await restoreBackup(await file.text(), projectsList.map(x => x.id));
      // Un proyecto vacío de relleno (sin nombre ni referencias) se reemplaza por el importado.
      const isBlank = (x: Project) => !x.name.trim() && !x.objective.trim() && !x.references.length && !x.patterns.length && !x.systems.length;
      setProjectsList(list => [...list.filter(x => !isBlank(x)), imported]);
      setActiveProjectId(imported.id);
      resetUiForProject(imported);
      showToast({ message: `Proyecto importado · ${imported.name || 'sin nombre'} · ${imported.references.length} referencias, ${pieces} ${pieces === 1 ? 'pieza' : 'piezas'}`, tone: 'confirmed' }, 5000);
    } catch (err: any) {
      showToast({ message: err?.message || 'No se pudo importar el respaldo', tone: 'discarded' }, 6000);
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
      resetUiForProject(next[0]);
    }
    setDeleteRequest(null);
    showToast({ message: ids.length === 1 ? 'Proyecto eliminado' : `${ids.length} proyectos eliminados`, tone: 'discarded' });
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

  /** Borra una referencia y, si es una original, también sus partes. */
  const handleDeleteReference = (id: string) => {
    const gone = new Set([id, ...project.references.filter(r => r.parentId === id).map(r => r.id)]);
    updateProject(p => ({
      ...p,
      references: p.references.filter(r => !gone.has(r.id)),
      patterns: p.patterns.map(pt => ({ ...pt, evidence: pt.evidence.filter(e => !gone.has(e)) })),
      systems: p.systems.map(s => ({ ...s, referenceIds: s.referenceIds.filter(r => !gone.has(r)) })),
      groups: withoutRefs(p.groups ?? [], gone),
    }));
    gone.forEach(x => clearCachedBreakdown(project.id, x));
    setSelectedRefId(null);
    showToast({ message: gone.size > 1 ? `Referencia eliminada · ${id} y ${gone.size - 1} ${gone.size === 2 ? 'parte' : 'partes'}` : `Referencia eliminada · ${id}`, tone: 'discarded' });
  };

  /* ---------- Grupos ---------- */
  const selectReference = useCallback((id: string | null) => {
    setSelectedRefId(id);
    if (id) setSelectedGroupId(null);
  }, []);
  const selectGroup = useCallback((id: string | null) => {
    setSelectedGroupId(id);
    if (id) setSelectedRefId(null);
  }, []);

  const setGroups = (fn: (g: RefGroup[]) => RefGroup[]) => updateProject(p => ({ ...p, groups: fn(p.groups ?? []) }));
  const groupName = (id: string) => (projectRef.current.groups ?? []).find(g => g.id === id)?.name ?? id;

  /** Resultado de soltar una ficha en el lienzo. */
  const handleGroupDrop = (d: GroupDrop) => {
    const groups = projectRef.current.groups ?? [];
    if (d.kind === 'card') {
      const r = dropOnto(groups, d.dragId, d.targetId);
      setGroups(() => r.groups);
      const name = r.groups.find(g => g.id === r.groupId)?.name ?? r.groupId;
      if (r.created) {
        addLog('group', r.groupId, `Grupo creado · ${d.targetId} + ${d.dragId}`);
        // Abrir el grupo para que el diseñador le ponga nombre.
        selectGroup(r.groupId);
        showToast({ message: `Grupo nuevo · ponele un nombre`, tone: 'signal' });
      } else {
        addLog('group', r.groupId, `${d.dragId} sumada a «${name}»`);
        showToast({ message: `${d.dragId} sumada a «${name}»`, tone: 'signal' });
      }
    } else if (d.kind === 'group') {
      setGroups(g => addToGroup(g, d.dragId, d.groupId));
      addLog('group', d.groupId, `${d.dragId} sumada a «${groupName(d.groupId)}»`);
      showToast({ message: `${d.dragId} sumada a «${groupName(d.groupId)}»`, tone: 'signal' });
    } else {
      const name = groupName(d.groupId);
      setGroups(g => withoutRefs(g, [d.dragId]));
      addLog('group', d.groupId, `${d.dragId} sacada de «${name}»`);
      showToast({ message: `${d.dragId} sacada de «${name}»`, tone: 'neutral' });
    }
  };

  /** Desde el panel (teclado o lista): sumar a un grupo existente o crear uno nuevo. */
  const handleAssignGroup = (refId: string, groupId: string | 'new') => {
    const groups = projectRef.current.groups ?? [];
    if (groupId === 'new') {
      const r = createGroup(groups, [refId]);
      setGroups(() => r.groups);
      addLog('group', r.group.id, `Grupo creado · ${refId}`);
      selectGroup(r.group.id);
    } else {
      // La ficha se mueve junto al grupo para que el marco no envuelva referencias ajenas.
      const p = projectRef.current;
      const ref = p.references.find(r => r.id === refId);
      const members = p.references.filter(r => groups.find(g => g.id === groupId)?.refIds.includes(r.id));
      const anchor = [...members].sort((a, b) => refRect(b).x + refRect(b).w - (refRect(a).x + refRect(a).w))[0];
      if (ref && anchor) {
        const position = freeSpotNear(refRect(anchor), refRect(ref), p.references.filter(r => r.id !== refId && r.id !== anchor.id).map(refRect));
        handleUpdateReference(refId, { position });
      }
      setGroups(g => addToGroup(g, refId, groupId));
      addLog('group', groupId, `${refId} sumada a «${groupName(groupId)}»`);
      showToast({ message: `${refId} sumada a «${groupName(groupId)}»`, tone: 'signal' });
    }
  };

  const handleRemoveFromGroup = (refId: string) => {
    const g = groupOf(projectRef.current.groups, refId);
    if (!g) return;
    setGroups(gs => withoutRefs(gs, [refId]));
    addLog('group', g.id, `${refId} sacada de «${g.name}»`);
  };

  const handleUpdateGroup = (id: string, updates: Partial<RefGroup>) => {
    const prev = (projectRef.current.groups ?? []).find(g => g.id === id);
    setGroups(gs => gs.map(g => (g.id === id ? { ...g, ...updates } : g)));
    if (prev && updates.name && updates.name !== prev.name) addLog('group', id, `Grupo «${prev.name}» → «${updates.name}»`);
  };

  const handleUngroup = (id: string) => {
    const g = (projectRef.current.groups ?? []).find(x => x.id === id);
    if (!g) return;
    setGroups(gs => gs.filter(x => x.id !== id));
    setSelectedGroupId(null);
    addLog('group', id, `Grupo «${g.name}» desarmado`, `${g.refIds.length} referencias vuelven a estar sueltas.`);
    showToast({ message: `Grupo «${g.name}» desarmado`, tone: 'neutral' });
  };

  /** Le pregunta a Gemini qué comparten las referencias de un grupo. */
  const handleReadGroup = async (id: string) => {
    const p = projectRef.current;
    const g = (p.groups ?? []).find(x => x.id === id);
    if (!g) return;
    setGroupReads(r => ({ ...r, [id]: { status: 'loading' } }));
    try {
      const refs = p.references.filter(r => g.refIds.includes(r.id));
      const compressed = await compressReferences(refs, { maxWidth: 768, maxHeight: 768, quality: 0.8 });
      const res = await fetch('/api/group-hypothesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group: { name: g.name, note: g.note },
          references: compressed.map(r => ({ id: r.id, name: r.name, image: r.image, parentId: r.parentId })),
          objective: p.objective,
        }),
      });
      const text = await res.text();
      let result: any;
      try {
        result = JSON.parse(text);
      } catch {
        throw new Error(
          text.trim().startsWith('<')
            ? 'El servidor está corriendo una versión anterior sin esta función. Cortá "npm run server" (Ctrl+C) y volvé a ejecutarlo.'
            : `El servidor no devolvió una respuesta válida (HTTP ${res.status}).`,
        );
      }
      if (!res.ok || !result.success) throw new Error(result.details || result.error || 'Error al leer el grupo');
      const hypothesis = result.data as GroupHypothesis;
      updateProject(x => ({ ...x, groups: (x.groups ?? []).map(y => (y.id === id ? { ...y, hypothesis } : y)) }), p.id);
      addLog('group', id, `Hipótesis de la IA sobre «${g.name}»`, hypothesis.summary, { projectId: p.id });
      setGroupReads(({ [id]: _, ...rest }) => rest);
    } catch (err: any) {
      setGroupReads(r => ({ ...r, [id]: { status: 'error', message: err?.message || String(err) } }));
    }
  };

  /* ---------- Partes ---------- */
  const setPartDraft = useCallback((id: string, d: PartDraft | null) => {
    setPartDrafts(all => {
      const { [id]: _, ...rest } = all;
      return d ? { ...rest, [id]: d } : rest;
    });
  }, []);

  /** Pide a Gemini las partes de una referencia; quedan en revisión hasta que el diseñador las confirme. */
  const handleDetectParts = async (ref: Reference) => {
    setPartDraft(ref.id, { status: 'loading' });
    try {
      const image = await compressImageString(ref.image, { maxWidth: 1024, maxHeight: 1024, quality: 0.85 });
      const res = await fetch('/api/segment-reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference: { id: ref.id, image }, objective: project.objective }),
      });
      const text = await res.text();
      let result: any;
      try {
        result = JSON.parse(text);
      } catch {
        throw new Error(
          text.trim().startsWith('<')
            ? 'El servidor está corriendo una versión anterior sin esta función. Cortá "npm run server" (Ctrl+C) y volvé a ejecutarlo.'
            : `El servidor no devolvió una respuesta válida (HTTP ${res.status}). ¿Está corriendo "npm run server"?`,
        );
      }
      if (!res.ok || !result.success) throw new Error(result.details || result.error || 'Error al separar la referencia');
      const parts: any[] = result.data?.parts ?? [];
      if (!parts.length) throw new Error('Gemini no encontró partes separables. Podés marcarlas a mano.');
      setPartDraft(ref.id, {
        status: 'review',
        proposals: parts.map((p, i) => ({ key: `ai${i}`, kind: p.kind, label: p.label, description: p.description, box: p.box, source: 'ai', selected: true })),
      });
    } catch (err: any) {
      setPartDraft(ref.id, { status: 'error', message: err?.message || String(err) });
    }
  };

  /** Recorta las partes elegidas y las suma al moodboard junto a la original. */
  const handleAddParts = async (parentId: string, proposals: PartProposal[]): Promise<string[]> => {
    const parent = projectRef.current.references.find(r => r.id === parentId);
    const chosen = proposals.filter(p => p.selected);
    if (!parent || !chosen.length) return [];
    try {
      const crops = await cropImage(parent.image, chosen.map(p => p.box));
      const p = projectRef.current;
      const ids = nextPartIds(parentId, p.references, chosen.length);
      const positions = placeParts(parent, p.references.filter(r => r.id !== parentId), crops.map(c => c.aspectRatio));
      const now = new Date().toISOString();
      const parts: Reference[] = chosen.map((c, i) => ({
        id: ids[i],
        name: c.label.trim() || partKindInfo(c.kind).label,
        image: crops[i].image,
        aspectRatio: crops[i].aspectRatio,
        position: positions[i],
        width: PART_CARD_W,
        createdAt: now,
        notes: c.description,
        tags: [partKindInfo(c.kind).label],
        isNew: true,
        parentId,
        crop: c.box,
        partKind: c.kind,
      }));
      updateProject(x => ({ ...x, references: [...x.references, ...parts] }), p.id);
      setPartDraft(parentId, null);
      addLog('split', parentId, `${parentId} separada en ${parts.length} ${parts.length === 1 ? 'parte' : 'partes'}`, parts.map(r => `${r.id} ${r.name}`).join(' · '), { projectId: p.id });
      showToast({ message: `${parts.length} ${parts.length === 1 ? 'parte sumada' : 'partes sumadas'} al moodboard · reinducí para usarlas`, tone: 'pending' }, 4000);
      return parts.map(r => r.id);
    } catch (err: any) {
      showToast({ message: err?.message || 'No se pudieron recortar las partes', tone: 'discarded' }, 5000);
      return [];
    }
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
    if (wholeReferences(p.references).length < MIN_REFERENCES || induction.status === 'running') return;
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
          designerGroups: (p.groups ?? []).map(g => ({ id: g.id, name: g.name, note: g.note, refIds: g.refIds, hypothesis: g.hypothesis?.summary })),
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
      const { merged: mergedRaw, newCount } = mergeInducedPatterns(projectRef.current.patterns, detected);
      // Patrones que responden a un grupo del diseñador: guardar a cuál y qué dijo la IA.
      const groupsNow = projectRef.current.groups ?? [];
      const merged = mergedRaw.map((m: any) => {
        const g = groupsNow.find(x => x.id === m.designerGroupId);
        const { designerGroupId, groupVerdict, ...rest } = m;
        if (!g) return rest as Pattern;
        const verdict = ['supports', 'refines', 'contradicts'].includes(groupVerdict) ? groupVerdict : undefined;
        return { ...rest, designerGroup: { id: g.id, name: g.name, verdict } } as Pattern;
      });
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
        // Los patrones nuevos (pendientes) emergen en el lienzo antes de pasar a Auditoría.
        const fresh = merged.filter(x => x.status === 'detected' && x.evidence?.length).sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
        if (fresh.length) {
          setSelectedRefId(null);
          setSelectedGroupId(null);
          setEmergence(fresh);
        } else {
          setStage('audit');
          showToast({ message: `Inducción · ${p.references.length} referencias, ${detected.length} patrones`, tone: 'signal' }, 4000);
        }
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
      applications: Object.fromEntries(Object.entries(p.applications ?? {}).filter(([sid]) => sid !== id)),
    }));
    setVisitedApply(v => v.filter(x => x !== id));
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
                  typographyRules: d.typographyRules ? normalizeRules(d.typographyRules, 'T', 'type') : s.typographyRules,
                  textureRules: d.textureRules ? normalizeRules(d.textureRules, 'X', 'evidence') : s.textureRules,
                  compositionRules: d.compositionRules ? normalizeRules(d.compositionRules, 'C', 'grid') : s.compositionRules,
                  systemDetails: d.systemDetails || s.systemDetails,
                  // La imagen elegida a mano se conserva en los pilares que mantienen su texto.
                  sources: d.sources?.aestheticPillars
                    ? {
                        aestheticPillars: d.sources.aestheticPillars,
                        pillarRefs: (d.aestheticPillars || []).map((p: string) => {
                          const k = (s.aestheticPillars ?? []).indexOf(p);
                          return k >= 0 ? s.sources?.pillarRefs?.[k] ?? null : null;
                        }),
                      }
                    : s.sources,
                  isSynthesizing: false,
                  updatedAt: new Date().toISOString(),
                },
          ),
        }),
        projectId,
      );
      addLog('synthesize', systemId, `Redactado con IA · ${sys.name}`, `${sysPatterns.length} patrones, ${sysRefs.length} referencias`, { projectId });
      showToast({ message: `Sistema redactado · ${sys.name}`, tone: 'confirmed' });
      // Recortes de ejemplo para las fichas nuevas (en segundo plano).
      setTimeout(() => handleRuleExamples(systemId, true), 50);
    } catch (err: any) {
      updateProject(x => ({ ...x, systems: x.systems.map(s => (s.id === systemId ? { ...s, isSynthesizing: false } : s)) }), projectId);
      setSynthesisErrors(e => ({ ...e, [systemId]: err?.message || String(err) }));
    }
  };

  /** Gemini elige, para cada regla, el recorte de una referencia que mejor la muestra. */
  const [examplesBusy, setExamplesBusy] = useState<string[]>([]);
  const handleRuleExamples = async (systemId: string, silent = false) => {
    const p = projectRef.current;
    const sys = p.systems.find(x => x.id === systemId);
    if (!sys) return;
    const fields = [
      { field: 'typographyRules' as const, family: 'typography' },
      { field: 'textureRules' as const, family: 'texture' },
      { field: 'compositionRules' as const, family: 'composition' },
    ];
    // Solo las fichas que muestran imágenes (no los especímenes con texto ni las retículas).
    const rules = fields.flatMap(({ field, family }) =>
      (sys[field] ?? [])
        .filter(r => r.example?.kind === 'evidence' || (r.example?.kind === 'type' && !r.example?.text) || !r.example)
        .map(r => ({ code: r.code, family, text: r.detail || r.title })),
    );
    const evidence = new Set(p.patterns.filter(x => sys.patternIds.includes(x.id)).flatMap(x => x.evidence));
    const whole = p.references.filter(r => !r.parentId && (!evidence.size || evidence.has(r.id)));
    const parts = p.references.filter(r => r.parentId && (evidence.has(r.parentId) || evidence.has(r.id)));
    const refs = [...parts, ...whole].slice(0, 12);
    if (!rules.length || !refs.length) {
      if (!silent) showToast({ message: 'No hay fichas con imagen o referencias para recortar', tone: 'neutral' });
      return;
    }
    setExamplesBusy(b => [...b, systemId]);
    try {
      const compressed = await compressReferences(refs, { maxWidth: 1024, maxHeight: 1024, quality: 0.85 });
      const res = await fetch('/api/rule-examples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules, references: compressed.map(r => ({ id: r.id, name: r.name, image: r.image })) }),
      });
      const text = await res.text();
      let result: any;
      try {
        result = JSON.parse(text);
      } catch {
        throw new Error(text.trim().startsWith('<') ? 'El servidor está corriendo una versión anterior. Reiniciá "npm run server".' : `HTTP ${res.status}`);
      }
      if (!res.ok || !result.success) throw new Error(result.details || result.error || 'Error al elegir los recortes');
      const byCode = new Map<string, { refId: string; crop: any; note?: string }>((result.data?.examples ?? []).map((e: any) => [e.code, e]));
      updateProject(
        x => ({
          ...x,
          systems: x.systems.map(s => {
            if (s.id !== systemId) return s;
            const apply = (rs?: Rule[]) =>
              rs?.map(r => {
                const e = byCode.get(r.code);
                if (!e) return r;
                return { ...r, example: { ...(r.example ?? { kind: 'evidence' }), kind: 'evidence' as const, refIds: [e.refId], crop: e.crop, cropNote: e.note } };
              });
            return { ...s, typographyRules: apply(s.typographyRules), textureRules: apply(s.textureRules), compositionRules: apply(s.compositionRules) };
          }),
        }),
        p.id,
      );
      if (!silent) showToast({ message: `${byCode.size} ${byCode.size === 1 ? 'ficha con recorte' : 'fichas con recorte'} · ${sys.name}`, tone: 'confirmed' });
    } catch (err: any) {
      if (!silent) showToast({ message: `No se pudieron elegir los recortes: ${err?.message || err}`, tone: 'discarded' }, 6000);
    } finally {
      setExamplesBusy(b => b.filter(x => x !== systemId));
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
            typographyRules: normalizeRules(data.system.typographyRules, 'T', 'type'),
            textureRules: normalizeRules(data.system.textureRules, 'X', 'evidence'),
            compositionRules: normalizeRules(data.system.compositionRules, 'C', 'grid'),
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
          showToast({ message: `Desglosando ${r.id} para inferir la paleta · ${done} / ${missing.length}`, tone: 'signal' }, 60000);
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

  /** Pide a Gemini qué patrones sostienen cada pilar (para sistemas adoptados o redactados sin trazabilidad). */
  const handleTracePillars = async (systemId: string, silent = false) => {
    const p = projectRef.current;
    const projectId = p.id;
    const sys = p.systems.find(s => s.id === systemId);
    const pillars = sys?.aestheticPillars ?? [];
    if (!sys || !pillars.length) return;
    const patterns = p.patterns.filter(x => x.status === 'confirmed' && (sys.patternIds.includes(x.id) || !sys.patternIds.length));
    try {
      const res = await fetch('/api/trace-pillars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pillars, patterns: patterns.map(x => ({ id: x.id, name: x.name, category: x.category, description: x.description })) }),
      });
      const result = await res.json().catch(() => ({ success: false }));
      if (!result.success) throw new Error(result.error || result.details || `HTTP ${res.status}`);
      const traced: string[][] = result.data.pillarSources ?? [];
      updateProject(
        x => ({
          ...x,
          systems: x.systems.map(s =>
            s.id !== systemId || JSON.stringify(s.aestheticPillars) !== JSON.stringify(pillars)
              ? s
              : { ...s, sources: { ...s.sources, aestheticPillars: traced } },
          ),
        }),
        projectId,
      );
      const n = traced.filter(t => t.length).length;
      if (!silent || n) showToast({ message: `Pilares rastreados · ${n} de ${pillars.length} con patrones de sostén`, tone: 'signal' });
    } catch (err: any) {
      if (!silent) showToast({ message: `No se pudieron rastrear los pilares: ${err?.message || err}`, tone: 'discarded' }, 5000);
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
    setFocusSystemId(sysId);
    showToast({ message: `Sugerencia adoptada · ${sug.name} (${patternIds.length} patrones confirmados)`, tone: 'confirmed' });
    // La paleta se infiere del corpus; no se toma la propuesta por la IA.
    if (patternIds.length) setTimeout(() => handleInferPalette(sysId, true), 0);
    // Las sugerencias traen los pilares sin trazabilidad: se rastrean para que cada pilar muestre su evidencia.
    if (sug.aestheticPillars?.length) setTimeout(() => handleTracePillars(sysId, true), 0);
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
    showToast({ message: 'Regla guardada · se usa en la próxima inducción', tone: 'signal' });
  };

  /** Etapa 06 con un sistema concreto. */
  const openApplication = (systemId: string) => {
    applySystemRef.current = systemId;
    setApplySystemId(systemId);
    setVisitedApply(v => (v.includes(systemId) ? v : [...v, systemId]));
    goToStage('application');
  };
  const openGuidelines = (systemId: string) => {
    goToStage('synthesis');
    setGuidelinesId(systemId);
  };

  /* ========== ActionBar por etapa ========== */
  const counts = useMemo(() => {
    const ps = project.patterns;
    return {
      refs: wholeReferences(project.references).length,
      parts: project.references.length - wholeReferences(project.references).length,
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
    status = `${counts.refs} ${counts.refs === 1 ? 'referencia' : 'referencias'}${counts.parts ? ` + ${counts.parts} ${counts.parts === 1 ? 'parte' : 'partes'}` : ''}${counts.newRefs && project.patterns.length ? ` · ${counts.newRefs} ${counts.newRefs === 1 ? 'nueva' : 'nuevas'}` : ''}`;
    const missing = MIN_REFERENCES - counts.refs;
    if (missing > 0) notice = `Faltan ${missing} para inducir`;
    const hasPatterns = project.patterns.length > 0;
    if (running) {
      const total = Math.max(project.references.length, 1);
      const n = (induction.tick % total) + 1;
      primary = (
        <Button variant="primary" loading loadingText={`Induciendo ${n}/${total}`}>
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
    const sysForApply = project.systems.find(x => x.id === (guidelinesId ?? focusSystemId)) ?? project.systems[0];
    if (guidelinesId) status = `Lineamientos · ${project.systems.find(x => x.id === guidelinesId)?.name ?? ''}`;
    secondary = (
      <>
        <Button variant="ghost" onClick={() => downloadProjectMarkdown(project)}>
          Dossier .md
        </Button>
        {sysForApply && (
          <Button variant="ghost" onClick={() => createSystem()}>
            Nuevo sistema
          </Button>
        )}
      </>
    );
    primary = sysForApply ? (
      <Button variant="primary" onClick={() => openApplication(sysForApply.id)}>
        Continuar a aplicación
      </Button>
    ) : (
      <Button variant="primary" onClick={() => createSystem()}>
        Nuevo sistema
      </Button>
    );
  } else if (stage === 'application') {
    const sys = project.systems.find(x => x.id === applySystemId);
    status = sys ? `Aplicando «${sys.name}» · verificación externa, no forma parte del sistema` : '';
    secondary = sys ? (
      <Button variant="ghost" onClick={() => openGuidelines(sys.id)}>
        Ver lineamientos
      </Button>
    ) : null;
  }

  const rail = railItems(project, stage, induction.status === 'running');
  const guidelinesSystem = stage === 'synthesis' && guidelinesId ? project.systems.find(s => s.id === guidelinesId) ?? null : null;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-bg text-ink print:h-auto print:overflow-visible">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-ctrl focus:bg-ink focus:px-3 focus:py-2 focus:text-bg">
        Saltar al contenido
      </a>
      <TopBar
        project={project}
        projects={projectsList}
        rail={rail}
        onSelectStage={id => goToStage(id as VisitableStage)}
        onSelectProject={handleSelectProject}
        onNewProject={handleNewProject}
        onEditBrief={() => goToStage('brief')}
        onDeleteProject={() => setDeleteRequest('current')}
        onDeleteAllProjects={() => setDeleteRequest('all')}
        onExportBackup={handleExportBackup}
        onImportBackup={handleImportBackup}
        onDownloadDossier={() => downloadProjectMarkdown(project)}
        onOpenLog={() => setIsLogOpen(o => !o)}
        onOpenMap={() => setMapOpen(o => !o)}
        isMapOpen={mapOpen}
        onOpenAbout={() => setOverlay({ kind: 'about' })}
        isLogOpen={isLogOpen}
      />

      <p className="sr-only" aria-live="polite">
        Etapa {STAGE_NUM[stage]} de 05: {STAGE_LABEL[stage]}
      </p>
      <main id="main" tabIndex={-1} className={`relative min-h-0 flex-1 outline-none print:overflow-visible ${overlay ? 'print:hidden' : ''}`}>
        {mapOpen && <TraceMap project={project} onBack={() => setMapOpen(false)} />}
        {!mapOpen && stage !== 'application' && (
        <div key={`${project.id}-${stage}${guidelinesSystem ? '-g' : ''}`} className="stage-enter h-full print:h-auto">
        {stage === 'brief' && (
          <BriefStage
            project={project}
            draft={briefDraft}
            onDraftChange={setBriefDraft}
            onSubmit={handleSubmitBrief}
          />
        )}
        {stage === 'corpus' && (
          <CorpusStage
            key={project.id}
            project={project}
            view={view}
            onViewChange={setView}
            selectedId={selectedRefId}
            onSelect={selectReference}
            onAdd={() => setIsUploadOpen(true)}
            onMove={handleMoveReference}
            onResize={handleResizeReference}
            onAddFiles={handleAddFiles}
            onUpdateReference={handleUpdateReference}
            onDeleteReference={handleDeleteReference}
            onInspect={handleInspectReference}
            partDrafts={partDrafts}
            onDetectParts={handleDetectParts}
            onPartDraftChange={setPartDraft}
            onAddParts={handleAddParts}
            selectedGroupId={selectedGroupId}
            onSelectGroup={selectGroup}
            onGroupDrop={handleGroupDrop}
            onAssignGroup={handleAssignGroup}
            onRemoveFromGroup={handleRemoveFromGroup}
            onUpdateGroup={handleUpdateGroup}
            onUngroup={handleUngroup}
            onReadGroup={handleReadGroup}
            groupReads={groupReads}
            emergence={emergence}
            onEmergenceEnd={go => {
              setEmergence(null);
              if (go) goToStage('audit');
            }}
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
        {guidelinesSystem && (
          <GuidelinesView
            project={project}
            system={guidelinesSystem}
            onBack={() => setGuidelinesId(null)}
            onTryPiece={() => openApplication(guidelinesSystem.id)}
          />
        )}
        {stage === 'synthesis' && !guidelinesSystem && (
          <SynthesisStage
            project={project}
            focusSystemId={focusSystemId}
            synthesisErrors={synthesisErrors}
            inferringIds={inferringIds}
            onRenameSystem={(id, name) => updateSystem(id, s => ({ ...s, name, updatedAt: new Date().toISOString() }))}
            onUpdateSystem={sys => updateSystem(sys.id, () => sys)}
            onAssign={handleAssign}
            onUnassign={handleUnassign}
            onCreateSystemWithPattern={pid => createSystem([pid])}
            onSynthesize={handleSynthesize}
            onOpenGuidelines={setGuidelinesId}
            onTryPiece={openApplication}
            onExportSystem={id => {
              const sys = project.systems.find(x => x.id === id);
              if (sys) exportVisualSystemAsJSON(sys, project);
            }}
            onDeleteSystem={handleDeleteSystem}
            onInferPalette={handleInferPalette}
            onTracePillars={handleTracePillars}
            onRuleExamples={id => handleRuleExamples(id)}
            examplesBusy={examplesBusy}
            onAdoptSuggestion={handleAdoptSuggestion}
            onDismissSuggestion={handleDismissSuggestion}
            onImportFile={handleImportSystemFile}
          />
        )}
        </div>
        )}
        {/* Etapa 06: cada sistema visitado queda montado para no perder las piezas al cambiar de etapa. */}
        {visitedApply
          .map(id => project.systems.find(x => x.id === id))
          .filter(Boolean)
          .map(sys => (
            <div key={`${project.id}-${sys!.id}`} hidden={mapOpen || !(stage === 'application' && applySystemId === sys!.id)} className="stage-enter h-full">
              <SystemApplicationView
                project={project}
                system={sys!}
                systems={project.systems}
                onSelectSystem={openApplication}
                onOpenGuidelines={() => openGuidelines(sys!.id)}
                onOpenLightbox={setLightboxRef}
                session={project.applications?.[sys!.id]}
                onSaveSession={session => {
                  const pid = project.id;
                  const sid = sys!.id;
                  updateProject(x => ({ ...x, applications: { ...(x.applications ?? {}), [sid]: session } }), pid);
                }}
              />
            </div>
          ))}
      </main>

      <ActionBar status={status} notice={notice} toast={toast} onDismissToast={dismissToast} secondary={secondary} primary={primary} />

      <UploadModal isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} existing={project.references} onAddFiles={files => handleAddFiles(files)} onAddReferences={handleAddReferences} />
      <LightboxModal reference={lightboxRef} onClose={() => setLightboxRef(null)} />

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
              ? `Se borran los ${projectsList.length} proyectos de este navegador, con sus referencias, patrones, sistemas y bitácora.`
              : `Se borra “${project.name.trim() || 'Proyecto sin nombre'}” con sus ${project.references.length} referencias, ${project.patterns.length} patrones, ${project.systems.length} sistemas y su bitácora.`}
          </p>
          <p className="m-0 text-13 text-ink-2">
            {deleteRequest === 'all'
              ? 'Si querés conservar copias, descargá antes el respaldo completo de cada proyecto desde el menú del proyecto.'
              : 'Si querés conservar una copia, descargá antes el respaldo completo: incluye referencias, sistemas y todas las piezas generadas.'}
          </p>
          {deleteRequest === 'current' && (
            <div>
              <Button size="sm" variant="secondary" onClick={handleExportBackup}>
                Descargar respaldo completo
              </Button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="discard"
              data-autofocus
              onClick={() => handleDeleteProjects(deleteRequest === 'all' ? projectsList.map(p => p.id) : [project.id])}
            >
              {deleteRequest === 'all' ? 'Eliminar todos' : 'Eliminar proyecto'}
            </Button>
            <Button variant="ghost" onClick={() => setDeleteRequest(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>

      <LogDrawer open={isLogOpen} project={project} onClose={() => setIsLogOpen(false)} onAddRule={handleAddRule} />

      {overlay?.kind === 'about' && <AboutView onBack={() => setOverlay(null)} />}
    </div>
  );
}
