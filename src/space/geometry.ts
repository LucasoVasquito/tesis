import { Layer } from '../types';

/**
 * Geometría de la pila (valores del mock 2c de "Tesis Identidad Visual", escalados ×2,2).
 * La jerarquía es la profundidad: el núcleo adelante, el corpus al fondo.
 * El tamaño sale solo de la perspectiva: no hay escalado manual.
 */
export const PERSPECTIVE = 2600;
export const PLANE_W = 880;
export const PLANE_H = 560;

/** Paradas de profundidad, de adelante hacia atrás. W avanza hacia el fondo; S vuelve. */
export type Stop = Layer | 'corpus';
export const STOPS: Stop[] = [1, 2, 3, 'corpus'];
export const stopIndex = (s: Stop) => STOPS.indexOf(s);

/** Centro de cada plano en el espacio de la pila (px). */
export const STOP_POS: Record<string, { x: number; y: number; z: number }> = {
  '1': { x: -198, y: 154, z: 374 },
  '2': { x: 88, y: -66, z: 0 },
  '3': { x: 330, y: -242, z: -374 },
  corpus: { x: 0, y: 0, z: -726 },
};
export const stopPos = (s: Stop) => STOP_POS[String(s)];

/** Rotación de la vista de costado (mock 2a/2c). */
export const SIDE_ROTATION = { x: 4, y: -38 };

/**
 * Cámara continua: t ∈ [0, 3] recorre las paradas. Devuelve el punto del espacio que queda
 * en el centro de la escena (interpolado entre las dos paradas vecinas).
 */
export function cameraAt(t: number) {
  const max = STOPS.length - 1;
  const c = Math.min(max, Math.max(0, t));
  const i = Math.min(max - 1, Math.floor(c));
  const f = c - i;
  const a = stopPos(STOPS[i]);
  const b = stopPos(STOPS[i + 1]);
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f };
}

export const clampT = (t: number) => Math.min(STOPS.length - 1, Math.max(0, t));
