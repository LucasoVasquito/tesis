import { useEffect, useRef } from 'react';

/**
 * Sistema único de atajos de Camaleon Corpus. Cada vista declara un mapa tecla → acción;
 * las guardas son comunes: no actúan mientras se escribe, con un diálogo abierto
 * ni con Ctrl / ⌘ / Alt.
 *
 * Claves: e.key en minúsculas ('w', 'arrowleft', 'enter', 'escape', ' ' para Espacio).
 * Una acción que devuelve `false` deja pasar el evento (no se consume).
 */
export type ShortcutMap = Partial<Record<string, (e: KeyboardEvent) => void | boolean>>;

const isTyping = (el: Element | null) =>
  !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el as HTMLElement).isContentEditable);

const overlayOpen = () => !!document.querySelector('[data-overlay-open="true"], [role="dialog"][aria-modal="true"]');

export function useShortcuts(enabled: boolean, map: ShortcutMap) {
  const ref = useRef({ enabled, map });
  ref.current = { enabled, map };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { enabled, map } = ref.current;
      if (!enabled || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTyping(document.activeElement)) return;
      if (overlayOpen()) return;
      const key = e.key === 'Spacebar' ? ' ' : e.key.toLowerCase();
      const run = map[key];
      if (!run) return;
      // Espacio y Enter sobre un botón enfocado son del botón.
      const el = document.activeElement as HTMLElement | null;
      if ((key === ' ' || key === 'enter') && el && (el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'button')) return;
      if (run(e) === false) return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
