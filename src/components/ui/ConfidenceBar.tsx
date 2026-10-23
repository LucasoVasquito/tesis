import React from 'react';

interface ConfidenceBarProps {
  value: number; // 0..1
  label?: string;
  className?: string;
}

export function ConfidenceBar({ value, label = 'Confianza', className }: ConfidenceBarProps) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <div className={`flex flex-col gap-2 ${className ?? ''}`}>
      <div className="flex justify-between text-13">
        <span className="text-ink-2">{label}</span>
        <span className="font-mono text-ink">{v.toFixed(2)}</span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={Number(v.toFixed(2))}
        className="h-1 rounded-sm bg-line"
      >
        <div className="h-full rounded-sm bg-ink" style={{ width: `${v * 100}%` }} />
      </div>
    </div>
  );
}

/** Barra de progreso simple (misma forma que ConfidenceBar, sin etiqueta). */
export function ProgressTrack({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      className="h-1 rounded-sm bg-line"
    >
      <div className="h-full rounded-sm bg-ink transition-[width] duration-180 ease-emergent" style={{ width: `${v * 100}%` }} />
    </div>
  );
}
