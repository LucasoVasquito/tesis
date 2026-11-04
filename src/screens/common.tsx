import React, { useEffect, useRef, useState } from 'react';
import { Pattern, Project } from '../types';
import { Crop } from '../space/Crop';
import { Notice } from '../pieces/model';

/** Imagen de una pieza: su recorte o, si no tiene, su primera referencia entera. */
export function PieceImage({ piece, project, className, style }: { piece: Pattern; project: Project; className?: string; style?: React.CSSProperties }) {
  const refId = piece.cover?.refId && project.references.some(r => r.id === piece.cover!.refId) ? piece.cover.refId : piece.evidence.find(id => project.references.some(r => r.id === id));
  const ref = refId ? project.references.find(r => r.id === refId) : undefined;
  if (!ref) return <span className={`block bg-raised ${className ?? ''}`} style={style} />;
  return <Crop image={ref.image} crop={piece.cover?.refId === ref.id ? piece.cover.crop : undefined} fit="cover" alt={piece.name} className={className} style={style} />;
}

/** Botón con el atajo adentro: [⏎] CONFIRMAR. Lo que se hace con teclado siempre tiene un botón. */
export function KeyButton({
  k,
  label,
  onClick,
  tone = 'line',
  disabled,
  title,
}: {
  k?: string;
  label: string;
  onClick: () => void;
  tone?: 'line' | 'core' | 'bone' | 'accent' | 'ghost';
  disabled?: boolean;
  title?: string;
}) {
  const tones: Record<string, string> = {
    line: 'border-2 border-bone/60 text-ink hover:border-bone hover:bg-bone hover:text-void',
    core: 'border-2 border-core bg-core text-void hover:bg-bone hover:border-bone',
    bone: 'border-2 border-bone bg-bone text-void hover:bg-core hover:border-core',
    accent: 'border-2 border-accent bg-accent text-bone hover:bg-bone hover:text-void hover:border-bone',
    ghost: 'border-2 border-transparent text-ink-2 hover:text-ink hover:border-line-strong',
  };
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={e => {
        e.stopPropagation();
        onClick();
      }}
      className={`type-label inline-flex items-center gap-[6px] whitespace-nowrap px-2 py-[5px] text-[11px] transition-colors duration-120 disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]}`}
    >
      {k && <kbd className="font-mono text-[11px] font-medium opacity-80">[{k}]</kbd>}
      {label}
    </button>
  );
}

/** El botón principal de cada pantalla: grande, naranja, abajo a la derecha. */
export function BigButton({ k, label, onClick, disabled, hint }: { k?: string; label: string; onClick: () => void; disabled?: boolean; hint?: string }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="type-label flex h-[52px] items-center gap-3 bg-core px-6 text-[18px] text-void transition-colors duration-120 hover:bg-bone disabled:cursor-not-allowed disabled:bg-raised disabled:text-ink-3"
      >
        {label}
        {k && <kbd className="font-mono text-[14px] font-medium opacity-70">[{k}]</kbd>}
      </button>
      {hint && <span className="text-[13px] text-ink-2">{hint}</span>}
    </div>
  );
}

/** Franja "La IA notó": una sola línea, con acción opcional, que se puede cerrar. Nunca bloquea. */
export function NoticeStrip({ notice, onAction, onDismiss }: { notice: Notice; onAction?: () => void; onDismiss: () => void }) {
  return (
    <div className="no-print flex min-h-[40px] shrink-0 items-center gap-3 border-t-2 border-accent bg-void px-5" role="status" aria-live="polite">
      <span className="layer-tag layer-3 shrink-0">LA IA NOTÓ</span>
      <span className="min-w-0 flex-1 truncate text-[14px]">{notice.text}</span>
      {notice.action && onAction && <KeyButton label={notice.action.label} tone="accent" onClick={onAction} />}
      <button type="button" aria-label="Cerrar aviso" onClick={onDismiss} className="type-label px-2 text-[14px] text-ink-2 hover:text-ink">
        ×
      </button>
    </div>
  );
}

/** Aviso breve de la app (lo que acaba de pasar). */
export function Toast({ text }: { text: string }) {
  return (
    <div className="no-print flex h-[38px] shrink-0 items-center gap-3 border-t-2 border-bone bg-void px-5" role="status" aria-live="polite">
      <span className="truncate text-[14px]">{text}</span>
    </div>
  );
}

/** Brief redactado por la IA: el diseñador lo edita. Se guarda al cerrar. */
export function BriefPanel({ brief, onSave, onClose }: { brief: string; onSave: (text: string) => void; onClose: () => void }) {
  const [value, setValue] = useState(brief);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const close = () => {
    if (value !== brief) onSave(value);
    onClose();
  };
  return (
    <div className="absolute left-10 top-6 z-40 flex w-[min(520px,calc(100%-40px))] flex-col gap-3 border-2 border-bone bg-void p-4" role="dialog" aria-label="Brief">
      <div className="flex items-center justify-between">
        <span className="layer-tag">BRIEF</span>
        <span className="font-mono text-[11px] text-ink-2">lo redactó la IA · editalo</span>
      </div>
      <textarea
        ref={ref}
        value={value}
        rows={9}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => e.key === 'Escape' && close()}
        className="w-full resize-y bg-transparent text-[15px] leading-[1.5] text-ink outline-none"
      />
      <div className="self-end">
        <KeyButton k="ESC" label="Guardar y cerrar" tone="bone" onClick={close} />
      </div>
    </div>
  );
}
