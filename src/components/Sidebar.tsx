import React, { useState } from 'react';
import { 
  Eye, 
  FileText, 
  Download, 
  Search, 
  Sparkles, 
  Target, 
  Trash2, 
  CheckCheck, 
  Palette, 
  PanelLeftClose, 
  PanelLeftOpen, 
  Grid, 
  Type as TypeIcon, 
  Layers, 
  Maximize2,
  ChevronDown,
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import { Project, Reference } from '../types';
import { downloadProjectMarkdown, exportProjectAsJSON } from '../utils/exportHelpers';

interface SidebarProps {
  project: Project;
  selectedReferenceIds: string[];
  onSelectReference: (id: string, multi?: boolean) => void;
  onDeleteReference: (id: string) => void;
  onFocusReferenceOnCanvas: (id: string) => void;
  onOpenInspectReference: (ref: Reference) => void;
  isInspectingRef?: boolean;
  isOpen?: boolean;
  onToggle?: () => void;
  // Optional legacy props kept for backward compatibility
  onUpdateProjectMeta?: (updates: Partial<Pick<Project, 'name' | 'objective' | 'description'>>) => void;
  onOpenUpload?: () => void;
  onTriggerAnalysis?: () => void;
  isAnalyzing?: boolean;
}

type SidebarTab = 'inspector' | 'dossier';

export const Sidebar: React.FC<SidebarProps> = ({
  project,
  selectedReferenceIds,
  onSelectReference,
  onDeleteReference,
  onFocusReferenceOnCanvas,
  onOpenInspectReference,
  isInspectingRef = false,
  isOpen = true,
  onToggle,
}) => {
  const [activeTab, setActiveTab] = useState<SidebarTab>('inspector');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedHex, setCopiedHex] = useState<string | null>(null);
  const [isRefListCollapsed, setIsRefListCollapsed] = useState(false);

  // Determine currently selected reference for deep inspection
  const selectedReference = project.references.find(r => selectedReferenceIds.includes(r.id)) 
    || (project.references.length > 0 ? project.references[0] : null);

  const handleCopyHex = (hex: string) => {
    navigator.clipboard.writeText(hex);
    setCopiedHex(hex);
    setTimeout(() => setCopiedHex(null), 1500);
  };

  const filteredReferences = project.references.filter(ref => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      ref.name.toLowerCase().includes(q) ||
      ref.id.toLowerCase().includes(q) ||
      ref.tags?.some(t => t.toLowerCase().includes(q)) ||
      ref.notes?.toLowerCase().includes(q)
    );
  });

  const confirmedPatternsCount = project.patterns.filter(p => p.status === 'confirmed').length;

  if (!isOpen) {
    return (
      <aside 
        onClick={onToggle}
        className="w-12 h-full border-r border-zinc-800/80 bg-zinc-950/90 hover:bg-zinc-900/90 flex flex-col items-center justify-between py-4 cursor-pointer transition-colors shrink-0 select-none z-20"
        title="Clic para expandir el panel lateral"
      >
        <div className="flex flex-col items-center gap-4">
          <button 
            onClick={(e) => { e.stopPropagation(); setActiveTab('inspector'); onToggle?.(); }}
            className={`p-2 rounded-lg relative ${activeTab === 'inspector' ? 'bg-sky-950 text-sky-400 border border-sky-700' : 'text-zinc-400 hover:text-zinc-200'}`}
            title="Inspector de Referencias"
          >
            <Eye className="w-4 h-4" />
          </button>

          <button 
            onClick={(e) => { e.stopPropagation(); setActiveTab('dossier'); onToggle?.(); }}
            className={`p-2 rounded-lg relative ${activeTab === 'dossier' ? 'bg-purple-950 text-purple-400 border border-purple-700' : 'text-zinc-400 hover:text-zinc-200'}`}
            title="Dossier y Reporte de Tesis"
          >
            <FileText className="w-4 h-4" />
          </button>
        </div>

        <div className="writing-mode-vertical text-[10px] font-mono text-zinc-500 uppercase tracking-widest rotate-180">
          {activeTab === 'inspector' ? 'Inspector' : 'Dossier'}
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-80 sm:w-96 h-full border-r border-zinc-800/80 bg-zinc-950/95 flex flex-col shrink-0 select-none z-20">
      {/* 1. Header with Tabs: Inspector & Dossier */}
      <div className="p-3 border-b border-zinc-800 flex items-center justify-between gap-2 bg-zinc-900/90 shrink-0">
        <div className="flex items-center gap-1.5 flex-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
          <button
            type="button"
            onClick={() => setActiveTab('inspector')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'inspector'
                ? 'bg-sky-950 text-sky-300 border border-sky-700/80 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <Eye className="w-3.5 h-3.5 text-sky-400" />
            <span>Inspector</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-sky-900/60 text-sky-200 border border-sky-700/60 ml-0.5">
              {project.references.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('dossier')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'dossier'
                ? 'bg-purple-950 text-purple-300 border border-purple-700/80 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-purple-400" />
            <span>Dossier</span>
          </button>
        </div>

        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors shrink-0"
            title="Minimizar panel izquierdo"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 2. Main Tab Views */}
      <div className="flex-1 overflow-y-auto min-h-0">
        
        {/* ======================================================== */}
        {/* TAB 1: INSPECTOR UNIFICADO CON REFERENCIAS EN CANVAS */}
        {/* ======================================================== */}
        {activeTab === 'inspector' && (
          <div className="p-4 space-y-4">
            
            {/* Active Selected Reference Deep Inspector */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-sky-400 font-mono flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" />
                  <span>Inspección de Referencia</span>
                </h2>
                {selectedReference && (
                  <span className="text-[10px] font-mono text-zinc-400">
                    {selectedReference.id}
                  </span>
                )}
              </div>

              {!selectedReference ? (
                <div className="py-8 px-4 text-center bg-zinc-900/40 rounded-xl border border-zinc-800 border-dashed space-y-2">
                  <Eye className="w-8 h-8 mx-auto text-zinc-600 stroke-1" />
                  <p className="text-xs text-zinc-400">
                    No hay referencias cargadas en el canvas.
                  </p>
                </div>
              ) : (
                <div className="space-y-3.5">
                  
                  {/* Selected Reference Header Card */}
                  <div className="p-3 bg-zinc-900/90 rounded-xl border border-zinc-800 space-y-2.5 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="w-16 h-16 rounded-lg bg-zinc-950 border border-zinc-700 overflow-hidden shrink-0 relative group">
                        <img
                          src={selectedReference.image}
                          alt={selectedReference.name}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] font-mono font-bold text-sky-400">
                            {selectedReference.id}
                          </span>
                          <button
                            type="button"
                            onClick={() => onFocusReferenceOnCanvas(selectedReference.id)}
                            className="text-[10px] text-zinc-400 hover:text-emerald-400 flex items-center gap-1 transition-colors"
                            title="Centrar en el canvas"
                          >
                            <Target className="w-3 h-3" />
                            <span>Centrar</span>
                          </button>
                        </div>

                        <h3 className="text-xs font-semibold text-zinc-100 truncate">
                          {selectedReference.name}
                        </h3>

                        {selectedReference.tags && selectedReference.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {selectedReference.tags.slice(0, 3).map((tag, i) => (
                              <span key={i} className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {selectedReference.notes && (
                      <p className="text-[10.5px] text-zinc-400 italic pt-1 border-t border-zinc-800/80 leading-relaxed">
                        "{selectedReference.notes}"
                      </p>
                    )}

                    {/* Trigger deep breakdown button if not analyzed */}
                    {!selectedReference.breakdown && (
                      <button
                        type="button"
                        onClick={() => onOpenInspectReference(selectedReference)}
                        disabled={isInspectingRef}
                        className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold bg-sky-600 hover:bg-sky-500 disabled:bg-zinc-800 text-white rounded-lg transition-colors shadow-md mt-1"
                      >
                        <Sparkles className={`w-3.5 h-3.5 ${isInspectingRef ? 'animate-spin' : ''}`} />
                        <span>{isInspectingRef ? 'Desglosando con Gemini...' : 'Desglosar Componentes Visuales'}</span>
                      </button>
                    )}
                  </div>

                  {/* Deep Breakdown Results View */}
                  {selectedReference.breakdown && (
                    <div className="space-y-3 animate-in fade-in duration-150">
                      
                      {/* Observable Summary */}
                      <div className="p-3 rounded-xl bg-sky-950/30 border border-sky-800/40 text-xs text-sky-200 leading-relaxed">
                        {selectedReference.breakdown.observableSummary}
                      </div>

                      {/* 1. Color Palette */}
                      {selectedReference.breakdown.colors && selectedReference.breakdown.colors.length > 0 && (
                        <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-2">
                          <h4 className="text-[10px] font-mono uppercase text-zinc-400 font-semibold flex items-center gap-1.5">
                            <Palette className="w-3 h-3 text-sky-400" />
                            <span>Paleta Cromática Observable</span>
                          </h4>

                          <div className="grid grid-cols-2 gap-1.5">
                            {selectedReference.breakdown.colors.map((c, i) => (
                              <div
                                key={i}
                                onClick={() => handleCopyHex(c.hex)}
                                className="flex items-center gap-2 p-1.5 rounded-lg bg-zinc-950 border border-zinc-800 cursor-pointer hover:border-zinc-700 transition-colors"
                                title="Clic para copiar HEX"
                              >
                                <div
                                  className="w-5 h-5 rounded-md shadow shrink-0 border border-white/10"
                                  style={{ backgroundColor: c.hex }}
                                />
                                <div className="min-w-0 text-[10.5px]">
                                  <div className="font-mono text-zinc-200 font-semibold truncate flex items-center gap-1">
                                    <span>{c.hex}</span>
                                    {copiedHex === c.hex && <CheckCheck className="w-2.5 h-2.5 text-emerald-400" />}
                                  </div>
                                  <div className="text-[9.5px] text-zinc-500 truncate">{c.name}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 2. Typography Breakdown */}
                      {selectedReference.breakdown.typography && (
                        <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-1.5">
                          <h4 className="text-[10px] font-mono uppercase text-zinc-400 font-semibold flex items-center gap-1.5">
                            <TypeIcon className="w-3 h-3 text-sky-400" />
                            <span>Tratamiento Tipográfico Observable</span>
                          </h4>
                          <div className="space-y-0.5 text-xs text-zinc-300">
                            <div>• Familia: <span className="text-zinc-100 font-semibold">{selectedReference.breakdown.typography.fontFamily}</span></div>
                            <div>• Peso & Estilo: {selectedReference.breakdown.typography.weightAndStyle}</div>
                            <div>• Espaciado: {selectedReference.breakdown.typography.trackingOrLeading}</div>
                          </div>
                        </div>
                      )}

                      {/* 3. Textures & Materials */}
                      {selectedReference.breakdown.texture && (
                        <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-1.5">
                          <h4 className="text-[10px] font-mono uppercase text-zinc-400 font-semibold flex items-center gap-1.5">
                            <Sparkles className="w-3 h-3 text-sky-400" />
                            <span>Texturas & Sustratos Observables</span>
                          </h4>
                          <div className="space-y-0.5 text-xs text-zinc-300">
                            <div>• Sustrato: <span className="text-zinc-100 font-semibold">{selectedReference.breakdown.texture.substrate}</span></div>
                            <div>• Acabado: {selectedReference.breakdown.texture.finish}</div>
                            <div>• Tactilidad: {selectedReference.breakdown.texture.tactileQuality}</div>
                          </div>
                        </div>
                      )}

                      {/* 4. Composition & Grid */}
                      {selectedReference.breakdown.composition && (
                        <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-1.5">
                          <h4 className="text-[10px] font-mono uppercase text-zinc-400 font-semibold flex items-center gap-1.5">
                            <Grid className="w-3 h-3 text-sky-400" />
                            <span>Composición & Espacio</span>
                          </h4>
                          <div className="space-y-0.5 text-xs text-zinc-300">
                            <div>• Alineación: {selectedReference.breakdown.composition.alignment}</div>
                            <div>• Distribución: {selectedReference.breakdown.composition.spatialDistribution}</div>
                            <div>• Espacio negativo: {selectedReference.breakdown.composition.negativeSpace}</div>
                            <div>• Contraste: {selectedReference.breakdown.composition.contrastLevel}</div>
                            <div>• Punto focal: {selectedReference.breakdown.composition.focalPoint}</div>
                          </div>
                        </div>
                      )}

                      {/* 5. Graphic Resources */}
                      {selectedReference.breakdown.graphicResources && selectedReference.breakdown.graphicResources.length > 0 && (
                        <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-1.5">
                          <h4 className="text-[10px] font-mono uppercase text-zinc-400 font-semibold">
                            Recursos Gráficos Observables:
                          </h4>
                          <div className="flex flex-wrap gap-1">
                            {selectedReference.breakdown.graphicResources.map((res, i) => (
                              <span key={i} className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-950 text-zinc-300 border border-zinc-800">
                                {res}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                    </div>
                  )}

                </div>
              )}
            </div>

            {/* UNIFIED CANVAS REFERENCES LIST */}
            <div className="pt-2 border-t border-zinc-800/80 space-y-2.5">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setIsRefListCollapsed(!isRefListCollapsed)}
                  className="text-xs font-bold uppercase tracking-wider text-zinc-200 font-mono flex items-center gap-1.5 hover:text-white"
                >
                  {isRefListCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  <span>Referencias en Canvas</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-800 text-zinc-300 font-normal">
                    {project.references.length}
                  </span>
                </button>
              </div>

              {!isRefListCollapsed && (
                <div className="space-y-2">
                  {/* Search Input */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="Buscar por tag o nombre..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full text-xs bg-zinc-900/90 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  {/* Reference Cards List */}
                  <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                    {filteredReferences.map(ref => {
                      const isSelected = selectedReferenceIds.includes(ref.id) || selectedReference?.id === ref.id;
                      const hasBreakdown = !!ref.breakdown;
                      return (
                        <div
                          key={ref.id}
                          onClick={() => {
                            onSelectReference(ref.id);
                            onFocusReferenceOnCanvas(ref.id);
                          }}
                          className={`p-2 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-sky-950/40 border-sky-600 text-sky-100 shadow-sm'
                              : 'bg-zinc-900/60 border-zinc-800/80 hover:bg-zinc-800/60 text-zinc-300'
                          }`}
                        >
                          <div className="w-10 h-10 rounded-lg bg-zinc-950 border border-zinc-700 overflow-hidden shrink-0">
                            <img
                              src={ref.image}
                              alt={ref.name}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9.5px] font-mono font-bold text-sky-400">
                                {ref.id}
                              </span>
                              {hasBreakdown && (
                                <span className="text-[8.5px] px-1 py-0.2 rounded bg-sky-950 text-sky-300 font-mono border border-sky-800">
                                  Desglosada
                                </span>
                              )}
                            </div>
                            <h4 className="text-xs font-semibold truncate leading-tight">
                              {ref.name}
                            </h4>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onFocusReferenceOnCanvas(ref.id);
                              }}
                              className="p-1 hover:text-white text-zinc-400 rounded hover:bg-zinc-800 transition-colors"
                              title="Centrar en el canvas"
                            >
                              <Target className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteReference(ref.id);
                              }}
                              className="p-1 hover:text-red-400 text-zinc-500 rounded hover:bg-zinc-800 transition-colors"
                              title="Eliminar referencia"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {filteredReferences.length === 0 && (
                      <p className="text-xs text-zinc-500 text-center py-4 italic">
                        No se encontraron referencias con ese criterio.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 2: DOSSIER Y REPORTE DE TESIS */}
        {/* ======================================================== */}
        {activeTab === 'dossier' && (
          <div className="p-4 space-y-4">
            <div className="space-y-1">
              <h2 className="text-xs font-bold uppercase tracking-wider text-purple-400 font-mono flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                <span>Dossier y Reporte de Tesis</span>
              </h2>
              <p className="text-[11px] text-zinc-400 leading-normal">
                Descargá el registro estructurado de la investigación visual, patrones emergentes y decisiones proyectuales.
              </p>
            </div>

            <div className="p-3.5 bg-zinc-900/90 rounded-xl border border-zinc-800 space-y-3 shadow-sm">
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-zinc-200">Resumen del Proyecto</h4>
                <div className="text-xs text-zinc-300 space-y-1.5 font-mono text-[11px] bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Proyecto:</span>
                    <span className="text-zinc-100 font-semibold truncate max-w-[170px]">{project.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Referencias:</span>
                    <span className="text-sky-300 font-bold">{project.references.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Patrones Detectados:</span>
                    <span className="text-indigo-300 font-bold">{project.patterns.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Patrones Validados:</span>
                    <span className="text-emerald-300 font-bold">{confirmedPatternsCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Sistemas Visuales:</span>
                    <span className="text-purple-300 font-bold">{project.systems.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Decisiones de Diseño:</span>
                    <span className="text-amber-300 font-bold">{project.feedback.length}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => downloadProjectMarkdown(project)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors shadow-md shadow-purple-950/40"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Descargar Dossier Markdown (.md)</span>
                </button>

                <button
                  type="button"
                  onClick={() => exportProjectAsJSON(project)}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition-colors border border-zinc-700"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Exportar Estructura JSON Completa</span>
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </aside>
  );
};
