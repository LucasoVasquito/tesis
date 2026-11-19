/**
 * Motor Camaleón (funciones puras, sin dependencias).
 *
 * derivePalette(detectedColors, pieces, overrides) → { primary, secondary, accent }
 *   1. Propuesta por frecuencia: los colores detectados, de mayor a menor presencia ponderada
 *      (lo que sale de las referencias del usuario pesa el doble que lo que infiere el sistema).
 *   2. Ajuste por jerarquía: la pieza de color con más frecuencia de Núcleo manda el primario, la de Soporte el
 *      secundario y la de Acento el acento. Si una capa no tiene pieza de color, ese rol toma el siguiente color del
 *      ranking que no esté usado. Un color editado a mano (override) manda sobre lo detectado.
 *
 * buildTheme(palette) → variables CSS (todo en OKLCH). El color elegido nunca se corrige: se adapta lo que está
 * encima o alrededor (texto, líneas, contornos).
 */

export type LayerNo = 1 | 2 | 3;

export interface DetectedColor {
  hex: string;
  /** Presencia (proporción o conteo). */
  weight: number;
  /** 'user': sale de las referencias del usuario (pesa x2). 'agent': lo infirió el sistema. */
  source?: 'user' | 'agent';
}

export interface ColorPiece {
  id: string;
  layer: LayerNo | null;
  /** Color de la pieza (hex), si se pudo leer. */
  hex: string | null;
  /** En cuántas referencias aparece. */
  frequency: number;
}

/** pieza → color elegido a mano. */
export type ColorOverrides = Record<string, string>;

export interface Palette {
  primary: string;
  secondary: string;
  accent: string;
}

/** Paleta neutra: la de los tres colores de capa por defecto (proyecto vacío). */
export const DEFAULT_PALETTE: Palette = {
  primary: 'oklch(0.68 0.14 33)',
  secondary: 'oklch(0.80 0.12 86)',
  accent: 'oklch(0.74 0.09 190)',
};

/* ---------- Color ---------- */

export type Oklch = [number, number, number];

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const gam = (v: number) => {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.min(255, Math.max(0, Math.round(c * 255)));
};

export function hexToOklch(hex: string): Oklch | null {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  const n = parseInt(h, 16);
  const R = lin((n >> 16) & 255);
  const G = lin((n >> 8) & 255);
  const B = lin(n & 255);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const b = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
}

export function oklchToHex([L, C, H]: Oklch): string {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return `#${[r, g, bl].map(v => gam(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** Lee un hex o un `oklch(L C H)`. */
export function parseColor(input: string): Oklch | null {
  const s = input.trim();
  const m = /^oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+([\d.]+)/i.exec(s);
  if (m) return [parseFloat(m[1]) > 1 ? parseFloat(m[1]) / 100 : parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
  return hexToOklch(s);
}

export const fmtOklch = ([L, C, H]: Oklch) => `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${H.toFixed(1)})`;

/** Distancia entre dos colores en OKLab. */
function distance(a: Oklch, b: Oklch) {
  const ax = a[1] * Math.cos((a[2] * Math.PI) / 180);
  const ay = a[1] * Math.sin((a[2] * Math.PI) / 180);
  const bx = b[1] * Math.cos((b[2] * Math.PI) / 180);
  const by = b[1] * Math.sin((b[2] * Math.PI) / 180);
  return Math.hypot(a[0] - b[0], ax - bx, ay - by);
}

const norm = (hex: string) => {
  const o = hexToOklch(hex);
  return o ? oklchToHex(o) : hex.toUpperCase();
};

/* ---------- derivePalette ---------- */

const SAME = 0.03;

export function derivePalette(detected: DetectedColor[], pieces: ColorPiece[], overrides: ColorOverrides = {}): Palette {
  // 1 · Ranking por frecuencia: colores casi iguales se suman.
  const merged: { hex: string; ok: Oklch; w: number }[] = [];
  for (const d of detected) {
    const ok = hexToOklch(d.hex);
    if (!ok || !(d.weight > 0)) continue;
    const w = d.weight * (d.source === 'agent' ? 1 : 2);
    const near = merged.find(m => distance(m.ok, ok) < SAME);
    if (near) near.w += w;
    else merged.push({ hex: oklchToHex(ok), ok, w });
  }
  const ranking = merged.sort((a, b) => b.w - a.w).map(m => m.hex);

  // 2 · Jerarquía: la pieza de color con más frecuencia de cada capa.
  const pick = (layer: LayerNo): string | null => {
    const best = pieces
      .filter(p => p.layer === layer && (overrides[p.id] || p.hex))
      .sort((a, b) => b.frequency - a.frequency)[0];
    if (!best) return null;
    return norm(overrides[best.id] || best.hex!);
  };
  const roles: (string | null)[] = [pick(1), pick(2), pick(3)];
  const used = (hex: string) => roles.some(r => r && distance(hexToOklch(r)!, hexToOklch(hex)!) < SAME);
  const defaults = [DEFAULT_PALETTE.primary, DEFAULT_PALETTE.secondary, DEFAULT_PALETTE.accent];
  const out = roles.map((r, i) => {
    if (r) return r;
    const next = ranking.find(h => !used(h));
    if (next) {
      roles[i] = next;
      return next;
    }
    return defaults[i];
  });
  return { primary: out[0], secondary: out[1], accent: out[2] };
}

/* ---------- Tema ---------- */

export const BONE = '#F4F1EC';
export const INK = '#141210';

/** Texto sobre un fondo: hueso si es oscuro (L < 0.6), tinta si es claro. */
export const textOn = (L: number) => (L < 0.6 ? BONE : INK);

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

/** Luminancia relativa (WCAG) de un hex. */
export function relLuminance(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16);
  const f = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}

/** Relación de contraste WCAG (1 a 21) entre dos hex. */
export function contrastRatio(a: string, b: string): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** De dos candidatos, el que más contrasta con el fondo (es el que se usa si ninguno llega al mínimo). */
export function bestOn(bg: string, a: string, b: string): string {
  return contrastRatio(bg, a) >= contrastRatio(bg, b) ? a : b;
}

const asHex = (o: Oklch) => oklchToHex(o);

export type Theme = Record<string, string>;

export interface ThemeOptions {
  /** Fondo elegido por el diseñador (hex). Se respeta tal cual; tinta, superficies, filetes y brillo se recalculan desde él. */
  bg?: string;
}

/**
 * Variables CSS de la interfaz a partir de la paleta («Editorial oscuro»).
 *  --cc-bg       tono del Núcleo con L 0.14 y croma 0.012 (neutro si el Núcleo es gris o negro)
 *  --cc-surface  fondo + 0.06 de L · --cc-raised fondo + 0.10
 *  --cc-text     blanco cálido con el tono del Núcleo (croma 0.01); sobre fondos claros, tinta oscura
 *  texto secundario al 75 % como mínimo · filetes al 12 %
 *  Por cada capa: -on (texto sobre el bloque, el que más contrasta), -ink (texto de 4.5:1 o más sobre el fondo),
 *  -head (titular grande: alcanza con 3:1), -under (subrayado de 4 px cuando el titular no llega y pasa a tinta).
 */
export function buildTheme(p: Palette, opts: ThemeOptions = {}): Theme {
  const prim = parseColor(p.primary) ?? parseColor(DEFAULT_PALETTE.primary)!;
  const sec = parseColor(p.secondary) ?? parseColor(DEFAULT_PALETTE.secondary)!;
  const acc = parseColor(p.accent) ?? parseColor(DEFAULT_PALETTE.accent)!;

  const forced = opts.bg ? hexToOklch(opts.bg) : null;
  const neutral = prim[1] < 0.01;
  const hue = neutral ? 0 : prim[2];
  const bg: Oklch = forced ?? [Math.min(0.14, prim[0]), neutral ? 0 : 0.012, hue];
  const light = bg[0] >= 0.6;
  const bgHex = asHex(bg);
  const step = light ? -0.06 : 0.06;
  const surface: Oklch = [Math.min(1, Math.max(0, bg[0] + step)), bg[1], bg[2]];
  const raised: Oklch = [Math.min(1, Math.max(0, bg[0] + step * (10 / 6))), bg[1], bg[2]];

  const text = light ? INK : asHex([0.955, neutral ? 0 : 0.01, hue]);
  const edge = (c: Oklch) => (contrastRatio(bgHex, asHex(c)) < 1.6 ? rgba(text, 0.4) : 'transparent');
  const on = (c: Oklch) => bestOn(asHex(c), bgHex, text);
  /** Texto en el color de la capa: si no llega al contraste pedido contra el fondo, va en el color de texto. */
  const ink = (c: Oklch, min: number) => (contrastRatio(bgHex, asHex(c)) >= min ? fmtOklch(c) : text);
  const under = (c: Oklch) => (contrastRatio(bgHex, asHex(c)) >= 3 ? 'transparent' : fmtOklch(c));

  return {
    '--cc-bg': fmtOklch(bg),
    '--cc-surface': fmtOklch(surface),
    '--cc-raised': fmtOklch(raised),
    '--cc-l0': fmtOklch(prim),
    '--cc-l1': fmtOklch(sec),
    '--cc-l2': fmtOklch(acc),
    '--cc-primary': fmtOklch(prim),
    '--cc-on-primary': on(prim),
    '--cc-text': text,
    '--cc-text-muted': rgba(text, 0.75),
    '--cc-line': rgba(text, 0.12),
    '--cc-line-hover': rgba(text, 0.2),
    '--cc-l0-edge': edge(prim),
    '--cc-l1-edge': edge(sec),
    '--cc-l2-edge': edge(acc),
    '--cc-l0-on': on(prim),
    '--cc-l1-on': on(sec),
    '--cc-l2-on': on(acc),
    '--cc-l0-ink': ink(prim, 4.5),
    '--cc-l1-ink': ink(sec, 4.5),
    '--cc-l2-ink': ink(acc, 4.5),
    '--cc-l0-head': ink(prim, 3),
    '--cc-l1-head': ink(sec, 3),
    '--cc-l2-head': ink(acc, 3),
    '--cc-l0-under': under(prim),
    '--cc-l1-under': under(sec),
    '--cc-l2-under': under(acc),
  };
}

/* ---------- Nombres de color (para el aviso «ahora usa Azul cobalto») ---------- */

export function colorName(input: string): string {
  const o = parseColor(input);
  if (!o) return input;
  const [L, C, H] = o;
  if (L < 0.2) return 'Negro';
  if (L > 0.95 && C < 0.03) return 'Blanco';
  if (C < 0.035) return L < 0.45 ? 'Gris oscuro' : L < 0.75 ? 'Gris' : 'Gris claro';
  const dark = L < 0.4 ? ' oscuro' : L > 0.82 ? ' claro' : '';
  let name: string;
  if (H < 20 || H >= 350) name = C > 0.15 ? 'Rojo' : 'Rojo apagado';
  else if (H < 45) name = L < 0.5 ? 'Marrón' : 'Naranja';
  else if (H < 75) name = L < 0.5 ? 'Marrón' : 'Naranja ámbar';
  else if (H < 110) name = 'Amarillo';
  else if (H < 165) name = 'Verde';
  else if (H < 205) name = 'Turquesa';
  else if (H < 245) name = 'Celeste';
  else if (H < 275) name = C > 0.15 ? 'Azul cobalto' : 'Azul';
  else if (H < 310) name = 'Violeta';
  else name = 'Rosa';
  return `${name}${dark}`;
}
