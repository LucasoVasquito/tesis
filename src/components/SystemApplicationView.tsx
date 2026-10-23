import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Sparkles, 
  RefreshCw, 
  Download, 
  CheckCircle2, 
  Palette, 
  Type as TypeIcon, 
  Grid, 
  Camera, 
  Compass, 
  History, 
  Check, 
  Cpu, 
  Copy, 
  Code, 
  Anchor, 
  FileText, 
  Layers, 
  Sliders, 
  Eye, 
  ChevronRight, 
  ChevronLeft,
  ZoomIn,
  AlertCircle
} from 'lucide-react';
import { 
  Project, 
  VisualSystem, 
  Reference, 
  Pattern,
  SystemResourceKey, 
  ApplicationIteration,
  AIEngineType,
} from '../types';

interface SystemApplicationViewProps {
  project: Project;
  system: VisualSystem;
  onBackToSystem: () => void;
  onOpenLightbox: (ref: Reference) => void;
}

type ApplicationLayerTab = 'directive' | 'constants' | 'engine';

interface DynamicShortcut {
  id: string;
  label: string;
  icon: string;
  prompt: string;
  category: 'identity' | 'editorial' | 'packaging' | 'digital' | 'space';
}

export const SystemApplicationView: React.FC<SystemApplicationViewProps> = ({
  project,
  system,
  onBackToSystem,
  onOpenLightbox,
}) => {
  // Assigned confirmed patterns in this system
  const assignedPatterns = project.patterns.filter(p => system.patternIds.includes(p.id));
  const relevantRefIds = Array.from(new Set(assignedPatterns.flatMap(p => p.evidence)));
  const relevantReferences = project.references.filter(r => relevantRefIds.includes(r.id));

  // Layer navigation state
  const [activeLayer, setActiveLayer] = useState<ApplicationLayerTab>('directive');

  // User prompt description & AI Engine state
  const [userDescription, setUserDescription] = useState('');
  const [aiEngine, setAiEngine] = useState<AIEngineType>('openai_dalle3');
  
  // Selectable System Resources
  const [selectedResources, setSelectedResources] = useState<Record<SystemResourceKey, boolean>>({
    palette: true,
    typography: true,
    texture: true,
    composition: true,
    graphic_elements: true,
    illustration: false,
    photography: true,
  });

  // Iteration & Style Anchor State
  const [iterationText, setIterationText] = useState('');
  const [iterations, setIterations] = useState<ApplicationIteration[]>([]);
  const [activeIterationIdx, setActiveIterationIdx] = useState<number>(-1);
  const [anchorIterationId, setAnchorIterationId] = useState<string | null>(null);

  // Export Modal State

  // Inspector de Prompt Maestro
  const [showPromptInspector, setShowPromptInspector] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // Generation Loading & Feedback
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Toggle Resource Checkbox
  const handleToggleResource = (key: SystemResourceKey) => {
    setSelectedResources(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Current active result
  const currentIteration = activeIterationIdx >= 0 && activeIterationIdx < iterations.length
    ? iterations[activeIterationIdx]
    : iterations[iterations.length - 1] || null;

  const anchoredIteration = iterations.find(it => it.id === anchorIterationId) || null;

  // Filter evidence references for selected resources
  const getResourceEvidence = (category: string) => {
    const matchingPatterns = assignedPatterns.filter(p => p.category === category);
    const refIds = Array.from(new Set(matchingPatterns.flatMap(p => p.evidence)));
    return {
      patterns: matchingPatterns,
      references: project.references.filter(r => refIds.includes(r.id))
    };
  };

  // DYNAMIC SHORTCUTS GENERATOR based strictly on the selected system and project
  const getDynamicShortcuts = (): DynamicShortcut[] => {
    const sysName = system.name || 'Sistema Visual';
    const projName = project.name || 'Identidad';
    const colorSummary = system.colorPalette && system.colorPalette.length > 0
      ? system.colorPalette.map(c => c.name ? `${c.name} (${c.hex})` : c.hex).slice(0, 3).join(', ')
      : '';
    const typoRule = system.typographyRules?.[0] || 'la tipografía oficial del sistema';
    const textureRule = system.textureRules?.[0] || 'texturas y materiales característicos';
    const compositionRule = system.compositionRules?.[0] || 'composición y grilla del sistema';

    const hasPackagingPattern = assignedPatterns.some(
      p => p.category === 'packaging' || /pack|caja|envoltorio|botella|bolsa/i.test(p.name + p.description)
    ) || !!system.systemDetails?.packagingSystem;

    const shortcuts: DynamicShortcut[] = [];

    // 1. Identidad de Marca Clave
    const brandEssence = system.systemDetails?.brandEssence || system.description || projName;
    shortcuts.push({
      id: 'identity_main',
      label: 'Identidad Clave',
      icon: '✨',
      category: 'identity',
      prompt: `Pieza central de identidad para ${sysName} (${brandEssence.slice(0, 80)}...), integrando logotipo, paleta cromática ${colorSummary ? `[${colorSummary}]` : ''} y ${typoRule} sobre fondo neutro de estudio.`
    });

    // 2. Afiche / Pieza Gráfica Editorial
    const editorialContext = system.systemDetails?.graphicApplications 
      ? system.systemDetails.graphicApplications.slice(0, 90)
      : `aplicando ${compositionRule} y jerarquía tipográfica en ${typoRule}`;
    shortcuts.push({
      id: 'editorial_poster',
      label: 'Afiche / Editorial',
      icon: '📄',
      category: 'editorial',
      prompt: `Afiche de comunicación de gran formato para ${sysName}, estructurado con ${editorialContext}, acentos cromáticos ${colorSummary} y acabado de estudio.`
    });

    // 3. Packaging o Soporte Físico representativo
    if (hasPackagingPattern || system.systemDetails?.packagingSystem) {
      const packDetail = system.systemDetails?.packagingSystem 
        ? system.systemDetails.packagingSystem.slice(0, 90) 
        : `soporte físico con acabado táctil de ${textureRule}`;
      shortcuts.push({
        id: 'packaging_piece',
        label: 'Packaging & Envase',
        icon: '📦',
        category: 'packaging',
        prompt: `Diseño y aplicación de packaging para ${sysName} (${packDetail}), con fidelidad táctil, materialidad de ${textureRule} y paleta ${colorSummary}.`
      });
    } else {
      shortcuts.push({
        id: 'merch_tangible',
        label: 'Soporte Tangible / Merch',
        icon: '🏷️',
        category: 'packaging',
        prompt: `Aplicación física de marca sobre soporte o merchandising exclusivo de ${sysName}, con textura de ${textureRule} y acabados de precisión.`
      });
    }

    // 4. Social & Digital Media
    const digitalDetail = system.systemDetails?.digitalAndSocialMedia 
      ? system.systemDetails.digitalAndSocialMedia.slice(0, 90)
      : `formato digital con composición ${compositionRule}`;
    shortcuts.push({
      id: 'digital_social',
      label: 'Social & Digital',
      icon: '📱',
      category: 'digital',
      prompt: `Pieza de comunicación digital y redes sociales para ${projName} aplicando la identidad de ${sysName} (${digitalDetail}) y colores ${colorSummary}.`
    });

    // 5. Espacio & Señalética
    shortcuts.push({
      id: 'spatial_signage',
      label: 'Espacio & Señalética',
      icon: '🏢',
      category: 'space',
      prompt: `Aplicación en entorno espacial, marquesina o señalética corporativa para ${sysName}, iluminación ambiental fotorrealista y materiales con textura de ${textureRule}.`
    });

    return shortcuts;
  };

  // DYNAMIC STYLE MODIFIERS
  const getDynamicStyleModifiers = () => {
    const colorHexList = system.colorPalette?.map(c => c.hex).join(', ') || '';
    const texture = system.textureRules?.[0] || 'texturas táctiles del sistema';

    return [
      {
        label: 'Studio Fondo Neutro',
        icon: '🏷️',
        text: 'Aislar objeto sobre fondo neutro de estudio profesional sin escenas 3D adicionales ni distractores.',
      },
      {
        label: 'Contraste HEX Estricto',
        icon: '🎨',
        text: colorHexList 
          ? `Maximizar contraste cromático utilizando estrictamente la paleta HEX: ${colorHexList}.`
          : 'Maximizar contraste cromático utilizando estrictamente los colores oficiales del sistema.',
      },
      {
        label: 'Plano Vectorial 2D',
        icon: '📐',
        text: 'Formato plano 2D vectorial limpio, sin perspectiva 3D ni distorsión volumétrica.',
      },
      {
        label: 'Textura & Acabado Real',
        icon: '✨',
        text: `Enfatizar materialidad y acabado táctil: ${texture}.`,
      },
    ];
  };

  // Dynamic system details extraction for resource cards
  const getResourceContent = (category: string): string => {
    if (category === 'palette') {
      return system.colorPalette?.length 
        ? `${system.colorPalette.length} tonos oficiales` 
        : 'Paleta cromática del sistema';
    }
    if (category === 'typography') {
      return system.typographyRules?.[0] 
        || assignedPatterns.find(p => p.category === 'typography')?.description
        || 'Jerarquía tipográfica y tratamiento de fuentes del sistema';
    }
    if (category === 'texture') {
      return system.textureRules?.[0] 
        || assignedPatterns.find(p => p.category === 'texture')?.description
        || 'Sustratos, acabados y materialidad táctil confirmada';
    }
    if (category === 'composition') {
      return system.compositionRules?.[0] 
        || assignedPatterns.find(p => p.category === 'composition')?.description
        || 'Criterios de composición perimetral y reticulado';
    }
    if (category === 'graphic_elements') {
      const match = assignedPatterns.find(p => p.category === 'graphic_elements' || p.category === 'logo_identity');
      return match?.name 
        ? `${match.name}: ${match.description.slice(0, 90)}...`
        : system.systemDetails?.logoAndIdentity 
          ? system.systemDetails.logoAndIdentity.slice(0, 100)
          : 'Constantes gráficas, sellos y elementos secundarios del sistema';
    }
    if (category === 'photography') {
      const match = assignedPatterns.find(p => p.category === 'photography_treatment');
      return match?.description 
        || system.systemDetails?.photographyStyle 
        || 'Iluminación y tratamiento de imagen fotorrealista coherente con el sistema';
    }
    return 'Regla activa del sistema';
  };

  // Reemplaza la lógica que dibuja la tarjeta por render de imagen
  const mostrarPiezaVisualGenerada = (urlImagenReal: string, promptUtilizado: string, textoUsuario: string) => {
    const contenedorCanvasCentral = document.getElementById("canvas-visualizador-central");
    if (!contenedorCanvasCentral) return;
    contenedorCanvasCentral.innerHTML = "";

    const imgElement = document.createElement("img");
    imgElement.src = urlImagenReal;
    imgElement.alt = textoUsuario;
    imgElement.className = "w-full h-full object-contain rounded-xl shadow-2xl";

    const footerInspector = document.createElement("div");
    footerInspector.className = "absolute bottom-4 left-4 right-4 bg-black/80 backdrop-blur-md p-3 rounded-lg text-xs text-zinc-400 border border-zinc-800 flex justify-between items-center z-10";
    footerInspector.innerHTML = `
      <span>Solicitud: "${textoUsuario}"</span>
      <button id="btn-inspect-prompt" class="text-emerald-400 hover:underline">&lt;/&gt; Ver Prompt Maestro</button>
    `;

    const inspectBtn = footerInspector.querySelector("#btn-inspect-prompt");
    if (inspectBtn) {
      inspectBtn.addEventListener("click", () => {
        setShowPromptInspector(prev => !prev);
      });
    }

    contenedorCanvasCentral.appendChild(imgElement);
    contenedorCanvasCentral.appendChild(footerInspector);
  };

  if (typeof window !== "undefined") {
    (window as any).mostrarPiezaVisualGenerada = mostrarPiezaVisualGenerada;
  }

  // Master Prompt builder
  const constructMasterPrompt = (isRevision = false): string => {
    const nombreProyecto = project.name || system.name;
    const objetivoProyecto = project.objective || "Branding y Sistema de Identidad Visual";
    const rawUserText = isRevision
      ? `${userDescription.trim()} (Ajuste solicitado por el diseñador: ${iterationText.trim()})`
      : userDescription.trim() || `Pieza de aplicación de marca oficial para ${system.name}`;

    const hexColors = (selectedResources.palette && system.colorPalette && system.colorPalette.length > 0)
      ? system.colorPalette.map(c => `${c.name ? `${c.name} ` : ''}(${c.hex})`).join(", ")
      : "";

    const tipografiaReglas = (selectedResources.typography && system.typographyRules && system.typographyRules.length > 0)
      ? system.typographyRules.slice(0, 2).join(". ")
      : "";

    const composicionReglas = (selectedResources.composition && system.compositionRules && system.compositionRules.length > 0)
      ? system.compositionRules.slice(0, 1).join(". ")
      : "";

    const textLower = rawUserText.toLowerCase().trim();
    const isLogo = /\b(logo|logotipo|isotipo|monograma|sello|emblema|marca|isologo)\b/i.test(textLower);
    const isFlyer = /\b(flyer|afiche|poster|volante|folleto|publicidad|aviso)\b/i.test(textLower);
    const isPackaging = /\b(envoltorio|papel|packaging|bolsa|caja|vaso|servilleta|etiqueta|envase)\b/i.test(textLower);
    const isSpatial = /\b(pared|fachada|marquesina|local|interior|mostrador|cartel|espacio)\b/i.test(textLower);

    let formatDirective = "";
    if (isLogo) {
      formatDirective = "FORMAT: Clean 2D flat vector logo design isolated on a solid neutral background. Crisp graphic mark.";
    } else if (isFlyer) {
      formatDirective = "FORMAT: Flat 2D graphic design print flyer / poster layout preview. Crisp typography and editorial composition.";
    } else if (isPackaging) {
      formatDirective = "FORMAT: Isolated product packaging mockup, tactile substrate, studio flat lay photography with soft lighting.";
    } else if (isSpatial) {
      formatDirective = "FORMAT: Spatial architectural environment mockup, store signage render with realistic lighting.";
    } else {
      formatDirective = "FORMAT: Focused professional graphic design representation strictly showing the requested item.";
    }

    const anchorDirective = anchoredIteration
      ? `\nVISUAL STYLE CONTINUITY ANCHOR: Maintain strict 100% aesthetic coherence, material finish, lighting style, and graphic language established in primary brand piece (${anchoredIteration.note || 'Anchored Brand Piece'}).`
      : "";

    const promptMaestroReal = `
Direct Subject Requested by Designer: "${rawUserText}".
Brand Context: ${nombreProyecto} (${objetivoProyecto}) — System: "${system.name}".
Execution Goal: ${formatDirective}${anchorDirective}

Brand Design System Parameters to follow strictly:
${hexColors ? `- Color Palette (HEX): ${hexColors}.` : ''}
${tipografiaReglas ? `- Typography Style: ${tipografiaReglas}.` : ''}
${composicionReglas ? `- Composition Rules: ${composicionReglas}.` : ''}

Strict Directive: Render ONLY the requested subject "${rawUserText}". Do NOT add extra background environments or clutter unless explicitly requested.
`.trim();

    return promptMaestroReal;
  };

  const handleCopyPrompt = async () => {
    const p = constructMasterPrompt(false);
    try {
      await navigator.clipboard.writeText(p);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    } catch {
      // Fallback
    }
  };

  // Generation Trigger
  const handleGenerate = async (isRevision = false) => {
    const engineNames: Record<AIEngineType, string> = {
      openai_dalle3: 'OpenAI DALL-E 3',
      huggingface_sdxl: 'Stable Diffusion XL (Hugging Face)',
      svg_vector: 'Boceto Vectorial SVG',
    };
    const currentEngineName = engineNames[aiEngine] || 'Motor de IA';
    setGenerationStep(isRevision ? `Iterando aplicación con ${currentEngineName}...` : `Directiva de Arte: Renderizando con ${currentEngineName}...`);
    setIsGenerating(true);
    setErrorMessage(null);

    try {
      const activeDescription = userDescription.trim() || `Pieza de identidad visual oficial de ${system.name} para ${project.name}`;
      const promptParaAIStudio = constructMasterPrompt(isRevision);

      const payload = {
        prompt: promptParaAIStudio,
        projectName: project.name,
        system,
        confirmedPatterns: assignedPatterns,
        selectedResources,
        relevantReferences,
        userDescription: activeDescription,
        iterationPrompt: isRevision ? iterationText.trim() : undefined,
        previousImageUrl: currentIteration?.imageUrl || undefined,
        aiEngine,
        objective: project.objective,
        context: project.description,
      };

      const response = await fetch('/api/generate-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();
      let result: any = null;
      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error('El servidor tardó en responder. Por favor, reintenta.');
      }

      if (!response.ok || !result.success) {
        throw new Error(result.error || result.details || 'Error al generar la visualización');
      }

      const newIteration: ApplicationIteration = {
        id: `iter_${Date.now()}`,
        imageUrl: result.data.imageUrl,
        svgMockup: result.data.svgCode,
        aspectRatio: result.data.aspectRatio || '1:1',
        iterationPrompt: isRevision ? iterationText.trim() : undefined,
        promptUsed: result.data.promptUsed || promptParaAIStudio,
        appliedResources: result.data.appliedResources || Object.keys(selectedResources).filter(k => selectedResources[k as SystemResourceKey]),
        timestamp: new Date().toISOString(),
        note: isRevision ? `Iteración: "${iterationText.trim()}"` : `Directiva de Arte: ${activeDescription.slice(0, 60)}...`,
        engineUsed: result.data.modelUsed || currentEngineName,
      };

      setIterations(prev => [...prev, newIteration]);
      setActiveIterationIdx(iterations.length);
      if (isRevision) {
        setIterationText('');
      }
    } catch (err: any) {
      console.error("Error generating visual application:", err);
      setErrorMessage(err.message || 'No se pudo generar la aplicación visual. Verificá la configuración del motor.');
    } finally {
      setIsGenerating(false);
      setGenerationStep('');
    }
  };

  const dynamicShortcuts = getDynamicShortcuts();
  const dynamicModifiers = getDynamicStyleModifiers();

  // Active resources count
  const activeResourcesCount = Object.values(selectedResources).filter(Boolean).length;

  return (
    <main id="system-application-view" className="flex-1 flex flex-col h-full bg-zinc-950 text-zinc-100 overflow-hidden select-none">
      {/* 1. Header with Breadcrumb & Export Manual Action */}
      <header className="h-14 border-b border-zinc-800 bg-zinc-900/95 px-6 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToSystem}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 hover:text-white transition-colors border border-zinc-700 font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver al sistema visual</span>
          </button>

          <div className="h-4 w-px bg-zinc-800" />

          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-emerald-950/90 text-emerald-300 text-[10px] font-mono border border-emerald-800 font-bold uppercase tracking-wider">
              APLICACIÓN DEL SISTEMA
            </span>
            <h1 className="text-sm font-bold text-zinc-100 truncate max-w-md">
              {system.name}
            </h1>
          </div>
        </div>

        {/* Action Header Items */}
        <div className="flex items-center gap-2.5">


          <div className="flex items-center gap-2 bg-gradient-to-r from-emerald-950/80 to-indigo-950/80 px-3 py-1.5 rounded-xl border border-emerald-700/50 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-zinc-200 font-bold text-xs">
              {aiEngine === 'openai_dalle3' && 'OpenAI DALL-E 3'}
              {aiEngine === 'huggingface_sdxl' && 'Stable Diffusion XL'}
              {aiEngine === 'svg_vector' && 'Motor Vectorial SVG'}
            </span>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono font-semibold border border-emerald-500/30">
              {aiEngine === 'openai_dalle3' && 'DALL-E 3'}
              {aiEngine === 'huggingface_sdxl' && 'SDXL'}
              {aiEngine === 'svg_vector' && 'Offline'}
            </span>
          </div>
        </div>
      </header>

      {/* 2. Main Workspace Split Layout: Layered Control Sidebar (Left) + Result Visualizer (Right) */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        
        {/* LEFT COLUMN: Layered Architecture for Intuitive Happy Path */}
        <div className="w-full lg:w-[480px] xl:w-[510px] border-r border-zinc-800 bg-zinc-900/70 flex flex-col min-h-0 shrink-0">
          
          {/* LAYER TABS HEADER (Seccionado por Capas) */}
          <div className="p-3 border-b border-zinc-800/80 bg-zinc-950/70 shrink-0">
            <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider mb-2 flex items-center justify-between px-1">
              <span className="font-bold flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                Flujo de Aplicación por Capas
              </span>
              <span className="text-zinc-500">
                {activeLayer === 'directive' ? 'Capa 1 de 3' : activeLayer === 'constants' ? 'Capa 2 de 3' : 'Capa 3 de 3'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 bg-zinc-900 p-1 rounded-xl border border-zinc-800">
              {/* Tab 1: Pieza & Directiva */}
              <button
                type="button"
                onClick={() => setActiveLayer('directive')}
                className={`py-2 px-2.5 rounded-lg text-xs font-semibold transition-all flex flex-col items-center justify-center gap-0.5 relative ${
                  activeLayer === 'directive'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/80 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-emerald-900/80 text-emerald-300 border border-emerald-700/60 flex items-center justify-center text-[9px] font-bold">1</span>
                  <span>Directiva</span>
                </div>
                <span className="text-[9.5px] opacity-75 font-normal truncate max-w-full">
                  {userDescription.trim() ? 'Definida' : 'Soporte / Pieza'}
                </span>
              </button>

              {/* Tab 2: Constantes (ADN) */}
              <button
                type="button"
                onClick={() => setActiveLayer('constants')}
                className={`py-2 px-2.5 rounded-lg text-xs font-semibold transition-all flex flex-col items-center justify-center gap-0.5 relative ${
                  activeLayer === 'constants'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/80 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-emerald-900/80 text-emerald-300 border border-emerald-700/60 flex items-center justify-center text-[9px] font-bold">2</span>
                  <span>ADN Visual</span>
                </div>
                <span className="text-[9.5px] opacity-75 font-normal truncate max-w-full">
                  {activeResourcesCount} reglas activas
                </span>
              </button>

              {/* Tab 3: Motor & Render */}
              <button
                type="button"
                onClick={() => setActiveLayer('engine')}
                className={`py-2 px-2.5 rounded-lg text-xs font-semibold transition-all flex flex-col items-center justify-center gap-0.5 relative ${
                  activeLayer === 'engine'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/80 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-emerald-900/80 text-emerald-300 border border-emerald-700/60 flex items-center justify-center text-[9px] font-bold">3</span>
                  <span>Motor</span>
                </div>
                <span className="text-[9.5px] opacity-75 font-normal truncate max-w-full">
                  {aiEngine === 'openai_dalle3' ? 'DALL-E 3' : aiEngine === 'huggingface_sdxl' ? 'SDXL' : 'Vector SVG'}
                </span>
              </button>
            </div>
          </div>

          {/* SCROLLABLE LAYER CONTENT */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5 min-h-0">

            {/* ======================================================== */}
            {/* CAPA 1: DEFINICIÓN DE LA PIEZA & DIRECTIVA DE ARTE */}
            {/* ======================================================== */}
            {activeLayer === 'directive' && (
              <div className="space-y-4 animate-in fade-in duration-200">
                
                {/* Dynamic System Context Banner */}
                <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 flex items-start justify-between gap-3 shadow-inner">
                  <div className="space-y-0.5">
                    <span className="text-[10px] uppercase font-mono font-bold text-emerald-400 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      Sistema Activo: {system.name}
                    </span>
                    <p className="text-[11px] text-zinc-400 leading-snug line-clamp-2">
                      {system.description || project.objective || 'Identidad visual y aplicaciones coherentes de diseño.'}
                    </p>
                  </div>
                </div>

                {/* Style Anchor Callout if present */}
                {anchoredIteration && (
                  <div className="p-2.5 bg-amber-950/70 border border-amber-800/80 rounded-xl text-xs flex items-center justify-between text-amber-200 shadow-inner">
                    <div className="flex items-center gap-2 truncate">
                      <Anchor className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-bounce" />
                      <span className="truncate text-[11px]">
                        <strong>Estilo Anclado Activo:</strong> Referencia v{iterations.findIndex(i => i.id === anchorIterationId) + 1}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAnchorIterationId(null)}
                      className="text-[10px] text-amber-400 font-mono underline hover:text-amber-200 ml-2 shrink-0 font-bold"
                    >
                      Desanclar
                    </button>
                  </div>
                )}

                {/* Dynamic Quick Shortcuts / Soportes Inteligentes */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-200 font-mono uppercase tracking-wider flex items-center gap-1.5">
                      <span>Atajos de Aplicación para este Sistema</span>
                    </label>
                    <span className="text-[10px] text-emerald-400 font-mono">Dinámico • 1 Clic</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {dynamicShortcuts.map((sc) => (
                      <button
                        key={sc.id}
                        type="button"
                        onClick={() => setUserDescription(sc.prompt)}
                        className="p-2.5 rounded-xl bg-zinc-950/90 hover:bg-zinc-800 text-left border border-zinc-800/90 hover:border-emerald-700/80 transition-all group shadow-sm flex flex-col justify-between gap-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-zinc-200 group-hover:text-emerald-300 flex items-center gap-1.5">
                            <span>{sc.icon}</span>
                            <span>{sc.label}</span>
                          </span>
                          <span className="text-[10px] text-zinc-500 group-hover:text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            Aplicar →
                          </span>
                        </div>
                        <p className="text-[10.5px] text-zinc-400 line-clamp-2 leading-relaxed">
                          {sc.prompt}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* User Prompt Textarea */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <label htmlFor="tu-input-de-texto" className="text-xs font-bold text-zinc-200 font-mono uppercase tracking-wider">
                      Instrucción Personalizada del Diseñador
                    </label>
                    {userDescription && (
                      <button
                        type="button"
                        onClick={() => setUserDescription('')}
                        className="text-[10px] text-zinc-500 hover:text-zinc-300 underline"
                      >
                        Limpiar
                      </button>
                    )}
                  </div>

                  <textarea
                    id="tu-input-de-texto"
                    value={userDescription}
                    onChange={e => setUserDescription(e.target.value)}
                    rows={4}
                    placeholder={`Describí el soporte o pieza para ${system.name} (ej: portada editorial, packaging, afiche tipográfico, merch o fachada)...`}
                    className="w-full text-xs bg-zinc-950 border border-zinc-700/80 rounded-xl p-3.5 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 resize-none leading-relaxed shadow-inner"
                  />
                </div>

                {/* Dynamic Style Modifiers (1-click append) */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-zinc-400 font-bold uppercase tracking-wider">
                      Directivas de Acabado Visual (Añadir al final)
                    </span>
                    <span className="text-[10px] text-zinc-500">Opcional</span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {dynamicModifiers.map((mod, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setUserDescription(prev => prev ? `${prev} ${mod.text}` : mod.text);
                        }}
                        className="text-[10px] px-2.5 py-1 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/60 transition-colors flex items-center gap-1 font-mono"
                        title={mod.text}
                      >
                        <span>{mod.icon}</span>
                        <span>{mod.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Layer Progression Helper */}
                <div className="pt-2 flex items-center justify-between border-t border-zinc-800/80">
                  <span className="text-[11px] text-zinc-500">¿Revisar reglas del sistema antes de renderizar?</span>
                  <button
                    type="button"
                    onClick={() => setActiveLayer('constants')}
                    className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                  >
                    <span>Capa 2: Constantes (ADN)</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

              </div>
            )}

            {/* ======================================================== */}
            {/* CAPA 2: CONSTANTES DEL SISTEMA VISUAL (ADN & RECURSOS) */}
            {/* ======================================================== */}
            {activeLayer === 'constants' && (
              <div className="space-y-4 animate-in fade-in duration-200">
                
                <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-zinc-200">Constantes de Marca a Transferir</h3>
                    <p className="text-[11px] text-zinc-400">Activá o desactivá los componentes de ADN que alimentan el render:</p>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
                    {activeResourcesCount} de 6 activas
                  </span>
                </div>

                {/* Resource Checkboxes list */}
                <div className="space-y-2.5 bg-zinc-950/70 p-3.5 rounded-xl border border-zinc-800">
                  
                  {/* Palette Resource */}
                  <div className="space-y-1.5 pb-2.5 border-b border-zinc-800/80">
                    <label className="flex items-center justify-between cursor-pointer group">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedResources.palette}
                          onChange={() => handleToggleResource('palette')}
                          className="w-4 h-4 rounded text-emerald-600 bg-zinc-900 border-zinc-700 focus:ring-emerald-500"
                        />
                        <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                          <Palette className="w-3.5 h-3.5 text-amber-400" />
                          Paleta cromática oficial
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-zinc-500">
                        {system.colorPalette?.length || 0} tonos
                      </span>
                    </label>

                    {selectedResources.palette && system.colorPalette && (
                      <div className="pl-6 flex flex-wrap gap-1.5 items-center pt-1">
                        {system.colorPalette.map((c, i) => (
                          <div key={i} className="flex items-center gap-1 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800 text-[10px]">
                            <span className="w-2.5 h-2.5 rounded-full border border-white/20" style={{ backgroundColor: c.hex }} />
                            <span className="text-zinc-300 font-mono">{c.hex}</span>
                            {c.name && <span className="text-zinc-500">({c.name})</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Typography Resource */}
                  <div className="space-y-1.5 pb-2.5 border-b border-zinc-800/80">
                    <label className="flex items-center justify-between cursor-pointer group">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedResources.typography}
                          onChange={() => handleToggleResource('typography')}
                          className="w-4 h-4 rounded text-emerald-600 bg-zinc-900 border-zinc-700 focus:ring-emerald-500"
                        />
                        <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                          <TypeIcon className="w-3.5 h-3.5 text-sky-400" />
                          Estilo tipográfico
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {getResourceEvidence('typography').references.length} refs
                      </span>
                    </label>
                    {selectedResources.typography && (
                      <p className="pl-6 text-[11px] text-zinc-400 leading-normal">
                        {getResourceContent('typography')}
                      </p>
                    )}
                  </div>

                  {/* Texture Resource */}
                  <div className="space-y-1.5 pb-2.5 border-b border-zinc-800/80">
                    <label className="flex items-center justify-between cursor-pointer group">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedResources.texture}
                          onChange={() => handleToggleResource('texture')}
                          className="w-4 h-4 rounded text-emerald-600 bg-zinc-900 border-zinc-700 focus:ring-emerald-500"
                        />
                        <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                          Texturas, Materiales & Acabados
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {getResourceEvidence('texture').references.length} refs
                      </span>
                    </label>
                    {selectedResources.texture && (
                      <p className="pl-6 text-[11px] text-zinc-400 leading-normal">
                        {getResourceContent('texture')}
                      </p>
                    )}
                  </div>

                  {/* Composition Resource */}
                  <div className="space-y-1.5 pb-2.5 border-b border-zinc-800/80">
                    <label className="flex items-center justify-between cursor-pointer group">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedResources.composition}
                          onChange={() => handleToggleResource('composition')}
                          className="w-4 h-4 rounded text-emerald-600 bg-zinc-900 border-zinc-700 focus:ring-emerald-500"
                        />
                        <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                          <Grid className="w-3.5 h-3.5 text-indigo-400" />
                          Criterios de Composición & Grilla
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {getResourceEvidence('composition').references.length} refs
                      </span>
                    </label>
                    {selectedResources.composition && (
                      <p className="pl-6 text-[11px] text-zinc-400 leading-normal">
                        {getResourceContent('composition')}
                      </p>
                    )}
                  </div>

                  {/* Graphic Elements Resource */}
                  <div className="space-y-1.5 pb-2.5 border-b border-zinc-800/80">
                    <label className="flex items-center justify-between cursor-pointer group">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedResources.graphic_elements}
                          onChange={() => handleToggleResource('graphic_elements')}
                          className="w-4 h-4 rounded text-emerald-600 bg-zinc-900 border-zinc-700 focus:ring-emerald-500"
                        />
                        <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                          <Compass className="w-3.5 h-3.5 text-emerald-400" />
                          Recursos Gráficos / Logomarca / Sellos
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {getResourceEvidence('graphic_elements').references.length} refs
                      </span>
                    </label>
                    {selectedResources.graphic_elements && (
                      <p className="pl-6 text-[11px] text-zinc-400 leading-normal">
                        {getResourceContent('graphic_elements')}
                      </p>
                    )}
                  </div>

                  {/* Photography Treatment Resource */}
                  <div className="space-y-1.5">
                    <label className="flex items-center justify-between cursor-pointer group">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedResources.photography}
                          onChange={() => handleToggleResource('photography')}
                          className="w-4 h-4 rounded text-emerald-600 bg-zinc-900 border-zinc-700 focus:ring-emerald-500"
                        />
                        <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                          <Camera className="w-3.5 h-3.5 text-rose-400" />
                          Tratamiento Fotográfico & Iluminación
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {getResourceEvidence('photography_treatment').references.length} refs
                      </span>
                    </label>
                    {selectedResources.photography && (
                      <p className="pl-6 text-[11px] text-zinc-400 leading-normal">
                        {getResourceContent('photography')}
                      </p>
                    )}
                  </div>

                </div>

                {/* Evidence Grid of Canvas References */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-200 font-mono uppercase tracking-wider">
                      Evidencias Visuales Sustentantes
                    </span>
                    <span className="text-[10px] font-mono text-emerald-400">
                      {relevantReferences.length} referencias en canvas
                    </span>
                  </div>

                  {relevantReferences.length > 0 ? (
                    <div className="grid grid-cols-4 gap-2 bg-zinc-950/70 p-3 rounded-xl border border-zinc-800">
                      {relevantReferences.map(ref => (
                        <div
                          key={ref.id}
                          onClick={() => onOpenLightbox(ref)}
                          className="aspect-[3/4] rounded-lg bg-zinc-900 border border-zinc-700 overflow-hidden relative group cursor-pointer hover:border-emerald-500 transition-all shadow-sm"
                          title={`${ref.name} (Clic para agrandar)`}
                        >
                          <img
                            src={ref.image}
                            alt={ref.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-1.5 flex flex-col justify-end">
                            <span className="text-[9px] font-mono font-bold text-emerald-300 truncate">
                              {ref.id}
                            </span>
                            <span className="text-[9px] text-zinc-200 truncate">
                              {ref.name}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500 italic p-3 bg-zinc-950 rounded-xl border border-zinc-800">
                      No hay referencias directas asignadas al sistema.
                    </p>
                  )}
                </div>

                {/* Layer Progression Helpers */}
                <div className="pt-2 flex items-center justify-between border-t border-zinc-800/80">
                  <button
                    type="button"
                    onClick={() => setActiveLayer('directive')}
                    className="text-xs font-semibold text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Capa 1: Directiva</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveLayer('engine')}
                    className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                  >
                    <span>Capa 3: Motor de IA</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

              </div>
            )}

            {/* ======================================================== */}
            {/* CAPA 3: MOTOR DE GENERACIÓN & INSPECTOR DE PROMPT */}
            {/* ======================================================== */}
            {activeLayer === 'engine' && (
              <div className="space-y-4 animate-in fade-in duration-200">
                
                <div className="space-y-1">
                  <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider font-mono">
                    Selección de Motor de Generación
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Elegí el modelo adecuado según tus necesidades de resolución y API:
                  </p>
                </div>

                {/* Engine Cards */}
                <div className="space-y-2">
                  {/* Option 1: OpenAI DALL-E 3 */}
                  <div
                    onClick={() => setAiEngine('openai_dalle3')}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      aiEngine === 'openai_dalle3'
                        ? 'bg-emerald-950/80 border-emerald-500 shadow-md shadow-emerald-950/50'
                        : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base">⚡</span>
                        <span className="text-xs font-bold text-zinc-100">OpenAI DALL-E 3</span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-300 border border-emerald-700/60 font-semibold">
                        Recomendado • Fotorrealista
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      Interpreta la directiva de arte creando piezas de branding fotorrealistas de alta resolución con iluminación cinematográfica y fidelidad de materiales.
                    </p>
                  </div>

                  {/* Option 2: Hugging Face SDXL */}
                  <div
                    onClick={() => setAiEngine('huggingface_sdxl')}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      aiEngine === 'huggingface_sdxl'
                        ? 'bg-emerald-950/80 border-emerald-500 shadow-md shadow-emerald-950/50'
                        : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base">🤗</span>
                        <span className="text-xs font-bold text-zinc-100">Stable Diffusion XL (Hugging Face)</span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 font-semibold">
                        Token Gratis
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      Render fotográfico alternativo a través de Hugging Face Inference API utilizando tu token gratuito.
                    </p>
                  </div>

                  {/* Option 3: SVG Vector */}
                  <div
                    onClick={() => setAiEngine('svg_vector')}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      aiEngine === 'svg_vector'
                        ? 'bg-emerald-950/80 border-emerald-500 shadow-md shadow-emerald-950/50'
                        : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base">📐</span>
                        <span className="text-xs font-bold text-zinc-100">Boceto Vectorial SVG</span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 font-semibold">
                        100% Offline
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      Genera un esquema de diseño plano y modular en código SVG sin requerir conexión a internet ni consumo de tokens.
                    </p>
                  </div>
                </div>

                {/* Master Prompt Inspector (Capa Técnica) */}
                <div className="pt-2 space-y-2 border-t border-zinc-800">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setShowPromptInspector(!showPromptInspector)}
                      className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-300 hover:text-emerald-300 transition-colors"
                    >
                      <Code className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{showPromptInspector ? 'Ocultar Prompt Maestro' : 'Inspeccionar Prompt Maestro (Google AI Studio / Imagen)'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleCopyPrompt}
                      className="inline-flex items-center gap-1 text-[10px] font-mono px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
                    >
                      {copiedPrompt ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400 font-bold">Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-zinc-400" />
                          <span>Copiar prompt</span>
                        </>
                      )}
                    </button>
                  </div>

                  {showPromptInspector && (
                    <div className="p-3.5 bg-zinc-950 rounded-xl border border-emerald-900/50 text-[10.5px] font-mono text-zinc-300 leading-relaxed whitespace-pre-wrap select-text shadow-inner">
                      {constructMasterPrompt(false)}
                    </div>
                  )}
                </div>

                {/* Layer Progression Helpers */}
                <div className="pt-2 flex items-center justify-between border-t border-zinc-800/80">
                  <button
                    type="button"
                    onClick={() => setActiveLayer('constants')}
                    className="text-xs font-semibold text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Capa 2: Constantes (ADN)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveLayer('directive')}
                    className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                  >
                    <span>Capa 1: Directiva</span>
                  </button>
                </div>

              </div>
            )}

          </div>

          {/* PERSISTENT BOTTOM ACTION BAR (HAPPY PATH CTA) */}
          <div className="p-4 bg-zinc-950 border-t border-zinc-800/80 space-y-2 shrink-0">
            {errorMessage && (
              <div className="p-2.5 bg-red-950/80 border border-red-800 rounded-xl text-xs text-red-200 flex items-start gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            <button
              onClick={() => handleGenerate(false)}
              disabled={isGenerating}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white font-bold text-xs tracking-wide shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-emerald-400/30 group"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-200" />
                  <span>{generationStep || 'Renderizando aplicación visual...'}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-emerald-200 group-hover:scale-110 transition-transform" />
                  <span>
                    Generar pieza visual con {
                      aiEngine === 'openai_dalle3' ? 'OpenAI DALL-E 3' :
                      aiEngine === 'huggingface_sdxl' ? 'SDXL (Hugging Face)' : 'Boceto Vectorial SVG'
                    }
                  </span>
                </>
              )}
            </button>
          </div>

        </div>

        {/* RIGHT COLUMN: Visualization Result & Iteration Engine */}
        <div className="flex-1 bg-zinc-950 flex flex-col overflow-y-auto p-6 space-y-6">
          
          {/* Main Visualization Display */}
          {!currentIteration ? (
            <div className="flex-1 min-h-[420px] flex flex-col items-center justify-center text-center p-8 bg-zinc-900/30 rounded-2xl border border-zinc-800/80 border-dashed space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-950/60 border border-emerald-800/60 flex items-center justify-center text-emerald-400 shadow-inner">
                <Sparkles className="w-8 h-8" />
              </div>

              <div className="space-y-1.5 max-w-lg">
                <h3 className="text-base font-bold text-zinc-100">
                  Listo para renderizar: {system.name}
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Configurá el soporte en la <strong className="text-emerald-300">Capa 1 (Directiva)</strong> o hacé clic en el botón inferior para materializar una pieza de identidad de alta fidelidad con <strong className="text-indigo-300">{aiEngine === 'openai_dalle3' ? 'OpenAI DALL-E 3' : aiEngine === 'huggingface_sdxl' ? 'Stable Diffusion XL' : 'Motor Vectorial SVG'}</strong>.
                </p>
              </div>

              {/* Sample Quick Action */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => {
                    if (!userDescription) {
                      const firstPreset = dynamicShortcuts[0]?.prompt || `Identidad clave para ${system.name}`;
                      setUserDescription(firstPreset);
                    }
                    handleGenerate(false);
                  }}
                  disabled={isGenerating}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-md transition-all flex items-center gap-2 border border-emerald-400/30"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Renderizar Pieza de Identidad Oficial</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* Image & System Breakdown Grid */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                
                {/* Result Image Presentation */}
                <div className="xl:col-span-8 bg-zinc-900/80 p-4 rounded-2xl border border-zinc-800 shadow-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-xs font-bold text-zinc-200">
                        Pieza Visual — Versión {activeIterationIdx + 1}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 text-[10px] font-mono border border-indigo-800/70">
                        {currentIteration.engineUsed || 'Render Engine'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setAnchorIterationId(anchorIterationId === currentIteration.id ? null : currentIteration.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 border transition-all ${
                          anchorIterationId === currentIteration.id
                            ? 'bg-amber-950/90 text-amber-300 border-amber-600 shadow-sm'
                            : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
                        }`}
                        title={anchorIterationId === currentIteration.id ? 'Desanclar referencia de estilo' : 'Anclar como Referencia de Estilo de la Marca para siguientes piezas'}
                      >
                        <Anchor className="w-3.5 h-3.5 text-amber-400" />
                        <span>{anchorIterationId === currentIteration.id ? 'Estilo Anclado' : 'Anclar Estilo'}</span>
                      </button>

                      <a
                        href={currentIteration.imageUrl}
                        download={`aplicacion_${system.name.toLowerCase().replace(/\s+/g, '_')}_v${activeIterationIdx + 1}.png`}
                        className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 transition-colors"
                        title="Descargar imagen generada"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    </div>
                  </div>

                  {/* Main Visual Mockup Frame / Canvas Visualizador Central */}
                  <div
                    id="canvas-visualizador-central"
                    className="relative rounded-xl overflow-hidden bg-black/60 border border-zinc-800 flex items-center justify-center min-h-[420px] max-h-[600px]"
                  >
                    <img
                      src={currentIteration.imageUrl}
                      alt={userDescription || `Aplicación del sistema ${system.name}`}
                      className="w-full h-full object-contain rounded-xl shadow-2xl"
                      referrerPolicy="no-referrer"
                    />

                    {/* Panel inferior flotante */}
                    <div className="absolute bottom-4 left-4 right-4 bg-black/80 backdrop-blur-md p-3 rounded-lg text-xs text-zinc-400 border border-zinc-800 flex justify-between items-center z-10 shadow-lg">
                      <span className="truncate mr-3">Solicitud: "{userDescription || system.name}"</span>
                      <button
                        type="button"
                        onClick={() => setShowPromptInspector(prev => !prev)}
                        className="text-emerald-400 hover:underline shrink-0 font-mono text-[11px]"
                      >
                        &lt;/&gt; Ver Prompt Maestro
                      </button>
                    </div>
                  </div>

                  {/* Result Note & Prompt Inspector */}
                  <div className="pt-2 border-t border-zinc-800/60 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-zinc-400">
                        {currentIteration.note || `Render generado con iluminación cinematográfica y materiales fotorrealistas.`}
                      </span>
                      {currentIteration.promptUsed && (
                        <button
                          type="button"
                          onClick={() => setShowPromptInspector(!showPromptInspector)}
                          className="text-[10.5px] font-mono text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors"
                        >
                          <Code className="w-3.5 h-3.5" />
                          <span>{showPromptInspector ? 'Ocultar Prompt Maestro' : 'Ver Prompt Maestro'}</span>
                        </button>
                      )}
                    </div>

                    {showPromptInspector && currentIteration.promptUsed && (
                      <div className="p-3 bg-zinc-950 rounded-xl border border-emerald-900/40 text-[10.5px] font-mono text-zinc-300 leading-relaxed whitespace-pre-wrap select-text shadow-inner">
                        {currentIteration.promptUsed}
                      </div>
                    )}
                  </div>
                </div>

                {/* Applied System & Evidence Summary Panel */}
                <div className="xl:col-span-4 space-y-4">
                  
                  {/* System Applied Box */}
                  <div className="p-4 bg-zinc-900/80 rounded-2xl border border-emerald-900/50 space-y-3">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 font-mono flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        ADN Visual Transferido
                      </h4>
                    </div>

                    <div className="space-y-2.5 text-xs">
                      {selectedResources.palette && system.colorPalette && system.colorPalette.length > 0 && (
                        <div className="flex items-start gap-2">
                          <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                          <div>
                            <span className="font-semibold text-zinc-200">Paleta Cromática:</span>
                            <div className="flex items-center gap-1 mt-1">
                              {system.colorPalette.slice(0, 5).map((c, i) => (
                                <span key={i} className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: c.hex }} title={`${c.name} (${c.hex})`} />
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {selectedResources.typography && (
                        <div className="flex items-start gap-2">
                          <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                          <div>
                            <span className="font-semibold text-zinc-200">Tipografía:</span>
                            <p className="text-[11px] text-zinc-400 mt-0.5">
                              {getResourceContent('typography')}
                            </p>
                          </div>
                        </div>
                      )}

                      {selectedResources.texture && (
                        <div className="flex items-start gap-2">
                          <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                          <div>
                            <span className="font-semibold text-zinc-200">Texturas & Materia:</span>
                            <p className="text-[11px] text-zinc-400 mt-0.5">
                              {getResourceContent('texture')}
                            </p>
                          </div>
                        </div>
                      )}

                      {selectedResources.composition && (
                        <div className="flex items-start gap-2">
                          <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                          <div>
                            <span className="font-semibold text-zinc-200">Composición & Grilla:</span>
                            <p className="text-[11px] text-zinc-400 mt-0.5">
                              {getResourceContent('composition')}
                            </p>
                          </div>
                        </div>
                      )}

                      {selectedResources.graphic_elements && (
                        <div className="flex items-start gap-2">
                          <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                          <div>
                            <span className="font-semibold text-zinc-200">Recursos Gráficos:</span>
                            <p className="text-[11px] text-zinc-400 mt-0.5">
                              {getResourceContent('graphic_elements')}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Supporting Canvas References */}
                  {relevantReferences.length > 0 && (
                    <div className="p-4 bg-zinc-900/80 rounded-2xl border border-zinc-800 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300 font-mono">
                          Evidencias del Canvas
                        </h4>
                        <span className="text-[10px] font-mono text-zinc-500">
                          {relevantReferences.length} refs
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5">
                        {relevantReferences.slice(0, 6).map(ref => (
                          <div
                            key={ref.id}
                            onClick={() => onOpenLightbox(ref)}
                            className="aspect-square rounded-lg bg-zinc-950 border border-zinc-800 overflow-hidden relative cursor-pointer hover:border-emerald-500 transition-colors"
                            title={ref.name}
                          >
                            <img
                              src={ref.image}
                              alt={ref.name}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                            <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-black/80 text-[8px] font-mono text-zinc-300">
                              {ref.id}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Iterations History Thumbnails */}
                  {iterations.length > 1 && (
                    <div className="p-3.5 bg-zinc-900/80 rounded-2xl border border-zinc-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase font-semibold text-zinc-400 flex items-center gap-1">
                          <History className="w-3.5 h-3.5" />
                          Historial de Versiones ({iterations.length})
                        </span>
                      </div>
                      <div className="flex items-center gap-2 overflow-x-auto pb-1">
                        {iterations.map((iter, idx) => (
                          <button
                            key={iter.id}
                            onClick={() => setActiveIterationIdx(idx)}
                            className={`w-14 h-14 rounded-lg overflow-hidden border-2 shrink-0 transition-all ${
                              activeIterationIdx === idx
                                ? 'border-emerald-400 ring-2 ring-emerald-500/30'
                                : 'border-zinc-700 opacity-60 hover:opacity-100'
                            }`}
                          >
                            <img
                              src={iter.imageUrl}
                              alt={`v${idx + 1}`}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              </div>

              {/* Section: ITERACIÓN DEL DIRECTOR DE ARTE */}
              <div className="p-5 bg-gradient-to-br from-zinc-900 to-zinc-950 rounded-2xl border border-emerald-800/40 shadow-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 font-mono flex items-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      ¿Qué querés modificar? (Ajuste de Dirección de Arte)
                    </h3>
                    <p className="text-[11px] text-zinc-400">
                      La nueva versión conservará el sistema visual {system.name}, refinando la composición o materiales:
                    </p>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500">
                    Versión actual: v{activeIterationIdx + 1}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch gap-2.5">
                  <input
                    type="text"
                    value={iterationText}
                    onChange={e => setIterationText(e.target.value)}
                    placeholder="Ejemplo: 'Composición más minimalista', 'Mayor escala de tipografía', 'Acentuar color principal'..."
                    onKeyDown={e => {
                      if (e.key === 'Enter' && iterationText.trim() && !isGenerating) {
                        handleGenerate(true);
                      }
                    }}
                    className="flex-1 text-xs bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2.5 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />

                  <button
                    onClick={() => handleGenerate(true)}
                    disabled={!iterationText.trim() || isGenerating}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold text-xs shadow-md transition-colors flex items-center justify-center gap-2 shrink-0"
                  >
                    {isGenerating ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Iterando...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Generar nueva versión</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Dynamic Iteration Suggestions */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-zinc-500 font-mono">Ajustes comunes:</span>
                  <button
                    onClick={() => setIterationText('Terminación más limpia y minimalista con menor saturación.')}
                    className="text-[10px] px-2 py-0.5 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 transition-colors"
                  >
                    Más minimalista
                  </button>
                  <button
                    onClick={() => setIterationText('Tipografía con mayor escala y protagonismo en la jerarquía del diseño.')}
                    className="text-[10px] px-2 py-0.5 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 transition-colors"
                  >
                    Tipografía más grande
                  </button>
                  <button
                    onClick={() => setIterationText('Composición con mayor espacio negativo y encuadre cinematográfico.')}
                    className="text-[10px] px-2 py-0.5 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 transition-colors"
                  >
                    Mayor espacio negativo
                  </button>
                  {system.colorPalette && system.colorPalette.length > 0 && (
                    <button
                      onClick={() => setIterationText(`Acentuar el contraste del color ${system.colorPalette?.[0]?.name || system.colorPalette?.[0]?.hex}.`)}
                      className="text-[10px] px-2 py-0.5 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 transition-colors"
                    >
                      Acentuar {system.colorPalette[0].name || 'color principal'}
                    </button>
                  )}
                </div>

              </div>

            </div>
          )}

        </div>

      </div>


    </main>
  );
};
