import React from 'react';
import { StatusDot, Tone } from './StatusPill';

interface LogEntryProps {
  time: string;
  target: string;
  action: string;
  reason?: string;
  tone: Tone;
}

/** Entrada de bitácora. Va dentro de un <ol> con borde izquierdo (ver LogList). */
export function LogEntry({ time, target, action, reason, tone }: LogEntryProps) {
  return (
    <li className="relative flex flex-col gap-1 pb-5 pl-5">
      <span className="absolute -left-1 top-1.5">
        <StatusDot tone={tone} size={7} />
      </span>
      <span className="font-mono text-xs text-ink-2">
        {time} · {target}
      </span>
      <span className="text-13 font-medium text-ink">{action}</span>
      {reason && <span className="font-serif text-15 italic text-ink-2">{reason}</span>}
    </li>
  );
}

export function LogList({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <ol aria-label={label} className="m-0 flex list-none flex-col border-l border-line-mid p-0">
      {children}
    </ol>
  );
}
