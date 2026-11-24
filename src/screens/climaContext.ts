import { createContext, useContext } from 'react';
import { Layer } from '../types';

/** Lo que las etapas le dicen al clima de fondo (v7). */
export interface ClimaCtx {
  /** Capa en foco: su luz crece (Revisar: la propuesta o la elegida; Capas: la que se mira). */
  setFocus: (layer: Layer | null) => void;
  /** Un pulso corto de la luz en foco (al aceptar una sugerencia). */
  pulse: () => void;
  /** Por 2 s el fondo toma estos colores (al aprobar una variante en Probar). */
  flash: (colors: string[]) => void;
}

export const ClimaContext = createContext<ClimaCtx>({ setFocus: () => {}, pulse: () => {}, flash: () => {} });
export const useClima = () => useContext(ClimaContext);
