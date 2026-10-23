import React, { useState } from 'react';
import { Copy, FileDown, FileJson, Printer } from 'lucide-react';
import { Project, Rule, RuleField, VisualSystem } from '../types';
import { Button, CategoryTag, Swatch } from './ui';
import { FullView } from './shell/FullView';
import { buildSystemMarkdown, downloadSystemMarkdown, exportVisualSystemAsJSON } from '../utils/exportHelpers';

interface GuidelinesViewProps {
  project: Project;
  system: VisualSystem;
  onBack: () => void;
  onTryPiece: () => void;
  onFocusReference?: (id: string) => void;
}

const Section = ({ n, title, children }: { n: string; title: string; children: React.ReactNode }) => (
  <section className="grid gap-4 border-t border-line pt-8 md:grid-cols-[160px_minmax(0,1fr)] md:gap-8 print:break-inside-avoid">
    <h2 className="m-0 font-mono text-xs font-normal text-ink-2">
      {n} — {title}
    </h2>
    <div className="flex min-w-0 flex-col gap-6">{children}</div>
  </section>
);

function Traced({ items, sources }: { items?: string[]; sources?: string[][] }) {
  if (!items?.length) return <p className="m-0 text-13 text-ink-2">Sin contenido redactado.</p>;
  return (
    <ul className="m-0 flex list-none flex-col gap-4 p-0">
      {items.map((it, i) => (
        <li key={i} className="flex flex-col gap-1">
          <span className="font-serif text-lg leading-snug text-ink">{it}</span>
          {sources?.[i]?.length ? <span className="font-mono text-xs text-ink-2">← {sources[i].join(', ')}</span> : null}
        </li>
      ))}
    </ul>
  );
}

const RULES: [RuleField, string][] = [
  ['typographyRules', 'Tipografía'],
  ['textureRules', 'Textura y materialidad'],
  ['compositionRules', 'Composición y retícula'],
];

/** Manual del sistema a pantalla completa (antes ExportBrandGuidelinesModal) con la exportación unificada. */
export function GuidelinesView({ project, system: s, onBack, onTryPiece }: GuidelinesViewProps) {
  const [copied, setCopied] = useState(false);
  const patterns = project.patterns.filter(p => s.patternIds.includes(p.id));
  const refIds = Array.from(new Set(patterns.flatMap(p => p.evidence)));
  const refs = project.references.filter(r => refIds.includes(r.id));
  const refById = new Map(project.references.map(r => [r.id, r]));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildSystemMarkdown(project, s));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* noop */
    }
  };

  return (
    <FullView
      title={s.name}
      meta={`Lineamientos · ${project.name}`}
      onBack={onBack}
      backLabel="Síntesis"
      actions={
        <>
          <Button size="sm" variant="ghost" icon={<Printer />} onClick={() => window.print()}>
            PDF
          </Button>
          <Button size="sm" variant="ghost" icon={<FileDown />} onClick={() => downloadSystemMarkdown(project, s)}>
            .md
          </Button>
          <Button size="sm" variant="ghost" icon={<Copy />} onClick={copy} aria-live="polite">
            {copied ? 'Copiado' : 'Copiar'}
          </Button>
          <Button size="sm" variant="ghost" icon={<FileJson />} onClick={() => exportVisualSystemAsJSON(s, project)}>
            .json
          </Button>
        </>
      }
    >
      <article className="guidelines mx-auto flex max-w-[960px] flex-col gap-12 px-4 py-12 lg:px-10 lg:py-[72px]">
        <header className="flex flex-col gap-4">
          <span className="font-mono text-xs text-ink-2">
            Manual del sistema · {patterns.length} patrones · {refs.length} referencias
          </span>
          <h1 className="m-0 text-4xl font-medium leading-[1.1] tracking-[-0.02em] text-ink">{s.name}</h1>
          <p className="m-0 max-w-[640px] font-serif text-lg text-ink-2">{project.objective}</p>
        </header>

        <Section n="01" title="Concepto">
          {s.description ? (
            <p className="m-0 max-w-[680px] whitespace-pre-line font-serif text-lg leading-normal text-ink">{s.description}</p>
          ) : (
            <p className="m-0 text-13 text-ink-2">Todavía no se redactó. Usá “Redactar con IA” en la columna del sistema.</p>
          )}
          <div className="flex flex-col gap-3">
            <h3 className="m-0 text-13 font-medium text-ink-2">Pilares</h3>
            <Traced items={s.aestheticPillars} sources={s.sources?.aestheticPillars} />
          </div>
        </Section>

        <Section n="02" title="Paleta">
          {s.colorPalette?.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
              {s.colorPalette.map((c, i) => (
                <Swatch key={`${c.hex}-${i}`} hex={c.hex} name={c.name} role={c.role} source={c.source} />
              ))}
            </div>
          ) : (
            <p className="m-0 text-13 text-ink-2">Sin paleta inferida.</p>
          )}
        </Section>

        <Section n="03" title="Reglas">
          {RULES.map(([f, label]) => (
            <div key={f} className="flex flex-col gap-3">
              <h3 className="m-0 text-13 font-medium text-ink-2">{label}</h3>
              <Traced items={(s[f] as Rule[] | undefined)?.map(r => r.title)} sources={(s[f] as Rule[] | undefined)?.map(r => r.patternIds)} />
            </div>
          ))}
        </Section>

        <Section n="04" title="Patrones">
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {patterns.map(p => (
              <li key={p.id} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5 print:break-inside-avoid">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-ink-2">{p.id}</span>
                  <CategoryTag category={p.category} />
                  <span className="font-mono text-xs text-ink-2">confianza {(p.confidence ?? 0).toFixed(2)}</span>
                </div>
                <h3 className="m-0 text-lg font-medium tracking-[-0.01em] text-ink">{p.name}</h3>
                <p className="m-0 font-serif text-base text-ink-2">{p.description}</p>
                {p.designerNotes && <p className="m-0 font-serif text-15 italic text-ink-2">Nota: {p.designerNotes}</p>}
                <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0 sm:grid-cols-6">
                  {p.evidence.map(id => {
                    const r = refById.get(id);
                    return (
                      <li key={id} className="flex flex-col gap-1">
                        {r ? (
                          <img src={r.image} alt={r.name} className="aspect-square w-full rounded-ctrl border border-signal/60 object-cover" referrerPolicy="no-referrer" loading="lazy" />
                        ) : (
                          <span className="block aspect-square w-full rounded-ctrl border border-dashed border-line-strong" />
                        )}
                        <span className="font-mono text-xs text-ink-2">{id}</span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </Section>

        {s.systemDetails && Object.values(s.systemDetails).some(Boolean) && (
          <Section n="05" title="Aplicaciones">
            <dl className="m-0 grid gap-6 sm:grid-cols-2">
              {(
                [
                  ['brandEssence', 'Esencia'],
                  ['logoAndIdentity', 'Logo e identidad'],
                  ['typographySystem', 'Sistema tipográfico'],
                  ['packagingSystem', 'Packaging'],
                  ['photographyStyle', 'Fotografía'],
                  ['graphicApplications', 'Piezas gráficas'],
                  ['mascotAndIllustration', 'Ilustración'],
                  ['digitalAndSocialMedia', 'Digital y redes'],
                ] as const
              )
                .filter(([k]) => s.systemDetails?.[k])
                .map(([k, label]) => (
                  <div key={k} className="flex flex-col gap-1">
                    <dt className="text-13 font-medium text-ink-2">{label}</dt>
                    <dd className="m-0 font-serif text-15 text-ink">{s.systemDetails?.[k]}</dd>
                  </div>
                ))}
            </dl>
          </Section>
        )}

        <section className="no-print flex flex-col gap-3 rounded-card border border-dashed border-line-strong p-5">
          <span className="font-mono text-xs text-ink-2">VERIFICACIÓN EXTERNA · no forma parte del sistema</span>
          <p className="m-0 text-13 text-ink-2">
            Generá una pieza con DALL·E a partir de estos lineamientos para ver si el sistema se sostiene fuera del corpus.
          </p>
          <div>
            <Button size="sm" variant="secondary" onClick={onTryPiece}>
              Probar en una pieza
            </Button>
          </div>
        </section>
      </article>
    </FullView>
  );
}
