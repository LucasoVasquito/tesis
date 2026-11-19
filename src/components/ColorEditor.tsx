import { useEffect, useState } from 'react';
import { RoleKey, useColors } from '../screens/colorContext';

const HEX = /^#[0-9a-f]{6}$/i;

export function EyedropperIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m2 22 1-1h3l9-9" />
      <path d="M3 21v-3l9-9" />
      <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z" />
    </svg>
  );
}

/** Editor de un color: muestra grande, hex, selector nativo y los otros colores del proyecto. Cambia en vivo; al cerrar se confirma. */
export function ColorEditor({
  title,
  start,
  overridden,
  others,
  onLive,
  onClose,
  onRestore,
  onEyedropper,
  mobile,
  className,
}: {
  title: string;
  start: string;
  overridden: boolean;
  others: string[];
  onLive: (hex: string) => void;
  /** hex válido si hay un cambio para confirmar; null si no. */
  onClose: (hex: string | null) => void;
  onRestore: () => void;
  /** Si se pasa, aparece el cuentagotas: lleva al lienzo de Referencias a elegir un color. */
  onEyedropper?: () => void;
  mobile?: boolean;
  className?: string;
}) {
  const [hex, setHex] = useState(start.toUpperCase());
  const [text, setText] = useState(start.toUpperCase());
  const valid = HEX.test(hex);
  const set = (v: string) => {
    setText(v.toUpperCase());
    if (HEX.test(v)) {
      setHex(v.toUpperCase());
      onLive(v.toUpperCase());
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose(valid ? hex : null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });
  const min = mobile ? 44 : undefined;
  const list = others.filter(c => c.toUpperCase() !== hex.toUpperCase()).slice(0, 8);
  return (
    <div
      role="dialog"
      aria-label={`Color: ${title}`}
      onPointerDown={e => e.stopPropagation()}
      className={`${className ?? ''} flex flex-col gap-3 p-4 ${mobile ? 'fixed inset-x-0 bottom-0 z-[65] rounded-t-[4px] pb-[calc(16px+env(safe-area-inset-bottom))]' : 'rounded-[4px]'}`}
      style={{ background: 'var(--cc-surface)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-semibold">{title}</span>
        <button type="button" onClick={() => onClose(valid ? hex : null)} className="rounded-[3px] bg-bone px-3 py-1 text-[12px] font-bold text-void" style={{ minHeight: min }}>
          Listo
        </button>
      </div>
      <div className="h-14 w-full rounded-[4px]" style={{ background: valid ? hex : start, boxShadow: '0 0 0 1px color-mix(in srgb, var(--cc-text) 40%, transparent)' }} />
      <div className="flex items-center gap-2">
        <input
          aria-label="Color en hexadecimal"
          value={text}
          onChange={e => set(e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`)}
          maxLength={7}
          spellCheck={false}
          className="min-w-0 flex-1 border-b-2 bg-transparent py-1 font-mono text-[14px] text-ink outline-none focus:border-bone"
          style={{ borderColor: valid ? 'var(--color-line-strong)' : 'var(--cc-error)', minHeight: min }}
        />
        {onEyedropper && (
          <button
            type="button"
            onClick={onEyedropper}
            aria-label="Cuentagotas: elegir un color de las referencias"
            title="Cuentagotas: elegí un color de cualquier imagen del lienzo"
            className="flex size-9 shrink-0 items-center justify-center rounded-[4px] bg-ink/10 hover:bg-white/10"
            style={{ minHeight: min, minWidth: min }}
          >
            <EyedropperIcon />
          </button>
        )}
        <input aria-label="Selector de color" type="color" value={valid ? hex : '#888888'} onChange={e => set(e.target.value)} className="h-9 w-12 shrink-0 cursor-pointer border-0 bg-transparent p-0" style={{ minHeight: min }} />
      </div>
      {list.length > 0 && (
        <div>
          <span className="font-mono text-[10px] tracking-[0.06em] text-ink-2">OTROS COLORES DEL PROYECTO</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {list.map(c => (
              <button key={c} type="button" aria-label={`Usar ${c}`} title={c} onClick={() => set(c)} className="size-6 rounded-full p-0" style={{ background: c, boxShadow: '0 0 0 1px color-mix(in srgb, var(--cc-text) 40%, transparent)', minWidth: mobile ? 32 : undefined, minHeight: mobile ? 32 : undefined }} />
            ))}
          </div>
        </div>
      )}
      {overridden && (
        <button type="button" onClick={onRestore} className="self-start text-[12px] text-ink-2 underline underline-offset-2 hover:text-ink" style={{ minHeight: min }}>
          Restaurar color detectado
        </button>
      )}
    </div>
  );
}

/**
 * Los tres colores de la interfaz (primario, secundario y acento): de dónde sale cada uno y cómo cambiarlo.
 * Un clic en una fila abre el editor; el cambio se ve en toda la interfaz mientras se arrastra el selector.
 */
export function ColorsPanel({
  onLive,
  onCommit,
  mobile,
  flat,
  className,
}: {
  onLive: (key: RoleKey, hex: string | null) => void;
  onCommit: (key: RoleKey, hex: string | null) => void;
  mobile?: boolean;
  /** Sin caja: va directo sobre el fondo (columna de Capas). */
  flat?: boolean;
  className?: string;
}) {
  const colors = useColors();
  const [editing, setEditing] = useState<RoleKey | null>(null);
  const role = colors.roles.find(r => r.key === editing);
  const edge = (layer: number) => `var(--cc-l${layer - 1}-edge)`;
  return (
    <section aria-label="Colores de la interfaz" className={`${className ?? ''} relative flex flex-col gap-2 ${flat ? 'p-1' : 'rounded-[4px] p-3'}`} style={flat ? undefined : { background: 'var(--cc-surface)' }}>
      <span className="type-label text-[11px] text-ink-2">Colores</span>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {colors.roles.map(r => (
          <li key={r.key}>
            <button
              type="button"
              onClick={() => setEditing(e => (e === r.key ? null : r.key))}
              aria-expanded={editing === r.key}
              title={r.source}
              className="flex w-full items-center gap-3 rounded-[4px] px-1 py-[5px] text-left hover:bg-white/5"
              style={{ minHeight: mobile ? 44 : undefined, background: editing === r.key ? 'color-mix(in srgb, var(--cc-text) 8%, transparent)' : undefined }}
            >
              <span aria-hidden="true" className="size-6 shrink-0 rounded-[3px]" style={{ background: r.hex, boxShadow: `0 0 0 1px ${edge(r.layer)}, 0 0 0 1px color-mix(in srgb, var(--cc-text) 25%, transparent)` }} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold leading-tight">
                    {r.layer} · {r.label}
                  </span>
                  <span className="font-mono text-[11px] text-ink-2">{r.hex.toUpperCase()}</span>
                </span>
                <span className="line-clamp-2 text-[11px] leading-tight" style={{ color: 'var(--cc-text-muted)' }}>
                  {r.source}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="m-0 text-[11px] leading-snug" style={{ color: 'var(--cc-text-muted)' }}>
        La interfaz usa estos colores. Tocá uno para cambiarlo.
      </p>
      {role && (
        <ColorEditor
          key={role.key}
          title={`${role.label} · ${role.layer === 1 ? 'Núcleo' : role.layer === 2 ? 'Soporte' : 'Acento'}`}
          start={role.hex.startsWith('#') ? role.hex : '#888888'}
          overridden={role.overridden}
          others={colors.detected}
          mobile={mobile}
          className={mobile ? '' : 'absolute right-[calc(100%+12px)] top-0 z-30 w-[260px]'}
          onLive={hex => onLive(role.key, hex)}
          onClose={hex => {
            setEditing(null);
            if (hex) onCommit(role.key, hex);
            else onLive(role.key, null);
          }}
          onRestore={() => {
            setEditing(null);
            onCommit(role.key, null);
          }}
          onEyedropper={
            colors.eyedrop
              ? () => {
                  const key = role.key;
                  setEditing(null);
                  onLive(key, null);
                  colors.eyedrop?.(key);
                }
              : undefined
          }
        />
      )}
    </section>
  );
}
