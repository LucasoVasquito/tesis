import React from 'react';
import { FullView } from './shell/FullView';

const STEPS: [string, string, string][] = [
  ['01', 'Moodboard', 'Tres capas apiladas y un panel de referencias. El usuario ubica; el agente analiza, extrae las piezas y completa lo que quedó sin ubicar, siempre como sugerencia. Nunca mueve lo del usuario: solo avisa.'],
  ['02', 'Sistema', 'Las tres capas como una página editorial: el Núcleo titula, el Soporte desarrolla y el Acento anota. El peso (capa × origen) ordena los lineamientos, la paleta y el pedido.'],
  ['03', 'Probar', 'El sistema aplicado a una pieza concreta. La receta dice qué parte se usa, por capa y por peso; el agente revisa si lo generado respeta cada pieza del Núcleo.'],
];

/** Marco conceptual de la tesis. */
export function AboutView({ onBack }: { onBack: () => void }) {
  return (
    <FullView title="Acerca del método" meta="Diseño Multimedial · UNLP · Interacción humano–agente" onBack={onBack}>
      <article className="mx-auto flex max-w-[640px] flex-col gap-12 px-4 py-12 lg:py-[72px]">
        <header className="flex flex-col gap-4">
          <span className="font-mono text-xs text-ink-2">Marco conceptual</span>
          <h2 className="m-0 text-4xl font-medium leading-[1.1] tracking-[-0.02em] text-ink">Patrones emergentes, verificables</h2>
          <p className="m-0 font-serif text-lg leading-normal text-ink-2">
            Durante la construcción de una identidad visual, el diseñador acumula referencias y, de manera no necesariamente consciente, empieza a repetir
            recursos, relaciones cromáticas, estructuras compositivas y gestos tipográficos.
          </p>
          <p className="m-0 font-serif text-lg leading-normal text-ink-2">
            Esos patrones existen dentro del conjunto de referencias sin haber sido formulados. Camaleon Corpus busca hacerlos <em>visibles</em> y{' '}
            <em>auditables</em> durante el proceso creativo.
          </p>
        </header>

        <section aria-labelledby="stance" className="flex flex-col gap-4">
          <h3 id="stance" className="m-0 text-2xl font-medium tracking-[-0.01em] text-ink">
            Postura frente al agente
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-5">
              <span className="font-mono text-xs text-discarded-ink">El agente no</span>
              <ul className="m-0 flex list-disc flex-col gap-1 pl-[18px] text-13 text-ink">
                <li>reemplaza el criterio del diseñador;</li>
                <li>decide cuál es la identidad “correcta”;</li>
                <li>genera identidades cerradas.</li>
              </ul>
            </div>
            <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-5">
              <span className="font-mono text-xs text-confirmed-ink">El instrumento sí</span>
              <ul className="m-0 flex list-disc flex-col gap-1 pl-[18px] text-13 text-ink">
                <li>detecta recurrencias observables;</li>
                <li>vincula cada patrón a su evidencia visual;</li>
                <li>permite que convivan sistemas divergentes.</li>
              </ul>
            </div>
          </div>
        </section>

        <section aria-labelledby="flow" className="flex flex-col gap-4">
          <h3 id="flow" className="m-0 text-2xl font-medium tracking-[-0.01em] text-ink">
            El flujo
          </h3>
          <ol className="m-0 flex list-none flex-col border-t border-line p-0">
            {STEPS.map(([n, label, text]) => (
              <li key={n} className="grid grid-cols-[48px_120px_minmax(0,1fr)] items-baseline gap-4 border-b border-line py-4 max-sm:grid-cols-[40px_minmax(0,1fr)]">
                <span className="font-mono text-xs text-ink-2">{n}</span>
                <span className="text-15 font-medium text-ink">{label}</span>
                <span className="text-13 text-ink-2 max-sm:col-span-2">{text}</span>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="multi" className="flex flex-col gap-3">
          <h3 id="multi" className="m-0 text-2xl font-medium tracking-[-0.01em] text-ink">
            Coexistencia de sistemas
          </h3>
          <p className="m-0 font-serif text-lg leading-normal text-ink-2">
            La inducción no asume que todas las imágenes pertenecen al mismo sistema. En un mismo corpus pueden emerger a la vez, por ejemplo, una línea
            editorial oscura y una urbana disruptiva. Las propuestas del agente quedan como sugerencias: un sistema existe solo cuando el diseñador lo arma o lo adopta.
          </p>
        </section>
      </article>
    </FullView>
  );
}
