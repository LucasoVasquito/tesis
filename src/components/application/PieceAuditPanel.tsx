import React from 'react';
import { ClipboardCheck, Wand2 } from 'lucide-react';
import { PieceAudit } from '../../utils/pieceAudit';
import { Button, ErrorState, LoadingState, StatusDot, Tone } from '../ui';

export type AuditState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'done'; audit: PieceAudit };

const VERDICT: Record<PieceAudit['rules'][number]['verdict'], { label: string; tone: Tone }> = {
  cumple: { label: 'Cumple', tone: 'confirmed' },
  parcial: { label: 'En parte', tone: 'pending' },
  no_cumple: { label: 'No cumple', tone: 'discarded' },
};

/** Puntaje de reglas: cumple = 1, en parte = 0,5. */
export function ruleScore(a: PieceAudit) {
  const got = a.rules.reduce((n, r) => n + (r.verdict === 'cumple' ? 1 : r.verdict === 'parcial' ? 0.5 : 0), 0);
  return { got, total: a.rules.length };
}
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));
export const scoreLabel = (a: PieceAudit) => {
  const { got, total } = ruleScore(a);
  return total ? `${fmt(got)}/${total}` : '—';
};

/** ¿Hay algo para corregir? */
export const hasFailures = (a: PieceAudit, expectsText: boolean) =>
  a.rules.some(r => r.verdict !== 'cumple') || (expectsText && !a.textOk) || a.palette.system.some(c => !c.found);

/** Pedido de corrección a partir de lo que falló (en inglés, para el modelo de imagen). */
export function fixRequest(a: PieceAudit, brandText: string, photo: boolean): string {
  const parts = [...a.fixes];
  if (brandText && !a.textOk) parts.unshift(`Render the text exactly as "${brandText}", letter by letter, with no extra or missing characters`);
  // En fotos, como mucho los dos colores principales que faltan: el resto forzaría la escena.
  const missing = a.palette.system.filter(c => !c.found).map(c => c.hex).slice(0, photo ? 2 : 4);
  if (missing.length) parts.push(`Bring in the brand color${missing.length > 1 ? 's' : ''} ${missing.join(', ')}${photo ? ' on the brand elements' : ''}`);
  return parts.join('; ');
}

interface PieceAuditPanelProps {
  state?: AuditState;
  brandText: string;
  photo: boolean;
  onAudit: () => void;
  onFix: (text: string) => void;
  busy: boolean;
}

export function PieceAuditPanel({ state, brandText, photo, onAudit, onFix, busy }: PieceAuditPanelProps) {
  if (!state) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-ctrl border border-line p-3">
        <p className="m-0 text-13 text-ink-2">
          Revisá si la pieza respeta el sistema: la paleta se mide en tu navegador; el texto y las reglas los revisa Gemini.
        </p>
        <Button size="sm" variant="secondary" icon={<ClipboardCheck />} onClick={onAudit} disabled={busy}>
          Auditar contra el sistema
        </Button>
      </div>
    );
  }
  if (state.status === 'loading') {
    return (
      <LoadingState
        meta="AUDITORÍA · GEMINI"
        title="Revisando la pieza"
        steps={[
          { label: 'paleta', state: 'done' },
          { label: 'texto', state: 'current' },
          { label: 'reglas', state: 'todo' },
        ]}
        note="La paleta se mide sin IA; el texto y las reglas los revisa Gemini."
        className="min-h-0"
      />
    );
  }
  if (state.status === 'error') {
    return <ErrorState code="AUDITORÍA" title="No se pudo auditar la pieza" body="La pieza no se modificó." detail={state.message} onRetry={onAudit} className="min-h-0" />;
  }

  const a = state.audit;
  const { got, total } = ruleScore(a);
  const found = a.palette.system.filter(c => c.found).length;
  const failing = hasFailures(a, !!brandText);

  return (
    <section aria-label="Auditoría de la pieza" className="flex flex-col gap-4 rounded-ctrl border border-line p-4">
      {/* Resumen */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="font-mono text-xs text-ink-2">AUDITORÍA</span>
        <span className="text-13 text-ink">
          reglas <b className="font-mono font-medium">{total ? `${fmt(got)}/${total}` : '—'}</b>
        </span>
        <span className="text-13 text-ink">
          paleta <b className="font-mono font-medium">{a.palette.system.length ? `${found}/${a.palette.system.length}` : '—'}</b>
        </span>
        {brandText && (
          <span className="flex items-center gap-1.5 text-13 text-ink">
            <StatusDot tone={a.textOk ? 'confirmed' : 'discarded'} />
            texto {a.textOk ? 'exacto' : 'con errores'}
          </span>
        )}
      </div>

      {/* Texto */}
      {(brandText || a.textRead) && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-ink-2">Texto que se lee</span>
          <p className="m-0 text-13 text-ink">
            «{a.textRead || '—'}»{brandText && !a.textOk ? <span className="text-discarded-ink"> · se esperaba «{brandText}»</span> : null}
          </p>
          {a.textIssue && !a.textOk && <p className="m-0 text-xs text-ink-2">{a.textIssue}</p>}
        </div>
      )}

      {/* Paleta */}
      {a.palette.system.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs text-ink-2">Paleta del sistema en la pieza{photo ? ' (elementos de marca)' : ''}</span>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {a.palette.system.map(c => (
              <li
                key={c.hex}
                className={`flex items-center gap-2 rounded-tag border px-2 py-1 text-xs ${c.found ? 'border-line-mid text-ink' : 'border-dashed border-line-strong text-ink-2'}`}
                title={c.found ? `Aparece como ${c.match}` : 'No aparece'}
              >
                <span className="size-3.5 rounded-[3px] border border-line" style={{ background: c.hex }} />
                <span className="font-mono">{c.hex.toUpperCase()}</span>
                <span>{c.found ? '✓' : 'falta'}</span>
              </li>
            ))}
          </ul>
          {a.palette.outside.length > 0 && (
            <p className="m-0 flex flex-wrap items-center gap-2 text-xs text-ink-2">
              {photo ? 'Colores del entorno:' : 'Fuera de la paleta:'}
              {a.palette.outside.map(c => (
                <span key={c.hex} className="inline-flex items-center gap-1 font-mono">
                  <span className="size-3 rounded-[2px] border border-line" style={{ background: c.hex }} />
                  {c.hex} · {Math.round(c.share * 100)}%
                </span>
              ))}
            </p>
          )}
        </div>
      )}

      {/* Reglas */}
      {a.rules.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {a.rules.map(r => (
            <li key={r.code} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
              <span className="flex items-center gap-1.5 pt-0.5 font-mono text-xs text-ink-2">
                <StatusDot tone={VERDICT[r.verdict].tone} />
                {r.code}
              </span>
              <span className="text-13 text-ink">
                {r.title} · <span className={r.verdict === 'cumple' ? 'text-confirmed-ink' : r.verdict === 'parcial' ? 'text-pending-ink' : 'text-discarded-ink'}>{VERDICT[r.verdict].label}</span>
              </span>
              <span />
              <span className="text-xs text-ink-2">{r.reason}</span>
            </li>
          ))}
        </ul>
      )}

      {a.quality && <p className="m-0 font-serif text-15 text-ink-2">{a.quality}</p>}

      <div className="flex flex-wrap gap-2">
        {failing && (
          <Button size="sm" variant="primary" icon={<Wand2 />} onClick={() => onFix(fixRequest(a, brandText, photo))} disabled={busy}>
            Corregir lo que falla
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onAudit} disabled={busy}>
          Volver a auditar
        </Button>
      </div>
      <p className="m-0 text-xs text-ink-2">La auditoría es una lectura de la IA: vos decidís si la pieza sirve.</p>
    </section>
  );
}
