import React, { useState } from 'react';
import { X, FolderPlus, Sparkles } from 'lucide-react';
import { Project } from '../types';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProject: (projectData: { name: string; objective: string; description: string }) => void;
}

export const NewProjectModal: React.FC<NewProjectModalProps> = ({
  isOpen,
  onClose,
  onCreateProject,
}) => {
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [description, setDescription] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onCreateProject({
      name: name.trim(),
      objective: objective.trim() || 'Definir universo estético y formal del proyecto',
      description: description.trim(),
    });

    setName('');
    setObjective('');
    setDescription('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-950 border border-indigo-800 flex items-center justify-center text-indigo-400">
              <FolderPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-100">Crear Nuevo Proyecto</h3>
              <p className="text-[11px] text-neutral-400">Inicia una nueva investigación visual</p>
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
          <div>
            <label className="text-[10px] uppercase font-mono text-neutral-400 font-semibold">
              Nombre del Proyecto *
            </label>
            <input
              type="text"
              required
              placeholder="ej. Identidad Visual Badder"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full text-xs bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 mt-1"
              autoFocus
            />
          </div>

          <div>
            <label className="text-[10px] uppercase font-mono text-neutral-400 font-semibold">
              Objetivo de Diseño *
            </label>
            <textarea
              required
              placeholder="ej. Construir un sistema visual para publicaciones de Instagram y sitio web..."
              value={objective}
              onChange={e => setObjective(e.target.value)}
              rows={2}
              className="w-full text-xs bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-neutral-200 focus:outline-none focus:border-indigo-500 mt-1 resize-none"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase font-mono text-neutral-400 font-semibold">
              Contexto o Universo Visual (Opcional)
            </label>
            <textarea
              placeholder="ej. Referencias entre minimalismo editorial y gráfica urbana experimental..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="w-full text-xs bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-neutral-200 focus:outline-none focus:border-indigo-500 mt-1 resize-none"
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
              Crear Proyecto
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
