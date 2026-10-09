import React from 'react';
import { Sparkles, CheckCircle2, Loader2, Layers, Palette, Eye, Cpu } from 'lucide-react';

interface AnalysisProgressModalProps {
  isOpen: boolean;
  stepIndex: number;
  totalReferencesCount: number;
}

const ANALYSIS_STEPS = [
  {
    title: 'Compresión y Procesamiento Visual',
    description: 'Optimizando resolución y peso Base64 de las referencias del canvas',
    icon: Layers,
  },
  {
    title: 'Envío al Motor Multimodal Gemini',
    description: 'Transmitiendo moodboard comprimido a la API de IA',
    icon: Cpu,
  },
  {
    title: 'Extracción de Patrones & Tensiones Estéticas',
    description: 'Analizando tipografía, cromatismo, packaging y geometría visual',
    icon: Palette,
  },
  {
    title: 'Sintetizando Sistemas Visuales',
    description: 'Articulando hallazgos en hipótesis de sistemas reutilizables',
    icon: Eye,
  },
];

export const AnalysisProgressModal: React.FC<AnalysisProgressModalProps> = ({
  isOpen,
  stepIndex,
  totalReferencesCount,
}) => {
  if (!isOpen) return null;

  // Track an animated visual percentage that fills smoothly
  const [visualPercent, setVisualPercent] = React.useState(() => {
    if (stepIndex === 0) return 20;
    if (stepIndex === 1) return 45;
    if (stepIndex === 2) return 70;
    if (stepIndex === 3) return 88;
    return 100;
  });

  React.useEffect(() => {
    if (!isOpen) return;

    if (stepIndex >= 4) {
      setVisualPercent(100);
      return;
    }

    const baseTargets: Record<number, number> = {
      0: 25,
      1: 50,
      2: 75,
      3: 88,
    };
    const target = baseTargets[stepIndex] ?? 25;
    setVisualPercent(prev => Math.max(prev, target));

    // While waiting on step 3 (Gemini processing), slowly increment up to 96%
    if (stepIndex === 3) {
      const interval = setInterval(() => {
        setVisualPercent(prev => {
          if (prev < 96) return prev + 1;
          return prev;
        });
      }, 450);
      return () => clearInterval(interval);
    }
  }, [isOpen, stepIndex]);

  const currentStep = ANALYSIS_STEPS[Math.min(stepIndex, ANALYSIS_STEPS.length - 1)];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in select-none">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 space-y-6 relative overflow-hidden">
        
        {/* Glow Header Accent */}
        <div
          className="absolute top-0 left-0 right-0 h-1"
          style={{ background: 'linear-gradient(90deg, #10b981 0%, #14b8a6 50%, #6366f1 100%)' }}
        />

        {/* Modal Title */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-950/80 border border-emerald-700/60 flex items-center justify-center text-emerald-400 shadow-sm shrink-0">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-100">
              Análisis Multimodal en Curso
            </h3>
            <p className="text-xs text-zinc-400">
              Evaluando {totalReferencesCount} referencia{totalReferencesCount !== 1 ? 's' : ''} visual{totalReferencesCount !== 1 ? 'es' : ''}
            </p>
          </div>
        </div>

        {/* Overall Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px] font-mono">
            <span className="text-emerald-400 font-bold">Progreso general</span>
            <span className="text-emerald-400 font-semibold">{visualPercent}%</span>
          </div>
          <div className="w-full h-3 rounded-full bg-zinc-950 border border-zinc-800 p-0.5 overflow-hidden shadow-inner">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${visualPercent}%`,
                background: 'linear-gradient(90deg, #10b981 0%, #14b8a6 50%, #6366f1 100%)',
                boxShadow: '0 0 14px rgba(16, 185, 129, 0.7), 0 0 6px rgba(99, 102, 241, 0.5)',
              }}
            />
          </div>
        </div>

        {/* Step-by-Step List */}
        <div className="space-y-3 pt-1">
          {ANALYSIS_STEPS.map((step, idx) => {
            const IconComponent = step.icon;
            const isCompleted = idx < stepIndex;
            const isCurrent = idx === stepIndex;

            return (
              <div
                key={idx}
                className={`p-3 rounded-xl border transition-all flex items-start gap-3 ${
                  isCurrent
                    ? 'bg-emerald-950/40 border-emerald-700/80 shadow-md shadow-emerald-950/30'
                    : isCompleted
                    ? 'bg-zinc-950/50 border-zinc-800/80 opacity-90'
                    : 'bg-zinc-950/20 border-zinc-900 opacity-40'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {isCompleted ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : isCurrent ? (
                    <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                  ) : (
                    <IconComponent className="w-4 h-4 text-zinc-600" />
                  )}
                </div>

                <div className="space-y-0.5">
                  <h4 className={`text-xs font-bold ${isCurrent ? 'text-emerald-200' : isCompleted ? 'text-zinc-200' : 'text-zinc-500'}`}>
                    {step.title}
                  </h4>
                  <p className="text-[11px] text-zinc-400 leading-normal">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Dynamic Status Footer */}
        <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800/60 text-center">
          <p className="text-[11px] text-zinc-400 font-mono flex items-center justify-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>
              {stepIndex >= 4
                ? '¡Análisis completado! Preparando patrones...'
                : `${currentStep.description}...`}
            </span>
          </p>
        </div>

      </div>
    </div>
  );
};
