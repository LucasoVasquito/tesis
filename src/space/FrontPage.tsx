import React from 'react';
import { Fragment, Pattern, Project } from '../types';
import { layerContents, oneLine, ruleFor, shortRule } from '../utils/layerRules';
import { Crop } from './Crop';
import { patternCover } from './items';

export const PAGE_W = 880;
export const PAGE_H = 560;

const Dot = ({ on }: { on: boolean }) =>
  on ? <span title="Sin auditar" aria-label="Sin auditar" className="inline-block size-[9px] shrink-0 rounded-full bg-[#8d8d8d]" /> : null;

function Cover({ project, pattern, className, round }: { project: Project; pattern: Pattern; className: string; round?: boolean }) {
  const frags = (project.fragments ?? []).filter(f => f.groupId === pattern.id || pattern.fragmentIds?.includes(f.id));
  const c = patternCover(project, { kind: 'pattern', id: pattern.id, pattern, fragments: frags });
  if (!c) return <span className={`bg-void/10 ${className}`} />;
  return <Crop image={c.image} crop={c.crop} fit="cover" alt={c.alt} className={`${className} ${round ? 'rounded-full' : ''}`} />;
}

function FragCover({ project, f, className }: { project: Project; f: Fragment; className: string }) {
  const ref = project.references.find(r => r.id === f.refId);
  return ref ? <Crop image={ref.image} crop={f.crop} fit="cover" alt={f.label} className={className} /> : null;
}

/**
 * Vista de frente (2d): la pila girada se lee como página.
 * El núcleo titula (bloque naranja, imagen y regla completa), el soporte desarrolla en columnas
 * (regla corta) y el acento anota al margen (una línea).
 */
export function FrontPage({ project }: { project: Project }) {
  const core = layerContents(project, 1);
  const support = layerContents(project, 2);
  const accent = layerContents(project, 3);
  const [lead, ...moreCore] = core.patterns;
  const empty = !core.patterns.length && !support.patterns.length && !accent.patterns.length && !core.fragments.length && !support.fragments.length && !accent.fragments.length;

  return (
    <div
      id="front-page"
      className="grid h-full w-full gap-[14px] overflow-hidden bg-bone p-4 text-void"
      style={{ gridTemplateColumns: 'minmax(0,1fr) 190px', gridTemplateRows: 'auto minmax(0,1fr)' }}
    >
      {/* 01 · Núcleo: titular */}
      <div className="col-span-2 flex flex-col gap-2">
        {lead ? (
          <div className="flex items-stretch gap-[14px] bg-core p-3">
            <Cover project={project} pattern={lead} className="h-[150px] w-[170px] shrink-0" />
            <div className="flex min-w-0 flex-col justify-between gap-2">
              <span className="flex items-center gap-2">
                <span className="layer-tag" style={{ background: 'var(--color-void)', color: 'var(--color-bone)' }}>
                  01 NÚCLEO
                </span>
                <Dot on={!lead.audited} />
              </span>
              <span className="type-name line-clamp-2 text-[54px] leading-[0.82]">{lead.name}</span>
              <span className="line-clamp-3 text-[13px] font-medium leading-[1.35]">{ruleFor(lead, 1) || 'Sin regla todavía: la IA la redacta al revelar.'}</span>
            </div>
          </div>
        ) : (
          <div className="flex h-[120px] items-center gap-3 border-4 border-dashed border-core px-4">
            <span className="layer-tag layer-1">01 NÚCLEO</span>
            <span className="type-label text-[13px]">VACÍO · LLEVÁ ALGO AL NÚCLEO PARA QUE LA PÁGINA TENGA TITULAR</span>
          </div>
        )}
        {(moreCore.length > 0 || core.fragments.length > 0) && (
          <div className="flex gap-2">
            {moreCore.map(p => (
              <div key={p.id} className="flex min-w-0 flex-1 items-center gap-2 bg-core p-2">
                <Cover project={project} pattern={p} className="size-[44px] shrink-0" />
                <span className="type-name line-clamp-2 text-[20px] leading-[0.9]">{p.name}</span>
                <Dot on={!p.audited} />
              </div>
            ))}
            {core.fragments.slice(0, 4).map(f => (
              <div key={f.id} className="flex items-center gap-2 bg-core p-2">
                <FragCover project={project} f={f} className="size-[44px] shrink-0" />
                <span className="type-label text-[11px]">{f.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 02 · Soporte: cuerpo en columnas */}
      <div className="grid min-w-0 content-start gap-[14px] overflow-hidden" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {support.patterns.map(p => (
          <div key={p.id} className="flex min-w-0 gap-[10px]">
            <Cover project={project} pattern={p} className="size-[54px] shrink-0" round={p.category === 'logo_identity'} />
            <div className="flex min-w-0 flex-col gap-[3px]">
              <span className="flex items-center gap-2">
                <span className="type-label text-[10px] tracking-[0.06em]">02 SOPORTE</span>
                <Dot on={!p.audited} />
              </span>
              <span className="type-name line-clamp-2 text-[18px] leading-[0.95]">{p.name}</span>
              <span className="line-clamp-2 text-[11px] leading-[1.35]">{shortRule(p)}</span>
            </div>
          </div>
        ))}
        {support.fragments.map(f => (
          <div key={f.id} className="flex min-w-0 gap-[10px]">
            <FragCover project={project} f={f} className="size-[54px] shrink-0" />
            <div className="flex min-w-0 flex-col gap-[3px]">
              <span className="type-label text-[10px] tracking-[0.06em]">02 SOPORTE · FRAGMENTO</span>
              <span className="type-name line-clamp-2 text-[18px] leading-[0.95]">{f.label}</span>
            </div>
          </div>
        ))}
        {!support.patterns.length && !support.fragments.length && <span className="type-label col-span-2 text-[11px] opacity-60">02 SOPORTE · VACÍO</span>}
      </div>

      {/* 03 · Acento: nota al margen */}
      <div className="flex min-w-0 flex-col gap-4 overflow-hidden">
        {accent.patterns.map(p => (
          <div key={p.id} className="flex flex-col gap-1 border-l-[3px] border-accent pl-[10px]">
            <span className="flex items-center gap-2">
              <span className="type-label text-[10px] tracking-[0.06em] text-accent">03 ACENTO</span>
              <Dot on={!p.audited} />
            </span>
            <span className="type-name line-clamp-3 text-[16px] leading-[0.95]">{p.name}</span>
            <span className="line-clamp-2 text-[11px] leading-[1.35]">{oneLine(p)}</span>
          </div>
        ))}
        {accent.fragments.map(f => (
          <div key={f.id} className="flex items-center gap-2 border-l-[3px] border-accent pl-[10px]">
            <FragCover project={project} f={f} className="size-[28px] shrink-0" />
            <span className="type-name text-[14px] leading-[0.95]">{f.label}</span>
          </div>
        ))}
        {!accent.patterns.length && !accent.fragments.length && (
          <span className="border-l-[3px] border-accent pl-[10px] type-label text-[10px] text-accent opacity-70">03 ACENTO · VACÍO</span>
        )}
      </div>

      {empty && (
        <span className="type-label col-span-2 self-end text-[12px] opacity-70">LA PILA ESTÁ VACÍA · ESPACIO PARA VOLVER AL COSTADO Y ARMARLA</span>
      )}
    </div>
  );
}
