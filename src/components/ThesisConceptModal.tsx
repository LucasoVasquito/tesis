import React from 'react';
import { X, BookOpen, Sparkles, CheckCircle2, ArrowRight, UserCheck, ShieldAlert, Cpu } from 'lucide-react';

interface ThesisConceptModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ThesisConceptModal: React.FC<ThesisConceptModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-neutral-800 flex items-center justify-between sticky top-0 bg-neutral-900/95 backdrop-blur z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-950 border border-indigo-800 flex items-center justify-center text-indigo-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-100">
                Marco Conceptual de la Tesis
              </h3>
              <p className="text-xs text-neutral-400">Diseño Multimedial • Interacción Humano-IA</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6 text-neutral-300 text-xs leading-relaxed">
          {/* Problemática */}
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
              La Problemática de Diseño
            </h4>
            <p>
              Durante la construcción de una identidad visual o universo estético, un diseñador acumula referencias visuales y, de manera no necesariamente consciente, comienza a repetir determinados recursos, relaciones cromáticas, estructuras compositivas y texturas.
            </p>
            <p className="text-neutral-400">
              Esos patrones emergentes existen dentro del conjunto de referencias sin que hayan sido formulados explícitamente. Esta aplicación busca hacerlos <strong>visibles</strong> y <strong>auditables</strong> durante el proceso creativo.
            </p>
          </div>

          {/* Postura ética y metodológica */}
          <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3">
            <h4 className="text-xs font-bold text-amber-400 uppercase font-mono tracking-wide">
              Postura de Diseño frente a la IA
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
              <div className="p-2.5 rounded-lg bg-red-950/20 border border-red-900/40 text-red-200 space-y-1">
                <span className="font-bold block text-red-400">Lo que la IA NO debe hacer:</span>
                <p>• No reemplaza el criterio del diseñador.</p>
                <p>• No decide cuál es la identidad "correcta".</p>
                <p>• No genera automáticamente identidades cerradas.</p>
              </div>

              <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-900/40 text-emerald-200 space-y-1">
                <span className="font-bold block text-emerald-400">Lo que el prototipo hace:</span>
                <p>• Detecta recurrencias observables empíricamente.</p>
                <p>• Vincula cada patrón a su evidencia visual exacta.</p>
                <p>• Permite la coexistencia de múltiples sistemas visuales.</p>
              </div>
            </div>
          </div>

          {/* El Flujo Co-creativo */}
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              El Flujo de Interacción
            </h4>
            <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 font-mono text-[11px] text-neutral-300 space-y-1.5">
              <div className="flex items-center gap-2 text-indigo-300">
                <span className="font-bold">1. REFERENCIAS</span>
                <span>→ Moodboard espacial en canvas</span>
              </div>
              <div className="flex items-center gap-2 text-sky-300">
                <span className="font-bold">2. PATRONES</span>
                <span>→ Detección multimodal estructurada con evidencia</span>
              </div>
              <div className="flex items-center gap-2 text-amber-300">
                <span className="font-bold">3. EXPLORACIÓN</span>
                <span>→ Visualización de evidencia y desglose individual</span>
              </div>
              <div className="flex items-center gap-2 text-emerald-300">
                <span className="font-bold">4. VALIDACIÓN</span>
                <span>→ El diseñador confirma, descarta o aporta feedback</span>
              </div>
              <div className="flex items-center gap-2 text-purple-300">
                <span className="font-bold">5. SISTEMAS</span>
                <span>→ Consolidación de sistemas visuales divergentes</span>
              </div>
            </div>
          </div>

          {/* Multiplicidad de Sistemas */}
          <div className="space-y-1 text-neutral-400">
            <h5 className="font-semibold text-neutral-200 text-xs">Coexistencia de Sistemas Visuales</h5>
            <p>
              Gemini no asume que todas las imágenes pertenecen al mismo sistema. Por ejemplo, en el caso de demostración "Badder", pueden emerger simultáneamente una línea <em>"Editorial Oscura"</em> y una línea <em>"Urbana Disruptiva"</em>, permitiendo al diseñador estructurar ambos universos sin forzar un consenso prematuro.
            </p>
          </div>
        </div>

        <div className="p-4 border-t border-neutral-800 bg-neutral-950/60 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition-colors"
          >
            Entendido, volver al espacio de trabajo
          </button>
        </div>
      </div>
    </div>
  );
};
