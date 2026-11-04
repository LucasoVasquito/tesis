import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Project } from '../types';
import { FullView } from './shell/FullView';
import { EmptyState } from './ui';
import { familyOf } from '../utils/families';
import { buildTraceGraph, EdgeKind, lineage, NodeKind, TraceEdge, TraceNode } from '../utils/traceGraph';
import { loadPieceImage } from '../utils/pieceStore';

interface TraceMapProps {
  project: Project;
  onBack: () => void;
}

const KIND_LABEL: Record<NodeKind, [string, string]> = {
  ref: ['referencia', 'referencias'],
  pattern: ['patrón', 'patrones'],
  pillar: ['pilar', 'pilares'],
  rule: ['regla', 'reglas'],
  piece: ['pieza', 'piezas'],
};

const EDGE_STYLE: Record<EdgeKind, { color: string; dash?: string }> = {
  evidence: { color: 'var(--color-ink-2)' },
  pillar: { color: 'var(--color-ink-2)' },
  rule: { color: 'var(--color-ink-2)' },
  crop: { color: 'var(--color-ink-2)', dash: '4 4' },
  verified: { color: 'var(--color-confirmed)' },
  partial: { color: 'var(--color-pending)', dash: '4 4' },
};

/**
 * Mapa de trazabilidad: referencias → patrones confirmados → pilares y reglas de cada sistema → piezas aprobadas.
 * Tocar un elemento ilumina su linaje completo (lo que lo sostiene y lo que sostiene).
 */
export function TraceMap({ project, onBack }: TraceMapProps) {
  const graph = useMemo(() => buildTraceGraph(project), [project]);
  const byId = useMemo(() => new Map(graph.nodes.map(n => [n.id, n])), [graph]);
  const refById = useMemo(() => new Map(project.references.map(r => [r.id, r])), [project.references]);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const active = selected ?? hovered;
  const lin = useMemo(() => (active ? lineage(graph, active) : null), [graph, active]);

  /* ---------- Imágenes de piezas ---------- */
  const [pieceImgs, setPieceImgs] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    const pieces = graph.nodes.filter(n => n.kind === 'piece' && n.pieceId && !pieceImgs[n.pieceId]);
    Promise.all(pieces.map(async n => [n.pieceId!, await loadPieceImage(project.id, n.pieceId!)] as const)).then(found => {
      if (!alive) return;
      const ok = Object.fromEntries(found.filter(([, u]) => u)) as Record<string, string>;
      if (Object.keys(ok).length) setPieceImgs(m => ({ ...m, ...ok }));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, project.id]);

  /* ---------- Líneas: se miden las fichas y se dibujan curvas entre columnas ---------- */
  const wrapRef = useRef<HTMLDivElement>(null);
  const nodeEls = useRef(new Map<string, HTMLElement>());
  const [paths, setPaths] = useState<{ edge: TraceEdge; d: string }[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const box = wrap.getBoundingClientRect();
    const pos = (id: string, side: 'l' | 'r') => {
      const el = nodeEls.current.get(id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: (side === 'r' ? r.right : r.left) - box.left, y: r.top + r.height / 2 - box.top };
    };
    const next: { edge: TraceEdge; d: string }[] = [];
    for (const e of graph.edges) {
      const a = pos(e.from, 'r');
      const b = pos(e.to, 'l');
      if (!a || !b) continue;
      const mid = (a.x + b.x) / 2;
      next.push({ edge: e, d: `M ${a.x} ${a.y} C ${mid} ${a.y}, ${mid} ${b.y}, ${b.x} ${b.y}` });
    }
    setPaths(next);
    setSize({ w: wrap.scrollWidth, h: wrap.scrollHeight });
  }, [graph]);
  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(() => measure());
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [measure]);

  const setEl = (id: string) => (el: HTMLElement | null) => {
    if (el) nodeEls.current.set(id, el);
    else nodeEls.current.delete(id);
  };

  /* ---------- Fichas ---------- */
  const nodeProps = (n: TraceNode) => {
    const on = !lin || lin.nodes.has(n.id);
    return {
      ref: setEl(n.id),
      type: 'button' as const,
      'aria-pressed': selected === n.id,
      onClick: () => setSelected(s => (s === n.id ? null : n.id)),
      onMouseEnter: () => setHovered(n.id),
      onMouseLeave: () => setHovered(h => (h === n.id ? null : h)),
      onFocus: () => setHovered(n.id),
      onBlur: () => setHovered(h => (h === n.id ? null : h)),
      className: `relative z-[1] flex w-full items-center gap-2 rounded-ctrl border bg-surface p-1.5 text-left transition-[opacity,border-color,background-color] duration-180 ease-emergent ${
        selected === n.id ? 'border-signal bg-signal/10' : lin?.nodes.has(n.id) && active ? 'border-signal/60' : 'border-line hover:border-line-strong'
      } ${on ? '' : 'opacity-25'}`,
    };
  };

  const refs = graph.nodes.filter(n => n.kind === 'ref');
  const patterns = graph.nodes.filter(n => n.kind === 'pattern');
  const hasPieces = graph.systems.some(s => s.pieces.length);

  // Resumen del linaje activo.
  const summary = useMemo(() => {
    if (!active || !lin) return null;
    const n = byId.get(active);
    if (!n) return null;
    const counts = (['ref', 'pattern', 'pillar', 'rule', 'piece'] as NodeKind[])
      .filter(k => k !== n.kind)
      .map(k => {
        const c = [...lin.nodes].filter(id => byId.get(id)?.kind === k).length;
        return c ? `${c} ${KIND_LABEL[k][c === 1 ? 0 : 1]}` : null;
      })
      .filter(Boolean);
    return { node: n, text: counts.length ? counts.join(' · ') : 'sin conexiones registradas' };
  }, [active, lin, byId]);

  return (
    <FullView embedded title="Mapa de trazabilidad" meta={`${project.name || 'Proyecto'} · de la referencia a la pieza`} onBack={onBack} backLabel="Volver">
      <div className="flex flex-col gap-4 px-4 py-5 lg:px-8">
        <div className="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-2" role="status" aria-live="polite">
          {summary ? (
            <>
              <span className="text-13 text-ink">
                <span className="font-mono text-signal-ink">{summary.node.code}</span>
                {summary.node.kind !== 'piece' && <> · {summary.node.label.length > 70 ? `${summary.node.label.slice(0, 70)}…` : summary.node.label}</>}
              </span>
              <span className="text-13 text-ink-2">{summary.text}</span>
              {selected && (
                <button type="button" className="text-xs text-ink underline-offset-2 hover:underline" onClick={() => setSelected(null)}>
                  Soltar selección
                </button>
              )}
            </>
          ) : (
            <span className="text-13 text-ink-2">Pasá o tocá cualquier elemento para ver su linaje completo: lo que lo sostiene y lo que sostiene.</span>
          )}
          <span className="ml-auto flex flex-wrap items-center gap-3 text-xs text-ink-2">
            <Legend color="var(--color-ink-2)">evidencia</Legend>
            <Legend color="var(--color-ink-2)" dash>
              recorte
            </Legend>
            <Legend color="var(--color-confirmed)">cumple</Legend>
            <Legend color="var(--color-pending)" dash>
              cumple en parte
            </Legend>
          </span>
        </div>

        {!patterns.length ? (
          <EmptyState meta="sin patrones confirmados" title="Todavía no hay nada para trazar" body="El mapa aparece cuando confirmás patrones en Auditoría y armás un sistema en Síntesis." className="min-h-[320px]" />
        ) : (
          <div className="overflow-x-auto">
            <div
              ref={wrapRef}
              className={`relative grid min-w-[1080px] gap-x-24 ${hasPieces ? 'grid-cols-[200px_240px_minmax(280px,1fr)_180px]' : 'grid-cols-[200px_240px_minmax(280px,1fr)]'}`}
              onClick={e => e.target === e.currentTarget && setSelected(null)}
            >
              <svg className="pointer-events-none absolute left-0 top-0 z-0" width={size.w} height={size.h} aria-hidden="true">
                {paths.map(({ edge, d }, i) => {
                  const st = EDGE_STYLE[edge.kind];
                  const on = lin?.edges.has(edge);
                  return (
                    <path
                      key={i}
                      d={d}
                      fill="none"
                      stroke={on && edge.kind !== 'verified' && edge.kind !== 'partial' ? 'var(--color-signal)' : st.color}
                      strokeWidth={on ? 2 : 1}
                      strokeDasharray={st.dash}
                      opacity={lin ? (on ? 1 : 0.06) : 0.3}
                      style={{ transition: 'opacity 180ms, stroke-width 180ms' }}
                    />
                  );
                })}
              </svg>

              <Column title="Referencias" count={refs.length} hint="las que sostienen algo">
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {refs.map(n => {
                    const r = refById.get(n.refId!);
                    return (
                      <li key={n.id}>
                        <button {...nodeProps(n)} aria-label={`${n.code}: ${n.label}`}>
                          {r && <img src={r.image} alt="" onLoad={measure} className={`size-9 shrink-0 rounded-[4px] bg-bg ${r.parentId ? 'object-contain' : 'object-cover'}`} referrerPolicy="no-referrer" />}
                          <span className="flex min-w-0 flex-col">
                            <span className="font-mono text-xs text-ink-2">
                              {n.code}
                              {n.parentRef ? ' · parte' : ''}
                            </span>
                            <span className="truncate text-xs text-ink">{n.label}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Column>

              <Column title="Patrones" count={patterns.length} hint="confirmados en Auditoría">
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {patterns.map(n => {
                    const f = familyOf(n.patternCategory ?? '');
                    return (
                      <li key={n.id}>
                        <button {...nodeProps(n)} aria-label={`${n.code}: ${n.label}`}>
                          <span aria-hidden="true" className="h-8 w-1 shrink-0 rounded-full" style={{ background: f.color }} />
                          <span className="flex min-w-0 flex-col">
                            <span className="font-mono text-xs" style={{ color: f.ink }}>
                              {n.code} · {f.label}
                            </span>
                            <span className="line-clamp-2 text-xs leading-snug text-ink">{n.label}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Column>

              <Column title="Sistemas" count={graph.systems.length} hint="pilares y reglas">
                <div className="flex flex-col gap-4">
                  {graph.systems.map(s => (
                    <div key={s.id} className="flex flex-col gap-2 rounded-card border border-line p-2">
                      <span className="px-1 text-13 font-medium text-ink">{s.name}</span>
                      {s.pillars.length > 0 && (
                        <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label={`Pilares de ${s.name}`}>
                          {s.pillars.map(id => {
                            const n = byId.get(id)!;
                            return (
                              <li key={id}>
                                <button {...nodeProps(n)} aria-label={`Pilar ${n.label}`}>
                                  <span className="w-6 shrink-0 font-mono text-xs text-ink-2">{n.code}</span>
                                  <span className="min-w-0 truncate font-serif text-sm text-ink">{n.label}</span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      {s.rules.length > 0 && (
                        <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label={`Reglas de ${s.name}`}>
                          {s.rules.map(id => {
                            const n = byId.get(id)!;
                            return (
                              <li key={id}>
                                <button {...nodeProps(n)} aria-label={`Regla ${n.code}: ${n.label}`}>
                                  <span className="w-6 shrink-0 font-mono text-xs text-ink-2">{n.code}</span>
                                  <span className="min-w-0 truncate text-xs text-ink">{n.label}</span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      {!s.pillars.length && !s.rules.length && <span className="px-1 text-xs text-ink-2">Sin redactar todavía.</span>}
                    </div>
                  ))}
                </div>
              </Column>

              {hasPieces && (
                <Column title="Piezas aprobadas" count={graph.nodes.filter(n => n.kind === 'piece').length} hint="reglas que cumplen según la verificación">
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {graph.nodes
                      .filter(n => n.kind === 'piece')
                      .map(n => (
                        <li key={n.id}>
                          <button {...nodeProps(n)} aria-label={`${n.label} aprobada${n.score ? `, cumple ${n.score} reglas` : ''}`}>
                            {pieceImgs[n.pieceId!] ? (
                              <img src={pieceImgs[n.pieceId!]} alt="" onLoad={measure} className="size-14 shrink-0 rounded-[4px] bg-bg object-cover" />
                            ) : (
                              <span className="size-14 shrink-0 rounded-[4px] bg-raised" />
                            )}
                            <span className="flex min-w-0 flex-col">
                              <span className="text-xs font-medium text-ink">{n.label}</span>
                              <span className="font-mono text-xs text-ink-2">{n.score ? `verificación ${n.score}` : 'sin verificar'}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                  </ul>
                </Column>
              )}
            </div>
          </div>
        )}
      </div>
    </FullView>
  );
}

function Column({ title, count, hint, children }: { title: string; count: number; hint: string; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <header className="sticky top-0 z-[2] flex flex-col bg-bg/95 pb-2 backdrop-blur">
        <span className="text-13 font-medium text-ink">
          {title} <span className="font-mono text-xs font-normal text-ink-2">· {count}</span>
        </span>
        <span className="text-xs text-ink-2">{hint}</span>
      </header>
      {children}
    </section>
  );
}

function Legend({ color, dash, children }: { color: string; dash?: boolean; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="22" height="6" aria-hidden="true">
        <line x1="0" y1="3" x2="22" y2="3" stroke={color} strokeWidth="1.5" strokeDasharray={dash ? '4 3' : undefined} />
      </svg>
      {children}
    </span>
  );
}
