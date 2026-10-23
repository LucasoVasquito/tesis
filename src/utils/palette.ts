import { PaletteColor, Pattern, Reference, ReferenceColor } from '../types';

/* ---------- Conversión sRGB → CIELAB (D65) ---------- */
type Lab = [number, number, number];

export function normalizeHex(input: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return `#${h.toUpperCase()}`;
}

export function hexToLab(hex: string): Lab {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const r = lin((n >> 16) & 255), g = lin((n >> 8) & 255), b = lin(n & 255);
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** Distancia ΔE (CIE76). */
export const deltaE = (a: Lab, b: Lab) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/* ---------- Inferencia ---------- */
interface Sample {
  hex: string;
  lab: Lab;
  name: string;
  role: string;
  source: string; // refId o patternId
  weight: number;
}

const ROLE_WEIGHT: Record<ReferenceColor['role'], number> = { predominant: 3, background: 2, accent: 1.5, detail: 1 };
const ROLE_LABEL: Record<ReferenceColor['role'], string> = { predominant: 'Predominante', background: 'Fondo', accent: 'Acento', detail: 'Detalle' };

const parsePct = (p?: string) => {
  const n = p ? parseFloat(p.replace(',', '.')) : NaN;
  return Number.isFinite(n) ? Math.max(0.2, n / 25) : 1;
};

export const HEX_IN_TEXT = /#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi;

/** Referencias de evidencia de los patrones dados (sin duplicados). */
export function evidenceReferences(patterns: Pattern[], references: Reference[]): Reference[] {
  const ids = new Set(patterns.flatMap(p => p.evidence));
  return references.filter(r => ids.has(r.id));
}

export const MAX_DISTANCE = 10;

/**
 * Paleta del sistema inferida del corpus:
 * 1. colores del desglose de las referencias que son evidencia de los patrones confirmados;
 * 2. HEX citados en la descripción de los patrones de categoría `color`;
 * 3. agrupación de colores cercanos (ΔE < 10), orden por frecuencia;
 * 4. entre 4 y 6 colores, cada uno con su `source`.
 */
export function inferPalette(patterns: Pattern[], references: Reference[], opts: { min?: number; max?: number } = {}): PaletteColor[] {
  const { max = 6 } = opts;
  const confirmed = patterns.filter(p => p.status === 'confirmed');
  const samples: Sample[] = [];

  for (const ref of evidenceReferences(confirmed, references)) {
    for (const c of ref.breakdown?.colors ?? []) {
      const hex = normalizeHex(c.hex);
      if (!hex) continue;
      samples.push({ hex, lab: hexToLab(hex), name: c.name, role: ROLE_LABEL[c.role] ?? c.role, source: ref.id, weight: (ROLE_WEIGHT[c.role] ?? 1) * parsePct(c.percentage) });
    }
  }
  for (const p of confirmed.filter(x => x.category === 'color')) {
    const text = `${p.description} ${(p.relatedObservations ?? []).join(' ')}`;
    for (const raw of text.match(HEX_IN_TEXT) ?? []) {
      const hex = normalizeHex(raw);
      if (!hex) continue;
      samples.push({ hex, lab: hexToLab(hex), name: '', role: 'Patrón de color', source: p.id, weight: 2 });
    }
  }

  // Agrupar: cada muestra se suma al primer grupo cuyo representante esté a menos de MAX_DISTANCE.
  const clusters: { rep: Sample; members: Sample[] }[] = [];
  for (const s of [...samples].sort((a, b) => b.weight - a.weight)) {
    const target = clusters.find(c => deltaE(c.rep.lab, s.lab) < MAX_DISTANCE);
    if (target) target.members.push(s);
    else clusters.push({ rep: s, members: [s] });
  }

  const ranked = clusters
    .map(c => {
      const sources = new Set(c.members.map(m => m.source));
      const named = c.members.find(m => m.name) ?? c.rep;
      // Origen: la fuente con más peso dentro del grupo.
      const bySource = new Map<string, number>();
      c.members.forEach(m => bySource.set(m.source, (bySource.get(m.source) ?? 0) + m.weight));
      const source = [...bySource.entries()].sort((a, b) => b[1] - a[1])[0][0];
      return {
        frequency: sources.size,
        weight: c.members.reduce((a, m) => a + m.weight, 0),
        color: { hex: c.rep.hex, name: named.name || c.rep.hex, role: c.rep.role, source } as PaletteColor,
      };
    })
    .sort((a, b) => b.frequency - a.frequency || b.weight - a.weight);

  return ranked.slice(0, max).map(r => r.color);
}
