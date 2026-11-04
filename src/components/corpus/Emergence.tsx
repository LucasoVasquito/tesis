import React, { useEffect, useRef, useState } from 'react';
import { Pattern } from '../../types';
import { Button, CategoryTag } from '../ui';
import { familyOf } from '../../utils/families';
import { CanvasHighlight } from '../canvas/ReferenceCanvas';

/** Cuánto se muestra cada patrón antes de pasar al siguiente. */
const STEP_MS = 2600;
/** Como mucho estos patrones en el recorrido; el resto aparece en el resumen. */
const MAX_STEPS = 8;

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

interface EmergenceProps {
  patterns: Pattern[];
  onHighlight: (h: CanvasHighlight | null) => void;
  onFinish: (goToAudit: boolean) => void;
}

/**
 * Momento de emergencia tras la inducción: cada patrón nuevo aparece en el lienzo saliendo de su evidencia
 * (la cámara viaja a las referencias y las líneas convergen en el patrón). Termina en un resumen.
 */
export function Emergence({ patterns, onHighlight, onFinish }: EmergenceProps) {
  const steps = patterns.slice(0, MAX_STEPS);
  const [step, setStep] = useState(() => (reducedMotion() ? steps.length : 0));
  const done = step >= steps.length;
  const current = done ? null : steps[step];
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (current) {
      onHighlight({
        ids: current.evidence,
        label: `${current.id} · ${current.name.length > 46 ? `${current.name.slice(0, 46)}…` : current.name}`,
        dimOthers: 0.18,
        emphasis: true,
        padBottom: 320,
      });
      const t = setTimeout(() => setStep(s => s + 1), STEP_MS);
      return () => clearTimeout(t);
    }
    // Resumen: se encuadra toda la evidencia de los patrones nuevos, sin atenuar nada.
    onHighlight({ ids: Array.from(new Set(patterns.flatMap(p => p.evidence))), dimOthers: 1, padBottom: 360 });
    summaryRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (!done) setStep(steps.length);
      else onFinish(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [done, steps.length, onFinish]);

  useEffect(() => () => onHighlight(null), [onHighlight]);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-30 flex justify-center px-4">
      {current ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-auto flex w-full max-w-[460px] flex-col gap-3 rounded-card border border-signal/40 bg-raised p-4 shadow-float motion-safe:animate-[em-rise_240ms_var(--ease-emergent)]"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-xs text-signal-ink">
              EMERGENCIA · {step + 1} / {steps.length}
            </span>
            <div className="flex gap-1" aria-hidden="true">
              {steps.map((_, i) => (
                <span key={i} className={`h-1 w-5 rounded-full ${i < step ? 'bg-signal/60' : i === step ? 'bg-signal' : 'bg-white/10'}`} />
              ))}
            </div>
          </div>
          <div key={current.id} className="flex flex-col gap-2 motion-safe:animate-[em-rise_240ms_var(--ease-emergent)]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs" style={{ color: familyOf(current.category).ink }}>
                {current.id}
              </span>
              <CategoryTag category={current.category} />
              <span className="font-mono text-xs text-ink-2">
                {current.evidence.length} {current.evidence.length === 1 ? 'referencia' : 'referencias'} · confianza {(current.confidence ?? 0).toFixed(2)}
              </span>
            </div>
            <span className="text-15 font-medium leading-snug text-ink">{current.name}</span>
            <p className="m-0 line-clamp-2 font-serif text-sm text-ink-2">{current.description}</p>
          </div>
          <div className="flex justify-end">
            <Button size="sm" variant="ghost" onClick={() => setStep(steps.length)}>
              Saltar
            </Button>
          </div>
        </div>
      ) : (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="dialog"
          aria-label="Patrones que emergieron"
          className="pointer-events-auto flex w-full max-w-[520px] flex-col gap-4 rounded-card border border-line-mid bg-raised p-5 shadow-float outline-none motion-safe:animate-[em-rise_240ms_var(--ease-emergent)]"
        >
          <div className="flex flex-col gap-1">
            <span className="font-mono text-xs text-signal-ink">INDUCCIÓN TERMINADA</span>
            <span className="text-lg font-medium text-ink">
              {patterns.length} {patterns.length === 1 ? 'patrón emergió' : 'patrones emergieron'} del corpus
            </span>
            <span className="text-13 text-ink-2">Son hipótesis de la IA: en Auditoría los confirmás o descartás, uno por uno.</span>
          </div>
          <ul className="m-0 flex max-h-[200px] list-none flex-col gap-1.5 overflow-y-auto p-0">
            {patterns.map(p => (
              <li key={p.id} className="flex items-center gap-2 text-13">
                <span aria-hidden="true" className="size-2 shrink-0 rounded-[2px]" style={{ background: familyOf(p.category).color }} />
                <span className="font-mono text-xs text-ink-2">{p.id}</span>
                <span className="min-w-0 truncate text-ink">{p.name}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => onFinish(true)} autoFocus>
              Ir a Auditoría
            </Button>
            <Button variant="ghost" onClick={() => onFinish(false)}>
              Quedarme en el corpus
            </Button>
            {steps.length > 0 && (
              <Button variant="ghost" onClick={() => setStep(0)}>
                Ver de nuevo
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
