import React from 'react';
import { PaletteColor } from '../../types';
import { readableOn } from '../../utils/dominantColor';

/** Banda de paleta a sangre: cada color ocupa un ancho proporcional a su presencia en la evidencia. */
export function PaletteBand({ palette, height = 120, labels = true, className }: { palette: PaletteColor[]; height?: number; labels?: boolean; className?: string }) {
  const total = palette.reduce((a, c) => a + (c.share ?? 0), 0);
  const weight = (c: PaletteColor) => (total > 0 ? Math.max(c.share ?? 0, 0.04) : 1);
  return (
    <div className={`flex ${className ?? ''}`} style={{ height }} role="list" aria-label="Paleta inferida del corpus">
      {palette.map((c, i) => {
        const ink = readableOn(c.hex);
        return (
          <div
            key={`${c.hex}-${i}`}
            role="listitem"
            className="flex flex-col justify-end gap-0.5 overflow-hidden p-3"
            style={{ flex: weight(c), background: c.hex, minWidth: labels ? 76 : 8 }}
            title={`${c.hex} · ${c.name}${c.source ? ` · ${c.source}` : ''}`}
          >
            {labels ? (
              <>
                <span className="font-mono text-xs font-medium" style={{ color: ink }}>
                  {c.hex.toUpperCase()}
                </span>
                <span className="truncate font-mono text-xs opacity-75" style={{ color: ink }}>
                  {c.share ? `${Math.round(c.share * 100)}% · ` : ''}
                  {c.source ? `← ${c.source}` : ''}
                </span>
              </>
            ) : (
              <span className="sr-only">{c.hex}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
