import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Maximize, 
  Move, 
  Eye, 
  Search, 
  Trash2, 
  Tag, 
  Sparkles, 
  UploadCloud, 
  Layers,
  X,
  SlidersHorizontal,
  ExternalLink,
  Check,
  Clipboard,
  Loader2
} from 'lucide-react';
import { Reference, Pattern } from '../types';

interface CanvasProps {
  references: Reference[];
  selectedReferenceIds: string[];
  onSelectReference: (id: string, multi?: boolean) => void;
  onClearSelection: () => void;
  onUpdateReferencePosition: (id: string, position: { x: number; y: number }) => void;
  onUpdateReference?: (id: string, updates: Partial<Reference>) => void;
  onDeleteReference: (id: string) => void;
  onOpenInspectReference: (ref: Reference) => void;
  onOpenLightbox: (ref: Reference) => void;
  onOpenUpload: () => void;
  onDropFiles: (files: FileList) => void;
  onAddReferences: (newRefs: Reference[]) => void;
  activeEvidencePattern: Pattern | null;
  onClearActiveEvidence: () => void;
  onTriggerAnalysis?: () => void;
  isAnalyzing?: boolean;
}

export const Canvas: React.FC<CanvasProps> = ({
  references,
  selectedReferenceIds,
  onSelectReference,
  onClearSelection,
  onUpdateReferencePosition,
  onUpdateReference,
  onDeleteReference,
  onOpenInspectReference,
  onOpenLightbox,
  onOpenUpload,
  onDropFiles,
  onAddReferences,
  activeEvidencePattern,
  onClearActiveEvidence,
  onTriggerAnalysis,
  isAnalyzing = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Transform state: Pan & Zoom
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [isDragOver, setIsDragOver] = useState(false);

  // Dragging individual references
  const [draggingRefId, setDraggingRefId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Resizing individual references
  const [resizingRefId, setResizingRefId] = useState<string | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(280);

  // Floating Toast confirmation for actions like Ctrl+V paste
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  }, []);

  // Listen for Clipboard Paste (CTRL + V / CMD + V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      const items = clipboardData.items;
      if (!items || items.length === 0) return;

      // Extract only image items from clipboard
      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            imageFiles.push(file);
          }
        }
      }

      // Check fallback clipboard files if items didn't return blobs
      if (imageFiles.length === 0 && clipboardData.files && clipboardData.files.length > 0) {
        for (let i = 0; i < clipboardData.files.length; i++) {
          const file = clipboardData.files[i];
          if (file.type && file.type.startsWith('image/')) {
            imageFiles.push(file);
          }
        }
      }

      // If no image is present (e.g. user copied plain text), do not intercept normal behavior
      if (imageFiles.length === 0) {
        return;
      }

      // Prevent default browser paste behavior for image payload
      e.preventDefault();
      e.stopPropagation();

      const newRefsToAdd: Reference[] = [];
      let processed = 0;

      imageFiles.forEach((file, idx) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const dataUrl = event.target?.result as string;
          if (dataUrl) {
            // Calculate center of currently visible canvas viewport
            let posX = 120;
            let posY = 120;

            if (containerRef.current) {
              const rect = containerRef.current.getBoundingClientRect();
              const viewCenterX = (rect.width / 2 - transform.x) / transform.scale;
              const viewCenterY = (rect.height / 2 - transform.y) / transform.scale;

              const jitterX = (idx % 3 - 1) * 35 + (Math.random() - 0.5) * 20;
              const jitterY = Math.floor(idx / 3) * 35 + (Math.random() - 0.5) * 20;

              posX = Math.round(viewCenterX - 140 + jitterX);
              posY = Math.round(viewCenterY - 120 + jitterY);
            }

            // Calculate next sequential ID: ref_XX
            const numericIds = references.map(r => {
              const match = r.id.match(/^ref_(\d+)$/);
              return match ? parseInt(match[1], 10) : 0;
            });
            const maxId = numericIds.length > 0 ? Math.max(...numericIds, 0) : 0;
            const nextIndex = maxId + idx + 1;
            const nextId = `ref_${String(nextIndex).padStart(2, '0')}`;

            const cleanName = file.name && file.name !== 'image.png' && !file.name.startsWith('blob')
              ? file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ")
              : `Captura ${String(nextIndex).padStart(2, '0')}`;

            newRefsToAdd.push({
              id: nextId,
              name: cleanName,
              image: dataUrl,
              position: { x: posX, y: posY },
              width: 280,
              height: 340,
              createdAt: new Date().toISOString(),
              tags: ['Captura', 'Portapapeles'],
              notes: 'Pegada directamente desde el portapapeles (Ctrl+V)',
              isNew: true,
            });
          }

          processed++;
          if (processed === imageFiles.length && newRefsToAdd.length > 0) {
            onAddReferences(newRefsToAdd);
            if (newRefsToAdd.length === 1) {
              onSelectReference(newRefsToAdd[0].id);
            }
            showToast('Referencia agregada');
          }
        };
        reader.readAsDataURL(file);
      });
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, [references, transform, onAddReferences, onSelectReference, showToast]);

  // Handle Zooming via Wheel
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey || true) {
      e.preventDefault();
      const zoomFactor = 1.1;
      const direction = e.deltaY < 0 ? 1 : -1;
      const newScale = direction > 0 
        ? Math.min(transform.scale * zoomFactor, 3) 
        : Math.max(transform.scale / zoomFactor, 0.2);

      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Zoom relative to mouse point
        const newX = mouseX - (mouseX - transform.x) * (newScale / transform.scale);
        const newY = mouseY - (mouseY - transform.y) * (newScale / transform.scale);

        setTransform({ x: newX, y: newY, scale: newScale });
      }
    }
  }, [transform]);

  // Handle Pan start (Middle click or Spacebar+Click or clicking canvas background)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || e.button === 0 && (e.target === containerRef.current || (e.target as HTMLElement).classList.contains('canvas-background'))) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
      if (e.button === 0 && !e.shiftKey) {
        onClearSelection();
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (resizingRefId) {
      if (onUpdateReference) {
        const deltaX = (e.clientX - resizeStartX) / transform.scale;
        const newWidth = Math.round(Math.max(160, Math.min(800, resizeStartWidth + deltaX)));
        onUpdateReference(resizingRefId, { width: newWidth });
      }
      return;
    }

    if (isPanning) {
      setTransform(prev => ({
        ...prev,
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      }));
    } else if (draggingRefId) {
      const currentRef = references.find(r => r.id === draggingRefId);
      if (currentRef && containerRef.current) {
        // Convert screen coordinates to canvas space
        const rect = containerRef.current.getBoundingClientRect();
        const canvasX = (e.clientX - rect.left - transform.x) / transform.scale - dragOffset.x;
        const canvasY = (e.clientY - rect.top - transform.y) / transform.scale - dragOffset.y;

        onUpdateReferencePosition(draggingRefId, {
          x: Math.round(canvasX),
          y: Math.round(canvasY),
        });
      }
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingRefId(null);
    setResizingRefId(null);
  };

  // Start resizing a card
  const handleStartResize = (e: React.MouseEvent, ref: Reference) => {
    e.stopPropagation();
    e.preventDefault();
    setResizingRefId(ref.id);
    setResizeStartX(e.clientX);
    setResizeStartWidth(ref.width || 280);
  };

  // Quick set card width
  const handleSetReferenceWidth = (e: React.MouseEvent, refId: string, width: number) => {
    e.stopPropagation();
    if (onUpdateReference) {
      onUpdateReference(refId, { width });
    }
  };

  // Start dragging a card
  const handleCardMouseDown = (e: React.MouseEvent, ref: Reference) => {
    if (resizingRefId) return;
    e.stopPropagation();
    if (e.button !== 0) return;

    onSelectReference(ref.id, e.shiftKey || e.metaKey);

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const clickCanvasX = (e.clientX - rect.left - transform.x) / transform.scale;
      const clickCanvasY = (e.clientY - rect.top - transform.y) / transform.scale;

      setDraggingRefId(ref.id);
      setDragOffset({
        x: clickCanvasX - ref.position.x,
        y: clickCanvasY - ref.position.y,
      });
    }
  };

  // Fit all references in view
  const handleFitToView = () => {
    if (references.length === 0 || !containerRef.current) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    references.forEach(r => {
      const w = r.width || 260;
      const h = r.height || 340;
      minX = Math.min(minX, r.position.x);
      minY = Math.min(minY, r.position.y);
      maxX = Math.max(maxX, r.position.x + w);
      maxY = Math.max(maxY, r.position.y + h);
    });

    const padding = 100;
    const contentW = maxX - minX + padding * 2;
    const contentH = maxY - minY + padding * 2;

    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = rect.width / contentW;
    const scaleY = rect.height / contentH;
    const newScale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.3), 1.2);

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    setTransform({
      x: rect.width / 2 - centerX * newScale,
      y: rect.height / 2 - centerY * newScale,
      scale: newScale,
    });
  };

  // Zoom Helpers
  const handleZoomIn = () => {
    setTransform(prev => ({ ...prev, scale: Math.min(prev.scale * 1.2, 3) }));
  };

  const handleZoomOut = () => {
    setTransform(prev => ({ ...prev, scale: Math.max(prev.scale / 1.2, 0.2) }));
  };

  const handleResetZoom = () => {
    setTransform({ x: 0, y: 0, scale: 1 });
  };

  // Focus on Evidence group when activeEvidencePattern changes
  useEffect(() => {
    if (activeEvidencePattern && activeEvidencePattern.evidence.length > 0 && containerRef.current) {
      const evidenceRefs = references.filter(r => activeEvidencePattern.evidence.includes(r.id));
      if (evidenceRefs.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        evidenceRefs.forEach(r => {
          const w = r.width || 260;
          const h = r.height || 340;
          minX = Math.min(minX, r.position.x);
          minY = Math.min(minY, r.position.y);
          maxX = Math.max(maxX, r.position.x + w);
          maxY = Math.max(maxY, r.position.y + h);
        });

        const padding = 140;
        const contentW = Math.max(maxX - minX + padding * 2, 400);
        const contentH = Math.max(maxY - minY + padding * 2, 400);

        const rect = containerRef.current.getBoundingClientRect();
        const scaleX = rect.width / contentW;
        const scaleY = rect.height / contentH;
        const newScale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.4), 1.1);

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        setTransform({
          x: rect.width / 2 - centerX * newScale,
          y: rect.height / 2 - centerY * newScale,
          scale: newScale,
        });
      }
    }
  }, [activeEvidencePattern, references]);

  // Drag & drop files onto canvas
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onDropFiles(e.dataTransfer.files);
    }
  };

  const isEvidenceMode = !!activeEvidencePattern;
  const evidenceIds = activeEvidencePattern?.evidence || [];

  return (
    <main
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="flex-1 h-full relative overflow-hidden bg-[#09090b] select-none cursor-grab active:cursor-grabbing canvas-background"
    >
      {/* Grid Pattern Background */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: `
            radial-gradient(circle, #71717a 1px, transparent 1px)
          `,
          backgroundSize: `${32 * transform.scale}px ${32 * transform.scale}px`,
          backgroundPosition: `${transform.x}px ${transform.y}px`
        }}
      />

      {/* Floating Canvas Controls Toolbar */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-1.5 bg-zinc-900/90 backdrop-blur-md p-1.5 rounded-xl border border-zinc-800 shadow-xl">
        <button
          onClick={handleZoomIn}
          className="p-1.5 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
          title="Acercar (Ctrl + Rueda)"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <button
          onClick={handleZoomOut}
          className="p-1.5 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
          title="Alejar (Ctrl - Rueda)"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <div className="h-4 w-px bg-zinc-800 mx-0.5" />

        <button
          onClick={handleFitToView}
          className="p-1.5 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors flex items-center gap-1 text-xs px-2"
          title="Ajustar todas las referencias al viewport"
        >
          <Maximize className="w-3.5 h-3.5" />
          <span className="font-mono text-[11px]">{Math.round(transform.scale * 100)}%</span>
        </button>

        <button
          onClick={handleResetZoom}
          className="p-1.5 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
          title="Restablecer vista 100%"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px bg-zinc-800 mx-0.5" />

        <button
          onClick={onOpenUpload}
          className="p-1.5 text-zinc-300 hover:text-white hover:bg-zinc-800/80 rounded-lg transition-colors flex items-center gap-1.5 text-xs px-2.5 font-medium"
          title="Agregar más imágenes al canvas"
        >
          <UploadCloud className="w-3.5 h-3.5 text-indigo-400" />
          <span>Subir Ref</span>
        </button>

        <button
          onClick={onTriggerAnalysis}
          disabled={isAnalyzing || references.length === 0}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md ${
            isAnalyzing
              ? 'bg-indigo-900/70 text-indigo-200 cursor-wait border border-indigo-700/60'
              : references.length === 0
              ? 'bg-zinc-800/50 text-zinc-500 cursor-not-allowed border border-zinc-800'
              : 'bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-indigo-500/25 border border-indigo-400/30 hover:scale-[1.02] active:scale-[0.98]'
          }`}
          title={
            references.length === 0
              ? 'Sube referencias al canvas para poder analizar el moodboard'
              : 'Analizar referencias visuales y detectar patrones emergentes con IA'
          }
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
              <span>Analizando...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
              <span>Analizar Moodboard</span>
            </>
          )}
        </button>
      </div>

      {/* Active Evidence Banner Overlay */}
      {activeEvidencePattern && (
        <div className="absolute top-4 right-4 z-20 max-w-md bg-zinc-900/95 backdrop-blur-md p-3 rounded-xl border border-amber-500/40 shadow-2xl space-y-1.5 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-amber-400 text-xs font-semibold">
              <Eye className="w-4 h-4" />
              <span>Explorando Evidencia del Patrón</span>
            </div>
            <button
              onClick={onClearActiveEvidence}
              className="p-1 text-zinc-400 hover:text-white rounded hover:bg-zinc-800 transition-colors"
              title="Cerrar exploración de evidencia"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <h4 className="text-xs font-bold text-zinc-100">
            {activeEvidencePattern.name}
          </h4>
          <p className="text-[11px] text-zinc-300 line-clamp-2 leading-relaxed">
            {activeEvidencePattern.description}
          </p>
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-amber-300/90 pt-0.5">
            <span>Sustentado en:</span>
            <div className="flex flex-wrap gap-1">
              {activeEvidencePattern.evidence.map(id => (
                <span key={id} className="px-1.5 py-0.2 rounded bg-amber-950 border border-amber-700/60 font-semibold">
                  {id}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Drag & Drop Canvas Overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-30 bg-indigo-950/80 backdrop-blur-sm border-2 border-dashed border-indigo-400 flex flex-col items-center justify-center text-white space-y-3 pointer-events-none">
          <UploadCloud className="w-12 h-12 text-indigo-300 animate-bounce" />
          <p className="text-base font-semibold">Soltá las imágenes para agregarlas al moodboard</p>
          <p className="text-xs text-indigo-200">Se crearán referencias independientes en el canvas</p>
        </div>
      )}

      {/* Empty State Banner if no references */}
      {references.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-6 text-center">
          <div className="max-w-md bg-zinc-900/80 backdrop-blur-md p-8 rounded-2xl border border-zinc-800 space-y-4 pointer-events-auto shadow-2xl">
            <div className="w-14 h-14 rounded-2xl bg-indigo-950/80 border border-indigo-800/80 flex items-center justify-center mx-auto text-indigo-400">
              <Layers className="w-7 h-7" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-base font-semibold text-zinc-100">Moodboard de Investigación Visual</h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Construí tu universo estético cargando referencias visuales (posters, identidades, fotografías, texturas o tipografías).
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
              <button
                onClick={onOpenUpload}
                className="w-full sm:w-auto px-4 py-2 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors shadow-lg shadow-indigo-600/20"
              >
                + Subir Referencias
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2D Canvas Transform Layer */}
      <div
        className="absolute inset-0 origin-top-left pointer-events-none"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
        }}
      >
        {/* Render Connection Lines between evidence items if in evidence mode */}
        {isEvidenceMode && activeEvidencePattern && activeEvidencePattern.evidence.length > 1 && (
          <svg className="absolute inset-0 w-[4000px] h-[4000px] pointer-events-none overflow-visible">
            <defs>
              <linearGradient id="evidenceLineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#818cf8" stopOpacity="0.8" />
              </linearGradient>
            </defs>
            {activeEvidencePattern.evidence.map((refId, idx) => {
              if (idx === activeEvidencePattern.evidence.length - 1) return null;
              const nextRefId = activeEvidencePattern.evidence[idx + 1];
              const r1 = references.find(r => r.id === refId);
              const r2 = references.find(r => r.id === nextRefId);
              if (!r1 || !r2) return null;

              const x1 = r1.position.x + (r1.width || 260) / 2;
              const y1 = r1.position.y + (r1.height || 340) / 2;
              const x2 = r2.position.x + (r2.width || 260) / 2;
              const y2 = r2.position.y + (r2.height || 340) / 2;

              return (
                <line
                  key={`${refId}-${nextRefId}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="url(#evidenceLineGrad)"
                  strokeWidth="2.5"
                  strokeDasharray="6 4"
                  className="animate-pulse"
                />
              );
            })}
          </svg>
        )}

        {/* References Cards */}
        {references.map(ref => {
          const isSelected = selectedReferenceIds.includes(ref.id);
          const isEvidence = isEvidenceMode && evidenceIds.includes(ref.id);
          const isDimmed = isEvidenceMode && !isEvidence;
          const cardWidth = ref.width || 280;

          return (
            <div
              key={ref.id}
              id={`ref-card-${ref.id}`}
              onMouseDown={(e) => handleCardMouseDown(e, ref)}
              style={{
                transform: `translate(${ref.position.x}px, ${ref.position.y}px)`,
                width: `${cardWidth}px`,
              }}
              className={`absolute group pointer-events-auto rounded-xl transition-shadow select-none duration-150 ${
                isDimmed
                  ? 'opacity-25 grayscale-[60%] hover:opacity-70 transition-opacity'
                  : isEvidence
                  ? 'ring-4 ring-amber-400 ring-offset-2 ring-offset-zinc-950 shadow-2xl shadow-amber-500/30 scale-[1.02] z-10'
                  : isSelected
                  ? 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-zinc-950 shadow-2xl shadow-indigo-500/30 z-10'
                  : 'shadow-lg hover:shadow-2xl hover:border-zinc-700 z-0'
              }`}
            >
              {/* Card Container */}
              <div className="bg-zinc-900/90 backdrop-blur-md rounded-xl border border-zinc-800/80 overflow-hidden flex flex-col transition-all">
                {/* Image Viewport - Natural Aspect Ratio Preserved (No Cropping / No Fixed Aspect Ratio) */}
                <div className="relative w-full bg-zinc-950/70 overflow-hidden group/img flex items-center justify-center">
                  <img
                    src={ref.image}
                    alt={ref.name}
                    className="w-full h-auto block object-contain select-none pointer-events-none transition-transform duration-300 group-hover/img:scale-[1.02]"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    draggable={false}
                  />

                  {/* Ref ID Badge */}
                  <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-zinc-950/85 backdrop-blur-md border border-zinc-700/80 text-[10px] font-mono font-bold text-zinc-200 tracking-wider shadow z-10">
                    {ref.id}
                  </div>

                  {/* Evidence Badge */}
                  {isEvidence && (
                    <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-amber-500 text-zinc-950 text-[10px] font-mono font-extrabold uppercase tracking-tight shadow-md flex items-center gap-1 animate-bounce z-10">
                      <Sparkles className="w-3 h-3" />
                      <span>Evidencia</span>
                    </div>
                  )}

                  {/* New reference marker */}
                  {ref.isNew && !isEvidence && (
                    <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-amber-500/90 text-zinc-950 text-[10px] font-bold tracking-tight shadow z-10">
                      Nueva
                    </div>
                  )}

                  {/* Hover Overlay Controls */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-zinc-950/95 via-zinc-950/70 to-transparent p-2.5 pt-8 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between z-10">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenLightbox(ref);
                        }}
                        className="p-1.5 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-700 transition-colors shadow"
                        title="Ver en alta resolución"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenInspectReference(ref);
                        }}
                        className="p-1.5 rounded-lg bg-sky-950/90 hover:bg-sky-900 text-sky-200 hover:text-white border border-sky-700/80 transition-colors shadow flex items-center gap-1 text-[10px]"
                        title="Desglosar componentes visuales con Gemini"
                      >
                        <Search className="w-3.5 h-3.5" />
                        <span>Desglosar</span>
                      </button>

                      {/* Quick resize buttons */}
                      <div className="flex items-center bg-zinc-950/80 border border-zinc-800 rounded-lg p-0.5 ml-1">
                        <button
                          onClick={(e) => handleSetReferenceWidth(e, ref.id, Math.max(160, cardWidth - 40))}
                          className="px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
                          title="Reducir tamaño (-)"
                        >
                          -
                        </button>
                        <span className="text-[9px] font-mono px-1 text-zinc-500">{cardWidth}</span>
                        <button
                          onClick={(e) => handleSetReferenceWidth(e, ref.id, Math.min(800, cardWidth + 40))}
                          className="px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
                          title="Aumentar tamaño (+)"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteReference(ref.id);
                      }}
                      className="p-1.5 rounded-lg bg-red-950/90 hover:bg-red-900 text-red-300 hover:text-white border border-red-800/80 transition-colors shadow"
                      title="Eliminar del moodboard"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Card Meta Footer */}
                <div className="p-2.5 space-y-1.5 bg-zinc-900/95 border-t border-zinc-800/80">
                  <div className="flex items-center justify-between gap-1">
                    <h3 className="text-xs font-semibold text-zinc-200 truncate flex-1" title={ref.name}>
                      {ref.name}
                    </h3>
                    
                    {/* Size preset chips */}
                    <div className="flex items-center gap-0.5 opacity-40 group-hover:opacity-100 transition-opacity">
                      {[
                        { label: 'S', w: 200 },
                        { label: 'M', w: 280 },
                        { label: 'L', w: 380 },
                        { label: 'XL', w: 520 },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          onClick={(e) => handleSetReferenceWidth(e, ref.id, preset.w)}
                          className={`text-[8px] font-mono px-1 py-0.2 rounded border transition-colors ${
                            Math.abs(cardWidth - preset.w) < 20
                              ? 'bg-indigo-900/80 border-indigo-600 text-indigo-200 font-bold'
                              : 'bg-zinc-800/60 border-zinc-700/40 text-zinc-400 hover:text-zinc-200'
                          }`}
                          title={`Tamaño ${preset.label} (${preset.w}px)`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {ref.tags && ref.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {ref.tags.map((tag, i) => (
                        <span
                          key={i}
                          className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-800/90 text-zinc-400 border border-zinc-700/40"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {ref.notes && (
                    <p className="text-[10px] text-zinc-400 italic line-clamp-2 leading-tight">
                      "{ref.notes}"
                    </p>
                  )}
                </div>
              </div>

              {/* Corner Resize Drag Handle */}
              <div
                onMouseDown={(e) => handleStartResize(e, ref)}
                className="absolute -bottom-1 -right-1 w-5 h-5 rounded-br-lg rounded-tl bg-zinc-800/90 hover:bg-indigo-600 border border-zinc-700/80 hover:border-indigo-400 text-zinc-400 hover:text-white cursor-se-resize flex items-center justify-center transition-all z-20 shadow-md group/resize"
                title="Arrastra esta esquina para cambiar libremente el tamaño de la imagen"
              >
                <svg className="w-2.5 h-2.5" viewBox="0 0 6 6" fill="currentColor">
                  <path d="M5 5H1L5 1V5Z" />
                </svg>
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Toast Notification (e.g. for Ctrl+V clipboard paste) */}
      {toastMessage && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2.5 px-4 py-2 rounded-xl bg-zinc-900/95 backdrop-blur-md border border-emerald-500/40 text-emerald-400 text-xs font-semibold shadow-2xl shadow-emerald-950/40 animate-in fade-in slide-in-from-bottom-3 duration-200 pointer-events-none">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-zinc-100">{toastMessage}</span>
        </div>
      )}
    </main>
  );
};
