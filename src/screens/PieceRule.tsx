import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Layer, Pattern, Project } from '../types';
import { SHEET_NAME, evidenceText, isSuggestion } from '../pieces/model';
import { Modal } from '../components/shell/Modal';
import { PieceThumb } from './common';
import { EvidenceStrip } from './EvidenceStrip';

/** Acción del pie del modal. `quiet`: texto discreto a la derecha (para lo destructivo). */
export interface ModalAction {
  label: string;
  run: () => void;
  quiet?: boolean;
}

/**
 * Regla de una pieza: el texto corto y «Ver completo», que abre un modal aparte con la pieza entera
 * (imagen, nombre, descripción, hipótesis y en cuántas referencias aparece). Así la grilla no se estira.
 */
export function PieceRule({ piece, project, short, className = '', actions, note }: { piece: Pattern; project: Project; short: string; className?: string; actions?: ModalAction[]; note?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      {short && <span className="text-[0.875rem] leading-[1.5] text-ink-2">{short}</span>}
      <button type="button" aria-haspopup="dialog" onClick={() => setOpen(true)} className="self-start p-0 text-[0.8125rem] font-bold text-ink underline underline-offset-4 hover:no-underline">
        Ver completo
      </button>
      {open && <PieceModal piece={piece} project={project} onClose={() => setOpen(false)} note={note} actions={actions?.map(a => ({ ...a, run: () => { setOpen(false); a.run(); } }))} />}
    </div>
  );
}

/**
 * La pieza completa en un modal aparte: imagen, nombre, descripción, cómo se aplica y en cuántas referencias aparece.
 * Va en el body: la mesa se anima con transform y un modal fijo adentro quedaría atrapado en ella.
 */
export function PieceModal({ piece, project, onClose, actions, note }: { piece: Pattern; project: Project; onClose: () => void; actions?: ModalAction[]; note?: React.ReactNode }) {
  const hyp = piece.systemHypothesis?.trim();
  const desc = piece.description?.trim();
  const layer = piece.layer as Layer | null | undefined;
  const state = piece.status === 'discarded' ? 'Descartada' : piece.origin === 'user' ? 'Usuario' : isSuggestion(piece) ? 'Sugerencia sin decidir' : 'Agente';
  return createPortal(
    <Modal open title={piece.status === 'discarded' ? 'Fuera del sistema' : layer ? SHEET_NAME[layer] : 'Pieza'} meta={state} width={680} onClose={onClose}>
      <div className={`flex flex-col gap-5 p-6 ${layer ? `layer-${layer}` : ''}`}>
        <PieceThumb piece={piece} project={project} className="aspect-[16/9] w-full rounded-[4px] bg-raised" />
        <h3 className="m-0 text-[1.5rem] font-semibold leading-tight text-ink">{piece.name}</h3>
        <div className="flex max-w-[64ch] flex-col gap-3 text-[1rem] leading-[1.65]">
          {desc && <p className="m-0 text-ink">{desc}</p>}
          {hyp && hyp !== desc && (
            <>
              <span className="type-label text-[0.75rem] text-ink-2">Cómo se aplica</span>
              <p className="m-0 -mt-2 text-ink-2">{hyp}</p>
            </>
          )}
          {!desc && !hyp && <p className="m-0 text-ink-2">Todavía sin regla redactada.</p>}
        </div>
        <span className="type-data text-[0.875rem] text-ink-2">En {evidenceText(piece, project)}</span>
        <EvidenceStrip piece={piece} project={project} />
        {note && <div className="flex flex-col gap-1 border-l-2 border-ink/40 pl-3 text-[0.9375rem] text-ink">{note}</div>}
        {actions && actions.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
            {actions.map(a => (
              <button key={a.label} type="button" onClick={a.run} className={a.quiet ? 'ml-auto text-[0.9375rem] font-medium text-ink-2 underline underline-offset-4 hover:text-ink' : 'inline-flex h-10 items-center rounded-full bg-ink/10 px-5 text-[0.9375rem] font-semibold text-ink hover:bg-ink/20'}>
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>,
    document.body,
  );
}
