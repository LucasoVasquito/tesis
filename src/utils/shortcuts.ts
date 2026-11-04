import type { Shortcut } from '../components/shell/ShortcutBar';
import type { VisitableStage } from '../types';

/**
 * Atajos que se muestran en la barra inferior. Solo se anuncian los que funcionan:
 * mientras conviven las etapas viejas con los tres momentos, cada vista declara los suyos.
 */
export const STAGE_SHORTCUTS: Record<VisitableStage, Shortcut[]> = {
  brief: [{ keys: '⏎', label: 'Continuar' }],
  corpus: [
    { keys: '⌘V', label: 'Pegar imágenes' },
    { keys: 'TAB', label: 'Elegir referencia' },
    { keys: '⏎', label: 'Abrir' },
    { keys: 'FLECHAS', label: 'Mover' },
    { keys: 'SUPR', label: 'Eliminar' },
  ],
  audit: [
    { keys: '←→', label: 'Patrón' },
    { keys: 'C', label: 'Confirmar' },
    { keys: 'D', label: 'Descartar' },
    { keys: 'N', label: 'Anotar' },
    { keys: 'ESC', label: 'Soltar' },
  ],
  synthesis: [
    { keys: 'TAB', label: 'Elegir patrón' },
    { keys: '⏎', label: 'Asignar a sistema' },
    { keys: 'ESC', label: 'Cerrar' },
  ],
  application: [{ keys: 'ESC', label: 'Cerrar' }],
};
