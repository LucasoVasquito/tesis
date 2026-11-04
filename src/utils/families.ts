import { PatternCategory } from '../types';

export type FamilyId = 'typography' | 'composition' | 'matter' | 'identity' | 'image' | 'color';

export interface Family {
  id: FamilyId;
  label: string;
  /** Tono oklch; Color no tiene tono propio: usa la paleta del corpus. */
  hue?: number;
  /** Color pleno (filetes, puntos). */
  color: string;
  /** Texto sobre fondo oscuro. */
  ink: string;
}

const fam = (id: FamilyId, label: string, hue: number, l = 0.8, li = 0.86): Family => ({
  id,
  label,
  hue,
  color: `oklch(${l} 0.11 ${hue})`,
  ink: `oklch(${li} 0.08 ${hue})`,
});

export const FAMILIES: Record<FamilyId, Family> = {
  typography: fam('typography', 'Tipografía', 285),
  composition: fam('composition', 'Composición', 230),
  matter: fam('matter', 'Materia', 60),
  identity: fam('identity', 'Identidad', 110, 0.82, 0.88),
  image: fam('image', 'Imagen', 195),
  color: { id: 'color', label: 'Color', color: 'var(--color-ink-2)', ink: 'var(--color-ink)' },
};

/** Las 13 categorías agrupadas en 5 familias más Color. */
export const CATEGORY_FAMILY: Record<PatternCategory, FamilyId> = {
  typography: 'typography',
  flyer_poster: 'typography',
  composition: 'composition',
  geometry: 'composition',
  graphic_elements: 'composition',
  texture: 'matter',
  packaging: 'matter',
  space_environment: 'matter',
  logo_identity: 'identity',
  mascot_illustration: 'identity',
  photography_treatment: 'image',
  social_media: 'image',
  mood: 'image',
  color: 'color',
};

export const familyOf = (category: PatternCategory | string): Family => FAMILIES[CATEGORY_FAMILY[category as PatternCategory] ?? 'image'];

/** Tinte de fondo/borde de una familia (para chips y tags). */
export const familyTint = (f: Family, alpha: number) => (f.hue === undefined ? `rgba(255,255,255,${alpha})` : `oklch(0.8 0.11 ${f.hue} / ${alpha})`);
