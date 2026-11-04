import React from 'react';
import { PatternStatus, PatternTrend } from '../../types';

export type Tone = 'pending' | 'confirmed' | 'discarded' | 'signal' | 'neutral' | 'current';

export const TONE_COLOR: Record<Tone, string> = {
  pending: 'var(--color-pending)',
  confirmed: 'var(--color-confirmed)',
  discarded: 'var(--color-discarded)',
  signal: 'var(--color-signal)',
  current: 'var(--color-ink)',
  neutral: 'rgba(255,255,255,.15)',
};

/** Punto de estado de 6px con halo. */
export function StatusDot({ tone, size = 6, glow = true, className }: { tone: Tone; size?: number; glow?: boolean; className?: string }) {
  const color = TONE_COLOR[tone];
  return (
    <span
      aria-hidden="true"
      className={`status-dot ${className ?? ''}`}
      style={{
        width: size,
        height: size,
        ['--dot' as string]: color,
        boxShadow: glow && tone !== 'neutral' && tone !== 'current' ? `0 0 6px ${color}` : 'none',
      }}
    />
  );
}

export const STATUS_LABEL: Record<PatternStatus, string> = {
  detected: 'Pendiente',
  confirmed: 'Confirmado',
  discarded: 'Descartado',
};

export const STATUS_TONE: Record<PatternStatus, Tone> = {
  detected: 'pending',
  confirmed: 'confirmed',
  discarded: 'discarded',
};

export function StatusPill({ status }: { status: PatternStatus }) {
  return (
    <span className="inline-flex h-6 items-center gap-2 rounded-full border border-line-mid px-[9px] text-xs text-ink">
      <StatusDot tone={STATUS_TONE[status]} />
      {STATUS_LABEL[status]}
    </span>
  );
}

const TREND_TEXT: Record<PatternTrend, string> = {
  strengthened: '↑ reforzado',
  new: '+ nuevo',
  weakened: '↓ debilitado',
  stable: '= estable',
};

export function TrendTag({ trend }: { trend?: PatternTrend }) {
  if (!trend) return null;
  return (
    <span className="inline-flex h-6 items-center rounded-tag bg-white/5 px-2 font-mono text-xs text-ink-2">
      {TREND_TEXT[trend]}
    </span>
  );
}
