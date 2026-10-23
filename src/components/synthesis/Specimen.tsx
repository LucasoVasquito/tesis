import React from 'react';
import { PaletteColor, SpecimenStyle } from '../../types';

/* ---------- Color ---------- */
const lum = (hex: string) => {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
};
export const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const chroma = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return Math.max(r, g, b) - Math.min(r, g, b);
};
const FALLBACK = ['#111111', '#F4F4F0', '#E4007C', '#F2E600'];
const hexesOf = (palette: PaletteColor[]) => {
  const h = palette.map(c => c.hex.toUpperCase());
  return h.length >= 2 ? h : [...h, ...FALLBACK].slice(0, 4);
};

/** Pares fondo/tinta de la paleta con contraste suficiente, ordenados para alternar entre fichas. */
export function palettePairs(palette: PaletteColor[]): { bg: string; ink: string }[] {
  const hexes = hexesOf(palette);
  const pairs: { bg: string; ink: string; score: number }[] = [];
  for (const bg of hexes)
    for (const ink of hexes) {
      if (bg === ink) continue;
      const c = contrast(bg, ink);
      if (c >= 3) pairs.push({ bg, ink, score: c + chroma(bg) / 60 });
    }
  pairs.sort((a, b) => b.score - a.score);
  // Evitar que dos pares seguidos repitan el mismo fondo.
  const out: { bg: string; ink: string }[] = [];
  const pool = [...pairs];
  while (pool.length) {
    const i = pool.findIndex(p => p.bg !== out[out.length - 1]?.bg);
    out.push(pool.splice(i === -1 ? 0 : i, 1)[0]);
  }
  return out.length ? out : [{ bg: '#111111', ink: '#F4F4F0' }];
}

const darkest = (hexes: string[]) => [...hexes].sort((a, b) => lum(a) - lum(b))[0];
const lightest = (hexes: string[]) => [...hexes].sort((a, b) => lum(b) - lum(a))[0];
const accents = (hexes: string[], exclude: string[]) => [...hexes].filter(h => !exclude.includes(h)).sort((a, b) => chroma(b) - chroma(a));

/** Estilo a partir del texto de la regla, para reglas que no lo traen (redactadas antes de este cambio). */
export function guessStyle(text: string, index: number): SpecimenStyle {
  const t = text.toLowerCase();
  if (/glitch|distors|ruido digital|desplaz|aberraci/.test(t)) return 'glitch';
  if (/jerarqu|niveles|secundari|combinaci|arriba.*abajo/.test(t)) return 'hierarchy';
  if (/estir|vertical|alargad|eje/.test(t)) return 'stretched';
  if (/curv|redond|org[aá]nic|fluid|blanda|suave/.test(t)) return 'rounded';
  if (/serif|clásic|clasic|editorial|romana/.test(t)) return 'serif';
  if (/extendid|expandid|ancha|tracking abierto|espaciad/.test(t)) return 'wide';
  if (/contorno|outline|calad|filete/.test(t)) return 'outline';
  if (/cursiv|inclin|itálic|italic|oblicu/.test(t)) return 'italic';
  return (['stretched', 'hierarchy', 'glitch', 'rounded'] as SpecimenStyle[])[index % 4];
}

export const SPECIMEN_LABEL: Record<SpecimenStyle, string> = {
  stretched: 'estirada',
  hierarchy: 'jerarquía',
  glitch: 'glitch',
  italic: 'inclinada',
  rounded: 'redondeada',
  serif: 'serif display',
  wide: 'extendida',
  outline: 'contorno',
};

interface SpecimenProps {
  text: string;
  subtext?: string;
  style: SpecimenStyle;
  palette: PaletteColor[];
  /** Posición de la ficha: rota las combinaciones de color. */
  index: number;
  height?: number;
}

/** Espécimen tipográfico: una aproximación con fuentes genéricas para leer la regla de un vistazo. */
export function Specimen({ text, subtext, style, palette, index, height = 200 }: SpecimenProps) {
  const hexes = hexesOf(palette);
  const pairs = palettePairs(palette);
  const pair = pairs[index % pairs.length];
  const words = text.trim() || 'Aa';
  const len = words.length;
  const base: React.CSSProperties = { height, background: pair.bg };
  const label = `Espécimen ${SPECIMEN_LABEL[style]}: ${words}`;

  if (style === 'hierarchy') {
    const bg = lightest(hexes);
    const ink = contrast(bg, darkest(hexes)) >= 4.5 ? darkest(hexes) : '#111111';
    const [a, ...rest] = words.split(/\s+/);
    return (
      <div role="img" aria-label={label} className="flex flex-col justify-between p-5" style={{ ...base, background: bg, color: ink }}>
        <span className="block uppercase leading-[0.9]" style={{ fontFamily: 'var(--font-specimen)', fontSize: len > 14 ? 40 : 56 }}>
          {a}
          {rest.length > 0 && (
            <>
              <br />
              {rest.join(' ')}
            </>
          )}
        </span>
        <span className="flex items-end justify-between gap-3 text-13 font-medium">
          <span className="truncate">{subtext || 'Información secundaria · 00 h'}</span>
          <span className="font-mono text-xs">01 / 03</span>
        </span>
      </div>
    );
  }

  if (style === 'glitch') {
    const bg = darkest(hexes);
    const [a1, a2] = accents(hexes, [bg]);
    const ink = lightest(hexes);
    return (
      <div role="img" aria-label={label} className="flex items-center justify-center overflow-hidden px-4" style={{ ...base, background: bg }}>
        <span
          className="block uppercase leading-none"
          style={{
            fontFamily: 'var(--font-specimen)',
            fontSize: len <= 5 ? 76 : len <= 9 ? 58 : 40,
            color: ink,
            transform: 'skewX(-12deg)',
            textShadow: `-5px 0 0 ${a1 ?? '#E4007C'}, 5px 2px 0 ${a2 ?? a1 ?? '#F2E600'}`,
          }}
        >
          {words}
        </span>
      </div>
    );
  }

  const fontFor: Record<Exclude<SpecimenStyle, 'hierarchy' | 'glitch'>, React.CSSProperties> = {
    stretched: { fontFamily: 'var(--font-specimen)', transform: 'scaleY(1.7) skewX(-8deg)', textTransform: 'uppercase', letterSpacing: '-0.01em' },
    italic: { fontFamily: 'var(--font-specimen)', transform: 'skewX(-14deg)', textTransform: 'uppercase' },
    rounded: { fontFamily: '"Fredoka", var(--font-sans)', fontWeight: 700, letterSpacing: '-0.02em' },
    serif: { fontFamily: '"DM Serif Display", var(--font-serif)', letterSpacing: '-0.02em' },
    wide: { fontFamily: '"Unbounded", var(--font-sans)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em' },
    outline: { fontFamily: 'var(--font-specimen)', textTransform: 'uppercase', color: 'transparent', WebkitTextStroke: `2px ${pair.ink}` },
  };
  const scale: Record<string, number> = { stretched: 1, italic: 1, rounded: 0.95, serif: 1.05, wide: 0.6, outline: 1.05 };
  const size = Math.round((len <= 5 ? 88 : len <= 8 ? 70 : len <= 12 ? 52 : 38) * (scale[style] ?? 1));

  return (
    <div role="img" aria-label={label} className="flex items-center justify-center overflow-hidden px-4" style={base}>
      <span className="block max-w-full text-center leading-[0.95]" style={{ fontSize: size, color: pair.ink, ...fontFor[style] }}>
        {words}
      </span>
    </div>
  );
}
