import React, { useEffect, useId, useRef, useState } from 'react';
import { ImageIcon } from 'lucide-react';
import { Pattern, Reference } from '../../types';
import { Family, familyOf } from '../../utils/families';
import { PillarImage } from '../../utils/pillars';

interface PillarTileProps {
  index: number;
  pillar: string;
  image: PillarImage | null;
  patterns: Map<string, Pattern>;
  candidates: Reference[];
  onChoose: (refId: string | null) => void;
  /** Tablero: foco en un patrón. */
  dim?: boolean;
  highlight?: boolean;
}

/** Tarjeta 4:5 de un pilar: imagen del corpus, familia, nombre y trazabilidad. Permite elegir la imagen a mano. */
export function PillarTile({ index, pillar, image, patterns, candidates, onChoose, dim, highlight }: PillarTileProps) {
  const [open, setOpen] = useState(false);
  const pickerId = useId();
  const wrapRef = useRef<HTMLLIElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    wrapRef.current?.querySelector<HTMLElement>('[data-choice]')?.focus();
    const onDoc = (e: MouseEvent) => !wrapRef.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Familia: la del patrón que sostiene el pilar o, en una coincidencia, la del patrón con el que coincidió.
  const familyPattern = patterns.get(image?.patternIds[0] ?? image?.matchedPatternId ?? '');
  const f: Family | null = familyPattern ? familyOf(familyPattern.category) : null;

  const trace =
    image?.via === 'evidence' ? (
      <span className="font-mono text-xs text-signal-ink">← {image.patternIds.join(' ')}</span>
    ) : image?.via === 'chosen' ? (
      <span className="font-mono text-xs text-signal-ink">
        ← {image.ref.id} · elegida{image.patternIds.length ? ` · ${image.patternIds.join(' ')}` : ''}
      </span>
    ) : image?.via === 'match' ? (
      <span className="font-mono text-xs text-ink-2" title="La app eligió esta imagen comparando el texto del pilar con tu corpus; no es trazabilidad de la IA.">
        ≈ coincidencia · {image.ref.id}
      </span>
    ) : null;

  return (
    <li
      ref={wrapRef}
      className={`group relative flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-card bg-raised transition-[opacity,box-shadow] duration-180 ease-emergent ${
        dim ? 'opacity-35' : ''
      } ${highlight ? 'shadow-[0_0_0_2px_var(--color-signal)]' : ''}`}
    >
      {image && (
        <img
          src={image.ref.image}
          alt=""
          className={`absolute inset-0 h-full w-full object-cover ${image.via === 'match' ? 'opacity-80' : ''}`}
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      )}
      <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(to_top,rgba(11,11,13,.95)_20%,rgba(11,11,13,0)_65%)]" />

      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={pickerId}
        className="btn btn-secondary btn-sm absolute right-3 top-3 opacity-0 transition-opacity duration-120 focus-visible:opacity-100 group-hover:opacity-100 aria-expanded:opacity-100"
      >
        <ImageIcon aria-hidden="true" />
        Cambiar imagen
        <span className="sr-only"> del pilar {index + 1}</span>
      </button>

      <div className="relative flex flex-col gap-2 p-4">
        <span className="font-mono text-xs" style={{ color: f?.ink ?? 'var(--color-ink-2)' }}>
          {String(index + 1).padStart(2, '0')}
          {f ? ` · ${f.label}` : ''}
        </span>
        <span className="font-serif text-[22px] font-medium leading-[1.15] text-ink">{pillar}</span>
        {trace}
      </div>

      {open && (
        <div
          id={pickerId}
          role="dialog"
          aria-label={`Elegir imagen para el pilar ${index + 1}`}
          className="absolute inset-2 z-20 flex flex-col gap-2 overflow-hidden rounded-ctrl border border-line-mid bg-raised p-2 shadow-float"
        >
          <span className="px-1 text-xs text-ink-2">Elegí una referencia del corpus</span>
          <ul className="m-0 grid min-h-0 flex-1 list-none grid-cols-3 content-start gap-1 overflow-y-auto p-0">
            {candidates.map(r => (
              <li key={r.id}>
                <button
                  type="button"
                  data-choice
                  onClick={() => {
                    onChoose(r.id);
                    setOpen(false);
                    btnRef.current?.focus();
                  }}
                  aria-pressed={image?.ref.id === r.id}
                  aria-label={`${r.name} (${r.id})`}
                  className={`block w-full overflow-hidden rounded-tag border ${image?.ref.id === r.id ? 'border-ink' : 'border-transparent hover:border-line-strong'}`}
                >
                  <img src={r.image} alt="" className="aspect-square w-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
                </button>
              </li>
            ))}
          </ul>
          {image?.via === 'chosen' && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                onChoose(null);
                setOpen(false);
                btnRef.current?.focus();
              }}
            >
              Volver a la imagen automática
            </button>
          )}
        </div>
      )}
    </li>
  );
}
