import React, { useState } from 'react';
import { X, Check, Layers, Plus, Sparkles, HelpCircle, ArrowRight, ShieldCheck, Zap } from 'lucide-react';
import { Pattern, VisualSystem } from '../types';

interface AssignSystemModalProps {
  isOpen: boolean;
  onClose: () => void;
  pattern: Pattern | null;
  systems: VisualSystem[];
  onConfirm: (patternId: string, systemId: string, newSystemData?: { name: string; description: string }) => void;
}

export const AssignSystemModal: React.FC<AssignSystemModalProps> = ({
  isOpen,
  onClose,
  pattern,
  systems,
  onConfirm,
}) => {
  // Determine recommended system ID
  const getRecommendedSystemId = (): string => {
    if (!pattern || systems.length === 0) return 'new';
    
    // Check direct match by suggestedSystemName
    if (pattern.suggestedSystemName) {
      const match = systems.find(s => 
        s.name.toLowerCase().includes(pattern.suggestedSystemName!.toLowerCase()) ||
        pattern.suggestedSystemName!.toLowerCase().includes(s.name.toLowerCase())
      );
      if (match) return match.id;
    }

    // Default to first system if available
    return systems[0]?.id || 'new';
  };

  const recommendedSysId = getRecommendedSystemId();

  const [selectedSystemId, setSelectedSystemId] = useState<string>(recommendedSysId);
  const [newSystemName, setNewSystemName] = useState(
    pattern?.suggestedSystemName || 'Sistema Visual Divergente'
  );
  const [newSystemDesc, setNewSystemDesc] = useState('');

  // State for "¿Por qué este sistema?" inline expansion
  const [expandedWhyId, setExpandedWhyId] = useState<string | null>(null);

  if (!isOpen || !pattern) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSystemId === 'new') {
      onConfirm(pattern.id, 'new', {
        name: newSystemName.trim() || 'Nuevo Sistema Visual',
        description: newSystemDesc.trim(),
      });
    } else {
      onConfirm(pattern.id, selectedSystemId);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400">
              <Check className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-100">Confirmar Patrón Visual</h3>
              <p className="text-[11px] text-neutral-400">Asignar a un sistema del proyecto o crear uno nuevo</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Pattern Summary */}
          <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase text-emerald-400 font-semibold">
                Patrón a Validar:
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">
                {pattern.category}
              </span>
            </div>
            <h4 className="text-xs font-bold text-neutral-100">{pattern.name}</h4>
            <p className="text-[11px] text-neutral-400 leading-relaxed line-clamp-3">
              {pattern.description}
            </p>
          </div>

          {/* System Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-mono uppercase tracking-wider text-neutral-400 font-semibold">
                Seleccionar Sistema Visual Destino
              </label>
              <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-400" />
                Sugerencia IA activa
              </span>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {systems.map(sys => {
                const isRecommended = sys.id === recommendedSysId;
                const isExpanded = expandedWhyId === sys.id;
                return (
                  <div
                    key={sys.id}
                    className={`p-3 rounded-xl border transition-all ${
                      selectedSystemId === sys.id
                        ? 'bg-emerald-950/40 border-emerald-600 text-emerald-200 shadow-md'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer">
                        <input
                          type="radio"
                          name="systemSelect"
                          value={sys.id}
                          checked={selectedSystemId === sys.id}
                          onChange={() => setSelectedSystemId(sys.id)}
                          className="accent-emerald-500 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold truncate">{sys.name}</span>
                            {isRecommended && (
                              <span className="px-1.5 py-0.5 rounded-full bg-emerald-900/90 text-emerald-300 text-[9px] font-bold border border-emerald-700 flex items-center gap-1 shrink-0">
                                <Sparkles className="w-2.5 h-2.5 text-emerald-400" />
                                Recomendado por IA
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-neutral-400">
                            {sys.patternIds.length} patrones confirmados
                          </div>
                        </div>
                      </label>

                      {/* Button: "¿Por qué este sistema?" */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setExpandedWhyId(prev => prev === sys.id ? null : sys.id);
                        }}
                        className={`px-2 py-1 text-[11px] font-medium rounded-lg transition-colors flex items-center gap-1 shrink-0 shadow-sm ${
                          isExpanded
                            ? 'bg-emerald-800 text-white border border-emerald-500'
                            : 'text-emerald-400 hover:text-emerald-200 bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-800/80'
                        }`}
                        title="¿Por qué este sistema?"
                      >
                        <HelpCircle className="w-3 h-3 text-emerald-400" />
                        <span>{isExpanded ? 'Ocultar' : '¿Por qué?'}</span>
                      </button>
                    </div>

                    {/* Inline Expandable Explanation: Fundamentación de la IA */}
                    {isExpanded && (
                      <div className="mt-2.5 pt-2.5 border-t border-emerald-800/60 text-xs space-y-2 animate-in fade-in duration-200">
                        <div className="flex items-center gap-1.5 text-emerald-300 font-bold text-[10.5px] font-mono uppercase">
                          <Zap className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Fundamentación & Afinidad Visual</span>
                        </div>
                        <p className="text-[11px] text-zinc-300 leading-relaxed bg-zinc-950/90 p-2.5 rounded-lg border border-zinc-800/80">
                          {pattern.systemHypothesis || 
                            `Este patrón de ${pattern.category} intensifica la coherencia del sistema "${sys.name}". Comparte afinidad morfológica y cromática con las referencias del canvas.`}
                        </p>
                        {sys.aestheticPillars && sys.aestheticPillars.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[10px] uppercase font-mono text-zinc-400">
                              Pilares Conceptuales del Sistema:
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {sys.aestheticPillars.map((pilar, idx) => (
                                <span key={idx} className="text-[9.5px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                                  {pilar}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Option to create a new system */}
              <div
                className={`p-3 rounded-xl border transition-all ${
                  selectedSystemId === 'new'
                    ? 'bg-indigo-950/40 border-indigo-600 text-indigo-200 shadow-md'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2.5 flex-1 cursor-pointer">
                    <input
                      type="radio"
                      name="systemSelect"
                      value="new"
                      checked={selectedSystemId === 'new'}
                      onChange={() => setSelectedSystemId('new')}
                      className="accent-indigo-500 shrink-0"
                    />
                    <div>
                      <div className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                        <Plus className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Crear Nuevo Sistema Visual Divergente</span>
                      </div>
                      <div className="text-[10px] text-neutral-400">
                        Para explorar una línea estética independiente sin mezclar con los sistemas actuales
                      </div>
                    </div>
                  </label>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setExpandedWhyId(prev => prev === 'new' ? null : 'new');
                    }}
                    className={`px-2 py-1 text-[11px] font-medium rounded-lg transition-colors flex items-center gap-1 shrink-0 ${
                      expandedWhyId === 'new'
                        ? 'bg-indigo-800 text-white border border-indigo-500'
                        : 'text-indigo-300 hover:text-indigo-100 bg-indigo-950/60 hover:bg-indigo-900/80 border border-indigo-800/80'
                    }`}
                    title="¿Por qué crear un nuevo sistema?"
                  >
                    <HelpCircle className="w-3 h-3 text-indigo-400" />
                    <span>{expandedWhyId === 'new' ? 'Ocultar' : '¿Por qué?'}</span>
                  </button>
                </div>

                {/* Inline Expandable Explanation for Divergent System */}
                {expandedWhyId === 'new' && (
                  <div className="mt-2.5 pt-2.5 border-t border-indigo-800/60 text-xs space-y-2 animate-in fade-in duration-200">
                    <div className="flex items-center gap-1.5 text-indigo-300 font-bold text-[10.5px] font-mono uppercase">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                      <span>¿Cuándo crear un Nuevo Sistema Visual?</span>
                    </div>
                    <p className="text-[11px] text-zinc-300 leading-relaxed bg-zinc-950/90 p-2.5 rounded-lg border border-zinc-800/80">
                      Si este patrón ({pattern.category}) representa un lenguaje visual divergente o contrasta marcadamente con los sistemas actuales, crear un **Nuevo Sistema Visual** permite conservar dos identidades de marca paralelas limpias sin contaminar las reglas existentes.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Form for new system if selected */}
          {selectedSystemId === 'new' && (
            <div className="p-3 bg-neutral-950 rounded-xl border border-indigo-900/60 space-y-2 animate-in fade-in duration-150">
              <div>
                <label className="text-[10px] uppercase font-mono text-neutral-400">Nombre del Nuevo Sistema *</label>
                <input
                  type="text"
                  required
                  placeholder="ej. Sistema Visual Secundario"
                  value={newSystemName}
                  onChange={e => setNewSystemName(e.target.value)}
                  className="w-full text-xs bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-indigo-500 mt-1"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-mono text-neutral-400">Descripción o Enfoque</label>
                <textarea
                  rows={2}
                  placeholder="ej. Identidad visual orientada a packaging editorial y soportes sobrios..."
                  value={newSystemDesc}
                  onChange={e => setNewSystemDesc(e.target.value)}
                  className="w-full text-xs bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-indigo-500 resize-none mt-1"
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-neutral-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl text-xs font-medium text-neutral-400 hover:text-white transition-colors"
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-colors flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Confirmar y Asignar al Sistema</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
