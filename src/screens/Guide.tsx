import { useEffect, useState } from 'react';
import { KeyButton } from './common';

const KEY = 'tesis_guide_done';

export const guideDone = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

const STEPS: { text: string; where: string }[] = [
  { text: 'Seis etapas arriba: Brief, Referencias, Revisar, Capas, Sistema y Probar. Podés ir y volver.', where: 'left-1/2 top-[72px] -translate-x-1/2' },
  { text: 'Juntá imágenes en el lienzo: arrastralas, pegá una URL o usá Ctrl+V. Con 5 o más, analizá. Rueda para moverte, Ctrl + rueda para zoom; arrastrá las esquinas de una imagen para cambiar su tamaño.', where: 'left-1/2 top-[160px] -translate-x-1/2' },
  { text: 'Cada etapa va por pasos (arriba, debajo de las etapas): → o ⏎ sigue, ← vuelve. En Capas recorrés Primario, Secundario y Acento de a una; arrastrá una pieza para cambiarla de capa. Ctrl+Z deshace.', where: 'bottom-[96px] right-6' },
];

/** Guía de 3 carteles: solo la primera vez (o desde AYUDA), salteable. */
export function Guide({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const finish = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* sin almacenamiento: se vuelve a mostrar la próxima vez */
    }
    onClose();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      if (e.key === 'Enter') (i < STEPS.length - 1 ? setI(i + 1) : finish());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const step = STEPS[i];
  return (
    <div className="fixed inset-0 z-50 bg-void/50" role="dialog" aria-modal="true" aria-label="Guía">
      <div className={`absolute flex w-[360px] flex-col gap-4 rounded-[4px] bg-raised p-6 text-ink ${step.where}`}>
        <span className="type-data text-[0.875rem] text-ink-2">
          {i + 1} / {STEPS.length}
        </span>
        <span className="text-[1.125rem] font-medium leading-snug">{step.text}</span>
        <div className="flex justify-between gap-2">
          <KeyButton k="ESC" label="Saltear" tone="ghost" onClick={finish} />
          <KeyButton k="⏎" label={i < STEPS.length - 1 ? 'Siguiente' : 'Empezar'} tone="bone" onClick={() => (i < STEPS.length - 1 ? setI(i + 1) : finish())} />
        </div>
      </div>
    </div>
  );
}

/** Cartel del proyecto de ejemplo. */
export function ExampleBanner({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-4 bg-surface px-10 py-2 text-ink">
      <span className="text-[0.875rem]">Esto es un proyecto de ejemplo.</span>
      <KeyButton label="Empezar el mío" tone="bone" onClick={onStart} />
    </div>
  );
}
