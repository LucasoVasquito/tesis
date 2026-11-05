import React, { useEffect, useRef, useState } from 'react';
import { CropBox, Project } from '../types';
import { clampBox } from '../utils/parts';
import { Crop } from '../space/Crop';
import { SHEET_NAME, SplitPart, evidenceText, livePieces } from '../pieces/model';
import { KeyButton, PieceImage } from './common';

/** Marco común: diálogo modal con título, Esc para cerrar y foco adentro. */
function Dialog({ title, onClose, children, width = 720 }: { title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button, input, [tabindex]')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 p-6" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={e => e.stopPropagation()}
        className="flex max-h-[90vh] w-full flex-col gap-4 overflow-hidden border-2 border-bone bg-void p-5"
        style={{ maxWidth: width }}
      >
        <div className="flex items-center justify-between">
          <span className="type-name text-[30px]">{title}</span>
          <KeyButton k="ESC" label="Cerrar" tone="ghost" onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- Unir con… ---------- */

export function MergeDialog({ project, pieceId, onMerge, onClose }: { project: Project; pieceId: string; onMerge: (otherId: string) => void; onClose: () => void }) {
  const piece = project.patterns.find(x => x.id === pieceId);
  const others = livePieces(project).filter(x => x.id !== pieceId);
  if (!piece) return null;
  return (
    <Dialog title={`Unir «${piece.name}» con…`} onClose={onClose}>
      <span className="text-[14px] text-ink-2">Elegí la pieza equivalente. Se suman las referencias y queda el nombre «{piece.name}».</span>
      <div className="grid min-h-0 gap-3 overflow-y-auto" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
        {others.map(x => (
          <button key={x.id} type="button" onClick={() => onMerge(x.id)} className="flex flex-col gap-1 border-2 border-line-strong p-2 text-left hover:border-bone focus:border-core">
            <PieceImage piece={x} project={project} className="aspect-[4/3] w-full" />
            <span className="type-name text-[17px] leading-[0.95]">{x.name}</span>
            <span className="font-mono text-[11px] text-ink-2">
              {x.layer ? SHEET_NAME[x.layer] : 'sin capa'} · {evidenceText(x, project)}
            </span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

/* ---------- Recortar de nuevo ---------- */

const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

export function CropDialog({ project, pieceId, onSave, onClose }: { project: Project; pieceId: string; onSave: (refId: string, crop?: CropBox) => void; onClose: () => void }) {
  const piece = project.patterns.find(x => x.id === pieceId);
  const refs = (piece?.evidence ?? []).map(id => project.references.find(r => r.id === id)).filter((r): r is NonNullable<typeof r> => !!r);
  const [refId, setRefId] = useState(piece?.cover?.refId ?? refs[0]?.id ?? '');
  const [box, setBox] = useState<CropBox | null>(piece?.cover?.refId === refId ? piece?.cover?.crop ?? null : null);
  const wrap = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const ref = refs.find(r => r.id === refId);
  if (!piece) return null;
  const norm = (e: React.PointerEvent) => {
    const r = wrap.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const from = (a: { x: number; y: number }, b: { x: number; y: number }): CropBox => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
  return (
    <Dialog title={`Recortar «${piece.name}»`} onClose={onClose} width={900}>
      <span className="text-[14px] text-ink-2">Elegí la referencia y arrastrá sobre la imagen para marcar la zona donde se ve la pieza.</span>
      <div className="flex min-h-0 gap-4">
        <div className="flex w-[140px] shrink-0 flex-col gap-2 overflow-y-auto">
          {refs.map(r => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                setRefId(r.id);
                setBox(null);
              }}
              style={r.id === refId ? { outline: '3px solid var(--color-core)', outlineOffset: 2 } : undefined}
            >
              <Crop image={r.image} fit="cover" alt={r.name} className="aspect-square w-full" />
            </button>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 items-start justify-center">
          {ref && (
            <div
              ref={wrap}
              className="relative inline-block cursor-crosshair touch-none select-none"
              onPointerDown={e => {
                e.preventDefault();
                start.current = norm(e);
                wrap.current?.setPointerCapture(e.pointerId);
              }}
              onPointerMove={e => start.current && setBox(from(start.current, norm(e)))}
              onPointerUp={e => {
                if (!start.current) return;
                setBox(clampBox(from(start.current, norm(e))));
                start.current = null;
              }}
            >
              <img src={ref.image} alt={ref.name} draggable={false} className="block max-h-[56vh] max-w-full" />
              {box && <span aria-hidden="true" className="pointer-events-none absolute border-[3px] border-core" style={{ left: pct(box.x), top: pct(box.y), width: pct(box.w), height: pct(box.h), boxShadow: '0 0 0 9999px rgba(20,22,30,.55)' }} />}
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <KeyButton label="Usar la imagen entera" onClick={() => ref && onSave(ref.id, undefined)} />
        <KeyButton label="Guardar recorte" tone="core" disabled={!box || !ref} onClick={() => ref && box && onSave(ref.id, box)} />
      </div>
    </Dialog>
  );
}

/* ---------- Separar ---------- */

export function SplitDialog({
  project,
  pieceId,
  parts,
  error,
  onConfirm,
  onClose,
}: {
  project: Project;
  pieceId: string;
  parts: SplitPart[] | null;
  error?: string;
  onConfirm: (parts: SplitPart[]) => void;
  onClose: () => void;
}) {
  const piece = project.patterns.find(x => x.id === pieceId);
  // ⏎ confirma la separación cuando la propuesta está lista.
  useEffect(() => {
    if (!parts?.length) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm(parts);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [parts, onConfirm]);
  if (!piece) return null;
  return (
    <Dialog title={`Separar «${piece.name}»`} onClose={onClose}>
      {parts === null && (
        <div className="flex items-center gap-3 text-[15px]">
          <span className="spinner text-core" /> El agente está mirando las {piece.evidence.length} referencias de esta pieza…
        </div>
      )}
      {error && <span className="text-[15px]">No se pudo separar. Revisá la conexión con el agente. ({error})</span>}
      {parts && parts.length > 0 && (
        <>
          <span className="text-[14px] text-ink-2">El agente propone separarla así. Las partes quedan en la misma capa, como sugerencias.</span>
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${parts.length}, minmax(0, 1fr))` }}>
            {parts.map((part, i) => (
              <div key={i} className="flex flex-col gap-2 border-2 border-dashed border-bone/60 p-2">
                <PieceImage piece={{ ...piece, name: part.name, evidence: part.evidence, cover: part.cover }} project={project} className="aspect-[4/3] w-full" />
                <span className="type-name text-[20px]">{part.name}</span>
                {part.description && <span className="text-[13px] text-ink-2">{part.description}</span>}
                <span className="font-mono text-[11px] text-ink-2">{part.evidence.length} referencias</span>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <KeyButton label="Dejarla como estaba" tone="ghost" onClick={onClose} />
            <KeyButton k="⏎" label="Separar" tone="core" onClick={() => onConfirm(parts)} />
          </div>
        </>
      )}
    </Dialog>
  );
}
