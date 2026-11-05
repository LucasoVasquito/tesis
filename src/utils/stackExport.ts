import { Layer, PaletteColor, Pattern, Project, Rule, VisualSystem } from '../types';
import { deltaE, hexToLab, inferPalette, MAX_DISTANCE } from './palette';
import { corpusRefs, evidenceCount, layerTag } from './layers';
import { fullRule, layerContents, oneLine, shortRule, stackOrder } from './layerRules';

/**
 * Consecuencias de la lámina: la lámina no es decorativa, cambia el resultado.
 * - DALL·E: el prompt va en orden de lámina; el núcleo pesa más, el acento es un detalle.
 * - Lineamientos: núcleo = regla completa con ejemplos, soporte = regla corta, acento = una línea.
 * - Paleta: sale del corpus; orden y proporción siguen la lámina de los patrones de color.
 */

const LAYER_WEIGHT: Record<Layer, number> = { 1: 3, 2: 2, 3: 1 };
/** Cupo de colores por lámina (de 6): la proporción de la paleta sigue la lámina. */
const LAYER_QUOTA: Record<Layer, number> = { 1: 3, 2: 2, 3: 1 };

export interface StackPaletteColor extends PaletteColor {
  layer: Layer;
}

/**
 * Paleta de la pila. Si hay patrones de color en la pila, mandan ellos; si no, todos los patrones.
 * Cada color toma la lámina más importante en la que aparece y su proporción sale del peso de esa lámina.
 */
export function stackPalette(p: Project, max = 6): StackPaletteColor[] {
  const placed = stackOrder(p);
  const colorOnly = placed.some(x => x.pattern.category === 'color');
  const out: StackPaletteColor[] = [];
  const spare: StackPaletteColor[] = [];
  for (const l of [1, 2, 3] as Layer[]) {
    const pats = placed.filter(x => x.layer === l && (!colorOnly || x.pattern.category === 'color')).map(x => ({ ...x.pattern, status: 'confirmed' as const }));
    // Fragmentos de color sueltos en la lámina: su imagen de origen también aporta.
    const colorFrags = layerContents(p, l).fragments.filter(f => f.type === 'color');
    const fake: Pattern[] = colorFrags.map(f => ({ id: f.id, name: f.label, category: 'color', description: '', evidence: [f.refId], confidence: 1, status: 'confirmed', relatedObservations: [] }));
    const all = [...pats, ...fake];
    if (!all.length) continue;
    let taken = 0;
    for (const c of inferPalette(all, p.references, { max })) {
      if ([...out, ...spare].some(o => deltaE(hexToLab(o.hex), hexToLab(c.hex)) < MAX_DISTANCE)) continue;
      if (taken < LAYER_QUOTA[l]) {
        out.push({ ...c, layer: l });
        taken++;
      } else spare.push({ ...c, layer: l });
    }
  }
  // Si una lámina no llenó su cupo, lo completan los colores que sobraron (en orden de lámina).
  const top = [...out, ...spare].slice(0, max).sort((a, b) => a.layer - b.layer);
  const total = top.reduce((a, c) => a + LAYER_WEIGHT[c.layer], 0) || 1;
  return top.map(c => ({ ...c, share: LAYER_WEIGHT[c.layer] / total }));
}

const pct = (n?: number) => `${Math.round((n ?? 0) * 100)}%`;
/** Las sugerencias de la IA que el diseñador todavía no confirmó van marcadas. */
const unaudited = (x: Pattern) => (x.layerConfirmed ? '' : ' [AGENTE · SUGERENCIA]');

/* ---------- DALL·E ---------- */

/** Pila en el formato que recibe el servidor para armar el prompt. */
export const stackPayload = (p: Project) =>
  stackOrder(p).map(({ pattern, layer }) => ({
    layer,
    name: pattern.name,
    rule: layer === 1 ? fullRule(pattern) : layer === 2 ? shortRule(pattern) : oneLine(pattern),
    audited: !!pattern.audited,
  }));

/** Prompt de DALL·E en orden de lámina. `piece` es lo que se pide ("afiche", "packaging"…). */
export function buildStackPrompt(p: Project, piece = '[describí la pieza: afiche, packaging, post…]'): string {
  const by = (l: Layer) => stackPayload(p).filter(x => x.layer === l);
  const block = (l: Layer, title: string) => {
    const items = by(l);
    return items.length ? [`## ${title}`, ...items.map(x => `- ${x.name}${x.rule ? `: ${x.rule}` : ''}`)].join('\n') : '';
  };
  const palette = stackPalette(p);
  return [
    `# Request`,
    `Piece: ${piece}.`,
    `Brand: ${p.name || p.intent || ''}${p.intent && p.intent !== p.name ? ` — ${p.intent}` : ''}`,
    p.brief || p.objective ? `Context: ${p.brief || p.objective}` : '',
    ``,
    `# Visual hierarchy (follow this order of weight)`,
    block(1, '1 · CORE — defines the piece. It must dominate: the largest share of the image and the first thing you see.'),
    block(2, '2 · SUPPORT — accompanies the core. Present, but secondary.'),
    block(3, '3 · ACCENT — a minor detail only: small, used once, never as background.'),
    palette.length ? `\n# Palette (use only these colors, in this proportion)\n${palette.map(c => `- ${c.hex.toUpperCase()} ${c.name ? `· ${c.name} ` : ''}— about ${pct(c.share)} (${layerTag(c.layer).toLowerCase()})`).join('\n')}` : '',
  ]
    .filter(x => x !== '')
    .join('\n');
}

/* ---------- Lineamientos ---------- */

export function stackGuidelinesMarkdown(p: Project): string {
  const total = corpusRefs(p).length;
  const lines: string[] = [];
  const title = p.name || p.intent || 'Sistema visual';
  lines.push(`# ${title}`, '');
  if (p.intent && p.intent !== title) lines.push(`> ${p.intent}`, '');
  if (p.brief) lines.push(p.brief, '');
  lines.push(`Sistema visual en tres capas. El Núcleo define, el Soporte acompaña y el Acento da carácter. Las piezas marcadas con [AGENTE · SUGERENCIA] las ubicó el agente y el diseñador todavía no las confirmó.`, '');

  const core = layerContents(p, 1);
  lines.push(`## 01 · Núcleo`, '');
  if (!core.patterns.length && !core.fragments.length) lines.push('_Vacío._', '');
  for (const x of core.patterns) {
    lines.push(`### ${x.name}${unaudited(x)}`, '');
    lines.push(fullRule(x) || '_Sin regla redactada._', '');
    if (x.relatedObservations?.length) lines.push(...x.relatedObservations.slice(0, 5).map(o => `- ${o}`), '');
    const frags = (p.fragments ?? []).filter(f => f.groupId === x.id || x.fragmentIds?.includes(f.id));
    if (frags.length) lines.push(`Definición: ${frags.map(f => `${f.label} (${f.refId})`).join(' · ')}`, '');
    lines.push(`Ejemplos: ${x.evidence.slice(0, 8).join(', ') || '—'} · aparece en ${evidenceCount(x, p)} de ${total} referencias`, '');
  }
  for (const f of core.fragments) lines.push(`- Fragmento: ${f.label} (${f.refId})`);
  if (core.fragments.length) lines.push('');

  const support = layerContents(p, 2);
  lines.push(`## 02 · Soporte`, '');
  if (!support.patterns.length && !support.fragments.length) lines.push('_Vacío._', '');
  for (const x of support.patterns) lines.push(`- **${x.name}**${unaudited(x)}: ${shortRule(x) || '—'} _(${evidenceCount(x, p)} de ${total} referencias)_`);
  for (const f of support.fragments) lines.push(`- Fragmento: ${f.label} (${f.refId})`);
  lines.push('');

  const accent = layerContents(p, 3);
  lines.push(`## 03 · Acento`, '');
  if (!accent.patterns.length && !accent.fragments.length) lines.push('_Vacío._', '');
  for (const x of accent.patterns) lines.push(`- ${x.name}${unaudited(x)} — ${oneLine(x) || '—'}`);
  for (const f of accent.fragments) lines.push(`- ${f.label} (${f.refId})`);
  lines.push('');

  const palette = stackPalette(p);
  lines.push(`## Paleta`, '');
  if (!palette.length) lines.push('_Sin colores todavía: en 03 SISTEMA, «Completar paleta» lee los colores de tus referencias._', '');
  for (const c of palette) lines.push(`- \`${c.hex.toUpperCase()}\` ${c.name} · ${pct(c.share)} · ${layerTag(c.layer)} · ← ${c.source ?? '—'}`);
  lines.push('');

  const out = p.patterns.filter(x => x.status === 'discarded' && !x.isGroup);
  if (out.length) lines.push(`## Fuera del sistema`, '', ...out.map(x => `- ${x.name}`), '');
  lines.push(`---`, `*Generado con Camaleón · ${new Date().toLocaleDateString('es-AR')}*`);
  return lines.join('\n');
}

/* ---------- La pila como sistema (para la vista de generación) ---------- */

const RULE_FAMILY = (x: Pattern): 'typographyRules' | 'textureRules' | 'compositionRules' =>
  x.category === 'typography' || x.category === 'flyer_poster' ? 'typographyRules' : x.category === 'texture' || x.category === 'packaging' ? 'textureRules' : 'compositionRules';

/** La pila leída como sistema visual: el orden de las reglas sigue la lámina. */
export function stackSystem(p: Project): VisualSystem {
  const ordered = stackOrder(p);
  const rules: Record<'typographyRules' | 'textureRules' | 'compositionRules', Rule[]> = { typographyRules: [], textureRules: [], compositionRules: [] };
  const prefix = { typographyRules: 'T', textureRules: 'X', compositionRules: 'C' } as const;
  for (const { pattern, layer } of ordered) {
    const fam = RULE_FAMILY(pattern);
    rules[fam].push({
      code: `${prefix[fam]}${rules[fam].length + 1}`,
      title: `${pattern.name} (${layerTag(layer).toLowerCase()})`,
      detail: layer === 1 ? fullRule(pattern) : layer === 2 ? shortRule(pattern) : oneLine(pattern),
      patternIds: [pattern.id],
      refIds: pattern.evidence.slice(0, 6),
    });
  }
  return {
    id: 'stack',
    name: p.name || p.intent || 'Pila',
    description: p.brief || p.objective || '',
    patternIds: ordered.map(x => x.pattern.id),
    referenceIds: [...new Set(ordered.flatMap(x => x.pattern.evidence))],
    status: 'active',
    colorPalette: stackPalette(p),
    aestheticPillars: ordered.filter(x => x.layer === 1).map(x => x.pattern.name),
    ...rules,
    createdAt: p.createdAt,
  };
}
