import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Moment } from '../types';

const KEY = 'tesis_guide_done';

export const guideDone = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

/** Un cartelito del recorrido: señala un elemento de la pantalla (si está) y dice qué hacer con él. */
interface Step {
  /** Selector del elemento al que apunta. Sin él, o si no está en pantalla, el cartel va al centro. */
  sel?: string;
  text: string;
}

const NEXT = '[data-primary]';
const RAIL = 'nav[aria-label="Subpasos"]';

/** El recorrido de la pantalla donde está el usuario (etapa, subpaso y, en Probar, pestaña). */
function tourFor(stage: Moment, sub: number): Step[] {
  switch (stage) {
    case 'brief':
      return sub >= 3
        ? [
            { sel: 'main button[title="Editar"]', text: 'Este es el resumen. Tocá cualquier campo para corregirlo.' },
            { sel: NEXT, text: 'Cuando esté bien, seguí a Referencias.' },
          ]
        : [
            { sel: 'main .field-input', text: 'Escribí acá. Es una pregunta por vez y nada es obligatorio.' },
            { sel: NEXT, text: 'Este botón (o Enter) sigue. Con ← volvés al paso anterior.' },
            { sel: RAIL, text: 'Arriba ves en qué paso estás. Podés saltar a cualquiera.' },
          ];
    case 'referencias':
      return [
        { sel: '[data-canvas]', text: 'Este es el lienzo. Arrastrá imágenes acá, pegá una URL o usá Ctrl+V.' },
        { sel: '[data-canvas]', text: 'La rueda mueve el lienzo y Ctrl + rueda hace zoom. Arrastrá las esquinas de una imagen para cambiar su tamaño.' },
        { sel: '.bar-tools', text: '+ Imagen suma más. «Elegir varias» te deja agrupar las que van juntas (después, G).' },
        { sel: NEXT, text: 'Con 5 o más imágenes, analizá. Cuando termine, seguí a Revisar.' },
      ];
    case 'revisar':
      return sub === 0
        ? [
            { sel: '[aria-label="Sugerencia"]', text: 'El agente encontró un patrón. Acá lo ves, con su nombre (podés editarlo).' },
            { sel: '[aria-label="¿En qué capa entra?"]', text: 'Elegí en qué capa entra: 1, 2 o 3. Si dudás, usá la que sugiere.' },
            { sel: NEXT, text: 'Enter confirma y pasa a la siguiente. X descarta, S salta por ahora, ← vuelve.' },
          ]
        : [
            { sel: '[role="tablist"][aria-label="Piezas revisadas"]', text: 'Tres pestañas: lo que aceptaste, lo que dejaste sin decidir y lo que descartaste.' },
            { sel: 'main ul li button', text: 'Tocá una tarjeta para abrirla. Desde ahí podés pasarla a «Sin decidir» o descartarla.' },
            { sel: NEXT, text: 'Cuando termines, seguí a Capas.' },
          ];
    case 'capas':
      return [
        { sel: '[data-layers-scene] aside', text: 'Acá elegís qué capa mirar: Primario, Secundario o Acento. También con ↑ ↓ o 1 · 2 · 3.' },
        { sel: '[data-piece]', text: 'Cada tarjeta es una pieza. Un clic la elige y «Ver completo» la abre. Arrastrala para cambiarla de capa.' },
        { sel: '.bar-tools', text: 'Abajo: Renombrar (F2) y el color (C) de la pieza elegida.' },
        { sel: NEXT, text: 'Cuando las capas estén como querés, seguí a Sistema.' },
      ];
    case 'sistema':
      return sub === 5
        ? [
            { sel: 'main ol li button', text: 'Las reglas dicen cómo se usa el sistema. Tocá una para editarla.' },
            { sel: '[data-guide="rules-add"]', text: 'Escribí las tuyas acá. Van primero y el agente no las reescribe.' },
            { sel: NEXT, text: 'Seguí a Exportar.' },
          ]
        : [
            { sel: RAIL, text: 'Son siete partes: Paleta, Tipografía, Primario, Secundario, Acento, Reglas y Exportar.' },
            { sel: '[data-headline]', text: 'Acá solo se lee. Para cambiar algo, usá «Editar en Capas» al pie de cada parte.' },
            { sel: NEXT, text: 'Con Siguiente pasás a la parte que sigue. Al final, exportás.' },
          ];
    case 'probar':
      return sub === 0
        ? [
            { sel: '[role="radiogroup"]', text: 'Elegí qué querés probar. Doble clic avanza directo.' },
            { sel: NEXT, text: 'Seguí con el texto y el pedido. Lo que generes o hagas afuera lo evaluás después en Resultados.' },
          ]
        : [
            { sel: RAIL, text: 'Probar va en cuatro pasos: Pieza, Pedido, Comparar y Listo.' },
            { sel: NEXT, text: 'Este botón hace lo siguiente que corresponde: generar, aprobar o seguir.' },
          ];
    case 'resultados':
      return [
        { sel: '[data-guide="import-result"]', text: 'Cargá lo que otra IA u otro diseñador hizo con tu sistema.' },
        { sel: 'main ul li button', text: 'Abrí un resultado para ver la imagen grande y marcar qué piezas funcionaron, fallaron o ignoró.' },
        { text: 'Con 2 o más pruebas, Capas te propone subir, bajar o sacar piezas. Lo decidís vos.' },
      ];
  }
}

/** Ancho del cartel: cómodo en escritorio y nunca más ancho que la pantalla. */
const popWidth = () => Math.min(380, window.innerWidth - 24);
const GAP = 14;

/** Ayuda de la pantalla actual: cartelitos que señalan qué tocar, paso a paso. */
export function Guide({ onClose, stage, sub }: { onClose: () => void; stage: Moment; sub: number }) {
  const steps = tourFor(stage, sub);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const pop = useRef<HTMLDivElement>(null);
  const last = i === steps.length - 1;
  const step = steps[i];

  const finish = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* sin almacenamiento: se vuelve a mostrar la próxima vez */
    }
    onClose();
  };

  // Teclas: ← → recorren, Enter sigue, Esc cierra.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      else if (e.key === 'ArrowRight') setI(n => Math.min(steps.length - 1, n + 1));
      else if (e.key === 'ArrowLeft') setI(n => Math.max(0, n - 1));
      else if (e.key === 'Enter') (last ? finish() : setI(n => n + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Dónde está el elemento señalado (se vuelve a medir al cambiar de paso o de tamaño).
  useLayoutEffect(() => {
    const measure = () => {
      const el = step.sel ? (document.querySelector(step.sel) as HTMLElement | null) : null;
      const r = el?.getBoundingClientRect();
      setRect(r && r.width > 4 && r.height > 4 ? r : null);
    };
    const el = step.sel ? (document.querySelector(step.sel) as HTMLElement | null) : null;
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [i, step.sel]);

  // Dónde va el cartel: debajo del elemento, o arriba, o al costado; sin salirse de la pantalla.
  useLayoutEffect(() => {
    const POP_W = popWidth();
    const h = pop.current?.offsetHeight ?? 170;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clampX = (x: number) => Math.max(12, Math.min(vw - POP_W - 12, x));
    const clampY = (y: number) => Math.max(12, Math.min(vh - h - 12, y));
    if (!rect) return setPos({ left: clampX((vw - POP_W) / 2), top: clampY((vh - h) / 2) });
    const big = rect.height > vh * 0.5 || rect.width > vw * 0.7;
    if (big) return setPos({ left: clampX(rect.left + 24), top: clampY(rect.top + 24) });
    const cx = rect.left + rect.width / 2 - POP_W / 2;
    if (rect.bottom + GAP + h < vh) return setPos({ left: clampX(cx), top: rect.bottom + GAP });
    if (rect.top - GAP - h > 0) return setPos({ left: clampX(cx), top: rect.top - GAP - h });
    if (rect.right + GAP + POP_W < vw) return setPos({ left: rect.right + GAP, top: clampY(rect.top) });
    return setPos({ left: clampX(rect.left - GAP - POP_W), top: clampY(rect.top) });
  }, [rect, i]);

  if (!steps.length) return null;
  const big = rect && (rect.height > window.innerHeight * 0.5 || rect.width > window.innerWidth * 0.7);
  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Ayuda de esta pantalla">
      {/* Fondo que atrapa los clics; el elemento señalado queda iluminado */}
      <div className="absolute inset-0" onClick={onClose} style={{ background: rect ? 'transparent' : 'rgba(0,0,0,.5)' }} />
      {rect && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-[6px]"
          style={{
            left: rect.left - 6,
            top: rect.top - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            outline: '2px solid var(--cc-text)',
            boxShadow: big ? 'none' : '0 0 0 9999px rgba(0,0,0,.55)',
          }}
        />
      )}
      <div ref={pop} className="absolute flex flex-col gap-4 rounded-[4px] bg-raised p-5 text-ink shadow-float" style={{ left: pos.left, top: pos.top, width: popWidth() }}>
        <div className="flex items-center justify-between gap-3">
          <span className="type-data text-[0.875rem] text-ink-2">
            {i + 1} / {steps.length}
          </span>
          <button type="button" onClick={finish} className="text-[0.875rem] text-ink-2 underline underline-offset-4 hover:text-ink">
            Saltar
          </button>
        </div>
        <span className="text-[1.0625rem] font-medium leading-snug">{step.text}</span>
        <div className="flex items-center justify-end gap-2">
          {i > 0 && (
            <button type="button" onClick={() => setI(i - 1)} className="h-10 rounded-full px-4 text-[0.9375rem] font-medium text-ink-2 hover:bg-ink/10 hover:text-ink">
              Atrás
            </button>
          )}
          <button type="button" onClick={() => (last ? finish() : setI(i + 1))} className="h-10 rounded-full bg-bone px-5 text-[0.9375rem] font-bold text-void hover:opacity-90">
            {last ? 'Listo' : 'Siguiente'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Cartel del proyecto de ejemplo: una franja de vidrio, igual que el riel de subpasos, para no cortar el fondo. */
export function ExampleBanner({ onStart }: { onStart: () => void }) {
  return (
    <div className="no-print surface-glass relative z-[5] flex h-10 shrink-0 items-center justify-center gap-3 border-b border-line px-4">
      <span className="truncate text-[0.875rem] text-ink-2">Esto es un proyecto de ejemplo.</span>
      <button type="button" onClick={onStart} className="h-7 shrink-0 whitespace-nowrap rounded-full bg-bone px-4 text-[0.8125rem] font-bold text-void transition-opacity duration-150 hover:opacity-90">
        Empezar el mío
      </button>
    </div>
  );
}
