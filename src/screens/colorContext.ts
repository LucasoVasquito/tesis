import { createContext, useContext } from 'react';
import { DEFAULT_PALETTE, Palette } from '../utils/derivePalette';

export interface PieceColor {
  /** Color efectivo (el editado a mano o el detectado). */
  hex: string;
  /** Color detectado. */
  base: string | null;
  overridden: boolean;
}

export type RoleKey = 'primary' | 'secondary' | 'accent';

/** Un color de la interfaz: su rol, su valor y de dónde sale. */
export interface RoleColor {
  key: RoleKey;
  label: string;
  layer: 1 | 2 | 3;
  hex: string;
  /** Color que se detectó (sin la edición a mano). */
  detected: string;
  overridden: boolean;
  source: string;
  /** Pieza de la que sale el color (si sale de una). */
  pieceId?: string;
}

export interface ColorCtx {
  roles: RoleColor[];
  byPiece: Record<string, PieceColor>;
  /** Otros colores detectados en el proyecto, de más a menos presentes. */
  detected: string[];
  /** Paleta vigente: primario, secundario y acento. */
  palette: Palette;
  /** Abre el lienzo de Referencias para elegir un color con el cuentagotas. */
  eyedrop?: (key: RoleKey) => void;
}

export const ColorContext = createContext<ColorCtx>({ roles: [], byPiece: {}, detected: [], palette: DEFAULT_PALETTE });
export const useColors = () => useContext(ColorContext);
