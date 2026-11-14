import { createContext, useContext } from 'react';

export interface PieceColor {
  /** Color efectivo (el editado a mano o el detectado). */
  hex: string;
  /** Color detectado. */
  base: string | null;
  overridden: boolean;
}

export interface ColorCtx {
  byPiece: Record<string, PieceColor>;
  /** Otros colores detectados en el proyecto, de más a menos presentes. */
  detected: string[];
}

export const ColorContext = createContext<ColorCtx>({ byPiece: {}, detected: [] });
export const useColors = () => useContext(ColorContext);
