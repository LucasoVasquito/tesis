import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { inferPalette, HEX_IN_TEXT, normalizeHex } from '../utils/palette';
import { useColors } from './colorContext';
import { Pattern, Project } from '../types';
import { Crop } from '../space/Crop';
import { Notice } from '../pieces/model';
import { bestOn, BONE, INK } from '../utils/derivePalette';

/** Imagen de una pieza: su recorte o, si no tiene, su primera referencia entera. */
export function PieceImage({ piece, project, className, style }: { piece: Pattern; project: Project; className?: string; style?: React.CSSProperties }) {
  const refId = piece.cover?.refId && project.references.some(r => r.id === piece.cover!.refId) ? piece.cover.refId : piece.evidence.find(id => project.references.some(r => r.id === id));
  const ref = refId ? project.references.find(r => r.id === refId) : undefined;
  if (!ref) return <span className={`block bg-raised ${className ?? ''}`} style={style} />;
  return <Crop image={ref.image} crop={piece.cover?.refId === ref.id ? piece.cover.crop : undefined} fit="cover" alt={piece.name} className={className} style={style} />;
}

/** Color de una pieza de color: de su descripción o del desglose de su evidencia. */
function pieceHex(piece: Pattern, project: Project): string | null {
  for (const raw of piece.description?.match(HEX_IN_TEXT) ?? []) {
    const h = normalizeHex(raw);
    if (h) return h;
  }
  const fromEvidence = inferPalette([{ ...piece, status: 'confirmed' }], project.references, { max: 1 })[0];
  return fromEvidence?.hex ?? null;
}

/**
 * Texto que ajusta su tamaño para entrar completo en su caja (sin «…»): hasta `max` px y, si no entra, más chico.
 * Mide el ancho real del texto y lo escala; se recalcula si cambia el tamaño de la caja.
 */
export function FitText({ text, max = 64, min = 10, className, style }: { text: string; max?: number; min?: number; className?: string; style?: React.CSSProperties }) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState(max);
  useLayoutEffect(() => {
    const box = boxRef.current;
    const t = textRef.current;
    if (!box || !t) return;
    const fit = () => {
      t.style.fontSize = '100px';
      const w = t.scrollWidth;
      const avail = box.clientWidth;
      const h = box.clientHeight;
      if (!w || !avail) return;
      // Por ancho (una línea) y por alto (que no se salga de la caja).
      const next = Math.max(min, Math.min(max, (100 * avail) / w, h ? h * 0.9 : max));
      t.style.fontSize = `${next}px`;
      setSize(next);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, [text, max, min]);
  return (
    <span ref={boxRef} className={`flex min-w-0 items-center justify-center overflow-hidden ${className ?? ''}`} style={style}>
      <span ref={textRef} className="whitespace-nowrap leading-[0.95]" style={{ fontSize: size }}>
        {text}
      </span>
    </span>
  );
}

/**
 * Imagen de una pieza con su señal sobre la foto: las piezas de color llevan una etiqueta abajo a la izquierda
 * (fondo vacío al 78%, filete del color y el hex en mono); las tipográficas, la palabra de la marca.
 * Nada de cuadrados de color sueltos.
 */
export function PieceThumb({ piece, project, className, style, word, onSwatch }: { piece: Pattern; project: Project; className?: string; style?: React.CSSProperties; word?: boolean; onSwatch?: () => void }) {
  const colors = useColors();
  const fallback = useMemo(() => (piece.category === 'color' ? pieceHex(piece, project) : null), [piece.id, piece.category, piece.description, project.references]); // eslint-disable-line react-hooks/exhaustive-deps
  const brand = (project.name || project.intent || '').split(/\s[—–-]\s/)[0].trim();
  // Una pieza de paleta muestra sus 3 o 4 colores en franjas, no un solo hex (y menos un blanco sobre blanco).
  const stripes = useMemo(() => {
    if (piece.category !== 'color' || !/paleta|colores|cromátic|cromatic/i.test(piece.name)) return null;
    const fromText = [...new Set((piece.description?.match(HEX_IN_TEXT) ?? []).map(normalizeHex).filter((h): h is string => !!h))];
    const list = fromText.length >= 2 ? fromText : inferPalette([{ ...piece, status: 'confirmed' }], project.references, { max: 4 }).map(c => c.hex);
    return list.length >= 2 ? list.slice(0, 4) : null;
  }, [piece.id, piece.category, piece.name, piece.description, project.references]); // eslint-disable-line react-hooks/exhaustive-deps
  const hex = piece.category === 'color' && !stripes ? colors.byPiece[piece.id]?.hex ?? piece.colorOverride ?? fallback : null;
  // Las piezas de color son bloques llenos con su hex adentro; el color del texto sale del contraste real.
  const ink = hex ? bestOn(hex, INK, BONE) : BONE;
  const label = hex && <span>{hex.toUpperCase()}</span>;
  const labelStyle: React.CSSProperties = { color: ink };
  const typo = word !== false && piece.category === 'typography' && !!brand;
  return (
    <div className={`relative overflow-hidden ${className ?? ''}`} style={{ ...style, background: hex ? hex : typo ? 'var(--cc-surface)' : undefined, boxShadow: hex ? 'inset 0 0 0 1px var(--cc-line)' : undefined }}>
      {stripes && (
        <span aria-hidden="true" className="absolute inset-0 flex">
          {stripes.map(c => (
            <span key={c} className="flex-1" style={{ background: c }} />
          ))}
        </span>
      )}
      {!hex && !typo && !stripes && <PieceImage piece={piece} project={project} className="absolute inset-0 size-full" />}
      {hex &&
        (onSwatch ? (
          <button
            type="button"
            data-swatch
            aria-label={`Cambiar el color de ${piece.name} (C)`}
            title="Cambiar el color"
            onPointerDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation();
              onSwatch();
            }}
            className="absolute bottom-[6px] left-[8px] flex items-center gap-2 py-[2px] font-mono text-[0.875rem] font-bold leading-none underline-offset-4 hover:underline"
            style={labelStyle}
          >
            {label}
          </button>
        ) : (
          <span className="absolute bottom-[6px] left-[8px] flex items-center gap-2 py-[2px] font-mono text-[0.875rem] font-bold leading-none" style={labelStyle}>
            {label}
          </span>
        ))}
      {typo && (
        // Espécimen: el nombre del proyecto entra completo (ajusta su tamaño), sobre --surface.
        <FitText text={brand} max={72} className="type-name pointer-events-none absolute inset-3 text-ink" />
      )}
    </div>
  );
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
    line: 'rounded-[4px] bg-ink/10 text-ink hover:bg-ink/20',
    core: 'rounded-full bg-bone text-void hover:bg-[var(--cc-primary)] hover:text-[var(--cc-on-primary)]',
    bone: 'rounded-full bg-bone text-void hover:bg-[var(--cc-primary)] hover:text-[var(--cc-on-primary)]',
    accent: 'rounded-[4px] bg-ink/10 text-ink hover:bg-ink/20',
    ghost: 'rounded-[4px] text-ink-2 underline-offset-4 hover:text-ink hover:underline',
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
      className={`type-label inline-flex items-center gap-[6px] whitespace-nowrap px-3 py-[6px] text-[0.75rem] transition-colors duration-120 disabled:cursor-not-allowed disabled:opacity-75 ${tones[tone]}`}
    >
      {k && <kbd className="font-mono text-[0.875rem] font-medium opacity-80">[{k}]</kbd>}
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
        className="flex h-[52px] items-center gap-3 rounded-full bg-bone px-7 text-[0.9375rem] font-bold text-void transition-colors duration-150 hover:bg-[var(--cc-primary)] hover:text-[var(--cc-on-primary)] disabled:cursor-not-allowed disabled:bg-raised disabled:text-ink-3"
      >
        {label}
        {k && <kbd className="font-mono text-[0.875rem] font-medium opacity-75">[{k}]</kbd>}
      </button>
      {hint && <span className="text-[0.875rem] text-ink-2">{hint}</span>}
    </div>
  );
}

/** Franja "El agente notó": una sola línea, con acción opcional, que se puede cerrar. Nunca bloquea. */
export function NoticeStrip({ notice, onAction, onDismiss }: { notice: Notice; onAction?: () => void; onDismiss: () => void }) {
  return (
    <div className="no-print flex min-h-[40px] shrink-0 items-center gap-3 bg-void px-5" role="status" aria-live="polite">
      <span className="layer-tag layer-3 shrink-0">AVISO</span>
      <span className="min-w-0 flex-1 truncate text-[0.875rem]">{notice.text}</span>
      {notice.action && onAction && <KeyButton label={notice.action.label} tone="accent" onClick={onAction} />}
      <button type="button" aria-label="Cerrar aviso" onClick={onDismiss} className="type-label px-2 text-[0.875rem] text-ink-2 hover:text-ink">
        ×
      </button>
    </div>
  );
}

/** Aviso breve de la app (lo que acaba de pasar). */
export function Toast({ text }: { text: string }) {
  return (
    <div className="no-print flex h-[38px] shrink-0 items-center gap-3 bg-void px-5" role="status" aria-live="polite">
      <span className="truncate text-[0.875rem]">{text}</span>
    </div>
  );
}

/** Brief redactado por el agente: el diseñador lo edita. Se guarda al cerrar. */
export function BriefPanel({ brief, onSave, onClose }: { brief: string; onSave: (text: string) => void; onClose: () => void }) {
  const [value, setValue] = useState(brief);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const close = () => {
    if (value !== brief) onSave(value);
    onClose();
  };
  return (
    <div className="absolute left-10 top-6 z-40 flex w-[min(520px,calc(100%-40px))] flex-col gap-3 rounded-[4px] bg-surface p-4" role="dialog" aria-label="Brief">
      <div className="flex items-center justify-between">
        <span className="layer-tag">BRIEF</span>
        <span className="font-mono text-[0.875rem] text-ink-2">borrador automático · editalo</span>
      </div>
      <textarea
        ref={ref}
        value={value}
        rows={9}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => e.key === 'Escape' && close()}
        className="w-full resize-y bg-transparent text-[0.9375rem] leading-[1.5] text-ink outline-none"
      />
      <div className="self-end">
        <KeyButton k="ESC" label="Guardar y cerrar" tone="bone" onClick={close} />
      </div>
    </div>
  );
}
