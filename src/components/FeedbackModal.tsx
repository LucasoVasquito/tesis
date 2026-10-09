import React, { useState } from 'react';
import { X, MessageSquare, AlertCircle, Sparkles } from 'lucide-react';
import { Pattern, Reference } from '../types';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  pattern: Pattern | null;
  reference: Reference | null;
  onSubmitFeedback: (feedback: {
    patternId?: string;
    referenceId?: string;
    type: 'pattern_rejection' | 'reference_exclusion' | 'scope_refinement' | 'designer_rule';
    comment: string;
  }) => void;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
  isOpen,
  onClose,
  pattern,
  reference,
  onSubmitFeedback,
}) => {
  const [feedbackType, setFeedbackType] = useState<
    'pattern_rejection' | 'reference_exclusion' | 'scope_refinement' | 'designer_rule'
  >('pattern_rejection');
  const [comment, setComment] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;

    onSubmitFeedback({
      patternId: pattern?.id,
      referenceId: reference?.id,
      type: feedbackType,
      comment: comment.trim(),
    });

    setComment('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-950 border border-indigo-800 flex items-center justify-center text-indigo-400">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-100">Feedback y Criterio del Diseñador</h3>
              <p className="text-[11px] text-neutral-400">Contexto correctivo para las próximas llamadas a Gemini</p>
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
          {pattern && (
            <div className="p-2.5 bg-neutral-950 rounded-lg border border-neutral-800 text-xs">
              <span className="text-[10px] font-mono uppercase text-indigo-400">Patrón:</span>
              <p className="font-semibold text-neutral-200">{pattern.name}</p>
            </div>
          )}

          {reference && (
            <div className="p-2.5 bg-neutral-950 rounded-lg border border-neutral-800 text-xs">
              <span className="text-[10px] font-mono uppercase text-sky-400">Referencia:</span>
              <p className="font-semibold text-neutral-200">{reference.id} - {reference.name}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-mono text-neutral-400 font-semibold">
              Tipo de Indicación
            </label>

            <select
              value={feedbackType}
              onChange={(e: any) => setFeedbackType(e.target.value)}
              className="w-full text-xs bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="pattern_rejection">El patrón no representa lo que estoy buscando</option>
              <option value="reference_exclusion">Esta referencia no debería formar parte de este patrón</option>
              <option value="scope_refinement">Refinar el nivel de contraste / detalle técnico</option>
              <option value="designer_rule">Regla de diseño personalizada</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-mono text-neutral-400 font-semibold">
              Observación / Explicación del Diseñador *
            </label>
            <textarea
              required
              placeholder="Explicá el motivo para que el modelo lo tenga en cuenta en la siguiente iteración..."
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={3}
              className="w-full text-xs bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-neutral-200 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors shadow-md"
            >
              Registrar Feedback
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
