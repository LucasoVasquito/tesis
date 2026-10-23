import React, { useMemo, useState } from 'react';
import { Anchor, Copy, Download, Sparkles } from 'lucide-react';
import { Project, Reference, SystemResourceKey, VisualSystem } from '../types';
import { Button, EmptyState, ErrorState, LoadingState, TextArea, TextInput } from './ui';
import { FullView } from './shell/FullView';
import { compressImageString } from '../utils/imageCompressor';

interface SystemApplicationViewProps {
  project: Project;
  system: VisualSystem;
  onBack: () => void;
  onOpenLightbox: (ref: Reference) => void;
}

type PieceType = 'logo' | 'poster' | 'packaging' | 'post' | 'story' | 'facade' | 'web' | 'other';

const PIECES: { id: PieceType; label: string; format: string }[] = [
  { id: 'logo', label: 'Logotipo', format: '1:1' },
  { id: 'poster', label: 'Afiche', format: '2:3' },
  { id: 'packaging', label: 'Packaging', format: '1:1' },
  { id: 'post', label: 'Post', format: '1:1' },
  { id: 'story', label: 'Story', format: '2:3' },
  { id: 'facade', label: 'Fachada', format: '3:2' },
  { id: 'web', label: 'Web', format: '3:2' },
  { id: 'other', label: 'Otra', format: 'auto' },
];

/** Una imagen generada: una variante de una ronda, o una iteración sobre una variante. */
interface Piece {
  id: string;
  roundId: string;
  imageUrl: string;
  responseId: string;
  direction: string;
  rationale: string;
  revisedPrompt: string;
  model: string;
  pieceType: PieceType;
  parentId?: string;
}

interface Round {
  id: string;
  label: string;
  brief: string;
  referencesUsed: string[];
  pieces: Piece[];
  failed: number;
  failureMessage?: string;
}

const RESOURCES: { key: SystemResourceKey; label: string; category?: string }[] = [
  { key: 'palette', label: 'Paleta' },
  { key: 'typography', label: 'Tipografía', category: 'typography' },
  { key: 'texture', label: 'Textura', category: 'texture' },
  { key: 'composition', label: 'Composición', category: 'composition' },
];

/**
 * Verificación externa: piezas generadas con OpenAI a partir de los lineamientos.
 * Un modelo de texto interpreta el sistema como director de arte y genera con GPT Image;
 * cada variante explora una dirección distinta. No forma parte del sistema.
 */
export function SystemApplicationView({ project, system, onBack, onOpenLightbox }: SystemApplicationViewProps) {
  const patterns = project.patterns.filter(p => system.patternIds.includes(p.id) && p.status === 'confirmed');
  const [pieceType, setPieceType] = useState<PieceType>('logo');
  const [brandText, setBrandText] = useState(() => project.name.split(/\s[—–-]\s/)[0].trim());
  const [details, setDetails] = useState('');
  const [variantCount, setVariantCount] = useState(2);
  const [transparent, setTransparent] = useState(false);
  const [resources, setResources] = useState<Record<string, boolean>>({ palette: true, typography: true, texture: true, composition: true });
  const [rounds, setRounds] = useState<Round[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [revision, setRevision] = useState('');
  const [busy, setBusy] = useState<null | { kind: 'new' | 'revision'; count: number }>(null);
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const allPieces = rounds.flatMap(r => r.pieces);
  const selected = allPieces.find(p => p.id === selectedId) ?? null;
  const anchor = allPieces.find(p => p.id === anchorId) ?? null;
  const lastRound = rounds[rounds.length - 1] ?? null;

  /** Referencias de evidencia (hasta 4) que el modelo recibe como contexto visual. */
  const evidenceRefs = useMemo(() => {
    const ranked = [...patterns].sort((a, b) => b.confidence - a.confidence);
    const ids: string[] = [];
    for (const p of ranked) for (const id of p.evidence) if (!ids.includes(id)) ids.push(id);
    return ids.map(id => project.references.find(r => r.id === id)).filter(Boolean).slice(0, 4) as Reference[];
  }, [patterns, project.references]);

  const post = async (body: any) => {
    const res = await fetch('/api/generate-application', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const text = await res.text();
    let result: any;
    try {
      result = JSON.parse(text);
    } catch {
      throw Object.assign(new Error(`El servidor no devolvió una respuesta válida (HTTP ${res.status}). ¿Está corriendo "npm run server"?`), { detail: text.slice(0, 400) });
    }
    if (!res.ok || !result.success) throw Object.assign(new Error(result.error || 'No se pudo generar la pieza'), { detail: [result.details, result.promptUsed].filter(Boolean).join('\n\n') });
    return result.data;
  };

  const common = () => ({
    system,
    project: { name: project.name, objective: project.objective, description: project.description },
    patterns: patterns.map(p => ({ id: p.id, name: p.name, category: p.category, description: p.description })),
    resources,
    pieceType,
    brandText: brandText.trim(),
    details: details.trim(),
    transparent: pieceType === 'logo' && transparent,
  });

  const toPieces = (data: any, roundId: string, parentId?: string): Piece[] =>
    (data.variants || []).map((v: any, i: number) => ({
      id: `${roundId}_${i}`,
      roundId,
      imageUrl: v.imageUrl,
      responseId: v.responseId,
      direction: v.direction || '',
      rationale: v.rationale || '',
      revisedPrompt: v.revisedPrompt || '',
      model: [v.textModel, v.imageModel].filter(Boolean).join(' + '),
      pieceType: data.pieceType,
      parentId,
    }));

  const generate = async () => {
    setBusy({ kind: 'new', count: variantCount });
    setError(null);
    try {
      const refs = await Promise.all(
        evidenceRefs.map(async r => ({ id: r.id, image: await compressImageString(r.image, { maxWidth: 768, maxHeight: 768, quality: 0.85 }) })),
      );
      const data = await post({ ...common(), references: refs, variants: variantCount, anchorImageUrl: anchor?.imageUrl });
      const roundId = `r${Date.now()}`;
      const label = PIECES.find(p => p.id === pieceType)?.label ?? 'Pieza';
      const pieces = toPieces(data, roundId);
      setRounds(rs => [...rs, { id: roundId, label, brief: data.brief, referencesUsed: data.referencesUsed ?? [], pieces, failed: data.failed ?? 0, failureMessage: data.failureMessage }]);
      setSelectedId(pieces[0]?.id ?? null);
    } catch (err: any) {
      setError({ message: err?.message || String(err), detail: err?.detail });
    } finally {
      setBusy(null);
    }
  };

  const iterate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !revision.trim()) return;
    setBusy({ kind: 'revision', count: 1 });
    setError(null);
    try {
      const data = await post({
        ...common(),
        pieceType: selected.pieceType,
        revision: { text: revision.trim(), responseId: selected.responseId, imageUrl: selected.imageUrl },
      });
      const roundId = `r${Date.now()}`;
      const pieces = toPieces(data, roundId, selected.id);
      setRounds(rs => [...rs, { id: roundId, label: `Iteración: ${revision.trim()}`, brief: data.brief, referencesUsed: [], pieces, failed: 0 }]);
      setSelectedId(pieces[0]?.id ?? null);
      setRevision('');
    } catch (err: any) {
      setError({ message: err?.message || String(err), detail: err?.detail });
    } finally {
      setBusy(null);
    }
  };

  const copyBrief = async () => {
    const round = rounds.find(r => r.id === selected?.roundId);
    if (!round) return;
    try {
      await navigator.clipboard.writeText([round.brief, selected?.revisedPrompt && `\n\nPrompt final del modelo:\n${selected.revisedPrompt}`].filter(Boolean).join(''));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* noop */
    }
  };

  const selectedRound = rounds.find(r => r.id === selected?.roundId) ?? null;

  return (
    <FullView title={`Probar en una pieza · ${system.name}`} meta="VERIFICACIÓN EXTERNA · no forma parte del sistema" onBack={onBack} backLabel="Lineamientos">
      <div className="mx-auto grid max-w-[1320px] gap-8 px-4 py-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:px-8">
        {/* ---------- Pedido ---------- */}
        <form
          className="flex flex-col gap-6"
          onSubmit={e => {
            e.preventDefault();
            generate();
          }}
        >
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 text-13 text-ink-2">Tipo de pieza</legend>
            <div role="radiogroup" className="grid grid-cols-4 gap-1">
              {PIECES.map(p => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={pieceType === p.id}
                  onClick={() => setPieceType(p.id)}
                  className={`btn btn-sm px-2 ${pieceType === p.id ? 'btn-secondary border-ink/60' : 'btn-ghost'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <span className="font-mono text-xs text-ink-2">formato {PIECES.find(p => p.id === pieceType)?.format}</span>
          </fieldset>

          <TextInput
            label="Texto que aparece en la pieza"
            optional
            hint="Se escribe tal cual: revisá mayúsculas y tildes."
            value={brandText}
            onChange={e => setBrandText(e.target.value)}
          />

          <TextArea
            label="Detalles del pedido"
            optional
            rows={3}
            placeholder={pieceType === 'logo' ? 'Ej: que funcione en sellos y en el envoltorio; evitar ilustraciones literales de comida' : 'Ej: lanzamiento de temporada, titular “Abrimos de noche”'}
            value={details}
            onChange={e => setDetails(e.target.value)}
          />

          {pieceType === 'logo' && (
            <label className="flex cursor-pointer items-center gap-3 text-13 text-ink">
              <input type="checkbox" className="size-4 accent-[#EDEDEF]" checked={transparent} onChange={e => setTransparent(e.target.checked)} />
              Fondo transparente (PNG)
            </label>
          )}

          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 text-13 text-ink-2">Variantes</legend>
            <div role="radiogroup" aria-label="Cantidad de variantes" className="flex w-fit overflow-hidden rounded-ctrl border border-line-mid">
              {[1, 2, 3, 4].map(n => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={variantCount === n}
                  onClick={() => setVariantCount(n)}
                  className={`h-9 w-11 font-mono text-13 transition-colors duration-120 ${variantCount === n ? 'bg-ink text-bg' : 'text-ink-2 hover:bg-white/5 hover:text-ink'}`}
                >
                  {n}
                </button>
              ))}
            </div>
            <span className="text-xs text-ink-2">Cada variante explora una dirección distinta y se cobra como una generación aparte.</span>
          </fieldset>

          <details className="group rounded-card border border-line">
            <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-13 text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
              Qué recibe el modelo
              <span className="font-mono text-xs">{evidenceRefs.length} refs · {patterns.length} patrones</span>
            </summary>
            <div className="flex flex-col gap-3 border-t border-line p-3">
              <p className="m-0 text-xs text-ink-2">
                Los lineamientos completos (pilares, paleta, reglas, desglose de identidad y patrones confirmados) y estas referencias de evidencia como contexto
                visual. El modelo hereda su lenguaje sin copiar su contenido.
              </p>
              {evidenceRefs.length > 0 && (
                <ul className="m-0 grid list-none grid-cols-4 gap-2 p-0">
                  {evidenceRefs.map(r => (
                    <li key={r.id}>
                      <button type="button" onClick={() => onOpenLightbox(r)} className="flex w-full flex-col gap-1 text-left text-ink-2 hover:text-ink" aria-label={`Ver ${r.name} (${r.id})`}>
                        <img src={r.image} alt="" className="aspect-square w-full rounded-tag border border-signal/60 object-cover" referrerPolicy="no-referrer" />
                        <span className="font-mono text-xs">{r.id}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-col gap-1">
                {RESOURCES.map(r => (
                  <label key={r.key} className="flex cursor-pointer items-center gap-2 text-13 text-ink">
                    <input type="checkbox" className="size-4 accent-[#EDEDEF]" checked={resources[r.key]} onChange={() => setResources(x => ({ ...x, [r.key]: !x[r.key] }))} />
                    Incluir reglas de {r.label.toLowerCase()}
                  </label>
                ))}
              </div>
            </div>
          </details>

          {anchor && (
            <div className="flex items-center gap-3 rounded-ctrl border border-line p-3">
              <img src={anchor.imageUrl} alt="" className="size-10 rounded-tag object-cover" />
              <span className="flex-1 text-xs text-ink-2">Ancla de estilo: las piezas nuevas mantienen su lenguaje visual.</span>
              <Button size="sm" variant="ghost" onClick={() => setAnchorId(null)}>
                Quitar
              </Button>
            </div>
          )}

          <Button type="submit" variant="primary" loading={busy?.kind === 'new'} loadingText={`Generando ${variantCount} ${variantCount === 1 ? 'variante' : 'variantes'}…`} icon={<Sparkles />} disabled={!!busy}>
            {variantCount === 1 ? 'Generar pieza' : `Generar ${variantCount} variantes`}
          </Button>
        </form>

        {/* ---------- Resultado ---------- */}
        <section aria-label="Resultado" aria-busy={!!busy} className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-8 lg:self-start">
          {busy && (
            <LoadingState
              meta={`VERIFICACIÓN · ${busy.kind === 'revision' ? 'ITERACIÓN' : `${busy.count} ${busy.count === 1 ? 'VARIANTE' : 'VARIANTES'}`}`}
              title="El director de arte está trabajando"
              steps={[
                { label: 'lee los lineamientos y la evidencia', state: 'done' },
                { label: 'escribe el pedido de imagen', state: 'done' },
                { label: 'genera la imagen', state: 'current' },
              ]}
              note="Suele tardar entre 30 y 90 segundos. Las variantes se generan en paralelo."
            />
          )}
          {error && !busy && (
            <ErrorState code="VERIFICACIÓN" title="No se pudo generar la pieza" body={error.message} detail={error.detail} onRetry={generate} onDismiss={() => setError(null)} />
          )}
          {!busy && !error && rounds.length === 0 && (
            <EmptyState
              meta="0 piezas"
              title="Todavía no generaste ninguna pieza"
              body="Elegí el tipo de pieza y cuántas variantes querés comparar. Las piezas no se guardan en el proyecto: descargá las que te sirvan."
              className="min-h-[360px]"
            />
          )}

          {lastRound && !busy && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="m-0 text-15 font-medium text-ink">{lastRound.label}</h2>
                <span className="font-mono text-xs text-ink-2">
                  {lastRound.pieces.length} {lastRound.pieces.length === 1 ? 'pieza' : 'piezas'}
                  {lastRound.referencesUsed.length ? ` · evidencia ${lastRound.referencesUsed.join(', ')}` : ''}
                </span>
              </div>
              {lastRound.failed > 0 && (
                <p role="status" className="m-0 text-xs text-pending-ink">
                  {lastRound.failed} {lastRound.failed === 1 ? 'variante no se pudo generar' : 'variantes no se pudieron generar'}: {lastRound.failureMessage}
                </p>
              )}
              <ul className={`m-0 grid list-none gap-3 p-0 ${lastRound.pieces.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {lastRound.pieces.map((p, i) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(p.id)}
                      aria-pressed={p.id === selectedId}
                      aria-label={`Variante ${i + 1}${p.direction ? `: ${p.direction}` : ''}`}
                      className={`flex w-full flex-col gap-2 rounded-card border bg-surface p-2 text-left transition-colors duration-120 ${
                        p.id === selectedId ? 'border-ink' : 'border-line hover:border-line-strong'
                      }`}
                    >
                      <img src={p.imageUrl} alt="" className={`max-h-[56vh] w-full rounded-ctrl object-contain ${transparent ? 'bg-[repeating-conic-gradient(#222_0_25%,#2c2c2c_0_50%)] bg-[length:16px_16px]' : 'bg-bg'}`} />
                      {p.direction && <span className="px-1 text-xs text-ink-2">{p.direction.replace(/^Direction [A-D] — /, '')}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {selected && !busy && (
            <div className="flex flex-col gap-4 rounded-card border border-line p-4">
              <div className="flex flex-wrap items-center gap-2">
                <a className="btn btn-secondary btn-sm" href={selected.imageUrl} download={`${system.name.replace(/\s+/g, '_')}_${selected.id}.png`}>
                  <Download aria-hidden="true" />
                  Descargar
                </a>
                <Button size="sm" variant="ghost" icon={<Anchor />} aria-pressed={anchorId === selected.id} onClick={() => setAnchorId(a => (a === selected.id ? null : selected.id))}>
                  {anchorId === selected.id ? 'Es el ancla de estilo' : 'Usar como ancla de estilo'}
                </Button>
                <span className="ml-auto font-mono text-xs text-ink-2">{selected.model}</span>
              </div>

              {selected.rationale && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-ink-2">Cómo aplicó el sistema</span>
                  <p className="m-0 font-serif text-15 text-ink">{selected.rationale}</p>
                </div>
              )}

              <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={iterate}>
                <TextInput
                  label="Iterar esta variante"
                  placeholder="Ej: la marca más compacta, menos detalle en el sello"
                  value={revision}
                  onChange={e => setRevision(e.target.value)}
                  wrapperClassName="flex-1"
                />
                <Button type="submit" variant="secondary" loading={busy?.kind === 'revision'} loadingText="Iterando…" disabled={!revision.trim() || !!busy}>
                  Iterar
                </Button>
              </form>

              <details className="group rounded-ctrl border border-line">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-13 text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
                  Pedido y prompt (trazabilidad)
                </summary>
                <div className="flex flex-col gap-3 border-t border-line p-3">
                  {selectedRound && (
                    <>
                      <span className="text-xs text-ink-2">Pedido enviado al director de arte</span>
                      <pre className="m-0 max-h-60 overflow-auto whitespace-pre-wrap font-mono text-xs text-ink-2">{selectedRound.brief}</pre>
                    </>
                  )}
                  {selected.revisedPrompt && (
                    <>
                      <span className="text-xs text-ink-2">Prompt final que escribió el modelo</span>
                      <pre className="m-0 max-h-60 overflow-auto whitespace-pre-wrap font-mono text-xs text-ink-2">{selected.revisedPrompt}</pre>
                    </>
                  )}
                  <Button size="sm" variant="ghost" icon={<Copy />} onClick={copyBrief} className="self-start">
                    {copied ? 'Copiado' : 'Copiar'}
                  </Button>
                </div>
              </details>
            </div>
          )}

          {rounds.length > 1 && (
            <div className="flex flex-col gap-2">
              <span className="text-13 text-ink-2">Historial · {allPieces.length} piezas</span>
              <ul className="m-0 flex list-none gap-2 overflow-x-auto p-0">
                {allPieces.map((p, i) => (
                  <li key={p.id} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelectedId(p.id)}
                      aria-pressed={p.id === selectedId}
                      aria-label={`Pieza ${i + 1}${p.id === anchorId ? ' (ancla de estilo)' : ''}`}
                      className={`block overflow-hidden rounded-ctrl border ${p.id === selectedId ? 'border-ink' : 'border-line hover:border-line-strong'}`}
                    >
                      <img src={p.imageUrl} alt="" className="size-16 bg-bg object-cover" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </FullView>
  );
}
