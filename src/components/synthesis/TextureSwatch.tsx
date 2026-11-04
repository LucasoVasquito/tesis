import React, { useId } from 'react';
import { PaletteColor } from '../../types';
import { contrast } from './Specimen';

export type TextureKind = 'grain' | 'halftone' | 'spiral' | 'stripes' | 'spray' | 'paper';

const has = (t: string, ...words: string[]) => words.some(w => t.includes(w));

/** Qué textura dibujar según el texto de la regla. */
export function guessTexture(text: string, index = 0): TextureKind {
  const t = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (has(t, 'espiral', 'hipnot', 'psicodel', 'circul', 'concentr')) return 'spiral';
  if (has(t, 'semitono', 'halftone', 'trama', 'punto', 'risograf')) return 'halftone';
  if (has(t, 'aerograf', 'spray', 'estela', 'difumin', 'degrad', 'glow', 'luz')) return 'spray';
  if (has(t, 'raya', 'linea', 'franja', 'stripe', 'cuadricul', 'damero')) return 'stripes';
  if (has(t, 'papel', 'kraft', 'carton', 'fibra')) return 'paper';
  if (has(t, 'grano', 'ruido', 'grain', 'analog', 'fotocop', 'desgast')) return 'grain';
  return (['grain', 'halftone', 'spray', 'stripes'] as TextureKind[])[index % 4];
}

const lum = (hex: string) => contrast(hex, '#000000');

/**
 * Muestra de textura dibujada con la paleta del sistema (sin imágenes externas).
 * Se usa cuando una regla de textura no tiene evidencia en el corpus.
 */
export function TextureSwatch({ text, palette, index = 0, height = 200 }: { text: string; palette: PaletteColor[]; index?: number; height?: number }) {
  const id = useId().replace(/:/g, '');
  const kind = guessTexture(text, index);
  const colors = (palette.length ? palette.map(c => c.hex) : ['#111111', '#E4007C', '#F2E600', '#F4EFE6']).slice();
  const byLum = [...colors].sort((a, b) => lum(a) - lum(b));
  const dark = byLum[0];
  const light = byLum[byLum.length - 1];
  const accents = colors.filter(c => c !== dark && c !== light);
  const a1 = accents[index % Math.max(accents.length, 1)] ?? light;
  const a2 = accents[(index + 1) % Math.max(accents.length, 1)] ?? dark;

  let bg: React.CSSProperties;
  switch (kind) {
    case 'spiral':
      bg = { background: `repeating-radial-gradient(circle at 50% 55%, ${dark} 0 10px, ${a1} 10px 20px, ${dark} 20px 30px, ${light} 30px 34px)` };
      break;
    case 'halftone':
      bg = {
        backgroundColor: light,
        backgroundImage: `radial-gradient(${a1} 32%, transparent 34%), radial-gradient(${dark} 22%, transparent 24%)`,
        backgroundSize: '14px 14px, 14px 14px',
        backgroundPosition: '0 0, 7px 7px',
      };
      break;
    case 'stripes':
      bg = { background: `repeating-linear-gradient(-45deg, ${a1} 0 14px, ${dark} 14px 28px)` };
      break;
    case 'spray':
      bg = {
        background: `radial-gradient(circle at 30% 40%, ${a1} 0, transparent 45%), radial-gradient(circle at 72% 62%, ${a2} 0, transparent 40%), ${dark}`,
        filter: 'blur(0.5px)',
      };
      break;
    case 'paper':
      bg = { background: `linear-gradient(160deg, ${light}, ${a1})` };
      break;
    default:
      bg = { background: `linear-gradient(135deg, ${dark} 0%, ${a1} 140%)` };
  }

  // Grano encima de todas (más fuerte en "grain" y "paper").
  const grain = kind === 'grain' ? 0.55 : kind === 'paper' ? 0.35 : 0.22;
  return (
    <div className="relative overflow-hidden" style={{ height }} role="img" aria-label={`Muestra de textura (${LABEL[kind]}) dibujada con la paleta del sistema`}>
      <div className="absolute inset-0" style={bg} />
      <svg className="absolute inset-0 h-full w-full mix-blend-overlay" aria-hidden="true">
        <filter id={`n-${id}`}>
          <feTurbulence type="fractalNoise" baseFrequency={kind === 'paper' ? 0.04 : 0.9} numOctaves={kind === 'paper' ? 4 : 2} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#n-${id})`} opacity={grain} />
      </svg>
      <span className="absolute bottom-2 left-2 rounded-[3px] border border-line-mid bg-raised px-1.5 py-0.5 font-mono text-xs text-ink-2">muestra · {LABEL[kind]}</span>
    </div>
  );
}

const LABEL: Record<TextureKind, string> = {
  grain: 'grano',
  halftone: 'semitono',
  spiral: 'espiral',
  stripes: 'rayas',
  spray: 'aerógrafo',
  paper: 'papel',
};
