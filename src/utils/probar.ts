import { Layer, Pattern, PatternCategory, PieceType, Project } from '../types';
import { fullRule, oneLine, shortRule } from './layerRules';
import { piecesIn } from '../pieces/model';
import { stackPalette } from './stackExport';

/**
 * 03 PROBAR: aplicar el sistema a una pieza concreta. La receta dice exactamente qué parte del sistema se usa,
 * ordenada por capa y por peso. El pedido sigue siempre el mismo orden y no pasa de 5 decisiones.
 */

export interface PieceTypeInfo {
  id: PieceType;
  label: string;
  /** Formato sugerido. */
  format: string;
  photo?: boolean;
  placeholder: string;
  /** Categorías de piezas que tienen sentido para este tipo de pieza, de más a menos importante. */
  prefers: PatternCategory[];
}

export const PIECE_TYPES: PieceTypeInfo[] = [
  { id: 'logo', label: 'Logotipo', format: '1:1', placeholder: 'Ej: que funcione en sellos y en el envoltorio; evitar ilustraciones literales de comida', prefers: ['typography', 'logo_identity', 'mascot_illustration', 'graphic_elements'] },
  { id: 'facade', label: 'Fachada', format: '3:2', photo: true, placeholder: 'Ej: local en esquina, de noche, cartel de chapa con luz, persiana a medio subir', prefers: ['space_environment', 'typography', 'texture', 'logo_identity'] },
  { id: 'packaging', label: 'Packaging', format: '1:1', photo: true, placeholder: 'Ej: caja de cartón kraft abierta sobre una barra de acero, con papel impreso', prefers: ['packaging', 'texture', 'graphic_elements', 'logo_identity', 'mascot_illustration'] },
  { id: 'poster', label: 'Afiche', format: '2:3', placeholder: 'Ej: fiesta de apertura, titular “Abrimos de noche”, fecha y dirección', prefers: ['flyer_poster', 'typography', 'composition', 'photography_treatment', 'graphic_elements'] },
  { id: 'post', label: 'Post', format: '1:1', placeholder: 'Ej: lanzamiento de la doble smash, precio y “solo este finde”', prefers: ['social_media', 'composition', 'photography_treatment', 'typography'] },
  { id: 'story', label: 'Story', format: '2:3', placeholder: 'Ej: cuenta regresiva para la apertura', prefers: ['social_media', 'composition', 'photography_treatment', 'typography'] },
  { id: 'web', label: 'Web', format: '3:2', placeholder: 'Ej: home con la carta y un botón para pedir', prefers: ['composition', 'typography', 'photography_treatment', 'social_media'] },
  { id: 'other', label: 'Otra', format: 'auto', placeholder: 'Describí la pieza', prefers: [] },
];
export const pieceTypeInfo = (t: PieceType) => PIECE_TYPES.find(p => p.id === t)!;

/** Como máximo 3 a 5 decisiones en total, para no saturar el pedido. */
export const MAX_DECISIONS = 5;
/** Del Núcleo, el agente preselecciona las 3 piezas de más peso; el usuario puede cambiarlas. */
export const MAX_CORE = 3;
/** Imágenes de referencia del Núcleo que se mandan al modelo de imagen. */
export const MAX_CORE_IMAGES = 3;

export interface Recipe {
  /** Núcleo: todo lo que hay; las 3 de más peso vienen marcadas. */
  core: Pattern[];
  /** Soporte: todo lo que hay, el usuario primero. */
  support: Pattern[];
  /** Acento: todo lo que hay, el usuario primero. */
  accent: Pattern[];
  /** Lo que el agente preselecciona para este tipo de pieza. */
  suggested: Set<string>;
}

/** Cuánto sentido tiene una pieza para un tipo de pieza: menor es mejor; -1 si no aplica. */
const fit = (x: Pattern, t: PieceTypeInfo) => t.prefers.indexOf(x.category);

/**
 * La receta: el Núcleo entra entero; el agente preselecciona 1 o 2 piezas de Soporte que tienen sentido para el tipo
 * de pieza y, como máximo, un Acento (solo si aplica). Todo ordenado por peso: lo del usuario primero.
 */
export function buildRecipe(p: Project, type: PieceType): Recipe {
  const info = pieceTypeInfo(type);
  const core = piecesIn(p, 1);
  const support = piecesIn(p, 2);
  const accent = piecesIn(p, 3);
  const best = (list: Pattern[], n: number) =>
    list
      .map((x, i) => ({ x, i, f: fit(x, info) }))
      .filter(r => r.f !== -1)
      .sort((a, b) => a.f - b.f || a.i - b.i)
      .slice(0, n)
      .map(r => r.x.id);
  return { core, support, accent, suggested: new Set([...core.slice(0, MAX_CORE).map(x => x.id), ...best(support, 2), ...best(accent, 1)]) };
}

export interface Selection {
  core: Pattern[];
  support: Pattern[];
  accent: Pattern | null;
  /** Lo que quedó afuera por el límite de decisiones. */
  omitted: Pattern[];
}

/** Lo que entra al pedido: Núcleo, Soporte marcado y Acento marcado, por capa y por peso, hasta el límite. */
export function selectDecisions(r: Recipe, on: (id: string) => boolean): Selection {
  const all = [
    ...r.core.filter(x => on(x.id)).map(x => ({ x, layer: 1 as Layer })),
    ...r.support.filter(x => on(x.id)).map(x => ({ x, layer: 2 as Layer })),
    ...r.accent.filter(x => on(x.id)).slice(0, 1).map(x => ({ x, layer: 3 as Layer })),
  ];
  const kept = all.slice(0, MAX_DECISIONS);
  const omitted = all.slice(MAX_DECISIONS).map(a => a.x);
  return {
    core: kept.filter(a => a.layer === 1).map(a => a.x),
    support: kept.filter(a => a.layer === 2).map(a => a.x),
    accent: kept.find(a => a.layer === 3)?.x ?? null,
    omitted,
  };
}

const pct = (n?: number) => `${Math.round((n ?? 0) * 100)}%`;
const LAYER_EN: Record<Layer, string> = { 1: 'core', 2: 'support', 3: 'accent' };

export interface PromptInput {
  type: PieceType;
  sel: Selection;
  /** Modo directo: solo el pedido, el texto y la paleta. */
  direct: boolean;
  text: string;
  request: string;
  transparent: boolean;
  /** Paleta sacada de una imagen de referencia: reemplaza a la del sistema. */
  palette?: { hex: string; share: number }[];
}

/**
 * El pedido, siempre en este orden:
 * 1 tipo de pieza y formato · 2 Núcleo (obligatorio) · 3 Soporte (secundario) · 4 Acento (detalle menor)
 * 5 paleta, en proporción según la capa · 6 texto y pedido libre · 7 restricciones.
 */
export function buildProbarPrompt(p: Project, o: PromptInput): string {
  const info = pieceTypeInfo(o.type);
  const palette: { hex: string; name?: string; share?: number; layer?: Layer }[] = o.palette?.length ? o.palette : stackPalette(p);
  const lines: string[] = [];

  lines.push('# 1 · Piece and format');
  lines.push(`Piece: ${info.label}. Format: ${info.format === 'auto' ? 'free' : info.format}${info.photo ? ' (a realistic photograph of the brand applied)' : ' (flat graphic artwork seen straight on, not a mock-up)'}.`);
  lines.push(`Brand: ${p.name || p.intent || ''}${p.intent && p.intent !== p.name ? ` — ${p.intent}` : ''}`);

  if (!o.direct) {
    if (o.sel.core.length) {
      lines.push('', '# 2 · Core (mandatory: it must dominate and be clearly recognizable, in this order of weight)');
      o.sel.core.forEach(x => lines.push(`- It must have: ${x.name}${fullRule(x) ? ` — ${fullRule(x).slice(0, 500)}` : ''}`));
    }
    if (o.sel.support.length) {
      lines.push('', '# 3 · Support (secondary: present but never competing with the core)');
      o.sel.support.forEach(x => lines.push(`- Incorporate: ${x.name}${shortRule(x) ? ` — ${shortRule(x)}` : ''}`));
    }
    if (o.sel.accent) {
      lines.push('', '# 4 · Accent (minor detail)');
      lines.push(`- A detail of ${o.sel.accent.name}${oneLine(o.sel.accent) ? ` (${oneLine(o.sel.accent)})` : ''}, in very little surface. Use it once, never as a background.`);
    }
  }

  if (palette.length) {
    lines.push('', '# 5 · Palette (use only these colors, in this proportion)');
    palette.forEach(c => lines.push(`- ${c.hex.toUpperCase()}${c.name ? ` · ${c.name}` : ''} — about ${pct(c.share)}${c.layer ? ` (${LAYER_EN[c.layer]})` : ''}`));
  }

  if (o.text.trim() || o.request.trim()) {
    lines.push('', '# 6 · Text and request');
    if (o.text.trim()) lines.push(`Text to render exactly, spelled as given: "${o.text.trim()}".`);
    if (o.request.trim()) lines.push(`What the designer asks for: ${o.request.trim()}`);
  }

  lines.push('', '# 7 · Constraints');
  if (!o.direct) lines.push('- Do not add elements foreign to the system. Everything visible must come from the core, support or accent above.');
  if (o.transparent) lines.push('- Background: transparent, with the artwork alone.');
  lines.push('- Spell every word exactly as given. Keep text short.');
  return lines.join('\n');
}
