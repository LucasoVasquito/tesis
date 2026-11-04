import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Project } from '../types';
import { useShortcuts } from '../hooks/useAuditShortcuts';
import { Shortcut, ShortcutBar } from '../components/shell/ShortcutBar';
import { layerInfo, layerTag } from '../utils/layers';
import { STOPS, Stop, clampT, stopIndex } from './geometry';
import { StackScene } from './StackScene';
import { SceneItem, stopItems, stopOf } from './items';

interface SpaceViewProps {
  project: Project;
  /** Mensaje breve de la app (toast), se muestra como franja sobre la barra de atajos. */
  notice?: { text: string; tag?: string } | null;
  enabled: boolean;
}

const stopName = (s: Stop) => (s === 'corpus' ? 'CORPUS' : layerTag(s));

function describe(item: SceneItem | undefined) {
  if (!item) return '';
  if (item.kind === 'ref') return `Referencia ${item.ref.name}`;
  if (item.kind === 'fragment') return `Fragmento ${item.fragment.label}`;
  return `${item.pattern.isGroup ? 'Grupo' : 'Patrón'} ${item.pattern.name}${item.pattern.audited ? '' : ', sin auditar'}`;
}

/**
 * Vista espacial: la pila de láminas con su navegación (rueda, W/S, ← / →, Esc),
 * el indicador de profundidad y la barra de atajos.
 */
export function SpaceView({ project, notice, enabled }: SpaceViewProps) {
  const [t, setT] = useState(1);
  const [scrubbing, setScrubbing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const snapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active = STOPS[Math.round(t)];
  const items = stopItems(project, active);

  // Si lo seleccionado desaparece (se borró), se suelta.
  useEffect(() => {
    if (selectedId && !stopOf(project, selectedId)) setSelectedId(null);
  }, [project, selectedId]);

  const goStop = useCallback((s: Stop) => {
    setScrubbing(false);
    setT(stopIndex(s));
  }, []);

  /** Rueda / trackpad: movimiento continuo; al soltar se imanta a la lámina más cercana. */
  const onWheelDepth = useCallback((dy: number) => {
    setScrubbing(true);
    setT(v => clampT(v + dy / 700));
    if (snapTimer.current) clearTimeout(snapTimer.current);
    snapTimer.current = setTimeout(() => {
      setScrubbing(false);
      setT(v => Math.round(v));
    }, 180);
  }, []);
  useEffect(() => () => void (snapTimer.current && clearTimeout(snapTimer.current)), []);

  const step = (dir: 1 | -1) => {
    if (!items.length) return;
    const i = items.findIndex(x => x.id === selectedId);
    const next = i === -1 ? (dir === 1 ? 0 : items.length - 1) : (i + dir + items.length) % items.length;
    setSelectedId(items[next].id);
  };

  useShortcuts(enabled, {
    // W avanza hacia el fondo (hacia el corpus); S vuelve hacia el núcleo.
    w: () => goStop(STOPS[Math.min(STOPS.length - 1, Math.round(t) + 1)]),
    s: () => goStop(STOPS[Math.max(0, Math.round(t) - 1)]),
    arrowleft: () => step(-1),
    arrowright: () => step(1),
    escape: () => (selectedId ? setSelectedId(null) : false),
  });

  const selected = items.find(x => x.id === selectedId);
  const shortcuts: Shortcut[] = [
    { keys: 'RUEDA', label: 'Z' },
    { keys: 'W S', label: 'Lámina' },
    { keys: '←→', label: active === 'corpus' ? 'Referencia' : 'Patrón o fragmento' },
    ...(selectedId ? [{ keys: 'ESC', label: 'Soltar' }] : []),
  ];

  return (
    <div className="relative flex h-full flex-col">
      <div className="relative min-h-0 flex-1">
        <StackScene
          project={project}
          t={t}
          scrubbing={scrubbing}
          selectedId={selectedId}
          onSelect={(id, s) => {
            setSelectedId(id);
            goStop(s);
          }}
          onFocusStop={goStop}
          onWheelDepth={onWheelDepth}
        />

        {/* Indicador de profundidad: dónde está la cámara. */}
        <nav aria-label="Profundidad" className="absolute right-5 top-1/2 flex -translate-y-1/2 flex-col items-end gap-2">
          {STOPS.map(s => {
            const on = s === active;
            const cls = s === 'corpus' ? '' : layerInfo(s).className;
            return (
              <button
                key={String(s)}
                type="button"
                aria-current={on ? 'location' : undefined}
                onClick={() => goStop(s)}
                className={`${cls} type-label px-2 py-[3px] text-[12px] transition-colors duration-120`}
                style={
                  on
                    ? { background: 'var(--layer-color, var(--color-bone))', color: 'var(--layer-ink, var(--color-void))' }
                    : { boxShadow: 'inset 0 0 0 2px color-mix(in oklab, var(--layer-color, var(--color-bone)) 45%, transparent)', color: 'var(--color-ink-2)' }
                }
              >
                {stopName(s)}
              </button>
            );
          })}
        </nav>

        <p className="sr-only" aria-live="polite">
          {stopName(active)}
          {selected ? ` · ${describe(selected)} · ${items.indexOf(selected) + 1} de ${items.length}` : ` · ${items.length} elementos`}
        </p>
      </div>

      {notice && (
        <div className="no-print mx-3 mb-2 flex h-[38px] shrink-0 items-center gap-3 border-t-2 border-bone bg-void px-5" role="status">
          <span className="layer-tag">{notice.tag ?? 'AVISO'}</span>
          <span className="truncate text-[14px]">{notice.text}</span>
        </div>
      )}
      <ShortcutBar items={shortcuts} />
    </div>
  );
}
