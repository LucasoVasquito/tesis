import React, { useState } from 'react';
import { 
  Sparkles, 
  Plus, 
  RefreshCw, 
  FolderPlus, 
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
  Sliders 
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
  isRightPanelOpen,
  onToggleRightPanel,
}) => {
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);

  const [editName, setEditName] = useState(project.name);
  const [editObjective, setEditObjective] = useState(project.objective);
  const [editDesc, setEditDesc] = useState(project.description);

  const newReferencesCount = project.references.filter(r => r.isNew).length;

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
      <header className="h-14 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md px-4 flex items-center justify-between select-none z-30 shrink-0">
        {/* Active Project Dropdown Switcher Header */}
        <div className="relative z-40">
          <button
            onClick={() => setIsProjectDropdownOpen(prev => !prev)}
            className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 transition-all cursor-pointer group select-none text-left shadow-sm"
            title="Clic para cambiar de proyecto o ver preferencias"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 via-purple-600 to-emerald-500 flex items-center justify-center shadow-md shadow-indigo-500/20 text-white font-bold text-xs tracking-tighter group-hover:scale-105 transition-transform shrink-0">
              EM
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-zinc-100 text-sm tracking-tight group-hover:text-emerald-400 transition-colors truncate max-w-[200px] sm:max-w-xs">
                  {project.name}
                </span>
                <ChevronDown className={`w-4 h-4 text-zinc-400 group-hover:text-emerald-400 transition-transform duration-200 shrink-0 ${isProjectDropdownOpen ? 'rotate-180' : ''}`} />
              </div>
              <div className="text-[10px] text-zinc-400 font-mono truncate max-w-[200px] sm:max-w-xs">
                {project.objective || 'Sin objetivo definido'}
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
              <div className="absolute left-0 mt-2 w-80 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl z-40 overflow-hidden py-1 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3.5 py-2.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
                  <span className="text-[10px] uppercase font-mono text-zinc-400 font-semibold flex items-center gap-1.5">
                    <FolderKanban className="w-3.5 h-3.5 text-indigo-400" />
                    Mis Proyectos ({projectsList.length})
                  </span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 font-medium">
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
                            ? 'bg-indigo-950/70 text-indigo-200 font-bold border-l-2 border-indigo-500' 
                            : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-white'
                        }`}
                      >
                        <div className="truncate pr-2">
                          <div className="truncate font-semibold">{p.name}</div>
                          <div className="text-[10px] text-zinc-400 font-normal font-mono">
                            {p.references.length} referencias • {p.systems.length} sistemas
                          </div>
                        </div>
                        {isActive && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                <div className="border-t border-zinc-800 p-1.5 bg-zinc-950/80 space-y-1">
                  <button
                    onClick={() => {
                      setIsProjectDropdownOpen(false);
                      onOpenNewProjectModal();
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-indigo-300 hover:bg-indigo-950 hover:text-indigo-200 flex items-center gap-2 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Crear Nuevo Proyecto</span>
                  </button>

                  <button
                    onClick={() => {
                      setIsProjectDropdownOpen(false);
                      handleOpenProfileModal();
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-zinc-300 hover:bg-zinc-800 flex items-center gap-2 transition-colors"
                  >
                    <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Preferencias de este Proyecto</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Central Active Evidence Banner (if active) */}
        {activeEvidencePatternId && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-full text-amber-300 text-xs animate-pulse">
            <Eye className="w-3.5 h-3.5" />
            <span>Modo Inspección de Evidencia activo</span>
            <button 
              onClick={onClearActiveEvidence}
              className="ml-1 hover:text-white underline text-[11px]"
            >
              Limpiar
            </button>
          </div>
        )}

        {/* Right Section */}
        <div className="flex items-center gap-2.5" />
      </header>

      {/* Project Preferences Modal */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center text-white font-bold shadow-md">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">Preferencias del Proyecto</h3>
                  <p className="text-[11px] text-zinc-400">Configuración de: {project.name}</p>
                </div>
              </div>

              <button
                onClick={() => setIsProfileModalOpen(false)}
                className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
              {/* Form: Edit Project Metadata */}
              <form onSubmit={handleSavePreferences} className="space-y-3 p-4 bg-zinc-950/80 rounded-xl border border-zinc-800">
                <div className="flex items-center justify-between pb-1 border-b border-zinc-800/80">
                  <span className="text-[10px] uppercase font-mono text-emerald-400 font-semibold flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5" />
                    Información del Proyecto
                  </span>
                  <span className="text-[10px] text-zinc-500">Editables en vivo</span>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-mono text-zinc-400 font-semibold">
                    Nombre del Proyecto:
                  </label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="w-full text-xs font-semibold bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-zinc-100 focus:outline-none focus:border-emerald-500 mt-1"
                    placeholder="Nombre del proyecto..."
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase font-mono text-zinc-400 font-semibold">
                    Objetivo Estratégico:
                  </label>
                  <input
                    type="text"
                    value={editObjective}
                    onChange={e => setEditObjective(e.target.value)}
                    className="w-full text-xs bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-zinc-200 focus:outline-none focus:border-emerald-500 mt-1"
                    placeholder="Objetivo estratégico del proyecto..."
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase font-mono text-zinc-400 font-semibold">
                    Descripción del Universo Visual:
                  </label>
                  <textarea
                    value={editDesc}
                    onChange={e => setEditDesc(e.target.value)}
                    rows={2}
                    className="w-full text-xs bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-zinc-300 focus:outline-none focus:border-emerald-500 mt-1 resize-none"
                    placeholder="Descripción del contexto o tono estético..."
                  />
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-md"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Guardar Preferencias</span>
                  </button>
                </div>
              </form>

              {/* Action Buttons Section */}
              <div className="space-y-2">
                <span className="text-[10px] uppercase font-mono text-zinc-400 font-semibold">
                  Acciones Rápidas del Proyecto:
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* Primary AI Analysis Trigger */}
                  <button
                    onClick={() => {
                      setIsProfileModalOpen(false);
                      onTriggerAnalysis();
                    }}
                    disabled={isAnalyzing || project.references.length === 0}
                    className={`col-span-1 sm:col-span-2 p-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-between ${
                      isAnalyzing
                        ? 'bg-indigo-950 text-indigo-300 border-indigo-800'
                        : project.references.length === 0
                        ? 'bg-zinc-950 text-zinc-500 border-zinc-800 cursor-not-allowed'
                        : newReferencesCount > 0
                        ? 'bg-gradient-to-r from-amber-950 via-indigo-950 to-emerald-950 border-amber-500/50 text-amber-200 hover:border-amber-400 shadow-md'
                        : 'bg-indigo-950 hover:bg-indigo-900 border-indigo-700/80 text-indigo-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <RefreshCw className={`w-4 h-4 ${isAnalyzing ? 'animate-spin text-indigo-400' : 'text-indigo-400'}`} />
                      <span>
                        {isAnalyzing
                          ? 'Analizando con Gemini...'
                          : newReferencesCount > 0
                          ? `Actualizar Análisis (+${newReferencesCount} nuevas refs)`
                          : 'Re-analizar Proyecto con IA'}
                      </span>
                    </div>
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                  </button>

                  {/* Add Reference Button */}
                  <button
                    onClick={() => {
                      setIsProfileModalOpen(false);
                      onOpenUpload();
                    }}
                    className="p-2.5 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-xs font-semibold text-zinc-200 flex items-center gap-2 transition-colors"
                  >
                    <Plus className="w-4 h-4 text-emerald-400" />
                    <span>Agregar Referencias</span>
                  </button>

                  {/* Export JSON */}
                  <button
                    onClick={() => exportProjectAsJSON(project)}
                    className="p-2.5 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-xs font-semibold text-zinc-200 flex items-center gap-2 transition-colors"
                  >
                    <Download className="w-4 h-4 text-sky-400" />
                    <span>Exportar (.json)</span>
                  </button>

                  {/* Export Markdown Dossier */}
                  <button
                    onClick={() => downloadProjectMarkdown(project)}
                    className="col-span-1 sm:col-span-2 p-2.5 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-xs font-semibold text-zinc-200 flex items-center justify-center gap-2 transition-colors"
                  >
                    <FileText className="w-4 h-4 text-purple-400" />
                    <span>Descargar Dossier Completo</span>
                  </button>

                  {/* Thesis Help Guide */}
                  <button
                    onClick={() => {
                      setIsProfileModalOpen(false);
                      onOpenThesisGuide();
                    }}
                    className="col-span-1 sm:col-span-2 p-2.5 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-xs font-semibold text-zinc-300 flex items-center justify-center gap-2 transition-colors"
                  >
                    <HelpCircle className="w-4 h-4 text-amber-400" />
                    <span>Concepto y Metodología de la Tesis</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
