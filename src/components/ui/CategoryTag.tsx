import React from 'react';
import { PatternCategory } from '../../types';
import { familyOf, familyTint } from '../../utils/families';

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

/**
 * Tag mono de categoría, teñido con el color de su familia.
 * La familia Color muestra hasta 3 colores de la paleta del corpus, si se pasan.
 */
export function CategoryTag({ category, palette }: { category: PatternCategory | string; palette?: string[] }) {
  const label = CATEGORY_LABEL[category as PatternCategory] ?? category;
  const f = familyOf(category);
  return (
    <span
      className="inline-flex h-6 items-center gap-2 rounded-tag border px-2 font-mono text-xs"
      style={{ borderColor: familyTint(f, 0.3), color: f.ink, background: familyTint(f, 0.06) }}
      title={`${label} · familia ${f.label}`}
    >
      {f.id === 'color' && palette && palette.length > 0 && (
        <span aria-hidden="true" className="flex h-2.5 w-6 overflow-hidden rounded-[2px]">
          {palette.slice(0, 3).map((c, i) => (
            <span key={i} className="flex-1" style={{ background: c }} />
          ))}
        </span>
      )}
      <span className="sr-only">Categoría: {label} · </span>
      <span aria-hidden="true">{category}</span>
    </span>
  );
}
