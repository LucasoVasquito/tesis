export interface Shortcut {
  /** Tecla o combinación, tal como se lee ("←→", "ESPACIO", "⌘V"). */
  keys: string;
  /** Qué hace, en una o dos palabras. */
  label: string;
}

/**
 * Barra de atajos: bloque hueso fijo abajo, con texto en color vacío y Archivo 800.
 * Siempre visible; su contenido cambia según el momento.
 */
export function ShortcutBar({ items }: { items: Shortcut[] }) {
  if (!items.length) return null;
  return (
    <div className="no-print shrink-0 px-3 pb-3">
      <nav aria-label="Atajos de teclado" className="shortcut-bar">
        {items.map(s => (
          <span key={`${s.keys}-${s.label}`}>
            <kbd>{s.keys}</kbd> · {s.label}
          </span>
        ))}
      </nav>
    </div>
  );
}
