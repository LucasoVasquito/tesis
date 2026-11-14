import { createContext, useContext } from 'react';
import { DEFAULT_PALETTE, Palette } from '../utils/derivePalette';

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
  /** Paleta vigente: primario, secundario y acento. */
  palette: Palette;
}

export const ColorContext = createContext<ColorCtx>({ byPiece: {}, detected: [], palette: DEFAULT_PALETTE });
export const useColors = () => useContext(ColorContext);
