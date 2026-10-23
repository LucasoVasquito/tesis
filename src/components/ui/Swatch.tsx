import React, { useState } from 'react';

interface SwatchProps {
  hex: string;
  name?: string;
  /** ID de la referencia o el patrón del que sale el color. */
  source?: string;
  role?: string;
}

/** Muestra de color con trazabilidad. Clic copia el HEX. */
export function Swatch({ hex, name, source, role }: SwatchProps) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(hex);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* el portapapeles puede no estar disponible */
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="flex flex-col overflow-hidden rounded-card border border-line bg-surface text-left transition-colors duration-120 ease-emergent hover:border-line-strong"
      aria-label={`${name ?? 'Color'} ${hex}${source ? `, origen ${source}` : ''}. Copiar HEX`}
    >
      <span className="block h-16" style={{ background: hex }} />
      <span className="flex flex-col gap-0.5 px-3 py-2">
        <span className="font-mono text-xs font-medium text-ink">{copied ? 'Copiado' : hex.toUpperCase()}</span>
        {name && <span className="text-xs text-ink-2">{name}</span>}
        {role && <span className="text-xs text-ink-2">{role}</span>}
        {source && <span className="font-mono text-xs text-ink-2">← {source}</span>}
      </span>
    </button>
  );
}
