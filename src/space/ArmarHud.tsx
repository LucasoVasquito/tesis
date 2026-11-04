import React, { useEffect, useRef, useState } from 'react';

interface IntentProps {
  intent: string;
  /** Hay referencias: la frase pasa a ser un rótulo compacto. */
  compact: boolean;
  busy: boolean;
  error?: string | null;
  onSubmit: (intent: string) => void;
  onPickFiles: (files: File[]) => void;
  onOpenBrief: () => void;
  onOpenUpload: () => void;
  hasBrief: boolean;
}

/**
 * 01 · Armar. Estado vacío (2a): una frase de intención y una zona para soltar imágenes.
 * Las tres láminas vacías ya se ven en el espacio, detrás.
 */
export function IntentBlock({ intent, compact, busy, error, onSubmit, onPickFiles, onOpenBrief, onOpenUpload, hasBrief }: IntentProps) {
  const [value, setValue] = useState(intent);
  const [editing, setEditing] = useState(!intent);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => setValue(intent), [intent]);
  useEffect(() => {
    if (editing && !compact) inputRef.current?.focus();
  }, [editing, compact]);

  const submit = () => {
    const v = value.trim();
    if (!v || busy) return;
    setEditing(false);
    inputRef.current?.blur();
    if (v !== intent) onSubmit(v);
  };

  const field = (
    <div className="flex items-end gap-1 border-b-4 border-bone pb-2">
      <textarea
        ref={inputRef}
        rows={compact ? 1 : 2}
        aria-label="Frase de intención"
        placeholder="HAMBURGUESERÍA CRUDA, DE BARRIO"
        value={value}
        onChange={e => setValue(e.target.value)}
        onFocus={() => setEditing(true)}
        onBlur={() => value.trim() === intent && setEditing(false)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
          if (e.key === 'Escape') {
            setValue(intent);
            setEditing(false);
            inputRef.current?.blur();
          }
        }}
        className={`type-name w-full resize-none bg-transparent leading-[0.88] text-ink outline-none placeholder:text-ink-3 ${compact ? 'text-[28px]' : 'text-[46px]'}`}
      />
      <span aria-hidden="true" className={`shrink-0 bg-core ${compact ? 'h-[26px] w-[9px]' : 'h-[44px] w-[14px]'} ${editing ? 'motion-safe:animate-pulse' : ''}`} />
    </div>
  );

  if (compact) {
    return (
      <div className="pointer-events-auto flex w-[420px] flex-col gap-2">
        {field}
        <div className="flex items-center gap-3">
          <button type="button" onClick={onOpenBrief} className="type-label text-[12px] text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink">
            {busy ? 'LA IA REDACTA EL BRIEF…' : hasBrief ? 'VER Y EDITAR EL BRIEF' : 'SIN BRIEF · ESCRIBÍ LA FRASE Y ⏎'}
          </button>
          <button type="button" onClick={onOpenUpload} className="type-label text-[12px] text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink">
            + IMÁGENES
          </button>
          {error && <span className="text-[12px] text-error-ink">{error}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto flex w-[440px] flex-col gap-10">
      <div className="flex flex-col gap-[14px]">
        <span className="layer-tag layer-3 self-start">QUÉ QUERÉS QUE SEA</span>
        {field}
        <span className="text-[14px] leading-[1.45] text-ink-2">
          {busy ? 'La IA redacta el brief…' : 'Una frase alcanza. La IA redacta el brief y lo podés editar después.'}
        </span>
        {error && <span className="text-[13px] text-error-ink">{error}</span>}
        {hasBrief && !busy && (
          <button type="button" onClick={onOpenBrief} className="type-label self-start text-[12px] text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink">
            VER Y EDITAR EL BRIEF
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="flex h-[92px] w-[300px] flex-col justify-center gap-1 border-2 border-dashed border-bone/50 px-4 text-left hover:border-bone"
      >
        <span className="type-name text-[20px]">SOLTÁ IMÁGENES</span>
        <span className="font-mono text-[11px] font-medium text-ink-2">caen al fondo · todavía no pesan</span>
      </button>
      <button type="button" onClick={onOpenUpload} className="type-label -mt-8 self-start text-[12px] text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink">
        O SUMAR POR URL
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={e => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onPickFiles(files);
          e.target.value = '';
        }}
      />
    </div>
  );
}

/** Brief redactado por la IA: el diseñador lo edita. Se guarda al salir del campo. */
export function BriefPanel({ brief, onSave, onClose }: { brief: string; onSave: (text: string) => void; onClose: () => void }) {
  const [value, setValue] = useState(brief);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const close = () => {
    if (value !== brief) onSave(value);
    onClose();
  };
  return (
    <div className="pointer-events-auto absolute left-12 top-8 z-30 flex w-[480px] flex-col gap-3 border-2 border-bone bg-void p-4" role="dialog" aria-label="Brief">
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
      <button type="button" onClick={close} className="btn btn-primary btn-sm self-end">
        Guardar · Esc
      </button>
    </div>
  );
}
