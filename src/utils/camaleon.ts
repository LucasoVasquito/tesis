import { Theme } from './derivePalette';

/**
 * Aplica el tema del motor Camaleón a la interfaz: escribe las variables --cc-* en :root.
 * Las variables están registradas como <color> (ver index.css), así que el cambio se anima (.4 s).
 */
export function applyTheme(theme: Theme | null) {
  const root = document.documentElement;
  const names = ['--cc-bg', '--cc-surface', '--cc-raised', '--cc-l0', '--cc-l1', '--cc-l2', '--cc-primary', '--cc-on-primary', '--cc-text', '--cc-text-muted', '--cc-line', '--cc-line-hover', '--cc-l0-edge', '--cc-l1-edge', '--cc-l2-edge', '--cc-l0-on', '--cc-l1-on', '--cc-l2-on', '--cc-l0-ink', '--cc-l1-ink', '--cc-l2-ink'];
  for (const n of names) {
    if (theme && theme[n]) root.style.setProperty(n, theme[n]);
    else root.style.removeProperty(n);
  }
}
