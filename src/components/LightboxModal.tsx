import React from 'react';
import { X, Search, Sparkles, Tag, ExternalLink } from 'lucide-react';
import { Reference } from '../types';

interface LightboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  reference: Reference | null;
  onInspect: (ref: Reference) => void;
}

export const LightboxModal: React.FC<LightboxModalProps> = ({
  isOpen,
  onClose,
  reference,
  onInspect,
}) => {
  if (!isOpen || !reference) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col md:flex-row animate-in fade-in zoom-in-95 duration-150">
        {/* Image Display Area */}
        <div className="flex-1 bg-black/60 flex items-center justify-center p-4 relative min-h-[300px] md:min-h-[500px]">
          <img
            src={reference.image}
            alt={reference.name}
            className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-2xl"
            referrerPolicy="no-referrer"
          />

          <div className="absolute top-4 left-4 px-2.5 py-1 rounded bg-black/80 backdrop-blur-md text-xs font-mono font-bold text-neutral-200 border border-neutral-700">
            {reference.id}
          </div>
        </div>

        {/* Info Sidebar */}
        <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-neutral-800 p-5 flex flex-col justify-between bg-neutral-900/90 space-y-4">
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-mono uppercase text-indigo-400 font-semibold">
                  Referencia del Moodboard
                </span>
                <h3 className="text-base font-bold text-neutral-100 leading-tight mt-0.5">
                  {reference.name}
                </h3>
              </div>

              <button
                onClick={onClose}
                className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {reference.tags && reference.tags.length > 0 && (
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-mono text-neutral-400">Etiquetas:</span>
                <div className="flex flex-wrap gap-1">
                  {reference.tags.map((t, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {reference.notes && (
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-mono text-neutral-400">Notas de Intención:</span>
                <p className="text-xs text-neutral-300 italic bg-neutral-950 p-2.5 rounded-lg border border-neutral-800">
                  "{reference.notes}"
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2 pt-4 border-t border-neutral-800">
            <button
              onClick={() => {
                onInspect(reference);
                onClose();
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors shadow-md"
            >
              <Search className="w-4 h-4" />
              <span>Desglosar con Gemini</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
