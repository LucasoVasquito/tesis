import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { Canvas } from './components/Canvas';
import { RightPanel } from './components/RightPanel';
import { SystemApplicationView } from './components/SystemApplicationView';
import { UploadModal } from './components/UploadModal';
import { LightboxModal } from './components/LightboxModal';
import { AssignSystemModal } from './components/AssignSystemModal';
import { FeedbackModal } from './components/FeedbackModal';
import { ThesisConceptModal } from './components/ThesisConceptModal';
import { NewProjectModal } from './components/NewProjectModal';
import { AnalysisProgressModal } from './components/AnalysisProgressModal';

import { 
  Project, 
  Reference, 
  Pattern, 
  VisualSystem, 
  FeedbackItem, 
  RightPanelTab,
  VisualSystemExportData
} from './types';
import { 
  SAMPLE_PROJECT_BURGER_CLUB, 
  SAMPLE_PROJECT_BADDER, 
  INITIAL_EMPTY_PROJECT 
} from './data/sampleProjects';
import { compressReferences, compressImageString } from './utils/imageCompressor';
import { getCachedBreakdown, setCachedBreakdown } from './utils/inspectorCache';

const STORAGE_KEY = 'emergent_visual_system_project_v3';
const LEGACY_STORAGE_KEYS = [
  'emergent_visual_system_project_v2',
  'emergent_visual_system_project_v1',
  'emergent_visual_system_project'
];

export default function App() {
  // 1. Core Projects State
  const [projectsList, setProjectsList] = useState<Project[]>(() => {
    const savedList = localStorage.getItem('emergent_projects_list_v4');
    if (savedList) {
      try {
        const parsed = JSON.parse(savedList);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch (e) {
        console.error("Error loading projects list", e);
      }
    }

    const savedSingle = localStorage.getItem(STORAGE_KEY);
    if (savedSingle) {
      try {
        const parsedSingle = JSON.parse(savedSingle);
        if (parsedSingle && typeof parsedSingle === 'object') {
          return [{
            ...INITIAL_EMPTY_PROJECT,
            ...parsedSingle,
            references: Array.isArray(parsedSingle.references) ? parsedSingle.references : [],
            patterns: Array.isArray(parsedSingle.patterns) ? parsedSingle.patterns : [],
            systems: Array.isArray(parsedSingle.systems) ? parsedSingle.systems : [],
            feedback: Array.isArray(parsedSingle.feedback) ? parsedSingle.feedback : [],
          }];
        }
      } catch (e) {}
    }

    return [INITIAL_EMPTY_PROJECT];
  });

  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    return projectsList[0]?.id || INITIAL_EMPTY_PROJECT.id;
  });

  const project = projectsList.find(p => p.id === activeProjectId) || projectsList[0] || INITIAL_EMPTY_PROJECT;

  const setProject = (action: Project | ((prev: Project) => Project)) => {
    setProjectsList(prevList => {
      const currentActive = prevList.find(p => p.id === activeProjectId) || prevList[0] || INITIAL_EMPTY_PROJECT;
      const updated = typeof action === 'function' ? action(currentActive) : action;
      
      const exists = prevList.some(p => p.id === updated.id);
      if (exists) {
        return prevList.map(p => p.id === updated.id ? updated : p);
      } else {
        return [...prevList, updated];
      }
    });
  };

  useEffect(() => {
    try {
      localStorage.setItem('emergent_projects_list_v4', JSON.stringify(projectsList));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    } catch (e) {
      console.warn("Could not save to localStorage", e);
    }
  }, [projectsList, project]);

  // 2. UI Navigation & Selection State
  const [activeTab, setActiveTab] = useState<RightPanelTab>('systems');
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<string[]>([]);
  const [activeEvidencePatternId, setActiveEvidencePatternId] = useState<string | null>(null);
  // Active Applying System View Mode (SISTEMA VISUAL CONFIRMADO → APLICARLO)
  const [activeApplyingSystem, setActiveApplyingSystem] = useState<VisualSystem | null>(null);

  // Panel collapse / minimize state (for maximum screen space & reduced visual noise)
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);

  // 3. Modals State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isThesisGuideOpen, setIsThesisGuideOpen] = useState(false);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [patternToAssign, setPatternToAssign] = useState<Pattern | null>(null);
  const [feedbackContext, setFeedbackContext] = useState<{ pattern?: Pattern; ref?: Reference } | null>(null);
  const [lightboxReference, setLightboxReference] = useState<Reference | null>(null);

  // 4. Async Operation State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStepIndex, setAnalysisStepIndex] = useState(0);
  const [isInspectingRef, setIsInspectingRef] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reference selection helpers
  const handleSelectReference = useCallback((id: string, multi = false) => {
    setSelectedReferenceIds(prev => {
      if (multi) {
        return prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id];
      }
      return [id];
    });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedReferenceIds([]);
  }, []);

  // Selected Reference object for Inspector
  const selectedReference = selectedReferenceIds.length > 0
    ? project.references.find(r => r.id === selectedReferenceIds[0]) || null
    : null;

  // 5. Trigger Multimodal Multi-Reference Analysis
  const handleTriggerAnalysis = async () => {
    if (project.references.length === 0) return;

    setIsAnalyzing(true);
    setAnalysisStepIndex(0);
    setErrorMessage(null);

    const confirmed = project.patterns.filter(p => p.status === 'confirmed');
    const discarded = project.patterns.filter(p => p.status === 'discarded');

    try {
      // Step 0: Compress references client-side
      const compressedReferences = await compressReferences(project.references, {
        maxWidth: 1024,
        maxHeight: 1024,
        quality: 0.8,
      });

      // Step 1: Transmitting to API
      setAnalysisStepIndex(1);

      // Step 2 & 3 timers for progressive UI feedback while waiting for Gemini
      const t2 = setTimeout(() => setAnalysisStepIndex(2), 1200);
      const t3 = setTimeout(() => setAnalysisStepIndex(3), 3200);

      const response = await fetch('/api/analyze-references', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          references: compressedReferences,
          projectName: project.name,
          objective: project.objective,
          description: project.description,
          previousPatterns: project.patterns,
          confirmedPatterns: confirmed,
          discardedPatterns: discarded,
          feedback: project.feedback,
        }),
      });

      clearTimeout(t2);
      clearTimeout(t3);
      setAnalysisStepIndex(3);

      const responseText = await response.text();
      let result: any = null;
      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error('El servidor de análisis tardó en responder. Por favor, reintenta.');
      }

      if (!response.ok || !result.success) {
        throw new Error(result.error || result.details || 'Error desconocido al analizar');
      }

      const { patterns: newDetectedPatterns = [], suggestedSystems = [] } = result.data || {};

      // Merge new patterns with existing confirmed/discarded patterns
      setProject(prev => {
        // Retain confirmed decisions made by human
        const preservedConfirmed = prev.patterns.filter(p => p.status === 'confirmed');
        const preservedDiscarded = prev.patterns.filter(p => p.status === 'discarded');

        // Formulate updated pattern list
        const mergedPatterns: Pattern[] = newDetectedPatterns.map((p: any) => {
          // Check if previously confirmed
          const existingConfirmed = preservedConfirmed.find(c => c.id === p.id || c.name.toLowerCase() === p.name.toLowerCase());
          if (existingConfirmed) {
            return {
              ...p,
              id: existingConfirmed.id,
              status: 'confirmed' as const,
              assignedSystemId: existingConfirmed.assignedSystemId,
              trend: 'strengthened' as const,
            };
          }

          // Check if previously discarded
          const existingDiscarded = preservedDiscarded.find(d => d.id === p.id || d.name.toLowerCase() === p.name.toLowerCase());
          if (existingDiscarded) {
            return {
              ...p,
              id: existingDiscarded.id,
              status: 'discarded' as const,
              discardReason: existingDiscarded.discardReason,
              trend: 'stable' as const,
            };
          }

          return {
            ...p,
            status: 'detected' as const,
            trend: (p.trend || 'new') as any,
          };
        });

        // Add any confirmed pattern not re-returned by AI to never lose human work
        preservedConfirmed.forEach(cp => {
          if (!mergedPatterns.some(mp => mp.id === cp.id)) {
            mergedPatterns.unshift(cp);
          }
        });

        // Initialize systems if none exist yet based on suggested systems
        let updatedSystems = [...prev.systems];
        if (updatedSystems.length === 0 && suggestedSystems.length > 0) {
          updatedSystems = suggestedSystems.map((s: any, idx: number) => ({
            id: s.id || `sys_${idx + 1}`,
            name: s.name,
            description: s.description,
            patternIds: [],
            referenceIds: s.referenceIds || [],
            status: 'active' as const,
            aestheticPillars: s.aestheticPillars || [],
            colorPalette: s.suggestedPalette || [],
            createdAt: new Date().toISOString(),
          }));
        }

        // Mark all references as analyzed (not new)
        const updatedReferences = prev.references.map(r => ({ ...r, isNew: false }));

        return {
          ...prev,
          status: 'analyzed' as const,
          lastAnalyzedAt: new Date().toISOString(),
          patterns: mergedPatterns,
          systems: updatedSystems,
          references: updatedReferences,
        };
      });

      // Step 4: Full completion
      setAnalysisStepIndex(4);
      await new Promise(resolve => setTimeout(resolve, 500));

      setActiveTab('patterns');
    } catch (err: any) {
      console.error("Error analyzing references:", err);
      setErrorMessage(err.message || 'Error al conectar con el servicio de análisis de Gemini.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 6. Deep Inspector for an Individual Reference (with caching)
  const handleInspectReference = async (ref: Reference) => {
    setIsInspectingRef(true);
    setErrorMessage(null);
    setIsLeftSidebarOpen(true);
    setSelectedReferenceIds([ref.id]);

    // Check if breakdown is already in state or in local cache first
    const cachedBreakdown = ref.breakdown || getCachedBreakdown(ref.id);
    if (cachedBreakdown) {
      if (!ref.breakdown) {
        setProject(prev => ({
          ...prev,
          references: prev.references.map(r => 
            r.id === ref.id ? { ...r, breakdown: cachedBreakdown } : r
          ),
        }));
      }
      setIsInspectingRef(false);
      return;
    }

    try {
      // Compress reference image client-side before sending
      const compressedImage = await compressImageString(ref.image, {
        maxWidth: 1024,
        maxHeight: 1024,
        quality: 0.8,
      });

      const compressedRef = { ...ref, image: compressedImage };

      const response = await fetch('/api/inspect-reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference: compressedRef }),
      });

      const responseText = await response.text();
      let result: any = null;
      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error('El servidor no devolvió una respuesta válida.');
      }
      if (!response.ok || !result.success) {
        throw new Error(result.error || result.details || 'Error al desglosar referencia');
      }

      // Save to client localStorage cache
      setCachedBreakdown(ref.id, result.data);

      setProject(prev => ({
        ...prev,
        references: prev.references.map(r => 
          r.id === ref.id ? { ...r, breakdown: result.data } : r
        ),
      }));
    } catch (err: any) {
      console.error("Error inspecting reference:", err);
      setErrorMessage(err.message || 'No se pudo completar el desglose individual.');
    } finally {
      setIsInspectingRef(false);
    }
  };

  // 7. Human Decision Handlers
  const handleStartConfirmPattern = (pattern: Pattern) => {
    setPatternToAssign(pattern);
  };

  const handleCompleteConfirmPattern = (
    patternId: string, 
    systemId: string, 
    newSystemData?: { name: string; description: string }
  ) => {
    setProject(prev => {
      let systems = [...prev.systems];
      let targetSystemId = systemId;

      if (systemId === 'new' && newSystemData) {
        targetSystemId = `sys_${Date.now()}`;
        const newSystem: VisualSystem = {
          id: targetSystemId,
          name: newSystemData.name,
          description: newSystemData.description,
          patternIds: [patternId],
          referenceIds: [],
          status: 'active',
          createdAt: new Date().toISOString(),
        };
        systems.push(newSystem);
      } else {
        systems = systems.map(s => {
          if (s.id === targetSystemId) {
            return {
              ...s,
              patternIds: Array.from(new Set([...s.patternIds, patternId])),
            };
          }
          return s;
        });
      }

      const patterns = prev.patterns.map(p => {
        if (p.id === patternId) {
          return {
            ...p,
            status: 'confirmed' as const,
            assignedSystemId: targetSystemId,
          };
        }
        return p;
      });

      return {
        ...prev,
        patterns,
        systems,
      };
    });
  };

  const handleDiscardPattern = (pattern: Pattern, reason = 'No se ajusta al objetivo de diseño') => {
    setProject(prev => {
      const patterns = prev.patterns.map(p => {
        if (p.id === pattern.id) {
          return {
            ...p,
            status: 'discarded' as const,
            discardReason: reason,
          };
        }
        return p;
      });

      const newFeedback: FeedbackItem = {
        id: `fb_${Date.now()}`,
        patternId: pattern.id,
        type: 'pattern_rejection',
        comment: `Patrón "${pattern.name}" descartado: ${reason}`,
        createdAt: new Date().toISOString(),
      };

      return {
        ...prev,
        patterns,
        feedback: [...prev.feedback, newFeedback],
      };
    });

    if (activeEvidencePatternId === pattern.id) {
      setActiveEvidencePatternId(null);
    }
  };

  const handleRestorePattern = (pattern: Pattern) => {
    setProject(prev => ({
      ...prev,
      patterns: prev.patterns.map(p => 
        p.id === pattern.id ? { ...p, status: 'detected' as const, assignedSystemId: null } : p
      ),
    }));
  };

  const handleExplorePatternEvidence = (pattern: Pattern) => {
    setActiveEvidencePatternId(pattern.id);
    setSelectedReferenceIds(pattern.evidence);
  };

  const handleClearActiveEvidence = () => {
    setActiveEvidencePatternId(null);
  };

  // Add references to canvas
  const handleAddReferences = (newRefs: Reference[]) => {
    setProject(prev => ({
      ...prev,
      references: [...prev.references, ...newRefs],
    }));
  };

  const handleUpdateReferencePosition = (id: string, position: { x: number; y: number }) => {
    setProject(prev => ({
      ...prev,
      references: prev.references.map(r => r.id === id ? { ...r, position } : r),
    }));
  };

  const handleUpdateReference = (id: string, updates: Partial<Reference>) => {
    setProject(prev => ({
      ...prev,
      references: prev.references.map(r => r.id === id ? { ...r, ...updates } : r),
    }));
  };

  const handleDeleteReference = (id: string) => {
    setProject(prev => ({
      ...prev,
      references: prev.references.filter(r => r.id !== id),
      patterns: prev.patterns.map(p => ({
        ...p,
        evidence: p.evidence.filter(eId => eId !== id),
      })),
    }));
    setSelectedReferenceIds(prev => prev.filter(i => i !== id));
  };

  const handleFocusReferenceOnCanvas = (id: string) => {
    setSelectedReferenceIds([id]);
    const ref = project.references.find(r => r.id === id);
    if (ref) {
      const el = document.getElementById(`ref-card-${id}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }
  };

  const handleUpdateProjectMeta = (updates: Partial<Pick<Project, 'name' | 'objective' | 'description'>>) => {
    setProject(prev => ({ ...prev, ...updates }));
  };

  const handleCreateVisualSystem = (name: string, description: string) => {
    const newSystem: VisualSystem = {
      id: `sys_${Date.now()}`,
      name,
      description,
      patternIds: [],
      referenceIds: [],
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    setProject(prev => ({ ...prev, systems: [...prev.systems, newSystem] }));
  };

  const handleSynthesizeVisualSystem = async (systemId: string) => {
    let targetSys: VisualSystem | undefined;
    let currentProj: Project = project;

    setProject(prev => {
      currentProj = prev;
      targetSys = prev.systems.find(s => s.id === systemId);
      if (!targetSys) return prev;
      return {
        ...prev,
        systems: prev.systems.map(s => s.id === systemId ? { ...s, isSynthesizing: true } : s),
      };
    });

    const sys = currentProj.systems.find(s => s.id === systemId);
    if (!sys) return;

    const sysPatterns = currentProj.patterns.filter(p => sys.patternIds.includes(p.id) || p.assignedSystemId === systemId);
    const sysReferences = currentProj.references.filter(r => sys.referenceIds.includes(r.id) || sysPatterns.some(p => p.evidence?.includes(r.id)));

    try {
      const res = await fetch('/api/synthesize-system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: sys,
          patterns: sysPatterns,
          references: sysReferences,
          projectName: currentProj.name,
          projectObjective: currentProj.objective,
          projectDescription: currentProj.description,
        }),
      });

      const result = await res.json();
      if (result.success && result.data) {
        const d = result.data;
        setProject(prev => ({
          ...prev,
          systems: prev.systems.map(s => {
            if (s.id !== systemId) return s;
            return {
              ...s,
              name: d.name || s.name,
              description: d.description || s.description,
              aestheticPillars: d.aestheticPillars || s.aestheticPillars,
              colorPalette: d.colorPalette || s.colorPalette,
              typographyRules: d.typographyRules || s.typographyRules,
              textureRules: d.textureRules || s.textureRules,
              compositionRules: d.compositionRules || s.compositionRules,
              systemDetails: d.systemDetails || s.systemDetails,
              isSynthesizing: false,
              updatedAt: new Date().toISOString(),
            };
          }),
        }));
      } else {
        setProject(prev => ({
          ...prev,
          systems: prev.systems.map(s => s.id === systemId ? { ...s, isSynthesizing: false } : s),
        }));
      }
    } catch (err) {
      console.error('Error al sintetizar el sistema visual:', err);
      setProject(prev => ({
        ...prev,
        systems: prev.systems.map(s => s.id === systemId ? { ...s, isSynthesizing: false } : s),
      }));
    }
  };

  const handleConsolidateVisualSystem = (customName?: string) => {
    let createdSysId: string | null = null;
    setProject(prev => {
      const confirmedPatterns = prev.patterns.filter(p => p.status === 'confirmed');
      const targetPatterns = confirmedPatterns.length > 0 ? confirmedPatterns : prev.patterns;
      
      if (targetPatterns.length === 0) return prev;

      const newSysId = `sys_${Date.now()}`;
      createdSysId = newSysId;
      const name = customName || (prev.name ? `Sistema Visual: ${prev.name}` : 'Sistema Visual Principal');
      
      // Collect reference IDs
      const allRefIds: string[] = Array.from(new Set(targetPatterns.flatMap(p => p.evidence || [])));
      
      const typoPatterns = targetPatterns.filter(p => p.category === 'typography');
      const texturePatterns = targetPatterns.filter(p => p.category === 'texture');
      const compPatterns = targetPatterns.filter(p => p.category === 'composition');
      
      // Default pillars from patterns
      const aestheticPillars = targetPatterns.map(p => p.name).slice(0, 5);

      const colorPalette = [
        { hex: '#18181b', name: 'Base Neutra', role: 'Fondos & Superficies' },
        { hex: '#fafafa', name: 'Luz de Contraste', role: 'Tipografía & Lectura' },
        { hex: '#10b981', name: 'Acento Primario', role: 'Identidad & Enfoque' },
        { hex: '#6366f1', name: 'Acento Complementario', role: 'Detalles & Gráfica' },
        { hex: '#f59e0b', name: 'Acento Cálido', role: 'Packaging & Destacados' },
      ];

      const newSystem: VisualSystem = {
        id: newSysId,
        name,
        description: `Estructura visual coherente formada a partir de ${targetPatterns.length} patrones validados en el moodboard.`,
        patternIds: targetPatterns.map(p => p.id),
        referenceIds: allRefIds,
        status: 'active',
        aestheticPillars,
        colorPalette,
        typographyRules: typoPatterns.map(p => p.description),
        textureRules: texturePatterns.map(p => p.description),
        compositionRules: compPatterns.map(p => p.description),
        systemDetails: {
          brandEssence: `Identidad emergente construida sobre los patrones: ${targetPatterns.map(p => p.name).join(', ')}.`,
          logoAndIdentity: 'Logotipos con alto contraste, legibilidad clara y alineación al tono del sistema.',
          packagingSystem: 'Superficies y envoltorios con armonía tonal y jerarquía de marca.',
          photographyStyle: 'Fotografía con iluminación cuidada y encuadres alineados al moodboard.',
          mascotAndIllustration: 'Recursos ilustrativos y gráficos secundarios que complementan la marca.',
          graphicApplications: 'Diseño editorial e impreso con jerarquía tipográfica y grilla balanceada.',
          digitalAndSocialMedia: 'Soportes digitales consistentes con la paleta y pesos tipográficos del sistema.',
        },
        createdAt: new Date().toISOString(),
      };

      // Mark target patterns as confirmed and assigned
      const updatedPatterns = prev.patterns.map(p => {
        if (targetPatterns.some(tp => tp.id === p.id)) {
          return {
            ...p,
            status: 'confirmed' as const,
            assignedSystemId: newSysId,
          };
        }
        return p;
      });

      return {
        ...prev,
        patterns: updatedPatterns,
        systems: [...prev.systems, newSystem],
      };
    });

    setActiveTab('systems');

    if (createdSysId) {
      const idToSynthesize = createdSysId;
      setTimeout(() => {
        handleSynthesizeVisualSystem(idToSynthesize);
      }, 200);
    }
  };

  const handleUpdateVisualSystem = (updated: VisualSystem) => {
    setProject(prev => ({
      ...prev,
      systems: prev.systems.map(s => s.id === updated.id ? updated : s),
    }));
  };

  const handleDeleteVisualSystem = (systemId: string) => {
    setProject(prev => ({
      ...prev,
      systems: prev.systems.filter(s => s.id !== systemId),
      patterns: prev.patterns.map(p => 
        p.assignedSystemId === systemId ? { ...p, assignedSystemId: null } : p
      ),
    }));
    if (activeApplyingSystem?.id === systemId) {
      setActiveApplyingSystem(null);
    }
  };

  const handleCreateNewProject = (projectData: { name: string; objective: string; description: string }) => {
    const newProj: Project = {
      ...INITIAL_EMPTY_PROJECT,
      id: `proj_${Date.now()}`,
      name: projectData.name,
      objective: projectData.objective,
      description: projectData.description,
      createdAt: new Date().toISOString(),
    };
    setProjectsList(prev => [...prev, newProj]);
    setActiveProjectId(newProj.id);
    setSelectedReferenceIds([]);
    setActiveEvidencePatternId(null);
    setActiveApplyingSystem(null);
  };

  const handleSelectProject = (projectId: string) => {
    setActiveProjectId(projectId);
    setSelectedReferenceIds([]);
    setActiveEvidencePatternId(null);
    setActiveApplyingSystem(null);
  };

  const handleApplyVisualSystem = (system: VisualSystem) => {
    setActiveApplyingSystem(system);
  };

  const handleBackFromApplication = () => {
    setActiveApplyingSystem(null);
  };

  const handleImportVisualSystemData = (data: VisualSystemExportData) => {
    if (!data || !data.system) return;

    setProject(prev => {
      const newSysId = `sys_${Date.now()}`;
      const confirmedPatIds = (data.confirmedPatterns || []).map(p => p.id);
      const supportingRefIds = (data.supportingReferences || []).map(r => r.id);

      const importedSystem: VisualSystem = {
        id: newSysId,
        name: data.system.name,
        description: data.system.description,
        patternIds: confirmedPatIds,
        referenceIds: supportingRefIds,
        aestheticPillars: data.system.aestheticPillars || [],
        colorPalette: data.system.colorPalette,
        typographyRules: data.system.typographyRules,
        textureRules: data.system.textureRules,
        compositionRules: data.system.compositionRules,
        status: 'active',
        createdAt: new Date().toISOString(),
      };

      // Merge patterns
      const importedPatterns: Pattern[] = (data.confirmedPatterns || []).map(p => ({
        id: p.id,
        name: p.name,
        category: p.category,
        description: p.description,
        evidence: p.evidence,
        confidence: 0.95,
        status: 'confirmed' as const,
        assignedSystemId: newSysId,
        designerNotes: p.designerNotes,
        relatedObservations: ['Importado desde sistema confirmado'],
        trend: 'strengthened' as const,
      }));

      const importedPatternIdsSet = new Set(importedPatterns.map(p => p.id));
      const filteredPrevPatterns = prev.patterns.filter(p => !importedPatternIdsSet.has(p.id));
      const updatedPatterns = [...filteredPrevPatterns, ...importedPatterns];

      // Merge references
      const importedRefs: Reference[] = (data.supportingReferences || []).map((r, i) => ({
        id: r.id,
        name: r.name,
        image: r.image,
        tags: r.tags || ['Importado'],
        notes: r.notes,
        position: { x: 80 + (i % 4) * 300, y: 80 + Math.floor(i / 4) * 360 },
        width: 260,
        height: 340,
        createdAt: new Date().toISOString(),
      }));

      const importedRefIdsSet = new Set(importedRefs.map(r => r.id));
      const filteredPrevRefs = prev.references.filter(r => !importedRefIdsSet.has(r.id));
      const updatedReferences = [...filteredPrevRefs, ...importedRefs];

      return {
        ...prev,
        systems: [...prev.systems, importedSystem],
        patterns: updatedPatterns,
        references: updatedReferences,
      };
    });

    setActiveTab('systems');
    alert(`Sistema visual "${data.system.name}" importado exitosamente con ${data.confirmedPatterns?.length || 0} patrones y ${data.supportingReferences?.length || 0} referencias.`);
  };

  const handleDropFiles = (files: FileList) => {
    const newRefs: Reference[] = [];
    let processed = 0;

    Array.from(files).forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        if (dataUrl) {
          const nextId = `ref_${String(project.references.length + index + 1).padStart(2, '0')}`;
          const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");

          newRefs.push({
            id: nextId,
            name: cleanName || `Referencia ${project.references.length + index + 1}`,
            image: dataUrl,
            position: {
              x: 120 + (index % 4) * 310,
              y: 120 + Math.floor(index / 4) * 380,
            },
            width: 260,
            height: 340,
            createdAt: new Date().toISOString(),
            tags: ['Drop Upload'],
            isNew: true,
          });
        }

        processed++;
        if (processed === files.length) {
          handleAddReferences(newRefs);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const activeEvidencePattern = activeEvidencePatternId
    ? project.patterns.find(p => p.id === activeEvidencePatternId) || null
    : null;

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden font-sans select-none">
      {/* 1. Global Navigation Bar */}
      <Navbar
        project={project}
        projectsList={projectsList}
        onSelectProject={handleSelectProject}
        onUpdateProjectMeta={handleUpdateProjectMeta}
        onOpenUpload={() => setIsUploadModalOpen(true)}
        onOpenThesisGuide={() => setIsThesisGuideOpen(true)}
        onOpenNewProjectModal={() => setIsNewProjectModalOpen(true)}
        onTriggerAnalysis={handleTriggerAnalysis}
        isAnalyzing={isAnalyzing}
        activeEvidencePatternId={activeEvidencePatternId}
        onClearActiveEvidence={handleClearActiveEvidence}
        isLeftSidebarOpen={isLeftSidebarOpen}
        onToggleLeftSidebar={() => setIsLeftSidebarOpen(prev => !prev)}
        isRightPanelOpen={isRightPanelOpen}
        onToggleRightPanel={() => setIsRightPanelOpen(prev => !prev)}
      />

      {/* Error notification banner if any */}
      {errorMessage && (
        <div className="bg-red-950/90 border-b border-red-800/80 px-4 py-2 text-xs text-red-200 flex items-center justify-between z-40 shrink-0">
          <span>⚠️ {errorMessage}</span>
          <button 
            onClick={() => setErrorMessage(null)}
            className="text-red-400 hover:text-white underline ml-4 text-[11px]"
          >
            Descartar
          </button>
        </div>
      )}

      {/* 2. Workspace: Either System Application View OR Moodboard Canvas + Panels */}
      {activeApplyingSystem ? (
        <SystemApplicationView
          project={project}
          system={activeApplyingSystem}
          onBackToSystem={handleBackFromApplication}
          onOpenLightbox={(ref) => setLightboxReference(ref)}
        />
      ) : (
        <div className="flex-1 flex min-h-0 overflow-hidden relative">
          {/* Left Sidebar */}
          <Sidebar
            project={project}
            selectedReferenceIds={selectedReferenceIds}
            onSelectReference={handleSelectReference}
            onDeleteReference={handleDeleteReference}
            onFocusReferenceOnCanvas={handleFocusReferenceOnCanvas}
            onOpenInspectReference={(ref) => handleInspectReference(ref)}
            isInspectingRef={isInspectingRef}
            isOpen={isLeftSidebarOpen}
            onToggle={() => setIsLeftSidebarOpen(prev => !prev)}
          />

          {/* Central Spatial Moodboard Canvas */}
          <Canvas
            references={project.references}
            selectedReferenceIds={selectedReferenceIds}
            onSelectReference={handleSelectReference}
            onClearSelection={handleClearSelection}
            onUpdateReferencePosition={handleUpdateReferencePosition}
            onUpdateReference={handleUpdateReference}
            onDeleteReference={handleDeleteReference}
            onOpenInspectReference={handleInspectReference}
            onOpenLightbox={(ref) => setLightboxReference(ref)}
            onOpenUpload={() => setIsUploadModalOpen(true)}
            onDropFiles={handleDropFiles}
            onAddReferences={handleAddReferences}
            activeEvidencePattern={activeEvidencePattern}
            onClearActiveEvidence={handleClearActiveEvidence}
            onTriggerAnalysis={handleTriggerAnalysis}
            isAnalyzing={isAnalyzing}
          />

          {/* Right Discovery & Visual Systems Engine Panel */}
          <RightPanel
            project={project}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onConfirmPattern={handleStartConfirmPattern}
            onDiscardPattern={handleDiscardPattern}
            onRestorePattern={handleRestorePattern}
            onExplorePatternEvidence={handleExplorePatternEvidence}
            onClearActiveEvidence={handleClearActiveEvidence}
            activeEvidencePatternId={activeEvidencePatternId}
            selectedReference={selectedReference}
            onInspectReference={handleInspectReference}
            isInspectingRef={isInspectingRef}
            onOpenFeedbackModal={(pattern, ref) => setFeedbackContext({ pattern, ref })}
            onCreateVisualSystem={handleCreateVisualSystem}
            onConsolidateVisualSystem={handleConsolidateVisualSystem}
            onSynthesizeVisualSystem={handleSynthesizeVisualSystem}
            onUpdateVisualSystem={handleUpdateVisualSystem}
            onDeleteVisualSystem={handleDeleteVisualSystem}
            onApplyVisualSystem={handleApplyVisualSystem}
            onImportVisualSystemData={handleImportVisualSystemData}
            onTriggerAnalysis={handleTriggerAnalysis}
            isAnalyzing={isAnalyzing}
            isOpen={isRightPanelOpen}
            onToggle={() => setIsRightPanelOpen(prev => !prev)}
          />
        </div>
      )}

      {/* 3. Global Interactive Modals */}
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onAddReferences={handleAddReferences}
        existingCount={project.references.length}
      />

      <LightboxModal
        isOpen={!!lightboxReference}
        onClose={() => setLightboxReference(null)}
        reference={lightboxReference}
        onInspect={handleInspectReference}
      />

      <AssignSystemModal
        isOpen={!!patternToAssign}
        onClose={() => setPatternToAssign(null)}
        pattern={patternToAssign}
        systems={project.systems}
        onConfirm={handleCompleteConfirmPattern}
      />

      <FeedbackModal
        isOpen={!!feedbackContext}
        onClose={() => setFeedbackContext(null)}
        pattern={feedbackContext?.pattern || null}
        reference={feedbackContext?.ref || null}
        onSubmitFeedback={(fb) => {
          const item: FeedbackItem = {
            id: `fb_${Date.now()}`,
            ...fb,
            createdAt: new Date().toISOString(),
          };
          setProject(prev => ({ ...prev, feedback: [...prev.feedback, item] }));
        }}
      />

      <ThesisConceptModal
        isOpen={isThesisGuideOpen}
        onClose={() => setIsThesisGuideOpen(false)}
      />

      <NewProjectModal
        isOpen={isNewProjectModalOpen}
        onClose={() => setIsNewProjectModalOpen(false)}
        onCreateProject={handleCreateNewProject}
      />

      <AnalysisProgressModal
        isOpen={isAnalyzing}
        stepIndex={analysisStepIndex}
        totalReferencesCount={project.references.length}
      />
    </div>
  );
}
