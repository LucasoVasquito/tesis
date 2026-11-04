import React, { useMemo, useState } from 'react';
import { ClipboardCheck, Copy } from 'lucide-react';
import { GeneratedPiece, GenMode, PieceAudit, PieceType } from '../../types';
import { Button } from '../ui';

type Piece = GeneratedPiece & { imageUrl: string };

const TYPE_LABEL: Record<PieceType, string> = {
  logo: 'Logotipo',
  facade: 'Fachada',
  packaging: 'Packaging',
  poster: 'Afiche',
  post: 'Post',
  story: 'Story',
  web: 'Web',
  other: 'Otra',
};
const MODE_LABEL: Record<GenMode, string> = { system: 'Con el sistema', direct: 'Directo' };

interface ExperimentPanelProps {
  pieces: Piece[];
  audits: Record<string, PieceAudit | 'loading' | undefined>;
  onVerify: (pieces: Piece[]) => void;
  onSelect: (id: string) => void;
  systemName: string;
}

/** Puntajes de una pieza verificada (0..1). */
function scores(a: PieceAudit) {
  const rules = a.rules.length ? a.rules.reduce((n, r) => n + (r.verdict === 'cumple' ? 1 : r.verdict === 'parcial' ? 0.5 : 0), 0) / a.rules.length : null;
  const palette = a.palette.system.length ? a.palette.system.filter(c => c.found).length / a.palette.system.length : null;
  return { rules, palette, text: a.textOk ? 1 : 0 };
}
const mean = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)} %`);

/**
 * Experimento: ¿el sistema mejora la pieza? Compara las piezas generadas "con el sistema" y "directo"
 * (solo el pedido, como en ChatGPT) con las mismas medidas de la verificación.
 */
export function ExperimentPanel({ pieces, audits, onVerify, onSelect, systemName }: ExperimentPanelProps) {
  const [withIterations, setWithIterations] = useState(false);
  const [copied, setCopied] = useState(false);
  const pool = pieces.filter(p => withIterations || !p.parentId);
  const verified = (p: Piece) => {
    const a = audits[p.id];
    return a && a !== 'loading' ? a : null;
  };

  const stats = useMemo(() => {
    const by = (mode: GenMode) => {
      const ps = pool.filter(p => p.mode === mode);
      const vs = ps.map(verified).filter(Boolean) as PieceAudit[];
      const sc = vs.map(scores);
      return {
        total: ps.length,
        verified: vs.length,
        rules: mean(sc.map(s => s.rules)),
        text: mean(sc.map(s => s.text)),
        palette: mean(sc.map(s => s.palette)),
      };
    };
    return { system: by('system'), direct: by('direct') };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, audits]);

  // Por tipo de pieza, la mejor de cada modo (para mirarlas lado a lado).
  const pairs = useMemo(() => {
    const types = Array.from(new Set(pool.map(p => p.pieceType)));
    return types
      .map(t => {
        const best = (mode: GenMode) =>
          pool
            .filter(p => p.pieceType === t && p.mode === mode && verified(p))
            .map(p => ({ p, s: scores(verified(p)!).rules ?? 0 }))
            .sort((a, b) => b.s - a.s)[0] ?? null;
        const typeStats = (mode: GenMode) => mean(pool.filter(p => p.pieceType === t && p.mode === mode).map(p => (verified(p) ? scores(verified(p)!).rules : null)));
        return { type: t, system: best('system'), direct: best('direct'), sysAvg: typeStats('system'), dirAvg: typeStats('direct') };
      })
      .filter(x => x.system || x.direct);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, audits]);

  const pending = pool.filter(p => !audits[p.id]);
  const loading = pool.some(p => audits[p.id] === 'loading');
  const comparable = stats.system.verified > 0 && stats.direct.verified > 0;
  const diff = comparable && stats.system.rules !== null && stats.direct.rules !== null ? Math.round((stats.system.rules - stats.direct.rules) * 100) : null;
  const small = Math.min(stats.system.verified, stats.direct.verified) < 5;

  const copyTable = async () => {
    const row = (label: string, k: 'rules' | 'text' | 'palette') => `| ${label} | ${pct(stats.system[k])} | ${pct(stats.direct[k])} |`;
    const md = [
      `### Experimento · ${systemName}: con el sistema vs. directo`,
      '',
      `| Medida | Con el sistema (n=${stats.system.verified}) | Directo (n=${stats.direct.verified}) |`,
      '|---|---|---|',
      row('Reglas cumplidas', 'rules'),
      row('Texto exacto', 'text'),
      row('Paleta del sistema presente', 'palette'),
      '',
      ...pairs.map(x => `- ${TYPE_LABEL[x.type]}: sistema ${pct(x.sysAvg)} · directo ${pct(x.dirAvg)}`),
      '',
      `Piezas de primera generación${withIterations ? ' e iteraciones' : ''}, verificadas con Gemini contra las reglas del sistema. Muestra chica: resultado indicativo.`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* noop */
    }
  };

  const Metric = ({ label, k }: { label: string; k: 'rules' | 'text' | 'palette' }) => {
    return (
      <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-x-4 gap-y-1.5">
        <span className="row-span-2 text-13 text-ink">{label}</span>
        {(['system', 'direct'] as GenMode[]).map(m => {
          const v = stats[m][k];
          return (
            <div key={m} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-xs text-ink-2">{MODE_LABEL[m]}</span>
              <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/5">
                <span
                  className={`block h-full rounded-full transition-[width] duration-240 ease-emergent ${m === 'system' ? 'bg-signal' : 'bg-ink-2'}`}
                  style={{ width: v === null ? 0 : `${v * 100}%` }}
                />
              </span>
              <span className="w-12 shrink-0 text-right font-mono text-xs text-ink">{pct(v)}</span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <section aria-label="Experimento: con el sistema vs directo" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-[640px] flex-col gap-1">
          <h2 className="m-0 text-15 font-medium text-ink">¿El sistema mejora la pieza?</h2>
          <p className="m-0 text-13 text-ink-2">
            Compara las piezas pedidas <b className="font-medium text-ink">con el sistema</b> y en modo <b className="font-medium text-ink">directo</b> (solo el pedido, como en
            ChatGPT), verificadas con las mismas reglas. Para que sea justo, generá el mismo tipo de pieza con el mismo pedido en los dos modos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-13 text-ink-2">
            <input type="checkbox" className="size-4 accent-[#EDEDEF]" checked={withIterations} onChange={e => setWithIterations(e.target.checked)} />
            Incluir iteraciones
          </label>
          {pending.length > 0 && (
            <Button size="sm" variant="secondary" icon={<ClipboardCheck />} loading={loading} loadingText="Verificando…" onClick={() => onVerify(pending)}>
              Verificar {pending.length} {pending.length === 1 ? 'pieza' : 'piezas'}
            </Button>
          )}
          {comparable && (
            <Button size="sm" variant="ghost" icon={<Copy />} onClick={copyTable}>
              {copied ? 'Copiado' : 'Copiar tabla'}
            </Button>
          )}
        </div>
      </div>

      {/* Conteos por modo */}
      <div className="grid gap-3 sm:grid-cols-2">
        {(['system', 'direct'] as GenMode[]).map(m => (
          <div key={m} className={`flex flex-col gap-1 rounded-card border p-4 ${m === 'system' ? 'border-signal/40' : 'border-line'}`}>
            <span className={`font-mono text-xs ${m === 'system' ? 'text-signal-ink' : 'text-ink-2'}`}>{MODE_LABEL[m].toUpperCase()}</span>
            <span className="text-2xl font-medium text-ink">{pct(stats[m].rules)}</span>
            <span className="text-xs text-ink-2">
              de reglas cumplidas · {stats[m].verified} de {stats[m].total} {stats[m].total === 1 ? 'pieza verificada' : 'piezas verificadas'}
            </span>
          </div>
        ))}
      </div>

      {!comparable ? (
        <p className="m-0 rounded-card border border-dashed border-line-strong p-4 text-13 text-ink-2">
          {!stats.system.total || !stats.direct.total
            ? `Falta generar piezas en modo ${!stats.direct.total ? '“Directo”' : '“Con el sistema”'}: elegí el modo en el bloque Pieza y generá el mismo tipo de pieza.`
            : 'Verificá al menos una pieza de cada modo para comparar.'}
        </p>
      ) : (
        <>
          {diff !== null && (
            <p className="m-0 text-15 text-ink">
              Con el sistema, las piezas cumplen{' '}
              <b className={`font-medium ${diff >= 0 ? 'text-signal-ink' : 'text-discarded-ink'}`}>
                {diff >= 0 ? `${diff} puntos más` : `${-diff} puntos menos`}
              </b>{' '}
              de las reglas que en modo directo.
              {small && <span className="text-13 text-ink-2"> Muestra chica (menos de 5 piezas por modo): tomalo como indicio, no como conclusión.</span>}
            </p>
          )}
          <div className="flex flex-col gap-4 rounded-card border border-line p-4">
            <Metric label="Reglas cumplidas" k="rules" />
            <Metric label="Texto exacto" k="text" />
            <Metric label="Paleta del sistema" k="palette" />
          </div>
        </>
      )}

      {/* Lado a lado por tipo de pieza */}
      {pairs.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="m-0 text-13 font-medium text-ink">Lado a lado · la mejor de cada modo</h3>
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {pairs.map(x => (
              <li key={x.type} className="flex flex-col gap-2">
                <span className="text-xs text-ink-2">
                  {TYPE_LABEL[x.type]} · promedio sistema {pct(x.sysAvg)} · directo {pct(x.dirAvg)}
                </span>
                <div className="grid grid-cols-2 gap-3">
                  {(['system', 'direct'] as GenMode[]).map(m => {
                    const best = x[m];
                    return best ? (
                      <button
                        key={m}
                        type="button"
                        onClick={() => onSelect(best.p.id)}
                        className={`flex flex-col gap-2 rounded-card border bg-surface p-2 text-left transition-colors duration-120 hover:border-line-strong ${m === 'system' ? 'border-signal/40' : 'border-line'}`}
                        aria-label={`${MODE_LABEL[m]}: ${TYPE_LABEL[x.type]}, ${pct(best.s)} de reglas`}
                      >
                        {best.p.imageUrl ? (
                          <img src={best.p.imageUrl} alt="" className="max-h-[260px] w-full rounded-ctrl bg-bg object-contain" />
                        ) : (
                          <span className="block aspect-square w-full rounded-ctrl bg-raised" />
                        )}
                        <span className="flex items-center justify-between px-1 text-xs">
                          <span className={m === 'system' ? 'text-signal-ink' : 'text-ink-2'}>{MODE_LABEL[m]}</span>
                          <span className="font-mono text-ink">{pct(best.s)}</span>
                        </span>
                      </button>
                    ) : (
                      <span key={m} className="flex min-h-[120px] items-center justify-center rounded-card border border-dashed border-line-strong p-4 text-center text-xs text-ink-2">
                        Sin pieza verificada en modo {MODE_LABEL[m].toLowerCase()}
                      </span>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
