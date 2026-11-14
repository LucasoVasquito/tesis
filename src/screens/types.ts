/** Opciones al modificar el proyecto desde una pantalla. */
export interface MutateOptions {
  /** Entra en el historial de deshacer (por defecto sí). */
  undoable?: boolean;
  /** No cambia nada de lo que se ve como "cambio de piezas" (no deja la etapa siguiente desactualizada). */
  silent?: boolean;
  /** Aviso con "Deshacer". */
  notice?: string;
}

/** Aviso flotante desde una pantalla. */
export interface NotifyOptions {
  detail?: string;
  tone?: 'info' | 'error';
  action?: { label: string; run: () => void };
  /** El botón es «Deshacer» y deshace lo último del historial. */
  undo?: boolean;
}
export type Notify = (text: string, o?: NotifyOptions) => void;
