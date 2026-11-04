import React, { useState } from 'react';
import { Layer, Pattern, Project } from '../types';
import { useShortcuts } from '../hooks/useAuditShortcuts';
import { corpusRefs, evidenceCount, evidenceLabel, layerTag, mirrorConflict } from '../utils/layers';
import { Crop } from './Crop';

/* ---------- Revelado ---------- */

/** Bloque azul: un patrón que la IA encontró y el diseñador no marcó. Queda sin lámina hasta 1/2/3 o X. */
export function RevealedCard({ pattern, project, position, total }: { pattern: Pattern; project: Project; position: number; total: number }) {
  const sug = pattern.aiSuggestedLayer;
  return (
    <div className="pointer-events-auto flex w-[240px] flex-col gap-[6px] bg-accent p-3 text-bone" role="status" aria-live="polite">
      <span className="flex items-center justify-between">
        <span className="type-label text-[11px] tracking-[0.06em]">NO LO MARCASTE</span>
        {total > 1 && <span className="font-mono text-[11px] font-medium">{position}/{total}</span>}
      </span>
      <span className="type-name text-[24px] leading-[0.95]">{pattern.name}</span>
      <span className="font-mono text-[11px] font-medium">{evidenceLabel(pattern, project)} · sin lámina</span>
      {sug && <span className="type-label text-[11px] opacity-85">LA IA PROPONE {layerTag(sug)}</span>}
      <span className="type-label mt-1 text-[11px] tracking-[0.05em]">1 2 3 · UBICAR&nbsp;&nbsp; X · DESCARTAR&nbsp;&nbsp; A · VER EVIDENCIA</span>
    </div>
  );
}

/* ---------- Espejo ---------- */

const CHOSEN: Record<Layer, string> = { 1: 'el núcleo', 2: 'soporte', 3: 'acento' };
const EVIDENCE: Record<Layer, string> = { 1: 'el núcleo', 2: 'el soporte', 3: 'el acento' };

/** La línea del espejo para un patrón, o null si la lámina elegida coincide con la evidencia. No discute ni bloquea. */
export function mirrorLine(pattern: Pattern, project: Project): React.ReactNode | null {
  const c = mirrorConflict(pattern, project);
  if (!c) return null;
  return (
    <>
      Pusiste «{pattern.name}» en {CHOSEN[c.chosen]}. Aparece en <b className="font-extrabold text-core">{c.count} de {c.total}</b>: la evidencia lo pone en {EVIDENCE[c.evidence]}.
    </>
  );
}

/** Patrón para el espejo: el seleccionado si contradice la evidencia; si no, el primero que la contradiga. */
export function mirrorTarget(project: Project, selectedId: string | null): Pattern | null {
  const live = project.patterns.filter(x => x.status !== 'discarded' && !x.isGroup);
  const sel = selectedId ? live.find(x => x.id === selectedId) : undefined;
  if (sel) return mirrorConflict(sel, project) ? sel : null;
  return live.find(x => mirrorConflict(x, project)) ?? null;
}

export function MirrorStrip({ children }: { children: React.ReactNode }) {
  return (
    <div className="no-print mx-3 mb-2 flex h-[38px] shrink-0 items-center gap-[14px] border-t-2 border-bone bg-void px-5" role="status" aria-live="polite">
      <span className="layer-tag">ESPEJO</span>
      <span className="truncate text-[14px]">{children}</span>
    </div>
  );
}

/* ---------- Auditoría (A) ---------- */

interface EvidencePanelProps {
  pattern: Pattern;
  project: Project;
  onRemove: (refId: string) => void;
  onAudited: () => void;
  onClose: () => void;
}

/**
 * Evidencias de un patrón, en color. El diseñador las revisa: X quita una referencia que no corresponde,
 * ⏎ marca el patrón como auditado. Esc cierra sin marcar.
 */
export function EvidencePanel({ pattern, project, onRemove, onAudited, onClose }: EvidencePanelProps) {
  const refs = pattern.evidence.map(id => project.references.find(r => r.id === id)).filter((r): r is NonNullable<typeof r> => !!r);
  const frags = (project.fragments ?? []).filter(f => f.groupId === pattern.id || pattern.fragmentIds?.includes(f.id));
  const [i, setI] = useState(0);
  const cur = refs[Math.min(i, refs.length - 1)];
  useShortcuts(true, {
    arrowleft: () => refs.length && setI(v => (v - 1 + refs.length) % refs.length),
    arrowright: () => refs.length && setI(v => (v + 1) % refs.length),
    x: () => (cur ? onRemove(cur.id) : false),
    enter: () => onAudited(),
    escape: () => onClose(),
    a: () => onClose(),
  });
  return (
    <div className="absolute inset-y-6 right-6 z-30 flex w-[min(620px,calc(100%-48px))] flex-col gap-4 overflow-hidden border-2 border-bone bg-void p-5" role="region" aria-label={`Evidencias de ${pattern.name}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="type-label text-[12px] text-ink-2">A · AUDITAR</span>
          <span className="type-name text-[34px]">{pattern.name}</span>
          <span className="font-mono text-[12px] font-medium text-ink-2">
            {evidenceCount(pattern, project)}/{corpusRefs(project).length} refs · {pattern.origin === 'designer' ? 'tu patrón' : 'lo encontró la IA'} · {pattern.audited ? 'auditado' : 'sin auditar'}
          </span>
        </div>
        {!pattern.audited && <span className="mt-2 inline-block size-[12px] shrink-0 rounded-full bg-[#8d8d8d]" title="Sin auditar" />}
      </div>
      {pattern.description && <p className="m-0 line-clamp-3 text-[14px] leading-[1.45] text-ink-2">{pattern.description}</p>}
      {frags.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="type-label shrink-0 text-[11px] text-ink-2">DEFINICIÓN</span>
          {frags.slice(0, 5).map(f => {
            const ref = project.references.find(r => r.id === f.refId);
            return ref ? <Crop key={f.id} image={ref.image} crop={f.crop} fit="cover" alt={f.label} className="size-[52px] shrink-0" /> : null;
          })}
        </div>
      )}
      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-4 gap-2 overflow-y-auto pr-1">
        {refs.map((r, k) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setI(k)}
            className="relative flex flex-col gap-1 text-left"
            style={k === i ? { outline: '3px solid var(--color-bone)', outlineOffset: 2 } : undefined}
          >
            <Crop image={r.image} fit="cover" alt={r.name} className="aspect-square w-full" />
            <span className="font-mono text-[11px] text-ink-2">{r.id}</span>
          </button>
        ))}
        {!refs.length && <span className="col-span-4 text-[14px] text-ink-2">Sin evidencia todavía.</span>}
      </div>
    </div>
  );
}
