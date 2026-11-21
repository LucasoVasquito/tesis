import React, { useState } from 'react';
import { Pattern, Project } from '../types';
import { fullRule } from '../utils/layerRules';
import { evidenceText } from '../pieces/model';

/**
 * Regla de una pieza con desplegable: muestra el texto corto y, al abrir, el completo
 * (descripción, hipótesis y en cuántas referencias aparece). Nada se corta con «…».
 */
export function PieceRule({ piece, project, short, className = '' }: { piece: Pattern; project: Project; short: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const full = fullRule(piece);
  const hyp = piece.systemHypothesis?.trim();
  const desc = piece.description?.trim();
  void full;
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      {!open && short && <span className="text-[0.875rem] leading-[1.5] text-ink-2">{short}</span>}
      {open && (
        <div className="flex flex-col gap-2 text-[0.875rem] leading-[1.55]">
          {desc && <p className="m-0 text-ink">{desc}</p>}
          {hyp && hyp !== desc && <p className="m-0 text-ink-2">{hyp}</p>}
          {!desc && !hyp && <p className="m-0 text-ink-2">Todavía sin regla redactada.</p>}
          <span className="type-data text-ink-2">En {evidenceText(piece, project)}</span>
        </div>
      )}
      <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)} className="self-start p-0 text-[0.8125rem] font-bold text-ink underline underline-offset-4 hover:no-underline">
        {open ? 'Ver menos ▴' : 'Ver completo ▾'}
      </button>
    </div>
  );
}
