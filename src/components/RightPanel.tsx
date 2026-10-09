import React, { useState } from 'react';
import { 
  Sparkles, 
  Layers, 
  Eye, 
  Check, 
  X, 
  Plus, 
  MessageSquare, 
  TrendingUp, 
  AlertCircle, 
  Palette, 
  Type as TypeIcon, 
  Grid, 
  Camera, 
  Maximize2, 
  Sliders, 
  FolderPlus, 
  Copy, 
  CheckCheck, 
  FileText, 
  Download,
  Info,
  Compass,
  ArrowRight,
  ExternalLink,
  Box,
  Smile,
  Share2,
  BadgeCheck,
  ChevronDown,
  ChevronUp,
  Trash2,
  Edit3,
  RefreshCw,
  Save,
  PanelRightClose
} from 'lucide-react';
import { 
  Project, 
  Pattern, 
  VisualSystem, 
  Reference, 
  RightPanelTab, 
  PatternCategory,
  PatternStatus,
  VisualSystemExportData
} from '../types';
import { 
  downloadProjectMarkdown, 
  exportProjectAsJSON, 
  exportVisualSystemAsJSON, 
  parseVisualSystemJSON 
} from '../utils/exportHelpers';

interface RightPanelProps {
  project: Project;
  activeTab: RightPanelTab;
  setActiveTab: (tab: RightPanelTab) => void;
  onConfirmPattern: (pattern: Pattern) => void;
  onDiscardPattern: (pattern: Pattern, reason?: string) => void;
  onRestorePattern: (pattern: Pattern) => void;
  onExplorePatternEvidence: (pattern: Pattern) => void;
  onClearActiveEvidence: () => void;
  activeEvidencePatternId: string | null;
  selectedReference: Reference | null;
  onInspectReference: (ref: Reference) => void;
  isInspectingRef: boolean;
  onOpenFeedbackModal: (pattern?: Pattern, ref?: Reference) => void;
  onCreateVisualSystem: (name: string, description: string) => void;
  onUpdateVisualSystem: (system: VisualSystem) => void;
  onDeleteVisualSystem: (systemId: string) => void;
  onApplyVisualSystem: (system: VisualSystem) => void;
  onConsolidateVisualSystem?: (name?: string) => void;
  onSynthesizeVisualSystem?: (systemId: string) => void;
  onImportVisualSystemData?: (data: VisualSystemExportData) => void;
  onTriggerAnalysis: () => void;
  isAnalyzing: boolean;
  isOpen?: boolean;
  onToggle?: () => void;
}

export const RightPanel: React.FC<RightPanelProps> = ({
  project,
  activeTab,
  setActiveTab,
  onConfirmPattern,
  onDiscardPattern,
  onRestorePattern,
  onExplorePatternEvidence,
  onClearActiveEvidence,
  activeEvidencePatternId,
  selectedReference,
  onInspectReference,
  isInspectingRef,
  onOpenFeedbackModal,
  onCreateVisualSystem,
  onUpdateVisualSystem,
  onDeleteVisualSystem,
  onApplyVisualSystem,
  onConsolidateVisualSystem,
  onSynthesizeVisualSystem,
  onImportVisualSystemData,
  onTriggerAnalysis,
  isAnalyzing,
  isOpen = true,
  onToggle,
}) => {
  // Filters for patterns
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [copiedHex, setCopiedHex] = useState<string | null>(null);
  const [expandedPatternIds, setExpandedPatternIds] = useState<Record<string, boolean>>({});

  const toggleExpandPattern = (patternId: string) => {
    setExpandedPatternIds(prev => ({
      ...prev,
      [patternId]: !prev[patternId],
    }));
  };

  // New system creation inline form
  const [isCreatingSystem, setIsCreatingSystem] = useState(false);
  const [newSystemName, setNewSystemName] = useState('');
  const [newSystemDesc, setNewSystemDesc] = useState('');
  const [systemToDelete, setSystemToDelete] = useState<string | null>(null);

  // Editing state for visual systems
  const [editingSystemId, setEditingSystemId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPillars, setEditPillars] = useState<string[]>([]);
  const [newPillarInput, setNewPillarInput] = useState('');

  const handleStartEditSystem = (system: VisualSystem) => {
    setEditingSystemId(system.id);
    setEditName(system.name);
    setEditDesc(system.description);
    setEditPillars(system.aestheticPillars || []);
    setNewPillarInput('');
  };

  const handleSaveEditSystem = (system: VisualSystem) => {
    onUpdateVisualSystem({
      ...system,
      name: editName.trim() || system.name,
      description: editDesc.trim(),
      aestheticPillars: editPillars.filter(p => p.trim().length > 0),
      updatedAt: new Date().toISOString(),
    });
    setEditingSystemId(null);
  };

  const handleAddPillar = () => {
    if (!newPillarInput.trim()) return;
    setEditPillars(prev => [...prev, newPillarInput.trim()]);
    setNewPillarInput('');
  };

  const handleRemovePillar = (index: number) => {
    setEditPillars(prev => prev.filter((_, i) => i !== index));
  };

  const handleCopyHex = (hex: string) => {
    navigator.clipboard.writeText(hex);
    setCopiedHex(hex);
    setTimeout(() => setCopiedHex(null), 2000);
  };

  const handleCreateSystemSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSystemName.trim()) return;
    onCreateVisualSystem(newSystemName.trim(), newSystemDesc.trim());
    setNewSystemName('');
    setNewSystemDesc('');
    setIsCreatingSystem(false);
  };

  // Helper for category icon
  const getCategoryIcon = (cat: PatternCategory) => {
    switch (cat) {
      case 'logo_identity': return <BadgeCheck className="w-3.5 h-3.5" />;
      case 'packaging': return <Box className="w-3.5 h-3.5" />;
      case 'mascot_illustration': return <Smile className="w-3.5 h-3.5" />;
      case 'flyer_poster': return <FileText className="w-3.5 h-3.5" />;
      case 'social_media': return <Share2 className="w-3.5 h-3.5" />;
      case 'typography': return <TypeIcon className="w-3.5 h-3.5" />;
      case 'color': return <Palette className="w-3.5 h-3.5" />;
      case 'texture': return <Sparkles className="w-3.5 h-3.5" />;
      case 'composition': return <Grid className="w-3.5 h-3.5" />;
      case 'photography_treatment': return <Camera className="w-3.5 h-3.5" />;
      case 'geometry': return <Compass className="w-3.5 h-3.5" />;
      case 'graphic_elements': return <Sparkles className="w-3.5 h-3.5" />;
      case 'mood': return <Sparkles className="w-3.5 h-3.5" />;
      default: return <Sparkles className="w-3.5 h-3.5" />;
    }
  };

  // Helper for category label
  const getCategoryLabel = (cat: PatternCategory) => {
    switch (cat) {
      case 'logo_identity': return 'Identidad & Logo';
      case 'packaging': return 'Packaging & Envoltorios';
      case 'mascot_illustration': return 'Mascota & Ilustración';
      case 'flyer_poster': return 'Flyers & Afiches';
      case 'social_media': return 'Redes & Digital';
      case 'typography': return 'Tipografía';
      case 'color': return 'Colorimetría';
      case 'texture': return 'Textura & Grano';
      case 'composition': return 'Composición';
      case 'photography_treatment': return 'Fotografía & Encuadre';
      case 'geometry': return 'Geometría';
      case 'graphic_elements': return 'Recursos Gráficos';
      case 'mood': return 'Clima & Tono Visual';
      default: return cat;
    }
  };

  const filteredPatterns = project.patterns.filter(p => {
    if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    return true;
  });

  const confirmedPatterns = project.patterns.filter(p => p.status === 'confirmed');
  const detectedPatterns = project.patterns.filter(p => p.status === 'detected');
  const discardedPatterns = project.patterns.filter(p => p.status === 'discarded');

  if (!isOpen) {
    return (
      <div 
        onClick={onToggle}
        className="w-12 h-full border-l border-zinc-800/80 bg-zinc-950/90 hover:bg-zinc-900/90 flex flex-col items-center justify-between py-4 cursor-pointer transition-colors shrink-0 select-none z-20"
        title="Clic para expandir la ventana de descubrimientos"
      >
        <div className="flex flex-col items-center gap-4">
          {/* Collapsed tab icons */}
          <button
            onClick={(e) => { e.stopPropagation(); setActiveTab('patterns'); onToggle?.(); }}
            className={`p-2 rounded-lg relative ${activeTab === 'patterns' ? 'bg-indigo-950 text-indigo-400 border border-indigo-700' : 'text-zinc-400 hover:text-zinc-200'}`}
            title="Descubrimientos"
          >
            <Sparkles className="w-4 h-4" />
            {project.patterns.length > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-indigo-500 rounded-full" />
            )}
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); setActiveTab('systems'); onToggle?.(); }}
            className={`p-2 rounded-lg relative ${activeTab === 'systems' ? 'bg-emerald-950 text-emerald-400 border border-emerald-700' : 'text-zinc-400 hover:text-zinc-200'}`}
            title="Sistemas Visuales"
          >
            <Layers className="w-4 h-4" />
            {project.systems.length > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full" />
            )}
          </button>
        </div>

        <div className="writing-mode-vertical text-[10px] font-mono text-zinc-500 uppercase tracking-widest rotate-180">
          Patrones Visuales
        </div>
      </div>
    );
  }

  return (
    <aside className="w-96 h-full border-l border-zinc-800 bg-zinc-900/90 backdrop-blur-md flex flex-col shrink-0 select-none overflow-hidden transition-all">
      {/* Tab Navigation Header */}
      <div className="p-2.5 border-b border-zinc-800 bg-zinc-950/80 flex items-center justify-between gap-1.5 shrink-0">
        <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-lg border border-zinc-800 flex-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab('patterns')}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-md text-xs font-medium transition-all ${
              activeTab === 'patterns'
                ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sparkles className="w-3 h-3 text-indigo-300" />
            <span>Patrones Visuales</span>
            {detectedPatterns.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-950 text-indigo-200 font-bold border border-indigo-700/50">
                {detectedPatterns.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('systems')}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-md text-xs font-medium transition-all ${
              activeTab === 'systems'
                ? 'bg-emerald-600 text-white shadow-sm font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Layers className="w-3 h-3 text-emerald-300" />
            <span>Sistemas</span>
            {project.systems.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-950 text-emerald-200 font-bold border border-emerald-700/50">
                {project.systems.length}
              </span>
            )}
          </button>
        </div>

        {onToggle && (
          <button
            onClick={onToggle}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors shrink-0"
            title="Minimizar ventana de descubrimientos"
          >
            <PanelRightClose className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Main Tab Views */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* ======================================================== */}
        {/* TAB 1: DESCUBRIMIENTOS (PATRONES EMERGENTES) */}
        {/* ======================================================== */}
        {activeTab === 'patterns' && (
          <div className="p-4 space-y-4">
            {/* Header & Concept Reminder */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-400 font-mono flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Patrones Visuales Detectados</span>
                </h2>
                <span className="text-[11px] text-zinc-400 font-mono">
                  {project.patterns.length} encontrados
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-normal">
                Recurrencias observables analizadas por Gemini a partir de las referencias cargadas en el canvas.
              </p>
            </div>

            {/* Empty State / Trigger */}
            {project.patterns.length === 0 ? (
              <div className="py-12 px-4 text-center bg-zinc-950/40 rounded-xl border border-zinc-800/80 space-y-3">
                <div className="w-12 h-12 rounded-xl bg-indigo-950/80 border border-indigo-800/60 flex items-center justify-center mx-auto text-indigo-400">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-zinc-200">
                    Aún no hay análisis de patrones
                  </h4>
                  <p className="text-[11px] text-zinc-400 max-w-xs mx-auto">
                    Subí referencias visuales al canvas y hacé click en "Analizar Referencias" para que Gemini identifique recurrencias y proponga sistemas visuales.
                  </p>
                </div>

                <button
                  onClick={onTriggerAnalysis}
                  disabled={isAnalyzing || project.references.length === 0}
                  className="px-4 py-2 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-lg transition-colors shadow-md"
                >
                  {isAnalyzing ? 'Analizando con Gemini...' : 'Iniciar Análisis de Referencias'}
                </button>
              </div>
            ) : (
              <>
                {/* Category & Status Filter Pills */}
                <div className="space-y-2 pb-1">

                  {/* Category Pills */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
                    {[
                      { id: 'all', label: 'Todos' },
                      { id: 'typography', label: 'Tipografía' },
                      { id: 'color', label: 'Color' },
                      { id: 'texture', label: 'Textura' },
                      { id: 'composition', label: 'Composición' },
                      { id: 'geometry', label: 'Geometría' },
                    ].map(cat => (
                      <button
                        key={cat.id}
                        onClick={() => setCategoryFilter(cat.id)}
                        className={`text-[10px] px-2 py-1 rounded-md whitespace-nowrap transition-colors ${
                          categoryFilter === cat.id
                            ? 'bg-zinc-200 text-zinc-900 font-semibold'
                            : 'bg-zinc-950 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  {/* Status Toggle (Pendientes / Confirmados / Descartados) */}
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <span className="text-zinc-500 uppercase font-mono">Estado:</span>
                    <button
                      onClick={() => setStatusFilter('all')}
                      className={`px-2 py-0.5 rounded ${statusFilter === 'all' ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                      Todos ({project.patterns.length})
                    </button>
                    <button
                      onClick={() => setStatusFilter('detected')}
                      className={`px-2 py-0.5 rounded ${statusFilter === 'detected' ? 'bg-indigo-950 text-indigo-300 font-medium' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                      Pendientes ({detectedPatterns.length})
                    </button>
                    <button
                      onClick={() => setStatusFilter('confirmed')}
                      className={`px-2 py-0.5 rounded ${statusFilter === 'confirmed' ? 'bg-emerald-950 text-emerald-300 font-medium' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                      Confirmados ({confirmedPatterns.length})
                    </button>
                    <button
                      onClick={() => setStatusFilter('discarded')}
                      className={`px-2 py-0.5 rounded ${statusFilter === 'discarded' ? 'bg-red-950 text-red-300 font-medium' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                      Descartados ({discardedPatterns.length})
                    </button>
                  </div>
                </div>

                {/* Pattern Cards List */}
                <div className="space-y-3">
                  {filteredPatterns.map((pattern, index) => {
                    const isExploring = activeEvidencePatternId === pattern.id;
                    const evidenceRatio = Math.round((pattern.evidence.length / Math.max(project.references.length, 1)) * 100);

                    return (
                      <div
                        key={pattern.id}
                        className={`p-3.5 rounded-xl border transition-all space-y-3 ${
                          pattern.status === 'confirmed'
                            ? 'bg-emerald-950/20 border-emerald-800/50'
                            : pattern.status === 'discarded'
                            ? 'bg-zinc-950/50 border-zinc-800/60 opacity-60'
                            : isExploring
                            ? 'bg-zinc-900 border-amber-500/80 shadow-lg shadow-amber-500/10'
                            : 'bg-zinc-950/70 border-zinc-800/90 hover:border-zinc-700'
                        }`}
                      >
                        {/* Card Header: Category & Number & Trend */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono font-bold text-zinc-500">
                              #{String(index + 1).padStart(2, '0')}
                            </span>
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] font-medium text-zinc-300">
                              {getCategoryIcon(pattern.category)}
                              <span>{getCategoryLabel(pattern.category)}</span>
                            </span>

                            {pattern.trend === 'new' && (
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800/60 font-semibold">
                                Nuevo
                              </span>
                            )}
                            {pattern.trend === 'strengthened' && (
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/60 font-semibold flex items-center gap-0.5">
                                <TrendingUp className="w-2.5 h-2.5" />
                                Fortalecido
                              </span>
                            )}
                          </div>

                          {/* Status Badge */}
                          {pattern.status === 'confirmed' && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-semibold">
                              Confirmado
                            </span>
                          )}
                          {pattern.status === 'discarded' && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-900 text-zinc-500 border border-zinc-800">
                              Descartado
                            </span>
                          )}
                        </div>

                        {/* Title & Description */}
                        <div className="space-y-1">
                          <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-tight">
                            {pattern.name}
                          </h3>
                          <p className="text-[11px] text-zinc-300 leading-relaxed">
                            {pattern.description}
                          </p>
                        </div>

                        {/* Frequency & Consistency Bar */}
                        <div className="space-y-1 bg-zinc-900/60 p-2 rounded-lg border border-zinc-800/60 text-[11px]">
                          <div className="flex items-center justify-between text-zinc-400">
                            <span>Presente en {pattern.evidence.length} de {project.references.length} referencias</span>
                            <span className="font-mono text-zinc-300 font-medium">{evidenceRatio}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-zinc-950 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-indigo-500 to-amber-500 rounded-full"
                              style={{ width: `${Math.min(evidenceRatio, 100)}%` }}
                            />
                          </div>
                        </div>

                        {/* Expandable Analytical Details Toggle */}
                        {(() => {
                          const isExpanded = !!expandedPatternIds[pattern.id] || isExploring;
                          return (
                            <>
                              <button
                                type="button"
                                onClick={() => toggleExpandPattern(pattern.id)}
                                className={`w-full py-1.5 px-2.5 rounded-lg text-[11px] font-medium flex items-center justify-between transition-all border ${
                                  isExpanded
                                    ? 'bg-indigo-950/40 text-indigo-300 border-indigo-800/60 shadow-sm'
                                    : 'bg-zinc-900/60 hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200 border-zinc-800 hover:border-zinc-700'
                                }`}
                              >
                                <div className="flex items-center gap-1.5">
                                  <Sparkles className={`w-3.5 h-3.5 ${isExpanded ? 'text-indigo-400' : 'text-zinc-500'}`} />
                                  <span className="font-semibold">
                                    {isExpanded ? 'Ocultar Desglose Analítico' : 'Desglosar Rasgos & Evidencia'}
                                  </span>
                                </div>
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-indigo-400' : 'text-zinc-500'}`} />
                              </button>

                              {/* Collapsible Analytical Details Container */}
                              {isExpanded && (
                                <div className="space-y-3 pt-1 border-t border-zinc-800/60 animate-in fade-in duration-150">
                                  {/* Related Visual Traits Chips */}
                                  {pattern.relatedObservations && pattern.relatedObservations.length > 0 && (
                                    <div className="space-y-1">
                                      <span className="text-[10px] uppercase font-mono text-zinc-500">
                                        Rasgos asociados observables:
                                      </span>
                                      <div className="flex flex-wrap gap-1">
                                        {pattern.relatedObservations.map((trait, i) => (
                                          <span
                                            key={i}
                                            className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-800"
                                          >
                                            • {trait}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* System Hypothesis (Subsistema Físico & Digital) */}
                                  {pattern.systemHypothesis && (
                                    <div className="space-y-1 bg-zinc-950/80 p-2.5 rounded-lg border border-emerald-900/40 text-[11px] text-zinc-300 leading-relaxed">
                                      <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-emerald-400 uppercase">
                                        <Sparkles className="w-3 h-3 text-emerald-400" />
                                        <span>Hipótesis de Subsistema (Físico / Digital):</span>
                                      </div>
                                      <p className="text-zinc-300 text-[11px] leading-relaxed">
                                        {pattern.systemHypothesis}
                                      </p>
                                    </div>
                                  )}

                                  {/* Suggested System hypothesis label */}
                                  {pattern.suggestedSystemName && (
                                    <div className="text-[10px] text-indigo-300 bg-indigo-950/40 px-2 py-1 rounded border border-indigo-800/40 flex items-center gap-1.5">
                                      <Layers className="w-3 h-3 shrink-0" />
                                      <span>Sistema sugerido: <strong>{pattern.suggestedSystemName}</strong></span>
                                    </div>
                                  )}

                                  {/* Evidence Section */}
                                  <div className="pt-1 border-t border-zinc-800/80 space-y-1.5">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10px] uppercase font-mono text-zinc-400">
                                        Evidencia ({pattern.evidence.length} refs):
                                      </span>

                                      <button
                                        onClick={() => {
                                          if (isExploring) {
                                            onClearActiveEvidence();
                                          } else {
                                            onExplorePatternEvidence(pattern);
                                          }
                                        }}
                                        className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded transition-colors ${
                                          isExploring
                                            ? 'bg-amber-500 text-zinc-950 font-bold'
                                            : 'text-amber-400 hover:text-amber-300 hover:bg-amber-950/50'
                                        }`}
                                      >
                                        <Eye className="w-3 h-3" />
                                        <span>{isExploring ? 'Ocultar Evidencia' : 'Ver Referencias en Canvas'}</span>
                                      </button>
                                    </div>

                                    <div className="flex flex-wrap gap-1.5">
                                      {pattern.evidence.map(refId => {
                                        const ref = project.references.find(r => r.id === refId);
                                        return (
                                          <button
                                            key={refId}
                                            onClick={() => onExplorePatternEvidence(pattern)}
                                            className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[10px] text-zinc-300 font-mono transition-colors group"
                                            title={ref?.name || refId}
                                          >
                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                                            <span>{refId}</span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </>
                          );
                        })()}

                        {/* Validation Action Buttons (Designer Decisions) */}
                        <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between gap-2">
                          {pattern.status === 'detected' ? (
                            <>
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => onConfirmPattern(pattern)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors shadow-sm active:scale-95"
                                  title="Confirmar patrón como parte del sistema visual"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Confirmar</span>
                                </button>

                                <button
                                  onClick={() => onDiscardPattern(pattern)}
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-rose-300 hover:text-white bg-rose-950/50 hover:bg-rose-900/70 border border-rose-800/70 hover:border-rose-600 rounded-lg transition-colors active:scale-95"
                                  title="Descartar hipótesis de patrón"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  <span>Descartar</span>
                                </button>
                              </div>

                              {/* Prominent Discussion / Feedback Button */}
                              <button
                                onClick={() => onOpenFeedbackModal(pattern)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-amber-500/70 bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 hover:text-amber-100 text-xs font-semibold shadow-sm transition-all hover:scale-105 active:scale-95 group shrink-0"
                                title="Abrir panel de discusión / feedback con IA"
                              >
                                <MessageSquare className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
                                <span>Discutir</span>
                              </button>
                            </>
                          ) : (
                            <div className="w-full flex items-center justify-between">
                              <span className="text-[10px] text-zinc-400 italic">
                                {pattern.status === 'confirmed' ? 'Validado por el diseñador' : 'Descartado del universo activo'}
                              </span>

                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => onOpenFeedbackModal(pattern)}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-amber-500/60 bg-amber-950/50 hover:bg-amber-900/70 text-amber-300 hover:text-amber-100 text-[10px] font-medium"
                                  title="Abrir panel de discusión / feedback con IA"
                                >
                                  <MessageSquare className="w-3 h-3 text-amber-400" />
                                  <span>Discutir</span>
                                </button>

                                <button
                                  onClick={() => onRestorePattern(pattern)}
                                  className="text-[11px] text-indigo-400 hover:underline"
                                >
                                  Restaurar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 2: SISTEMAS VISUALES CONFIRMADOS */}
        {/* ======================================================== */}
        {activeTab === 'systems' && (
          <div className="p-4 space-y-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400 font-mono flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  <span>Sistemas Visuales Confirmados</span>
                </h2>

                <div className="flex items-center gap-1.5">
                  <label className="flex items-center gap-1 text-[11px] text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-2 py-0.5 rounded cursor-pointer transition-colors" title="Importar sistema visual JSON">
                    <Download className="w-3 h-3 rotate-180 text-zinc-400" />
                    <span>Importar</span>
                    <input
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          try {
                            const parsed = parseVisualSystemJSON(event.target?.result as string);
                            if (parsed && onImportVisualSystemData) {
                              onImportVisualSystemData(parsed);
                            }
                          } catch (err: any) {
                            alert(err.message || 'Error al importar sistema visual');
                          }
                        };
                        reader.readAsText(file);
                        e.target.value = '';
                      }}
                    />
                  </label>

                  <button
                    onClick={() => setIsCreatingSystem(true)}
                    className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Nuevo Sistema</span>
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-zinc-400 leading-normal">
                Estructuras visuales coherentes formadas a partir de las recurrencias que confirmaste.
              </p>
            </div>

            {/* Inline create system form */}
            {isCreatingSystem && (
              <form onSubmit={handleCreateSystemSubmit} className="p-3 bg-zinc-950 rounded-xl border border-emerald-800/60 space-y-2">
                <h4 className="text-xs font-bold text-emerald-300">Crear Nuevo Sistema Visual</h4>
                <input
                  type="text"
                  placeholder="Nombre (ej. Sistema Editorial Oscuro)"
                  value={newSystemName}
                  onChange={e => setNewSystemName(e.target.value)}
                  className="w-full text-xs bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-emerald-500"
                  autoFocus
                />
                <textarea
                  placeholder="Descripción y rol en el proyecto..."
                  value={newSystemDesc}
                  onChange={e => setNewSystemDesc(e.target.value)}
                  rows={2}
                  className="w-full text-xs bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-emerald-500 resize-none"
                />
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsCreatingSystem(false)}
                    className="px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded"
                  >
                    Crear Sistema
                  </button>
                </div>
              </form>
            )}

            {/* List of Systems */}
            {project.systems.length === 0 ? (
              <div className="py-10 px-4 text-center bg-zinc-950/40 rounded-xl border border-zinc-800 space-y-4">
                <Layers className="w-10 h-10 mx-auto text-zinc-700 stroke-1" />
                <div className="space-y-1.5">
                  <h4 className="text-xs font-semibold text-zinc-200">
                    No hay sistemas visuales formados aún
                  </h4>
                  <p className="text-[11px] text-zinc-400 max-w-xs mx-auto leading-relaxed">
                    {confirmedPatterns.length > 0
                      ? `Tienes ${confirmedPatterns.length} patrones validados listos para sintetizarse en un sistema visual.`
                      : 'Aceptá patrones detectados en la pestaña "Descubrimientos" para agruparlos en uno o más sistemas visuales.'}
                  </p>
                </div>

                {confirmedPatterns.length > 0 || project.patterns.length > 0 ? (
                  <div className="pt-2 flex flex-col items-center gap-2">
                    <button
                      onClick={() => onConsolidateVisualSystem && onConsolidateVisualSystem()}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-lg shadow-emerald-950/50"
                    >
                      <Sparkles className="w-4 h-4 text-emerald-200" />
                      <span>⚡ Consolidar Sistema Visual ({confirmedPatterns.length || project.patterns.length} patrones)</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('patterns')}
                      className="text-[11px] text-zinc-400 hover:text-zinc-200 hover:underline"
                    >
                      Revisar descubrimientos →
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setActiveTab('patterns')}
                    className="px-3 py-1.5 text-xs text-indigo-400 hover:underline"
                  >
                    Explorar descubrimientos →
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {project.systems.map((system, sysIdx) => {
                  const assignedPatterns = project.patterns.filter(p => system.patternIds.includes(p.id));
                  const systemRefIds = Array.from(new Set(assignedPatterns.flatMap(p => p.evidence)));

                  return (
                    <div
                      key={system.id}
                      className="p-4 rounded-xl bg-zinc-950/80 border border-emerald-900/60 shadow-lg space-y-4"
                    >
                      {/* System Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider font-semibold">
                            SISTEMA VISUAL #{String(sysIdx + 1).padStart(2, '0')}
                          </span>
                          {editingSystemId === system.id ? (
                            <input
                              type="text"
                              value={editName}
                              onChange={e => setEditName(e.target.value)}
                              className="w-full text-xs font-bold text-zinc-100 bg-zinc-900 border border-emerald-700/80 rounded px-2 py-1 focus:outline-none focus:border-emerald-500 mt-1"
                              placeholder="Nombre del sistema..."
                            />
                          ) : (
                            <h3 className="text-sm font-bold text-zinc-100 truncate">
                              {system.name}
                            </h3>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 text-[10px] font-mono border border-emerald-800">
                            {assignedPatterns.length} patrones
                          </span>

                          {onSynthesizeVisualSystem && (
                            <button
                              onClick={() => onSynthesizeVisualSystem(system.id)}
                              disabled={system.isSynthesizing}
                              className={`p-1.5 rounded-md text-xs font-medium border transition-colors flex items-center gap-1 ${
                                system.isSynthesizing
                                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700 animate-pulse'
                                  : 'bg-zinc-900 hover:bg-emerald-950/60 text-emerald-400 hover:text-emerald-300 border-zinc-800 hover:border-emerald-800'
                              }`}
                              title="Sintetizar y actualizar pilares y descripción con IA Gemini"
                            >
                              <Sparkles className={`w-3.5 h-3.5 ${system.isSynthesizing ? 'animate-spin text-emerald-400' : ''}`} />
                            </button>
                          )}

                          {editingSystemId === system.id ? (
                            <button
                              onClick={() => handleSaveEditSystem(system)}
                              className="p-1.5 text-emerald-400 hover:text-emerald-300 bg-emerald-950 border border-emerald-700 rounded-md transition-colors"
                              title="Guardar cambios"
                            >
                              <Save className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleStartEditSystem(system)}
                              className="p-1.5 text-zinc-400 hover:text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-md transition-colors"
                              title="Editar nombre, descripción y pilares manualmente"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            onClick={() => setSystemToDelete(system.id)}
                            className="p-1.5 text-zinc-400 hover:text-red-400 bg-zinc-900/80 hover:bg-red-950/40 border border-zinc-800 hover:border-red-800/60 rounded-md transition-colors"
                            title="Eliminar este sistema visual"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Synthesizing Indicator Banner */}
                      {system.isSynthesizing && (
                        <div className="p-2.5 bg-emerald-950/40 border border-emerald-800/60 rounded-lg flex items-center gap-2 text-emerald-300 text-xs animate-pulse">
                          <Sparkles className="w-4 h-4 text-emerald-400 animate-spin" />
                          <span className="text-[11px] font-medium">
                            Sintetizando pilares, fundamentación y reglas con IA Gemini...
                          </span>
                        </div>
                      )}

                      {/* Confirmation Banner if deleting */}
                      {systemToDelete === system.id && (
                        <div className="p-3 bg-red-950/80 border border-red-800/80 rounded-xl space-y-2.5 shadow-md">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                              <h4 className="text-xs font-bold text-red-200">
                                ¿Eliminar el sistema "{system.name}"?
                              </h4>
                              <p className="text-[11px] text-red-300/90 leading-tight">
                                Este sistema se eliminará del proyecto. Los patrones continuarán existiendo en tus descubrimientos para que puedas reasignarlos o agruparlos según tus nuevas referencias.
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                              onClick={() => setSystemToDelete(null)}
                              className="px-2.5 py-1 text-xs font-medium text-zinc-300 hover:text-white bg-zinc-800/80 hover:bg-zinc-700/80 rounded-md transition-colors"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={() => {
                                onDeleteVisualSystem(system.id);
                                setSystemToDelete(null);
                              }}
                              className="px-3 py-1 text-xs font-bold text-white bg-red-600 hover:bg-red-500 rounded-md transition-colors flex items-center gap-1.5 shadow-sm"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Eliminar sistema</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Description - Edit Mode vs Display Mode */}
                      {editingSystemId === system.id ? (
                        <div className="space-y-2">
                          <label className="text-[10px] uppercase font-mono text-emerald-400 font-semibold">
                            Descripción / Narrativa Conceptual:
                          </label>
                          <textarea
                            value={editDesc}
                            onChange={e => setEditDesc(e.target.value)}
                            rows={3}
                            className="w-full text-xs bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-zinc-200 focus:outline-none focus:border-emerald-500 resize-none"
                            placeholder="Descripción conceptual del sistema visual..."
                          />
                        </div>
                      ) : (
                        system.description && (
                          <p className="text-[11px] text-zinc-300 leading-relaxed">
                            {system.description}
                          </p>
                        )
                      )}

                      {/* Prominent Action: Aplicar Sistema & Exportar */}
                      <div className="p-3 bg-gradient-to-r from-emerald-950/90 to-zinc-900 rounded-xl border border-emerald-800/70 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-emerald-300 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                            Aplicar Sistema en Producción
                          </span>
                          <span className="text-[10px] font-mono text-emerald-400/80">
                            Fase activa
                          </span>
                        </div>

                        <p className="text-[11px] text-zinc-300 leading-tight">
                          Trasladá este sistema visual validado a envoltorios, fachadas, publicaciones o packaging para generar visualizaciones tangibles e iterar.
                        </p>

                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={() => onApplyVisualSystem(system)}
                            className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md hover:shadow-emerald-950/60 transition-all flex items-center justify-center gap-1.5 border border-emerald-400/30"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-emerald-200" />
                            <span>Aplicar sistema</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => exportVisualSystemAsJSON(system, project)}
                            className="py-2 px-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs border border-zinc-700 transition-colors flex items-center gap-1"
                            title="Exportar sistema como JSON"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Exportar</span>
                          </button>
                        </div>
                      </div>

                      {/* Aesthetic Pillars - Edit Mode vs Display Mode */}
                      {editingSystemId === system.id ? (
                        <div className="space-y-2 bg-zinc-900/80 p-3 rounded-lg border border-emerald-800/60">
                          <span className="text-[10px] uppercase font-mono text-emerald-400 font-semibold">
                            Gestionar Pilares Conceptuales:
                          </span>
                          <div className="space-y-1.5">
                            {editPillars.map((pillar, i) => (
                              <div key={i} className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={pillar}
                                  onChange={e => {
                                    const updated = [...editPillars];
                                    updated[i] = e.target.value;
                                    setEditPillars(updated);
                                  }}
                                  className="flex-1 text-xs bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-zinc-100 focus:outline-none focus:border-emerald-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemovePillar(i)}
                                  className="p-1 text-zinc-400 hover:text-red-400 rounded"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>

                          <div className="flex items-center gap-1.5 pt-1">
                            <input
                              type="text"
                              value={newPillarInput}
                              onChange={e => setNewPillarInput(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddPillar(); } }}
                              placeholder="Agregar nuevo pilar..."
                              className="flex-1 text-xs bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-zinc-100 focus:outline-none focus:border-emerald-500"
                            />
                            <button
                              type="button"
                              onClick={handleAddPillar}
                              className="px-2 py-1 text-xs bg-emerald-700 hover:bg-emerald-600 text-white rounded font-medium flex items-center gap-1"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Añadir</span>
                            </button>
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
                            <button
                              type="button"
                              onClick={() => setEditingSystemId(null)}
                              className="px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveEditSystem(system)}
                              className="px-3 py-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold flex items-center gap-1"
                            >
                              <Save className="w-3.5 h-3.5" />
                              <span>Guardar Cambios</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        system.aestheticPillars && system.aestheticPillars.length > 0 && (
                          <div className="space-y-1.5 bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800/80">
                            <span className="text-[10px] uppercase font-mono text-zinc-400">
                              Pilares Conceptuales:
                            </span>
                            <ul className="space-y-1 text-xs text-zinc-200">
                              {system.aestheticPillars.map((pillar, i) => (
                                <li key={i} className="flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                  <span>{pillar}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )
                      )}

                      {/* Detailed Branding Systems Analysis (Brand Essence, Logos, Packaging, Photo, Mascots, Posters, Social) */}
                      {system.systemDetails && (
                        <div className="space-y-2 bg-zinc-900/40 p-3 rounded-lg border border-emerald-950/80 text-xs">
                          <div className="flex items-center gap-1.5 text-emerald-300 font-semibold text-[11px] pb-1 border-b border-zinc-800">
                            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Desglose Profundo de Identidad & Branding</span>
                          </div>

                          {system.systemDetails.brandEssence && (
                            <div className="space-y-0.5">
                              <span className="text-[10px] font-mono text-zinc-400 uppercase">Esencia de Marca:</span>
                              <p className="text-[11px] text-zinc-200">{system.systemDetails.brandEssence}</p>
                            </div>
                          )}

                          {system.systemDetails.logoRules && (
                            <div className="space-y-0.5">
                              <span className="text-[10px] font-mono text-indigo-400 uppercase flex items-center gap-1">
                                <BadgeCheck className="w-3 h-3" /> Logotipos & Isotipos:
                              </span>
                              <p className="text-[11px] text-zinc-300">{system.systemDetails.logoRules}</p>
                            </div>
                          )}

                          {system.systemDetails.packagingDesign && (
                            <div className="space-y-0.5">
                              <span className="text-[10px] font-mono text-amber-400 uppercase flex items-center gap-1">
                                <Box className="w-3 h-3" /> Packaging & Envoltorios:
                              </span>
                              <p className="text-[11px] text-zinc-300">{system.systemDetails.packagingDesign}</p>
                            </div>
                          )}

                          {system.systemDetails.photographyDirection && (
                            <div className="space-y-0.5">
                              <span className="text-[10px] font-mono text-cyan-400 uppercase flex items-center gap-1">
                                <Camera className="w-3 h-3" /> Dirección Fotográfica:
                              </span>
                              <p className="text-[11px] text-zinc-300">{system.systemDetails.photographyDirection}</p>
                            </div>
                          )}

                          {system.systemDetails.mascotOrIllustration && (
                            <div className="space-y-0.5">
                              <span className="text-[10px] font-mono text-pink-400 uppercase flex items-center gap-1">
                                <Smile className="w-3 h-3" /> Mascota & Ilustraciones:
                              </span>
                              <p className="text-[11px] text-zinc-300">{system.systemDetails.mascotOrIllustration}</p>
                            </div>
                          )}

                          {system.systemDetails.flyersAndPosters && (
                            <div className="space-y-0.5">
                              <span className="text-[10px] font-mono text-emerald-400 uppercase flex items-center gap-1">
                                <FileText className="w-3 h-3" /> Afiches & Material Impreso:
                              </span>
                              <p className="text-[11px] text-zinc-300">{system.systemDetails.flyersAndPosters}</p>
                            </div>
                          )}

                          {system.systemDetails.socialMediaGuidelines && (
                            <div className="space-y-0.5">
                              <span className="text-[10px] font-mono text-blue-400 uppercase flex items-center gap-1">
                                <Share2 className="w-3 h-3" /> Redes Sociales & Digital:
                              </span>
                              <p className="text-[11px] text-zinc-300">{system.systemDetails.socialMediaGuidelines}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Categorized Rules Breakdown from Confirmed Patterns */}
                      <div className="space-y-2">
                        <span className="text-[10px] uppercase font-mono text-zinc-400">
                          Constantes Formales Validadas:
                        </span>

                        <div className="space-y-1.5">
                          {assignedPatterns.map(pattern => (
                            <div
                              key={pattern.id}
                              className="p-2 rounded bg-zinc-900 border border-zinc-800 text-xs space-y-1"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
                                  {getCategoryIcon(pattern.category)}
                                  {pattern.name}
                                </span>
                                <button
                                  onClick={() => onExplorePatternEvidence(pattern)}
                                  className="text-[10px] text-amber-400 hover:underline font-mono"
                                >
                                  {pattern.evidence.length} refs
                                </button>
                              </div>
                              <p className="text-[10px] text-zinc-400 line-clamp-2">
                                {pattern.description}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Thumbnails of Supporting References */}
                      {systemRefIds.length > 0 && (
                        <div className="space-y-1.5 pt-2 border-t border-zinc-800">
                          <span className="text-[10px] uppercase font-mono text-zinc-400">
                            Universo de Referencias Sustentantes ({systemRefIds.length}):
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {systemRefIds.map(refId => {
                              const ref = project.references.find(r => r.id === refId);
                              if (!ref) return null;
                              return (
                                <div
                                  key={refId}
                                  className="w-9 h-9 rounded bg-zinc-900 border border-zinc-700 overflow-hidden shrink-0 relative group"
                                  title={ref.name}
                                >
                                  <img
                                    src={ref.image}
                                    alt={ref.name}
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}



      </div>
    </aside>
  );
};
