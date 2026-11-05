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
  { text: 'Estas son tus capas: adelante va lo más importante.', where: 'left-[230px] top-[120px]' },
  { text: 'El agente ya ubicó las piezas. Confirmá, subí o bajá.', where: 'left-1/2 top-[45%] -translate-x-1/2' },
  { text: 'Cuando estés listo, mirá tu sistema.', where: 'bottom-[90px] right-6' },
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
      <div className={`absolute flex w-[340px] flex-col gap-4 bg-accent p-5 text-bone ${step.where}`}>
        <span className="font-mono text-[12px] font-medium">
          {i + 1} / {STEPS.length}
        </span>
        <span className="type-name text-[30px] leading-[0.95]">{step.text}</span>
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
    <div className="flex shrink-0 items-center gap-4 bg-accent px-5 py-2 text-bone">
      <span className="text-[14px]">Esto es un proyecto de ejemplo.</span>
      <KeyButton label="Empezar el mío" tone="bone" onClick={onStart} />
    </div>
  );
}
