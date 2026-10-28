import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Check, ClipboardCheck, Copy, Download, Plus, Sparkles } from 'lucide-react';
import { ApplicationSession, GeneratedPiece, GenerationRound, GenMode, PieceType, Project, Reference, SystemResourceKey, VisualSystem } from '../types';
import { loadPieceImage, savePieceImage, toDataUrl } from '../utils/pieceStore';
import { Button, EmptyState, ErrorState, LoadingState, TextArea, TextInput } from './ui';
import { FullView } from './shell/FullView';
import { compressImageString } from '../utils/imageCompressor';
import { checkPalette, extractColors, PieceAudit } from '../utils/pieceAudit';
import { AuditState, PieceAuditPanel, scoreLabel } from './application/PieceAuditPanel';

interface SystemApplicationViewProps {
  project: Project;
  system: VisualSystem;
  /** Todos los sistemas del proyecto (para cambiar cuál se aplica). */
  systems: VisualSystem[];
  onSelectSystem: (id: string) => void;
  onOpenGuidelines: () => void;
  onOpenLightbox: (ref: Reference) => void;
  /** Lo generado antes para este sistema. */
  session?: ApplicationSession;
  onSaveSession: (session: ApplicationSession) => void;
}

type RuleFamily = 'typography' | 'texture' | 'composition';

/** Igual que en el servidor: formato, si es foto y qué familias de reglas importan en cada soporte. */
const PIECES: { id: PieceType; label: string; format: string; photo?: boolean; rules: RuleFamily[]; placeholder: string }[] = [
  { id: 'logo', label: 'Logotipo', format: '1:1', rules: ['typography'], placeholder: 'Ej: que funcione en sellos y en el envoltorio; evitar ilustraciones literales de comida' },
  { id: 'facade', label: 'Fachada', format: '3:2', photo: true, rules: ['typography', 'texture'], placeholder: 'Ej: local en esquina de Palermo, de noche, cartel de chapa con luz, persiana a medio subir' },
  { id: 'packaging', label: 'Packaging', format: '1:1', photo: true, rules: ['typography', 'texture'], placeholder: 'Ej: caja de hamburguesa de cartón kraft abierta sobre una barra de acero, con papel impreso' },
  { id: 'poster', label: 'Afiche', format: '2:3', rules: ['typography', 'texture', 'composition'], placeholder: 'Ej: fiesta de apertura, titular “Abrimos de noche”, fecha y dirección' },
  { id: 'post', label: 'Post', format: '1:1', rules: ['typography', 'composition'], placeholder: 'Ej: lanzamiento de la doble smash, precio y “solo este finde”' },
  { id: 'story', label: 'Story', format: '2:3', rules: ['typography', 'composition'], placeholder: 'Ej: cuenta regresiva para la apertura' },
  { id: 'web', label: 'Web', format: '3:2', rules: ['typography', 'composition'], placeholder: 'Ej: home con la carta y un botón para pedir' },
  { id: 'other', label: 'Otra', format: 'auto', rules: ['typography', 'texture', 'composition'], placeholder: 'Describí la pieza' },
];
const pieceInfoOf = (t: PieceType) => PIECES.find(p => p.id === t)!;
const WITH_ARTICLE: Record<PieceType, string> = {
  logo: 'el logotipo',
  facade: 'la fachada',
  packaging: 'el packaging',
  poster: 'el afiche',
  post: 'el post',
  story: 'la story',
  web: 'la web',
  other: 'la pieza',
};
/** Piezas que se muestran siempre en la tira de la marca (las demás aparecen cuando se aprueban). */
const STRIP: PieceType[] = ['logo', 'facade', 'packaging', 'poster', 'post'];
const NEXT: PieceType[] = ['facade', 'packaging', 'poster', 'post'];

/** Nombres en español de las direcciones que explora cada variante (el servidor las manda como "Direction A — …"). */
const DIRECTIONS: Partial<Record<PieceType, string[]>> & { default: string[] } = {
  logo: ['Logotipo tipográfico', 'Símbolo + logotipo', 'Emblema', 'Marca mínima'],
  poster: ['Tipografía protagonista', 'Imagen protagonista', 'Gráfico y sistemático', 'La más arriesgada'],
  packaging: ['Fiel a los materiales', 'Gráfica envolvente', 'Mínimo y premium', 'Familia de piezas'],
  facade: ['Cartelería protagonista', 'Material y color', 'Recursos gráficos en la arquitectura', 'La más arriesgada'],
  web: ['Tipografía', 'Imagen', 'Retícula y recursos', 'La más arriesgada'],
  other: ['Fiel', 'Más audaz', 'Más mínima', 'La más arriesgada'],
  default: ['Tipografía', 'Imagen', 'Patrón gráfico', 'La más arriesgada'],
};
function directionLabel(p: { direction: string; pieceType: PieceType }) {
  const m = /^Direction ([A-D])/.exec(p.direction);
  if (!m) return p.direction;
  return (DIRECTIONS[p.pieceType] ?? DIRECTIONS.default)['ABCD'.indexOf(m[1])];
}

/** Pieza con su imagen ya resuelta (data URL recién generada u object URL guardado). */
type Piece = GeneratedPiece & { imageUrl: string };
type Round = GenerationRound;

const RESOURCES: { key: SystemResourceKey; label: string }[] = [
  { key: 'palette', label: 'Paleta' },
  { key: 'typography', label: 'Tipografía' },
  { key: 'texture', label: 'Textura' },
  { key: 'composition', label: 'Composición' },
];

const Block = ({ n, title, children }: { n: string; title: string; children: React.ReactNode }) => (
  <fieldset className="m-0 flex flex-col gap-4 border-0 p-0">
    <legend className="mb-3 flex items-center gap-2 p-0 text-13 font-medium text-ink">
      <span className="font-mono text-xs text-ink-2">{n}</span>
      {title}
    </legend>
    {children}
  </fieldset>
);

/**
 * Verificación externa: piezas generadas con OpenAI a partir de los lineamientos.
 * Flujo: elegir pieza → pedir → comparar variantes → aprobar → la siguiente pieza usa el logo aprobado.
 */
export function SystemApplicationView({ project, system, systems, onSelectSystem, onOpenGuidelines, onOpenLightbox, session, onSaveSession }: SystemApplicationViewProps) {
  const patterns = project.patterns.filter(p => system.patternIds.includes(p.id) && p.status === 'confirmed');
  const [pieceType, setPieceType] = useState<PieceType>('logo');
  const [mode, setMode] = useState<GenMode>('system');
  const [brandText, setBrandText] = useState(() => session?.brandText ?? project.name.split(/\s[—–-]\s/)[0].trim());
  /** "Qué querés ver", por tipo de pieza: no se arrastra de una pieza a otra. */
  const [requests, setRequests] = useState<Partial<Record<PieceType, string>>>(() => session?.requests ?? {});
  const [variantCount, setVariantCount] = useState(2);
  const [transparent, setTransparent] = useState(false);
  const [useLogo, setUseLogo] = useState(true);
  const [resources, setResources] = useState<Record<string, boolean>>({ palette: true, typography: true, texture: true, composition: true });
  const [rounds, setRounds] = useState<Round[]>(() => session?.rounds ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(() => session?.rounds?.[session.rounds.length - 1]?.pieces[0]?.id ?? null);
  /** Imágenes por ID de pieza. */
  const [images, setImages] = useState<Record<string, string>>({});
  /** Pieza aprobada por tipo. El logo aprobado se usa en las demás piezas. */
  const [approved, setApproved] = useState<Partial<Record<PieceType, string>>>(() => session?.approved ?? {});
  const [justApproved, setJustApproved] = useState<PieceType | null>(null);
  const [revision, setRevision] = useState('');
  const [busy, setBusy] = useState<null | { kind: 'new' | 'revision'; count: number }>(null);
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [audits, setAudits] = useState<Record<string, AuditState>>(() =>
    Object.fromEntries(Object.entries(session?.audits ?? {}).map(([id, audit]) => [id, { status: 'done', audit } as AuditState])),
  );

  // Imágenes guardadas: se cargan de IndexedDB al abrir.
  useEffect(() => {
    let alive = true;
    const ids = rounds.flatMap(r => r.pieces.map(p => p.id)).filter(id => !images[id]);
    if (!ids.length) return;
    Promise.all(ids.map(async id => [id, await loadPieceImage(project.id, id)] as const)).then(found => {
      if (!alive) return;
      const loaded = Object.fromEntries(found.filter(([, url]) => url)) as Record<string, string>;
      if (Object.keys(loaded).length) setImages(im => ({ ...loaded, ...im }));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Todo lo generado se guarda en el proyecto (las imágenes, aparte).
  const firstSave = useRef(true);
  useEffect(() => {
    if (firstSave.current) {
      firstSave.current = false;
      return;
    }
    const doneAudits = Object.fromEntries(
      Object.entries(audits)
        .filter(([, a]) => a.status === 'done')
        .map(([id, a]) => [id, (a as { audit: PieceAudit }).audit]),
    );
    onSaveSession({ rounds, approved, audits: doneAudits, requests, brandText });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rounds, approved, audits, requests, brandText]);
  const formRef = useRef<HTMLFormElement>(null);
  const requestRef = useRef<HTMLTextAreaElement>(null);

  const withImg = (p: GeneratedPiece): Piece => ({ ...p, imageUrl: images[p.id] ?? '' });
  const allPieces = rounds.flatMap(r => r.pieces).map(withImg);
  const byId = (id?: string) => allPieces.find(p => p.id === id) ?? null;
  const selected = byId(selectedId ?? undefined);
  const lastRound = rounds[rounds.length - 1] ?? null;
  const pieceInfo = pieceInfoOf(pieceType);
  const isPhoto = !!pieceInfo.photo;
  const sendsRefs = mode === 'system' && !isPhoto;
  const approvedLogo = byId(approved.logo);
  const anchor = pieceType !== 'logo' && useLogo ? approvedLogo : null;
  const details = requests[pieceType] ?? '';

  /** Referencias de evidencia (hasta 4) que el modelo recibe como contexto visual. */
  const evidenceRefs = useMemo(() => {
    const ranked = [...patterns].sort((a, b) => b.confidence - a.confidence);
    const ids: string[] = [];
    for (const p of ranked) for (const id of p.evidence) if (!ids.includes(id)) ids.push(id);
    return ids.map(id => project.references.find(r => r.id === id)).filter(Boolean).slice(0, 4) as Reference[];
  }, [patterns, project.references]);

  /** Cambia la pieza del formulario y lleva el foco al pedido. */
  const startPiece = (t: PieceType) => {
    setPieceType(t);
    setJustApproved(null);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => requestRef.current?.focus({ preventScroll: true }), 300);
  };

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
    mode,
  });

  /** Piezas nuevas de una respuesta: sus imágenes se muestran ya y se guardan en IndexedDB. */
  const toPieces = (data: any, roundId: string, parentId?: string): Piece[] => {
    const now = new Date().toISOString();
    const pieces: Piece[] = (data.variants || []).map((v: any, i: number) => ({
      id: `${roundId}_${i}`,
      roundId,
      imageUrl: v.imageUrl,
      createdAt: now,
      responseId: v.responseId,
      direction: v.direction || '',
      rationale: v.rationale || '',
      revisedPrompt: v.revisedPrompt || '',
      model: [v.textModel, v.imageModel].filter(Boolean).join(' + '),
      pieceType: data.pieceType,
      mode: data.renderMode === 'direct' ? 'direct' : 'system',
      parentId,
    }));
    setImages(im => ({ ...im, ...Object.fromEntries(pieces.map(p => [p.id, p.imageUrl])) }));
    pieces.forEach(p => savePieceImage(project.id, p.id, p.imageUrl));
    return pieces;
  };
  /** Sin la imagen (para guardar en el proyecto). */
  const strip = ({ imageUrl, ...p }: Piece): GeneratedPiece => p;

  const generate = async () => {
    setBusy({ kind: 'new', count: variantCount });
    setError(null);
    setJustApproved(null);
    try {
      const refs = sendsRefs
        ? await Promise.all(evidenceRefs.map(async r => ({ id: r.id, image: await compressImageString(r.image, { maxWidth: 1024, maxHeight: 1024, quality: 0.9 }) })))
        : [];
      const anchorImageUrl = anchor?.imageUrl ? await toDataUrl(anchor.imageUrl) : undefined;
      const data = await post({ ...common(), references: refs, variants: variantCount, anchorImageUrl, anchorPieceType: anchor?.pieceType });
      const roundId = `r${Date.now()}`;
      const label = `${pieceInfo.label}${mode === 'direct' ? ' · directo' : ''}`;
      const pieces = toPieces(data, roundId);
      setRounds(rs => [
        ...rs,
        {
          id: roundId,
          label,
          brief: data.brief,
          request: details.trim() || undefined,
          referencesUsed: data.referencesUsed ?? [],
          pieces: pieces.map(strip),
          failed: data.failed ?? 0,
          failureMessage: data.failureMessage,
          createdAt: new Date().toISOString(),
        },
      ]);
      setSelectedId(pieces[0]?.id ?? null);
    } catch (err: any) {
      setError({ message: err?.message || String(err), detail: err?.detail });
    } finally {
      setBusy(null);
    }
  };

  /** Itera una pieza con un pedido de cambio. Devuelve la pieza nueva. */
  const runRevision = async (base: Piece, text: string, label = `Iteración: ${text}`): Promise<Piece | null> => {
    setBusy({ kind: 'revision', count: 1 });
    setError(null);
    setJustApproved(null);
    try {
      const baseImage = base.imageUrl ? await toDataUrl(base.imageUrl) : undefined;
      const data = await post({ ...common(), pieceType: base.pieceType, mode: base.mode, revision: { text, responseId: base.responseId, imageUrl: baseImage } });
      const roundId = `r${Date.now()}`;
      const pieces = toPieces(data, roundId, base.id).map(p => ({ ...p, mode: base.mode }));
      setRounds(rs => [
        ...rs,
        { id: roundId, label: `${pieceInfoOf(base.pieceType).label} · ${label}`, brief: data.brief, request: text, referencesUsed: [], pieces: pieces.map(strip), failed: 0, createdAt: new Date().toISOString() },
      ]);
      setSelectedId(pieces[0]?.id ?? null);
      return pieces[0] ?? null;
    } catch (err: any) {
      setError({ message: err?.message || String(err), detail: err?.detail });
      return null;
    } finally {
      setBusy(null);
    }
  };

  const iterate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !revision.trim()) return;
    const piece = await runRevision(selected, revision.trim());
    if (piece) setRevision('');
  };

  /** Audita una pieza: paleta medida en el navegador + texto y reglas con Gemini. */
  const auditPiece = async (piece: Piece) => {
    setAudits(a => ({ ...a, [piece.id]: { status: 'loading' } }));
    try {
      const [colors, image] = await Promise.all([
        extractColors(piece.imageUrl),
        compressImageString(piece.imageUrl, { maxWidth: 1280, maxHeight: 1280, quality: 0.9, mimeType: 'image/jpeg' }),
      ]);
      const res = await fetch('/api/audit-piece', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: image,
          pieceType: piece.pieceType,
          brandText: brandText.trim(),
          system: { name: system.name, typographyRules: system.typographyRules, textureRules: system.textureRules, compositionRules: system.compositionRules },
        }),
      });
      const text = await res.text();
      let result: any;
      try {
        result = JSON.parse(text);
      } catch {
        throw new Error(
          text.trim().startsWith('<')
            ? 'El servidor está corriendo una versión anterior sin esta función. Cortá "npm run server" (Ctrl+C) y volvé a ejecutarlo.'
            : `El servidor no devolvió una respuesta válida (HTTP ${res.status}).`,
        );
      }
      if (!res.ok || !result.success) throw new Error(result.details || result.error || 'No se pudo verificar la pieza');
      const audit: PieceAudit = { ...result.data, palette: checkPalette(colors, system.colorPalette ?? []) };
      setAudits(a => ({ ...a, [piece.id]: { status: 'done', audit } }));
    } catch (err: any) {
      setAudits(a => ({ ...a, [piece.id]: { status: 'error', message: err?.message || String(err) } }));
    }
  };

  /** Corrige lo que falló en la verificación y verifica la versión nueva. */
  const fixPiece = async (piece: Piece, text: string) => {
    const next = await runRevision(piece, text, 'corrección según la verificación');
    if (next) auditPiece(next);
  };

  const toggleApprove = (p: Piece) => {
    const isApproved = approved[p.pieceType] === p.id;
    setApproved(a => ({ ...a, [p.pieceType]: isApproved ? undefined : p.id }));
    setJustApproved(isApproved ? null : p.pieceType);
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
  const stripTypes = [...STRIP, ...PIECES.map(p => p.id).filter(t => !STRIP.includes(t) && approved[t])];
  const auditOf = (id: string) => (audits[id]?.status === 'done' ? (audits[id] as { audit: PieceAudit }).audit : null);

  return (
    <FullView
      embedded
      title={system.name}
      meta="05 · Aplicación · verificación externa, no forma parte del sistema"
      actions={
        <>
          {systems.length > 1 && (
            <label className="flex items-center gap-2 text-13 text-ink-2">
              <span className="hidden sm:inline">Sistema</span>
              <select className="field-input h-9 w-auto max-w-[220px] text-13" value={system.id} onChange={e => onSelectSystem(e.target.value)} aria-label="Sistema que se aplica">
                {systems.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button size="sm" variant="ghost" icon={<BookOpen />} onClick={onOpenGuidelines}>
            Lineamientos
          </Button>
        </>
      }
    >
      <div className="mx-auto flex max-w-[1320px] flex-col gap-8 px-4 py-6 lg:px-8">
        {/* ---------- Tira de la marca ---------- */}
        <nav aria-label="Piezas de la marca" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
            <h2 className="m-0 text-13 font-medium text-ink">Tu marca aplicada</h2>
            <span className="text-xs text-ink-2">Aprobá una variante por pieza. El logo aprobado se usa en las demás.</span>
          </div>
          <ul className="m-0 flex list-none gap-2 overflow-x-auto p-0 pb-1">
            {stripTypes.map(t => {
              const p = byId(approved[t]);
              const current = t === pieceType;
              return (
                <li key={t} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => (p ? (setSelectedId(p.id), setPieceType(t)) : startPiece(t))}
                    aria-current={current ? 'true' : undefined}
                    className={`flex w-[132px] flex-col gap-1.5 rounded-card border p-1.5 text-left transition-colors duration-120 ${
                      current ? 'border-ink' : 'border-line hover:border-line-strong'
                    }`}
                  >
                    {p ? (
                      <img src={p.imageUrl || undefined} alt="" className="aspect-[4/3] w-full rounded-ctrl bg-bg object-cover" />
                    ) : (
                      <span className="flex aspect-[4/3] w-full items-center justify-center rounded-ctrl border border-dashed border-line-strong text-ink-2">
                        <Plus className="size-4" aria-hidden="true" />
                      </span>
                    )}
                    <span className="flex items-center justify-between gap-1 px-0.5 text-xs">
                      <span className={current ? 'font-medium text-ink' : 'text-ink'}>{pieceInfoOf(t).label}</span>
                      {p ? (
                        <span className="text-confirmed-ink">
                          ✓<span className="sr-only"> aprobada</span>
                        </span>
                      ) : (
                        <span className="text-ink-2">
                          —<span className="sr-only"> sin aprobar</span>
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="grid gap-8 lg:grid-cols-[360px_minmax(0,1fr)]">
          {/* ---------- Pedido ---------- */}
          <form
            ref={formRef}
            className="flex scroll-mt-6 flex-col gap-7"
            onSubmit={e => {
              e.preventDefault();
              generate();
            }}
          >
            <Block n="1" title="Pieza">
              <div role="radiogroup" aria-label="Tipo de pieza" className="grid grid-cols-4 gap-1">
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
              <span className="font-mono text-xs text-ink-2">
                formato {pieceInfo.format} · {isPhoto ? 'fotografía realista' : 'arte gráfico'}
              </span>
              <div role="radiogroup" aria-label="Cómo pedirla" className="grid grid-cols-2 overflow-hidden rounded-ctrl border border-line-mid">
                {(
                  [
                    ['system', 'Con el sistema'],
                    ['direct', 'Directo'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={mode === id}
                    onClick={() => setMode(id)}
                    className={`h-9 text-13 font-medium transition-colors duration-120 ${mode === id ? 'bg-ink text-bg' : 'text-ink-2 hover:bg-white/5 hover:text-ink'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="-mt-2 text-xs text-ink-2">
                {mode === 'system'
                  ? 'El director de arte recibe lo esencial del sistema para esta pieza y prioriza 3 a 5 decisiones.'
                  : 'Solo tu pedido, el texto y la paleta, como en ChatGPT. Sirve para comparar si el sistema mejora la pieza.'}
              </span>
            </Block>

            <Block n="2" title="Pedido">
              <TextInput label="Texto que aparece en la pieza" optional hint="Se escribe tal cual: revisá mayúsculas y tildes." value={brandText} onChange={e => setBrandText(e.target.value)} />
              <TextArea
                ref={requestRef}
                label={`Qué querés ver en ${WITH_ARTICLE[pieceType]}`}
                optional={mode === 'system'}
                hint={mode === 'direct' ? 'En el modo directo es lo principal: describila como se la pedirías a ChatGPT.' : 'El sistema define cómo se ve; esto define qué se muestra.'}
                rows={4}
                placeholder={pieceInfo.placeholder}
                value={details}
                onChange={e => setRequests(r => ({ ...r, [pieceType]: e.target.value }))}
              />
              {pieceType === 'logo' ? (
                <label className="flex cursor-pointer items-center gap-3 text-13 text-ink">
                  <input type="checkbox" className="size-4 accent-[#EDEDEF]" checked={transparent} onChange={e => setTransparent(e.target.checked)} />
                  Fondo transparente (PNG)
                </label>
              ) : approvedLogo ? (
                <label className="flex cursor-pointer items-center gap-3 rounded-ctrl border border-line p-2 text-13 text-ink">
                  <input type="checkbox" className="size-4 shrink-0 accent-[#EDEDEF]" checked={useLogo} onChange={e => setUseLogo(e.target.checked)} />
                  <img src={approvedLogo.imageUrl || undefined} alt="" className="size-10 shrink-0 rounded-tag bg-bg object-contain" />
                  <span className="flex flex-col">
                    Usar el logo aprobado
                    <span className="text-xs text-ink-2">Se reproduce tal cual, sin rediseñarlo.</span>
                  </span>
                </label>
              ) : (
                <p className="m-0 text-xs text-ink-2">
                  Sin logo aprobado: el modelo dibuja la marca desde cero.{' '}
                  <button type="button" className="text-ink underline underline-offset-2" onClick={() => startPiece('logo')}>
                    Empezar por el logo
                  </button>
                </p>
              )}
            </Block>

            <details className="group rounded-card border border-line">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-13 text-ink [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2">
                  <span className="font-mono text-xs text-ink-2">3</span>
                  Opciones
                </span>
                <span className="font-mono text-xs text-ink-2">
                  {variantCount} {variantCount === 1 ? 'variante' : 'variantes'} · {mode === 'direct' ? 'solo el pedido' : `${sendsRefs ? evidenceRefs.length : 0} refs${anchor ? ' · logo' : ''}`}
                </span>
              </summary>
              <div className="flex flex-col gap-4 border-t border-line p-3">
                <div className="flex flex-col gap-2">
                  <span className="text-13 text-ink-2">Variantes</span>
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
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-13 text-ink-2">Qué recibe el modelo</span>
                  <p className="m-0 text-xs text-ink-2">
                    {mode === 'direct'
                      ? 'Tu pedido, el texto y la paleta. Nada más del sistema.'
                      : isPhoto
                        ? 'Lo esencial del sistema para esta pieza (pilares, paleta para los elementos de marca, reglas de tipografía y materiales) escrito como un pedido fotográfico. No se adjuntan las referencias: son piezas gráficas y empujan el resultado hacia la ilustración.'
                        : 'Lo esencial del sistema para esta pieza (pilares, paleta y las reglas que aplican a este soporte) y estas referencias como guía de estilo. El modelo hereda su lenguaje sin copiar su contenido.'}
                  </p>
                  {sendsRefs && evidenceRefs.length > 0 && (
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
                    {RESOURCES.filter(r => r.key === 'palette' || (mode === 'system' && pieceInfo.rules.includes(r.key as RuleFamily))).map(r => (
                      <label key={r.key} className="flex cursor-pointer items-center gap-2 text-13 text-ink">
                        <input type="checkbox" className="size-4 accent-[#EDEDEF]" checked={resources[r.key]} onChange={() => setResources(x => ({ ...x, [r.key]: !x[r.key] }))} />
                        Incluir {r.key === 'palette' ? 'la paleta' : `reglas de ${r.label.toLowerCase()}`}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </details>

            <div className="sticky bottom-0 -mx-4 bg-bg/95 px-4 pb-4 pt-2 backdrop-blur lg:mx-0 lg:px-0">
              <Button
                type="submit"
                variant="primary"
                className="w-full"
                loading={busy?.kind === 'new'}
                loadingText={`Generando ${variantCount} ${variantCount === 1 ? 'variante' : 'variantes'}…`}
                icon={<Sparkles />}
                disabled={!!busy}
              >
                {variantCount === 1 ? `Generar ${pieceInfo.label.toLowerCase()}` : `Generar ${variantCount} variantes de ${pieceInfo.label.toLowerCase()}`}
              </Button>
            </div>
          </form>

          {/* ---------- Resultado ---------- */}
          <section aria-label="Resultado" aria-busy={!!busy} className="flex min-w-0 flex-col gap-5">
            {busy && (
              <LoadingState
                meta={`VERIFICACIÓN · ${busy.kind === 'revision' ? 'ITERACIÓN' : `${busy.count} ${busy.count === 1 ? 'VARIANTE' : 'VARIANTES'}`}`}
                title="El director de arte está trabajando"
                steps={[
                  { label: 'lee el pedido y el sistema', state: 'done' },
                  { label: 'escribe el pedido de imagen', state: 'done' },
                  { label: 'genera la imagen', state: 'current' },
                ]}
                note="Suele tardar entre 30 y 90 segundos. Las variantes se generan en paralelo."
              />
            )}
            {error && !busy && <ErrorState code="VERIFICACIÓN" title="No se pudo generar la pieza" body={error.message} detail={error.detail} onRetry={generate} onDismiss={() => setError(null)} />}
            {!busy && !error && rounds.length === 0 && (
              <EmptyState
                meta="0 piezas"
                title="Empezá por el logo"
                body="Generá variantes, aprobá la que te convenza y seguí con la fachada, el packaging o un afiche: usan el logo aprobado. Las piezas no se guardan en el proyecto; descargá las que te sirvan."
                className="min-h-[360px]"
              />
            )}

            {lastRound && !busy && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="m-0 text-15 font-medium text-ink">{lastRound.label}</h2>
                  <div className="flex items-center gap-3">
                    {lastRound.pieces.length > 1 && lastRound.pieces.some(p => !audits[p.id]) && (
                      <Button size="sm" variant="ghost" icon={<ClipboardCheck />} onClick={() => lastRound.pieces.map(withImg).filter(p => !audits[p.id]).forEach(auditPiece)}>
                        Verificar las {lastRound.pieces.length}
                      </Button>
                    )}
                    {lastRound.referencesUsed.length > 0 && <span className="font-mono text-xs text-ink-2">evidencia {lastRound.referencesUsed.join(', ')}</span>}
                  </div>
                </div>
                {lastRound.failed > 0 && (
                  <p role="status" className="m-0 text-xs text-pending-ink">
                    {lastRound.failed} {lastRound.failed === 1 ? 'variante no se pudo generar' : 'variantes no se pudieron generar'}: {lastRound.failureMessage}
                  </p>
                )}
                <ul className={`m-0 grid list-none gap-3 p-0 ${lastRound.pieces.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {lastRound.pieces.map(withImg).map((p, i) => {
                    const a = auditOf(p.id);
                    const isApproved = approved[p.pieceType] === p.id;
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(p.id)}
                          aria-pressed={p.id === selectedId}
                          aria-label={`Variante ${i + 1}: ${directionLabel(p) || pieceInfoOf(p.pieceType).label}${isApproved ? ', aprobada' : ''}`}
                          className={`flex w-full flex-col gap-2 rounded-card border bg-surface p-2 text-left transition-colors duration-120 ${
                            p.id === selectedId ? 'border-ink' : 'border-line hover:border-line-strong'
                          }`}
                        >
                          <img
                            src={p.imageUrl || undefined}
                            alt=""
                            className={`max-h-[52vh] w-full rounded-ctrl object-contain ${p.pieceType === 'logo' && transparent ? 'bg-[repeating-conic-gradient(#222_0_25%,#2c2c2c_0_50%)] bg-[length:16px_16px]' : 'bg-bg'}`}
                          />
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-xs text-ink-2">
                            <span className="text-ink">{directionLabel(p) || `Variante ${i + 1}`}</span>
                            <span className="font-mono">· {p.mode === 'direct' ? 'directo' : 'sistema'}</span>
                            {a && <span className="font-mono text-ink">· reglas {scoreLabel(a)}</span>}
                            {isApproved && <span className="ml-auto text-confirmed-ink">✓ aprobada</span>}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {selected && !busy && (
              <div className="flex flex-col gap-4 rounded-card border border-line p-4">
                {/* Acciones */}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant={approved[selected.pieceType] === selected.id ? 'secondary' : 'primary'}
                    icon={<Check />}
                    aria-pressed={approved[selected.pieceType] === selected.id}
                    onClick={() => toggleApprove(selected)}
                  >
                    {approved[selected.pieceType] === selected.id
                      ? selected.pieceType === 'logo'
                        ? 'Logo aprobado'
                        : 'Pieza aprobada'
                      : `Aprobar ${selected.pieceType === 'logo' ? 'este logo' : 'esta pieza'}`}
                  </Button>
                  {!audits[selected.id] && (
                    <Button size="sm" variant="secondary" icon={<ClipboardCheck />} onClick={() => auditPiece(selected)} disabled={!!busy}>
                      Verificar
                    </Button>
                  )}
                  <a className="btn btn-ghost btn-sm" href={selected.imageUrl || undefined} download={`${system.name.replace(/\s+/g, '_')}_${selected.pieceType}_${selected.id}.png`}>
                    <Download aria-hidden="true" />
                    Descargar
                  </a>
                </div>

                {/* Paso siguiente */}
                {justApproved && justApproved === selected.pieceType && approved[justApproved] === selected.id && (
                  <div role="status" className="flex flex-col gap-3 rounded-ctrl border border-confirmed/40 bg-confirmed/5 p-3">
                    <span className="text-13 text-ink">
                      {justApproved === 'logo' ? 'Logo aprobado. Las piezas siguientes lo van a usar tal cual.' : `${pieceInfoOf(justApproved).label} aprobada.`} ¿Qué pieza sigue?
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {NEXT.filter(t => t !== justApproved).map(t => (
                        <Button key={t} size="sm" variant="secondary" onClick={() => startPiece(t)}>
                          {pieceInfoOf(t).label}
                          {approved[t] ? ' ✓' : ''}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {audits[selected.id] && (
                  <PieceAuditPanel
                    state={audits[selected.id]}
                    brandText={brandText.trim()}
                    photo={!!pieceInfoOf(selected.pieceType).photo}
                    onAudit={() => auditPiece(selected)}
                    onFix={text => fixPiece(selected, text)}
                    busy={!!busy}
                  />
                )}

                <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={iterate}>
                  <TextInput
                    label="Pedir un cambio"
                    placeholder={selected.pieceType === 'logo' ? 'Ej: la marca más compacta, menos detalle en el sello' : 'Ej: más contraste en el cartel, la marca más grande, menos objetos'}
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
                    Detalles: cómo aplicó el sistema y trazabilidad
                    <span className="font-mono text-xs">{selected.model}</span>
                  </summary>
                  <div className="flex flex-col gap-3 border-t border-line p-3">
                    {selected.rationale && (
                      <>
                        <span className="text-xs text-ink-2">Cómo aplicó el sistema</span>
                        <p className="m-0 font-serif text-15 text-ink">{selected.rationale}</p>
                      </>
                    )}
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

            {allPieces.length > 1 && (
              <div className="flex flex-col gap-2">
                <span className="text-13 text-ink-2">Historial · {allPieces.length} piezas</span>
                <ul className="m-0 flex list-none gap-2 overflow-x-auto p-0">
                  {allPieces.map((p, i) => {
                    const a = auditOf(p.id);
                    const isApproved = approved[p.pieceType] === p.id;
                    return (
                      <li key={p.id} className="shrink-0">
                        <button
                          type="button"
                          onClick={() => setSelectedId(p.id)}
                          aria-pressed={p.id === selectedId}
                          aria-label={`Pieza ${i + 1}: ${pieceInfoOf(p.pieceType).label}${isApproved ? ', aprobada' : ''}`}
                          className={`flex w-[72px] flex-col overflow-hidden rounded-ctrl border ${p.id === selectedId ? 'border-ink' : 'border-line hover:border-line-strong'}`}
                        >
                          <img src={p.imageUrl || undefined} alt="" className="size-[70px] bg-bg object-cover" />
                          <span className="truncate bg-raised px-1 text-center text-xs text-ink-2">
                            {isApproved ? '✓ ' : ''}
                            {a ? scoreLabel(a) : pieceInfoOf(p.pieceType).label}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>
        </div>
      </div>
    </FullView>
  );
}
