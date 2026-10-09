import React, { useState } from 'react';
import { X, Printer, Download, Copy, Check, Sparkles, Palette, Type as TypeIcon, Grid, Layers, FileText, CheckCircle2 } from 'lucide-react';
import { Project, VisualSystem } from '../types';

interface ExportBrandGuidelinesModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  system: VisualSystem;
}

export const ExportBrandGuidelinesModal: React.FC<ExportBrandGuidelinesModalProps> = ({
  isOpen,
  onClose,
  project,
  system,
}) => {
  const [isCopied, setIsCopied] = useState(false);

  if (!isOpen || !system) return null;

  // Patterns in this system
  const systemPatterns = project.patterns.filter(p => system.patternIds.includes(p.id));
  const confirmedPatterns = systemPatterns.filter(p => p.status === 'confirmed');

  // References supporting this system
  const evidenceRefIds = Array.from(new Set(systemPatterns.flatMap(p => p.evidence)));
  const systemReferences = project.references.filter(r => evidenceRefIds.includes(r.id));

  // Build Markdown Text
  const buildMarkdownExport = (): string => {
    const paletteStr = (system.colorPalette || [])
      .map(c => `- **${c.name || 'Color'}**: \`${c.hex}\` (${c.role || 'general'})`)
      .join('\n');

    const pillarsStr = (system.aestheticPillars || [])
      .map(p => `- ${p}`)
      .join('\n');

    const patternsStr = confirmedPatterns
      .map(p => `### ${p.name}\n- **Categoría:** \`${p.category}\`\n- **Descripción:** ${p.description}\n- **Evidencia Visual:** ${p.evidence.join(', ')}\n`)
      .join('\n');

    return `# Manual de Sistema Visual: ${system.name}
**Proyecto de Tesis:** ${project.name}
**Objetivo:** ${project.objective || 'Exploración de Identidad Visual'}
**Fecha de Generación:** ${new Date().toLocaleDateString('es-ES')}

---

## 1. Concepto y Pilares Estéticos
${system.description || 'Sistema visual extraído mediante análisis multimodal de patrones.'}

### Pilares Clave
${pillarsStr || '- No definidos'}

---

## 2. Paleta Cromática Identitaria
${paletteStr || '- No configurada'}

---

## 3. Reglas del Sistema Visual
- **Tipografía:** ${system.typographyRules?.join('. ') || 'Sin reglas especificadas'}
- **Textura y Materialidad:** ${system.textureRules?.join('. ') || 'Sin reglas especificadas'}
- **Composición y Retícula:** ${system.compositionRules?.join('. ') || 'Sin reglas especificadas'}

---

## 4. Matriz de Patrones Confirmados (${confirmedPatterns.length})
${patternsStr || 'Sin patrones asignados'}

---
*Documento generado automáticamente por Emergent - Visual Pattern Explorer (Tesis Multimedial).*
`;
  };

  const handleCopyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(buildMarkdownExport());
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.warn('Failed to copy to clipboard:', err);
    }
  };

  const handleDownloadMarkdown = () => {
    const content = buildMarkdownExport();
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `manual_marca_${system.name.toLowerCase().replace(/\s+/g, '_')}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrintPDF = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in select-none">
      <div className="w-full max-w-4xl max-h-[90vh] bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <header className="h-16 px-6 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-950">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-950/80 border border-emerald-800/80 flex items-center justify-center text-emerald-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                Manual del Sistema Visual — Ficha Técnica
              </h2>
              <p className="text-xs text-zinc-400">
                {system.name} • {project.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrintPDF}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-colors flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / PDF</span>
            </button>

            <button
              onClick={handleDownloadMarkdown}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700 transition-colors flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              <span>Descargar .MD</span>
            </button>

            <button
              onClick={handleCopyMarkdown}
              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
              title="Copiar contenido Markdown"
            >
              {isCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Printable & Scrollable Content Body */}
        <div id="printable-brand-guidelines" className="flex-1 overflow-y-auto p-8 space-y-8 bg-zinc-950 text-zinc-100 select-text">
          
          {/* Header Banner */}
          <div className="border-b border-zinc-800 pb-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-1 rounded-md bg-emerald-950 text-emerald-300 text-[11px] font-mono font-bold uppercase tracking-wider border border-emerald-800">
                MANUAL DE MARCA & BRAND GUIDELINES
              </span>
              <span className="text-xs font-mono text-zinc-500">
                {new Date().toLocaleDateString('es-ES')}
              </span>
            </div>

            <h1 className="text-2xl font-extrabold text-zinc-100">
              {system.name}
            </h1>
            <p className="text-xs text-zinc-400 leading-relaxed max-w-3xl">
              {system.description || 'Sistema de identidad visual construido sobre el análisis multimodal de referencias.'}
            </p>
          </div>

          {/* Color Palette Grid */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 font-mono flex items-center gap-2">
              <Palette className="w-4 h-4" />
              1. Paleta Cromática Identitaria
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(system.colorPalette || []).map((color, idx) => (
                <div key={idx} className="p-3 bg-zinc-900 rounded-xl border border-zinc-800 space-y-2">
                  <div
                    className="w-full h-16 rounded-lg border border-white/10 shadow-inner"
                    style={{ backgroundColor: color.hex }}
                  />
                  <div>
                    <div className="text-xs font-bold text-zinc-200 truncate">{color.name || `Color ${idx + 1}`}</div>
                    <div className="text-[11px] font-mono text-emerald-400">{color.hex}</div>
                    <div className="text-[10px] text-zinc-500 capitalize">{color.role || 'general'}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Aesthetic Pillars & Rules */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Aesthetic Pillars */}
            <div className="p-4 bg-zinc-900/80 rounded-xl border border-zinc-800 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-200 font-mono flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                Pilares Conceptuales
              </h4>
              <ul className="space-y-1.5 text-xs text-zinc-300">
                {(system.aestheticPillars || []).map((pillar, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-emerald-400 font-bold">•</span>
                    <span>{pillar}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Technical Directives */}
            <div className="p-4 bg-zinc-900/80 rounded-xl border border-zinc-800 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-200 font-mono flex items-center gap-2">
                <TypeIcon className="w-4 h-4 text-indigo-400" />
                Lineamientos Técnicos
              </h4>
              <div className="space-y-2 text-xs text-zinc-300">
                <div>
                  <strong className="text-zinc-200 font-mono text-[11px]">Tipografía:</strong>
                  <p className="text-zinc-400">{system.typographyRules?.join('. ') || 'Sin regla especificada'}</p>
                </div>
                <div>
                  <strong className="text-zinc-200 font-mono text-[11px]">Textura & Sustrato:</strong>
                  <p className="text-zinc-400">{system.textureRules?.join('. ') || 'Sin regla especificada'}</p>
                </div>
                <div>
                  <strong className="text-zinc-200 font-mono text-[11px]">Composición:</strong>
                  <p className="text-zinc-400">{system.compositionRules?.join('. ') || 'Sin regla especificada'}</p>
                </div>
              </div>
            </div>

          </section>

          {/* Confirmed Patterns List */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 font-mono flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              2. Matriz de Patrones Confirmados ({confirmedPatterns.length})
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {confirmedPatterns.map((pat) => (
                <div key={pat.id} className="p-3.5 bg-zinc-900/90 rounded-xl border border-zinc-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-bold text-zinc-100">{pat.name}</h5>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                      {pat.category}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">{pat.description}</p>
                  <div className="text-[10px] font-mono text-zinc-500">
                    Evidencia: {pat.evidence.join(', ')}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Evidence References Thumbnails */}
          {systemReferences.length > 0 && (
            <section className="space-y-3 pt-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300 font-mono flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                3. Moodboard Visual Sustentante
              </h3>

              <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                {systemReferences.map(ref => (
                  <div key={ref.id} className="aspect-square rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden">
                    <img src={ref.image} alt={ref.name} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </section>
          )}

        </div>

      </div>
    </div>
  );
};
