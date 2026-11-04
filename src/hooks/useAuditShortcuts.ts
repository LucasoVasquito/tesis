import { useEffect, useRef } from 'react';
import { Pattern } from '../types';
import { PatternCardMode } from '../components/ui';

interface AuditShortcutsApi {
  enabled: boolean;
  current: Pattern | null;
  mode: PatternCardMode;
  setMode: (m: PatternCardMode) => void;
  prev: () => void;
  next: () => void;
  confirm: () => void;
}

const isTyping = (el: Element | null) =>
  !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el as HTMLElement).isContentEditable);

/**
 * Atajos de la auditoría: C confirmar, D descartar, N anotar, ← / → navegar, Esc cerrar el input.
 * No actúan mientras se escribe ni con otro diálogo abierto.
 */
export function useAuditShortcuts(api: AuditShortcutsApi) {
  const ref = useRef(api);
  ref.current = api;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = ref.current;
      if (!a.enabled || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTyping(document.activeElement)) return;
      if (document.querySelector('[data-overlay-open="true"]')) return;
      const key = e.key.toLowerCase();
      const pending = a.current?.status === 'detected';
      if (key === 'escape' && a.mode !== 'idle') {
        e.preventDefault();
        a.setMode('idle');
      } else if (key === 'arrowleft') {
        e.preventDefault();
        a.prev();
      } else if (key === 'arrowright') {
        e.preventDefault();
        a.next();
      } else if (a.mode === 'idle' && a.current) {
        if (key === 'c' && pending) {
          e.preventDefault();
          a.confirm();
        } else if (key === 'd' && pending) {
          e.preventDefault();
          a.setMode('discard');
        } else if (key === 'n') {
          e.preventDefault();
          a.setMode('note');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
