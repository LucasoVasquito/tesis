import { Layer } from '../types';

/** Pregunta guía de cada capa: explica qué va ahí sin vocabulario técnico. */
export const LAYER_QUESTION: Record<Layer, string> = {
  1: 'Sin esto deja de ser la marca',
  2: 'La acompaña siempre, pero se podría cambiar',
  3: 'Aparece poco, pero la hace reconocible',
};
