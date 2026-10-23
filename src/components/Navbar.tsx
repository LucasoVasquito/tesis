import React, { useState } from 'react';
import { 
  Sparkles, 
  Plus, 
  RefreshCw, 
  FolderKanban,
  ChevronDown,
  Check,
  Download, 
  FileText, 
  HelpCircle, 
  X, 
  Save, 
  Settings, 
  Eye, 
  Sliders,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Layers,
  BookOpen,
  ExternalLink,
  Share2
} from 'lucide-react';
import { Project } from '../types';
import { exportProjectAsJSON, downloadProjectMarkdown } from '../utils/exportHelpers';

interface NavbarProps {
  project: Project;
  projectsList: Project[];
  onSelectProject: (id: string) => void;
  onUpdateProjectMeta: (updates: Partial<Pick<Project, 'name' | 'objective' | 'description'>>) => void;
  onOpenUpload: () => void;
  onOpenThesisGuide: () => void;
  onOpenNewProjectModal: () => void;
  onTriggerAnalysis: () => void;
  isAnalyzing: boolean;
  activeEvidencePatternId: string | null;
  onClearActiveEvidence: () => void;
  isLeftSidebarOpen: boolean;
  onToggleLeftSidebar: () => void;
  isRightPanelOpen: boolean;
  onToggleRightPanel: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  project,
  projectsList = [],
  onSelectProject,
  onUpdateProjectMeta,
  onOpenUpload,
  onOpenThesisGuide,
  onOpenNewProjectModal,
  onTriggerAnalysis,
  isAnalyzing,
  activeEvidencePatternId,
  onClearActiveEvidence,
  isLeftSidebarOpen,
  onToggleLeftSidebar,
  isRightPanelOpen,
  onToggleRightPanel,
}) => {
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);

  const [editName, setEditName] = useState(project.name);
  const [editObjective, setEditObjective] = useState(project.objective);
  const [editDesc, setEditDesc] = useState(project.description);

  const newReferencesCount = project.references.filter(r => r.isNew).length;
  const confirmedPatternsCount = project.patterns.filter(p => p.status === 'confirmed').length;

  const handleOpenProfileModal = () => {
    setEditName(project.name);
    setEditObjective(project.objective);
    setEditDesc(project.description);
    setIsProfileModalOpen(true);
  };

  const handleSavePreferences = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateProjectMeta({
      name: editName.trim() || 'Proyecto de Identidad Visual',
      objective: editObjective.trim() || 'Construir un sistema visual coherente',
      description: editDesc.trim(),
    });
    setIsProfileModalOpen(false);
  };

  return (
    <>
      <header className="h-14 border-b border-white/[0.08] bg-zinc-950/85 backdrop-blur-xl px-3 sm:px-4 flex items-center justify-between select-none z-30 shrink-0 relative">
        {/* LEFT SECTION: Sidebar Toggle + Brand Logo + Project Switcher */}
        <div className="flex items-center gap-2.5">
          {/* Toggle Left Sidebar */}
          <button
            onClick={onToggleLeftSidebar}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              isLeftSidebarOpen 
                ? 'bg-zinc-900/80 border-white/[0.08] text-zinc-300 hover:text-white hover:bg-zinc-800' 
                : 'bg-zinc-950 border-white/[0.05] text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
            title={isLeftSidebarOpen ? "Ocultar panel de referencias" : "Mostrar panel de referencias"}
          >
            {isLeftSidebarOpen ? (
              <PanelLeftClose className="w-4 h-4" />
            ) : (
              <PanelLeftOpen className="w-4 h-4 text-emerald-400" />
            )}
          </button>

          {/* Vertical Separator */}
          <div className="h-4 w-px bg-white/[0.08] hidden sm:block" />

          {/* Active Project Dropdown Switcher */}
          <div className="relative z-40">
            <button
              onClick={() => setIsProjectDropdownOpen(prev => !prev)}
              className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-800/80 border border-white/[0.08] hover:border-white/[0.15] transition-all cursor-pointer group select-none text-left shadow-sm"
              title="Cambiar de proyecto o editar configuración"
            >
              {/* Brand Geometric Glyphs */}
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 via-purple-600 to-emerald-400 flex items-center justify-center shadow-md shadow-indigo-500/20 text-white font-display font-bold text-[11px] tracking-tight group-hover:scale-105 transition-transform shrink-0">
                EM
              </div>

              <div className="min-w-0 pr-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-display font-bold text-zinc-100 text-xs sm:text-sm tracking-tight group-hover:text-emerald-400 transition-colors truncate max-w-[140px] sm:max-w-[210px]">
                    {project.name}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 group-hover:text-emerald-400 transition-transform duration-200 shrink-0 ${isProjectDropdownOpen ? 'rotate-180' : ''}`} />
                </div>
                <div className="text-[10px] text-zinc-400 font-mono truncate max-w-[140px] sm:max-w-[210px]">
                  {project.references.length} refs • {project.systems.length} sistemas
                </div>
              </div>
            </button>

            {/* Project Switcher Dropdown Popover */}
            {isProjectDropdownOpen && (
              <>
                <div 
                  className="fixed inset-0 z-30" 
                  onClick={() => setIsProjectDropdownOpen(false)} 
                />
                <div className="absolute left-0 mt-2 w-80 bg-zinc-900/95 backdrop-blur-2xl border border-white/[0.1] rounded-2xl shadow-2xl z-40 overflow-hidden py-1 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3.5 py-2.5 border-b border-white/[0.08] flex items-center justify-between bg-zinc-950/60">
                    <span className="text-[10px] uppercase font-display text-zinc-400 font-semibold tracking-wider flex items-center gap-1.5">
                      <FolderKanban className="w-3.5 h-3.5 text-indigo-400" />
                      Proyectos ({projectsList.length})
                    </span>
                    <span className="badge-tech px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                      Tesis Multimedial
                    </span>
                  </div>

                  <div className="max-h-60 overflow-y-auto py-1">
                    {projectsList.map(p => {
                      const isActive = p.id === project.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            onSelectProject(p.id);
                            setIsProjectDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between text-xs transition-colors ${
                            isActive 
                              ? 'bg-indigo-950/60 text-indigo-200 font-bold border-l-2 border-indigo-400' 
                              : 'text-zinc-300 hover:bg-zinc-800/60 hover:text-white'
                          }`}
                        >
                          <div className="truncate pr-2">
                            <div className="truncate font-semibold">{p.name}</div>
                            <div className="text-[10px] text-zinc-400 font-normal font-mono">
                              {p.references.length} refs • {p.patterns.filter(pat => pat.status === 'confirmed').length} patrones confirmados
                            </div>
                          </div>
                          {isActive && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>

                  <div className="border-t border-white/[0.08] p-1.5 bg-zinc-950/80 space-y-1">
                    <button
                      onClick={() => {
                        setIsProjectDropdownOpen(false);
                        onOpenNewProjectModal();
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-indigo-300 hover:bg-indigo-950/60 hover:text-indigo-200 flex items-center gap-2 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Crear Nuevo Proyecto</span>
                    </button>

                    <button
                      onClick={() => {
                        setIsProjectDropdownOpen(false);
                        handleOpenProfileModal();
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-zinc-300 hover:bg-zinc-800/60 flex items-center gap-2 transition-colors"
                    >
                      <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Configurar Universo y Objetivos</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* CENTER SECTION: Active Evidence Pill OR Overview Pill */}
        <div className="hidden md:flex items-center gap-2">
          {activeEvidencePatternId ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-full text-amber-300 text-xs glow-amber animate-pulse">
              <Eye className="w-3.5 h-3.5" />
              <span className="font-display font-medium">Modo Inspección de Evidencia activo</span>
              <button 
                onClick={onClearActiveEvidence}
                className="ml-1 text-[11px] underline text-amber-200 hover:text-white"
              >
                Cerrar
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 px-3.5 py-1 rounded-full bg-zinc-900/50 border border-white/[0.06] text-[11px] text-zinc-400 font-mono">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                <strong className="text-zinc-200 font-sans">{project.references.length}</strong> referencias
              </span>
              <span className="text-zinc-600">•</span>
              <span className="flex items-center gap-1.5">
                <strong className="text-emerald-400 font-sans">{confirmedPatternsCount}</strong> confirmados
              </span>
              <span className="text-zinc-600">•</span>
              <span className="flex items-center gap-1.5">
                <strong className="text-purple-300 font-sans">{project.systems.length}</strong> sistemas
              </span>
            </div>
          )}
        </div>

        {/* RIGHT SECTION: Upload + AI Trigger + Export + Thesis + Right Panel Toggle */}
        <div className="flex items-center gap-2">
          {/* Quick Add References Button */}
          <button
            onClick={onOpenUpload}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-white/[0.08] hover:border-white/[0.15] text-zinc-200 hover:text-white text-xs font-semibold transition-all shadow-sm cursor-pointer"
            title="Subir imágenes de referencia al moodboard"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Agregar Refs</span>
          </button>

          {/* Primary AI Analysis Trigger Button */}
          <button
            onClick={onTriggerAnalysis}
            disabled={isAnalyzing || project.references.length === 0}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-display font-bold transition-all shadow-md cursor-pointer ${
              isAnalyzing
                ? 'bg-indigo-950 text-indigo-300 border border-indigo-800 cursor-wait'
                : project.references.length === 0
                ? 'bg-zinc-900/50 text-zinc-600 border border-white/[0.05] cursor-not-allowed'
                : newReferencesCount > 0
                ? 'bg-gradient-to-r from-amber-600 via-indigo-600 to-emerald-600 hover:opacity-95 text-white border border-amber-400/50 glow-amber'
                : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white border border-indigo-400/30 glow-indigo'
            }`}
            title={
              project.references.length === 0 
                ? 'Sube imágenes para poder analizar patrones' 
                : 'Analizar universo visual con Gemini IA'
            }
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin text-white' : ''}`} />
            <span>
              {isAnalyzing
                ? 'Analizando...'
                : newReferencesCount > 0
                ? `Actualizar (+${newReferencesCount})`
                : 'Analizar con IA'}
            </span>
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
          </button>

          {/* Export Dropdown Popover */}
          <div className="relative">
            <button
              onClick={() => setIsExportDropdownOpen(prev => !prev)}
              className="p-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-white/[0.08] hover:border-white/[0.15] text-zinc-300 hover:text-white transition-all cursor-pointer shadow-sm"
              title="Exportar datos o dossier del proyecto"
            >
              <Download className="w-4 h-4 text-sky-400" />
            </button>

            {isExportDropdownOpen && (
              <>
                <div 
                  className="fixed inset-0 z-30" 
                  onClick={() => setIsExportDropdownOpen(false)} 
                />
                <div className="absolute right-0 mt-2 w-64 bg-zinc-900/95 backdrop-blur-2xl border border-white/[0.1] rounded-2xl shadow-2xl z-40 overflow-hidden py-1 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3.5 py-2 border-b border-white/[0.08] text-[10px] font-display uppercase tracking-wider text-zinc-400">
                    Opciones de Exportación
                  </div>
                  <button
                    onClick={() => {
                      setIsExportDropdownOpen(false);
                      downloadProjectMarkdown(project);
                    }}
                    className="w-full text-left px-3.5 py-2.5 text-xs text-zinc-200 hover:bg-zinc-800/80 flex items-center gap-2.5 transition-colors"
                  >
                    <FileText className="w-4 h-4 text-purple-400 shrink-0" />
                    <div>
                      <div className="font-semibold">Dossier Académico (.md)</div>
                      <div className="text-[10px] text-zinc-400 font-mono">Para entrega y bitácora</div>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      setIsExportDropdownOpen(false);
                      exportProjectAsJSON(project);
                    }}
                    className="w-full text-left px-3.5 py-2.5 text-xs text-zinc-200 hover:bg-zinc-800/80 flex items-center gap-2.5 transition-colors border-t border-white/[0.05]"
                  >
                    <Download className="w-4 h-4 text-sky-400 shrink-0" />
                    <div>
                      <div className="font-semibold">Copia de Seguridad (.json)</div>
                      <div className="text-[10px] text-zinc-400 font-mono">Restaurable en la app</div>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Thesis Guide Button */}
          <button
            onClick={onOpenThesisGuide}
            className="p-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-white/[0.08] hover:border-white/[0.15] text-zinc-400 hover:text-amber-300 transition-all cursor-pointer shadow-sm hidden sm:flex"
            title="Marco conceptual y metodología de la tesis"
          >
            <BookOpen className="w-4 h-4" />
          </button>

          {/* Vertical Separator */}
          <div className="h-4 w-px bg-white/[0.08]" />

          {/* Toggle Right Panel */}
          <button
            onClick={onToggleRightPanel}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              isRightPanelOpen 
                ? 'bg-zinc-900/80 border-white/[0.08] text-zinc-300 hover:text-white hover:bg-zinc-800' 
                : 'bg-zinc-950 border-white/[0.05] text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
            title={isRightPanelOpen ? "Ocultar panel de sistemas y patrones" : "Mostrar panel de sistemas y patrones"}
          >
            {isRightPanelOpen ? (
              <PanelRightClose className="w-4 h-4" />
            ) : (
              <PanelRightOpen className="w-4 h-4 text-purple-400" />
            )}
          </button>
        </div>
      </header>

      {/* Project Preferences Modal */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-white/[0.1] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 border-b border-white/[0.08] flex items-center justify-between bg-zinc-950/40">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center text-white font-bold shadow-md">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-display font-bold text-zinc-100">Configuración del Proyecto</h3>
                  <p className="text-[11px] text-zinc-400 font-mono">Universo visual: {project.name}</p>
                </div>
              </div>

              <button
                onClick={() => setIsProfileModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Form: Edit Project Metadata */}
              <form onSubmit={handleSavePreferences} className="space-y-3.5 p-4 bg-zinc-950/60 rounded-xl border border-white/[0.06]">
                <div className="flex items-center justify-between pb-1.5 border-b border-white/[0.06]">
                  <span className="text-[10px] uppercase font-display text-emerald-400 font-semibold tracking-wider flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5" />
                    Parámetros de Investigación
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">Guardado en vivo</span>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-display text-zinc-400 font-semibold">
                    Nombre del Caso de Estudio:
                  </label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="w-full text-xs font-semibold bg-zinc-900 border border-zinc-700/80 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-emerald-500 mt-1"
                    placeholder="Ej. The Bros / Maguchis / Burger Club..."
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase font-display text-zinc-400 font-semibold">
                    Objetivo Estratégico o Hipótesis:
                  </label>
                  <input
                    type="text"
                    value={editObjective}
                    onChange={e => setEditObjective(e.target.value)}
                    className="w-full text-xs bg-zinc-900 border border-zinc-700/80 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-emerald-500 mt-1"
                    placeholder="Ej. Detectar regularidades compositivas y de color para formalizar el sistema visual..."
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase font-display text-zinc-400 font-semibold">
                    Descripción del Contexto y Tono Estético:
                  </label>
                  <textarea
                    value={editDesc}
                    onChange={e => setEditDesc(e.target.value)}
                    rows={3}
                    className="w-full text-xs bg-zinc-900 border border-zinc-700/80 rounded-lg px-3 py-2 text-zinc-300 focus:outline-none focus:border-emerald-500 mt-1 resize-none"
                    placeholder="Describe el universo visual, soportes observados, lenguaje informal o formal..."
                  />
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-display font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-colors flex items-center gap-1.5 shadow-md cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Guardar Cambios</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
