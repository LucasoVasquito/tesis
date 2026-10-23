import React from 'react';
import { PatternCategory } from '../../types';

export const CATEGORY_LABEL: Record<PatternCategory, string> = {
  typography: 'Tipografía',
  color: 'Color',
  texture: 'Textura',
  composition: 'Composición',
  logo_identity: 'Identidad y logo',
  packaging: 'Packaging',
  photography_treatment: 'Fotografía',
  mascot_illustration: 'Ilustración',
  flyer_poster: 'Afiches',
  social_media: 'Redes',
  geometry: 'Geometría',
  graphic_elements: 'Recursos gráficos',
  mood: 'Clima',
};

/** Tag mono de categoría: muestra la clave técnica, con el nombre en español como título accesible. */
export function CategoryTag({ category }: { category: PatternCategory | string }) {
  const label = CATEGORY_LABEL[category as PatternCategory] ?? category;
  return (
    <span
      className="inline-flex h-6 items-center rounded-tag border border-line-mid px-2 font-mono text-xs text-ink-2"
      title={label}
    >
      <span className="sr-only">Categoría: {label} · </span>
      <span aria-hidden="true">{category}</span>
    </span>
  );
}
