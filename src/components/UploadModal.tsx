import React, { useState, useRef } from 'react';
import { 
  X, 
  UploadCloud, 
  Link as LinkIcon, 
  Sparkles, 
  Plus, 
  Check, 
  Image as ImageIcon,
  Layers
} from 'lucide-react';
import { Reference } from '../types';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddReferences: (newRefs: Reference[]) => void;
  existingCount: number;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onAddReferences,
  existingCount,
}) => {
  const [tab, setTab] = useState<'files' | 'url' | 'packs'>('files');
  const [imageUrl, setImageUrl] = useState('');
  const [refName, setRefName] = useState('');
  const [refTags, setRefTags] = useState('');
  const [refNotes, setRefNotes] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);

  if (!isOpen) return null;

  // Process File List from input or drop
  const handleProcessFiles = (files: FileList) => {
    setIsProcessingFiles(true);
    const newRefs: Reference[] = [];
    let processed = 0;

    Array.from(files).forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        if (dataUrl) {
          const nextId = `ref_${String(existingCount + index + 1).padStart(2, '0')}`;
          const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");

          newRefs.push({
            id: nextId,
            name: cleanName || `Referencia ${existingCount + index + 1}`,
            image: dataUrl,
            position: {
              x: 80 + (index % 4) * 310,
              y: 80 + Math.floor(index / 4) * 380,
            },
            width: 260,
            height: 340,
            createdAt: new Date().toISOString(),
            tags: ['Upload'],
            isNew: true,
          });
        }

        processed++;
        if (processed === files.length) {
          onAddReferences(newRefs);
          setIsProcessingFiles(false);
          onClose();
        }
      };
      reader.readAsDataURL(file);
    });
  };

  // Add via URL
  const handleAddViaUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageUrl.trim()) return;

    const nextId = `ref_${String(existingCount + 1).padStart(2, '0')}`;
    const tagsArray = refTags.split(',').map(t => t.trim()).filter(Boolean);

    const newRef: Reference = {
      id: nextId,
      name: refName.trim() || `Referencia Web ${existingCount + 1}`,
      image: imageUrl.trim(),
      position: {
        x: 100 + (existingCount % 4) * 310,
        y: 100 + Math.floor(existingCount / 4) * 380,
      },
      width: 260,
      height: 340,
      createdAt: new Date().toISOString(),
      tags: tagsArray.length > 0 ? tagsArray : ['Web'],
      notes: refNotes.trim(),
      isNew: true,
    };

    onAddReferences([newRef]);
    setImageUrl('');
    setRefName('');
    setRefTags('');
    setRefNotes('');
    onClose();
  };

  // Preset Sample Packs
  const handleLoadSamplePack = (packType: 'badder_extra' | 'minimal_editorial' | 'acid_urban') => {
    let images: { name: string; url: string; tags: string[]; notes: string }[] = [];

    if (packType === 'badder_extra') {
      images = [
        {
          name: 'Composición Asimétrica con Tipografía Display',
          url: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?q=80&w=800&auto=format&fit=crop',
          tags: ['Display', 'Urbano', 'Color Neón', 'Disruptivo'],
          notes: 'Bloques tipográficos superpuestos y gradiente cobalto.'
        },
        {
          name: 'Retícula Editorial Minimalista',
          url: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?q=80&w=800&auto=format&fit=crop',
          tags: ['Editorial', 'Serif', 'Mínimo', 'Espacio Negativo'],
          notes: 'Equilibrio asimétrico con margen superior dominante.'
        },
        {
          name: 'Textura de Semitono y Halftone Analógico',
          url: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?q=80&w=800&auto=format&fit=crop',
          tags: ['Halftone', 'Textura', 'Arte Gráfico'],
          notes: 'Trama de puntos serigráfica con saturación profunda.'
        }
      ];
    } else if (packType === 'minimal_editorial') {
      images = [
        {
          name: 'Editorial Clásico Libro Antiguo',
          url: 'https://images.unsplash.com/photo-1457369804613-52c61a468e7d?q=80&w=800&auto=format&fit=crop',
          tags: ['Serif', 'Papel Táctil', 'Monocromo'],
          notes: 'Serifas refinadas y márgenes de proporciones canónicas.'
        },
        {
          name: 'Póster Minimalista con Filetes Finos',
          url: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?q=80&w=800&auto=format&fit=crop',
          tags: ['Filetes 0.5pt', 'Negro Puro', 'Luz Cenital'],
          notes: 'Geometría ortogonal y alto contraste.'
        }
      ];
    } else {
      images = [
        {
          name: 'Gráfica Urbana Underground',
          url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?q=80&w=800&auto=format&fit=crop',
          tags: ['Urbano', 'Collage', 'Ruido'],
          notes: 'Estética fotocopia xerox con tipografía distorsionada.'
        },
        {
          name: 'Iluminación Neón Magenta y Azul Cobalto',
          url: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?q=80&w=800&auto=format&fit=crop',
          tags: ['Azul Eléctrico', 'Magenta', 'Gradiente'],
          notes: 'Relación cromática complementaria saturada.'
        }
      ];
    }

    const newRefs: Reference[] = images.map((item, idx) => ({
      id: `ref_${String(existingCount + idx + 1).padStart(2, '0')}`,
      name: item.name,
      image: item.url,
      position: {
        x: 100 + ((existingCount + idx) % 4) * 310,
        y: 100 + Math.floor((existingCount + idx) / 4) * 380,
      },
      width: 260,
      height: 340,
      createdAt: new Date().toISOString(),
      tags: item.tags,
      notes: item.notes,
      isNew: true,
    }));

    onAddReferences(newRefs);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-950 border border-indigo-800 flex items-center justify-center text-indigo-400">
              <UploadCloud className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-100">Agregar Referencias Visuales</h3>
              <p className="text-[11px] text-zinc-400">Cargá imágenes al canvas para el análisis de patrones</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="p-3 border-b border-zinc-800/80 bg-zinc-950/60 flex items-center gap-1">
          <button
            onClick={() => setTab('files')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === 'files' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Archivos Locales
          </button>

          <button
            onClick={() => setTab('url')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === 'url' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            URL de Imagen
          </button>

          <button
            onClick={() => setTab('packs')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === 'packs' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Packs de Referencias
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5">
          {tab === 'files' && (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-zinc-700 hover:border-indigo-500 rounded-xl p-8 text-center cursor-pointer transition-colors bg-zinc-950/40 hover:bg-indigo-950/10 space-y-3"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => e.target.files && handleProcessFiles(e.target.files)}
                  className="hidden"
                />
                <UploadCloud className="w-10 h-10 mx-auto text-indigo-400" />
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-zinc-200">
                    Hacé click para seleccionar o arrastrá imágenes aquí
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Soporta JPG, PNG, WebP. Podés subir varias a la vez.
                  </p>
                </div>
              </div>

              {isProcessingFiles && (
                <div className="text-center text-xs text-indigo-300 animate-pulse font-mono">
                  Procesando imágenes y creando referencias...
                </div>
              )}
            </div>
          )}

          {tab === 'url' && (
            <form onSubmit={handleAddViaUrl} className="space-y-3">
              <div>
                <label className="text-[10px] uppercase font-mono text-zinc-400">URL Directa de la Imagen *</label>
                <input
                  type="url"
                  required
                  placeholder="https://images.unsplash.com/..."
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="w-full text-xs bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase font-mono text-zinc-400">Nombre / Título</label>
                  <input
                    type="text"
                    placeholder="ej. Póster tipográfico"
                    value={refName}
                    onChange={(e) => setRefName(e.target.value)}
                    className="w-full text-xs bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 mt-1"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase font-mono text-zinc-400">Tags (separados por coma)</label>
                  <input
                    type="text"
                    placeholder="Serif, Noir, Azul"
                    value={refTags}
                    onChange={(e) => setRefTags(e.target.value)}
                    className="w-full text-xs bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 mt-1"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-mono text-zinc-400">Notas de Intención de Diseño</label>
                <textarea
                  placeholder="ej. Me interesa el contraste entre el titular y el fondo oscuro..."
                  value={refNotes}
                  onChange={(e) => setRefNotes(e.target.value)}
                  rows={2}
                  className="w-full text-xs bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-indigo-500 mt-1 resize-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors shadow-md mt-2"
              >
                Agregar al Canvas
              </button>
            </form>
          )}

          {tab === 'packs' && (
            <div className="space-y-3">
              <p className="text-xs text-zinc-400">
                Seleccioná un pack curado de imágenes para probar la detección de patrones emergentes y la coexistencia de múltiples sistemas visuales:
              </p>

              <div
                onClick={() => handleLoadSamplePack('badder_extra')}
                className="p-3 bg-zinc-950 hover:bg-zinc-800/80 border border-zinc-800 rounded-xl cursor-pointer transition-colors space-y-1"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-indigo-300">Pack Badder Extension (+3 Refs)</h4>
                  <span className="text-[10px] font-mono text-zinc-400">Asimétrico + Semitono</span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Agrega referencias híbridas que fortalecen la tensión entre lo editorial y lo urbano.
                </p>
              </div>

              <div
                onClick={() => handleLoadSamplePack('minimal_editorial')}
                className="p-3 bg-zinc-950 hover:bg-zinc-800/80 border border-zinc-800 rounded-xl cursor-pointer transition-colors space-y-1"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-sky-300">Pack Editorial Puro (+2 Refs)</h4>
                  <span className="text-[10px] font-mono text-zinc-400">Serif Clásico</span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Referencias con serifa tradicional, márgenes amplios y composición sosegada.
                </p>
              </div>

              <div
                onClick={() => handleLoadSamplePack('acid_urban')}
                className="p-3 bg-zinc-950 hover:bg-zinc-800/80 border border-zinc-800 rounded-xl cursor-pointer transition-colors space-y-1"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-purple-300">Pack Urbano / Noise (+2 Refs)</h4>
                  <span className="text-[10px] font-mono text-zinc-400">Collage + Ruido</span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Gráfica experimental con fotocopia analógica, gradientes cobalto y texturas sucias.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
