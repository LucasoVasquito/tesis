import { Layer, Moment, Project } from '../types';
import { contrastRatio, hexToOklch, oklchToHex, Oklch, Palette, parseColor } from './derivePalette';
import { piecesIn } from '../pieces/model';
import { corpusRefs } from './layers';
import { RefColorMap, chromaWeight } from './detectColors';

/**
 * Luces de clima (v7): detrás de toda la interfaz hay luces difusas, una por capa, más grano.
 * Color = color de la capa · tamaño = peso de la capa (referencias) · posición fija por capa.
 * Acá se decide QUÉ luces van según la etapa; `components/Clima.tsx` las dibuja y las anima.
 */

export interface Light {
  id: string;
  /** Color (hex). */
  color: string;
  /** Centro, en fracciones de la ventana (0..1; puede salirse un poco). */
  x: number;
  y: number;
  /** Radio, en fracción de vmax. */
  r: number;
  /** Opacidad del centro de la luz. */
  o: number;
}

export interface ClimaState {
  lights: Light[];
  /** Deriva lenta permanente (±20 px en 20 s). */
  drift: boolean;
  /** Las luces giran y se fusionan (el agente está analizando). */
  swirl: boolean;
  /** Cuánto tarda en llegar a lo nuevo (ms): 1200 normal, 2000 al terminar el análisis. */
  ease: number;
}

/** Posición fija por capa: el usuario aprende dónde está cada una. */
const POS: Record<Layer, { x: number; y: number; r: number }> = {
  1: { x: 0.12, y: 0.1, r: 0.55 }, // arriba a la izquierda, grande
  2: { x: 0.9, y: 0.92, r: 0.46 }, // abajo a la derecha
  3: { x: 0.86, y: 0.08, r: 0.32 }, // arriba a la derecha, chica
};
/** En Probar se alejan de los marcos de las variantes. */
const AWAY: Record<Layer, { x: number; y: number }> = { 1: { x: -0.08, y: -0.12 }, 2: { x: 1.08, y: 1.12 }, 3: { x: 1.08, y: -0.12 } };

const WARM_GRAY = '#8A8178';

/** Fondo y texto de la interfaz (mismo cálculo que el tema): para cuidar el contraste. */
export function baseColors(p: Palette): { bg: string; text: string; light: boolean } {
  const prim = parseColor(p.primary) ?? [0.5, 0, 0];
  const neutral = prim[1] < 0.01;
  const bg: Oklch = [Math.min(0.13, prim[0]), neutral ? 0 : 0.02, neutral ? 0 : prim[2]];
  return { bg: oklchToHex(bg), text: oklchToHex([0.955, neutral ? 0 : 0.01, neutral ? 0 : prim[2]]), light: false };
}

/** Mezcla en sRGB (lo que se ve: el fondo con la luz encima a cierta opacidad). */
function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

/**
 * Ningún texto baja de 4.5:1: se mide contra el punto más claro posible (fondo + luz a su opacidad máxima)
 * y, si no llega, se baja la opacidad de esa luz (nunca la del texto).
 */
export function capOpacity(color: string, o: number, bg: string, text: string): number {
  let v = o;
  while (v > 0.05 && contrastRatio(text, mix(bg, color, v)) < 4.5) v -= 0.03;
  return Math.max(0, v);
}

/** Peso de cada capa: cuántas referencias distintas la sostienen (0..1, la mayor = 1). */
export function layerWeights(p: Project): Record<Layer, number> {
  const n = ([1, 2, 3] as Layer[]).map(l => new Set(piecesIn(p, l).flatMap(x => x.evidence)).size);
  const max = Math.max(...n);
  if (!max) return { 1: 1, 2: 0.7, 3: 0.45 };
  return { 1: n[0] / max, 2: n[1] / max, 3: n[2] / max };
}

/** ¿El proyecto no tiene color? (todo casi gris). Entonces las luces son grises: no se inventa color. */
const isGray = (hexes: string[]) => hexes.every(h => (hexToOklch(h)?.[1] ?? 0) < 0.03);
const grayFor = (w: number) => oklchToHex([0.32 + 0.3 * w, 0, 0]);

/** Las tres luces de capa, con su peso. `focus`: la capa en foco crece; `dim`: las otras bajan. */
function layerLights(palette: Palette, w: Record<Layer, number>, opts: { focus?: Layer | null; dimOthers?: boolean; focusScale?: number; intensity?: number; away?: boolean } = {}): Light[] {
  const cols: Record<Layer, string> = { 1: palette.primary, 2: palette.secondary, 3: palette.accent };
  const gray = isGray([cols[1], cols[2], cols[3]]);
  return ([1, 2, 3] as Layer[]).map(l => {
    const weight = Math.max(0.15, w[l]);
    const focused = opts.focus === l;
    const pos = opts.away ? { ...POS[l], ...AWAY[l] } : POS[l];
    let r = POS[l].r * (0.6 + 0.5 * weight);
    let o = 0.35 + 0.4 * weight;
    if (focused) r *= opts.focusScale ?? 2;
    if (opts.focus && !focused && opts.dimOthers) o = 0.2;
    o *= opts.intensity ?? 1;
    return { id: `l${l}`, color: gray ? grayFor(weight) : cols[l], x: pos.x, y: pos.y, r, o };
  });
}

/** Hasta 6 luces con el color dominante de las referencias que se van sumando (se funden los parecidos). */
function referenceLights(p: Project, byRef: RefColorMap | null): Light[] {
  const refs = corpusRefs(p);
  if (!byRef || !refs.length) return [];
  const groups: { hex: string; ok: Oklch; n: number }[] = [];
  for (const r of refs) {
    const colors = byRef.get(r.id);
    if (!colors?.length) continue;
    const best = [...colors].sort((a, b) => b.share * chromaWeight(b.hex) - a.share * chromaWeight(a.hex))[0];
    const ok = hexToOklch(best.hex);
    if (!ok) continue;
    const near = groups.find(g => Math.hypot(g.ok[0] - ok[0], g.ok[1] - ok[1], ((g.ok[2] - ok[2]) / 360) * g.ok[1] * 2) < 0.09);
    if (near) near.n++;
    else groups.push({ hex: best.hex, ok, n: 1 });
  }
  const top = groups.sort((a, b) => b.n - a.n).slice(0, 6);
  const max = top[0]?.n ?? 1;
  const SLOTS = [
    { x: 0.14, y: 0.14 },
    { x: 0.88, y: 0.88 },
    { x: 0.86, y: 0.12 },
    { x: 0.12, y: 0.86 },
    { x: 0.5, y: 0.02 },
    { x: 0.5, y: 0.98 },
  ];
  return top.map((g, i) => {
    const w = g.n / max;
    return { id: `ref-${g.hex}`, color: g.hex, x: SLOTS[i].x, y: SLOTS[i].y, r: 0.22 + 0.22 * w, o: 0.3 + 0.35 * w };
  });
}

/** Una sola luz neutra: el camaleón dormido (Brief, o sin nada cargado). */
const asleep = (): Light[] => [{ id: 'l1', color: WARM_GRAY, x: POS[1].x, y: POS[1].y, r: 0.6, o: 0.2 }];

export interface ClimaInput {
  screen: Moment;
  project: Project;
  palette: Palette;
  byRef: RefColorMap | null;
  analyzing: boolean;
  /** Terminó un análisis hace instantes: la transición a las tres luces se hace más lenta y visible. */
  justAnalyzed: boolean;
  /** Capa en foco (Revisar: la propuesta o la elegida; Capas: la que se mira). */
  focus: Layer | null;
  /** Colores de la variante recién aprobada (Probar), por 2 s. */
  flash: string[] | null;
  analyzed: boolean;
}

export function buildClima(i: ClimaInput): ClimaState {
  const { bg, text } = baseColors(i.palette);
  const w = layerWeights(i.project);
  let lights: Light[];
  let drift = true;
  let swirl = false;
  let ease = i.justAnalyzed ? 2000 : 1200;

  if (i.flash?.length) {
    // Probar: al aprobar, el fondo toma por 2 s los colores de la variante.
    lights = i.flash.slice(0, 3).map((c, k) => {
      const l = (k + 1) as Layer;
      return { id: `l${l}`, color: c, x: POS[l].x, y: POS[l].y, r: POS[l].r, o: 0.55 };
    });
    ease = 800;
  } else if (i.screen === 'brief') {
    lights = asleep();
  } else if (i.screen === 'referencias' && (i.analyzing || !i.analyzed)) {
    // Absorbe lo que se carga; mientras analiza, las luces giran y se funden.
    lights = referenceLights(i.project, i.byRef);
    if (!lights.length) lights = asleep();
    swirl = i.analyzing;
  } else if (i.screen === 'revisar') {
    lights = layerLights(i.palette, w, { focus: i.focus, focusScale: 1.6 });
  } else if (i.screen === 'capas') {
    lights = layerLights(i.palette, w, { focus: i.focus, focusScale: 2, dimOthers: true });
  } else if (i.screen === 'sistema') {
    lights = layerLights(i.palette, w);
    drift = false;
  } else if (i.screen === 'probar') {
    // Para juzgar color, el fondo no puede teñir la pieza: luces tenues y lejos de los marcos.
    lights = layerLights(i.palette, w, { intensity: 0.3, away: true });
  } else {
    lights = layerLights(i.palette, w);
  }
  return { lights: lights.map(l => ({ ...l, o: capOpacity(l.color, l.o, bg, text) })), drift, swirl, ease };
}
