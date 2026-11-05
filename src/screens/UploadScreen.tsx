import { useEffect, useRef, useState } from 'react';
import { Project } from '../types';
import { useShortcuts } from '../hooks/useAuditShortcuts';
import { corpusRefs } from '../utils/layers';
import { Crop } from '../space/Crop';
import { MIN_REFS, livePieces } from '../pieces/model';
import { BigButton, BriefPanel, KeyButton } from './common';

export type AnalysisState =
  | { status: 'idle' }
  | { status: 'preparing'; done: number; total: number }
  | { status: 'reading'; total: number; since: number }
  | { status: 'error'; message: string; detail?: string };

interface UploadScreenProps {
  project: Project;
  enabled: boolean;
  onSubmitIntent: (intent: string) => void;
  briefBusy: boolean;
  briefError: string | null;
  onSaveBrief: (text: string) => void;
  briefRequest: number;
  onAddFiles: (files: File[]) => void;
  onOpenUpload: () => void;
  onDeleteRef: (id: string) => void;
  analysis: AnalysisState;
  onAnalyze: () => void;
  onCancelAnalysis: () => void;
  onGoOrder: () => void;
}

/**
 * 01 · SUBIR. Una frase de intención y las referencias, en una grilla plana y legible.
 * El botón principal es ANALIZAR: el agente arma las piezas y las ubica en las hojas.
 */
export function UploadScreen(props: UploadScreenProps) {
  const { project, analysis } = props;
  const refs = corpusRefs(project);
  const [intent, setIntent] = useState(project.intent ?? '');
  const [editing, setEditing] = useState(!project.intent);
  const [briefOpen, setBriefOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => setIntent(project.intent ?? ''), [project.intent]);
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);
  const firstBrief = useRef(props.briefRequest);
  useEffect(() => {
    if (props.briefRequest !== firstBrief.current) setBriefOpen(true);
  }, [props.briefRequest]);

  const hasIntent = !!project.intent?.trim();
  const busy = analysis.status === 'preparing' || analysis.status === 'reading';
  const missing = Math.max(0, MIN_REFS - refs.length);
  const canAnalyze = hasIntent && missing === 0 && !busy;
  const analyzed = livePieces(project).length > 0;
  const newRefs = refs.filter(r => r.isNew).length;

  const submitIntent = () => {
    const v = intent.trim();
    if (!v) return;
    setEditing(false);
    if (v !== project.intent) props.onSubmitIntent(v);
  };

  useShortcuts(props.enabled && !briefOpen && !editing, {
    enter: () => (canAnalyze ? props.onAnalyze() : false),
    escape: () => (busy ? props.onCancelAnalysis() : false),
  });

  // ⌘V: pegar imágenes.
  useEffect(() => {
    if (!props.enabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter(f => f.type.startsWith('image/'));
      if (!files.length) return;
      e.preventDefault();
      props.onAddFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [props.enabled, props.onAddFiles]);

  let status = '';
  if (analysis.status === 'preparing') status = `Preparando ${analysis.done} de ${analysis.total} referencias…`;
  if (analysis.status === 'reading') status = `El agente está leyendo las ${analysis.total} referencias… (suele tardar 1 o 2 minutos)`;

  return (
    <div
      className="relative flex h-full flex-col"
      onDragOver={e => {
        if (!Array.from(e.dataTransfer.types).includes('Files')) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={e => !e.currentTarget.contains(e.relatedTarget as Node) && setDragOver(false)}
      onDrop={e => {
        setDragOver(false);
        const files = Array.from(e.dataTransfer.files || []).filter(f => f.type.startsWith('image/'));
        if (!files.length) return;
        e.preventDefault();
        props.onAddFiles(files);
      }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-10 pb-6 pt-8">
        {/* Paso 1: la frase */}
        {editing || !hasIntent ? (
          <form
            className="flex max-w-[760px] flex-col gap-4"
            onSubmit={e => {
              e.preventDefault();
              submitIntent();
            }}
          >
            <span className="layer-tag layer-3 self-start">QUÉ QUERÉS QUE SEA</span>
            <div className="flex items-end gap-2 border-b-4 border-bone pb-2">
              <input
                ref={inputRef}
                aria-label="Frase de intención"
                placeholder="HAMBURGUESERÍA CRUDA, DE BARRIO"
                value={intent}
                onChange={e => setIntent(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape' && hasIntent) {
                    setIntent(project.intent ?? '');
                    setEditing(false);
                  }
                }}
                className="type-name w-full bg-transparent text-[52px] text-ink outline-none placeholder:text-ink-3"
              />
              <span aria-hidden="true" className="h-[48px] w-[14px] shrink-0 bg-core" />
            </div>
            <span className="text-[15px] text-ink-2">Una frase alcanza. El agente redacta el brief y lo podés editar después.</span>
            <div className="flex items-center gap-3">
              <button type="submit" disabled={!intent.trim()} className="type-label h-[44px] bg-core px-5 text-[15px] text-void hover:bg-bone disabled:bg-raised disabled:text-ink-3">
                CONTINUAR <kbd className="font-mono text-[12px] opacity-70">[⏎]</kbd>
              </button>
              {hasIntent && <KeyButton k="ESC" label="Cancelar" tone="ghost" onClick={() => setEditing(false)} />}
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-2">
            <button type="button" onClick={() => setEditing(true)} title="Cambiar la frase" className="type-name self-start text-left text-[46px] text-ink hover:text-core">
              {project.intent}
            </button>
            <div className="flex items-center gap-4">
              <button type="button" onClick={() => setBriefOpen(true)} className="type-label text-[12px] text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink">
                {props.briefBusy ? 'EL AGENTE REDACTA EL BRIEF…' : 'VER BRIEF'}
              </button>
              {props.briefError && <span className="text-[13px] text-error-ink">{props.briefError}</span>}
            </div>
          </div>
        )}

        {/* Paso 2: las referencias */}
        {(hasIntent || refs.length > 0) && (
          <section aria-label="Referencias" className="mt-10 flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="type-name text-[26px]">REFERENCIAS · {refs.length}</span>
              <KeyButton label="+ Imágenes" tone="bone" onClick={() => fileRef.current?.click()} />
              <KeyButton label="Por URL" onClick={props.onOpenUpload} />
              <span className="font-mono text-[12px] text-ink-2">o arrastralas acá · ⌘V pega</span>
            </div>
            {refs.length === 0 ? (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex h-[220px] flex-col items-center justify-center gap-2 border-2 border-dashed border-bone/50 hover:border-bone"
              >
                <span className="type-name text-[30px]">SOLTÁ IMÁGENES ACÁ</span>
                <span className="text-[14px] text-ink-2">Fotos, afiches, packaging, logos: todo lo que te sirve de referencia. Al menos {MIN_REFS}.</span>
              </button>
            ) : (
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
                {refs.map(r => (
                  <figure key={r.id} className="group relative m-0">
                    <Crop image={r.image} fit="cover" alt={r.name} className="aspect-square w-full" />
                    {r.isNew && analyzed && <span className="layer-tag layer-3 absolute left-1 top-1 text-[10px]">NUEVA</span>}
                    <button
                      type="button"
                      aria-label={`Quitar ${r.name}`}
                      onClick={() => props.onDeleteRef(r.id)}
                      className="type-label absolute right-1 top-1 bg-void/85 px-2 py-[2px] text-[12px] text-ink opacity-0 focus:opacity-100 group-hover:opacity-100"
                    >
                      QUITAR
                    </button>
                  </figure>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Botón principal */}
      <div className="flex shrink-0 items-end justify-between gap-6 border-t border-line px-10 py-4">
        <div className="min-w-0 flex-1" aria-live="polite">
          {busy && (
            <div className="flex items-center gap-3">
              <span className="spinner text-core" />
              <span className="text-[15px]">{status}</span>
              <KeyButton k="ESC" label="Cancelar" tone="ghost" onClick={props.onCancelAnalysis} />
            </div>
          )}
          {analysis.status === 'error' && (
            <div role="alert" className="flex flex-col gap-1">
              <span className="text-[15px]">{analysis.message}</span>
              {analysis.detail && (
                <details className="text-[12px] text-ink-2">
                  <summary className="cursor-pointer">Detalle técnico</summary>
                  <pre className="m-0 mt-1 max-h-32 overflow-auto whitespace-pre-wrap font-mono">{analysis.detail}</pre>
                </details>
              )}
            </div>
          )}
        </div>
        <div className="flex items-end gap-3">
          {analyzed && !busy && <KeyButton label="Ir a ordenar →" onClick={props.onGoOrder} />}
          <BigButton
            k="⏎"
            label={analysis.status === 'error' ? 'REINTENTAR' : analyzed ? (newRefs ? `ANALIZAR ${newRefs} NUEVAS` : 'VOLVER A ANALIZAR') : 'ANALIZAR'}
            onClick={props.onAnalyze}
            disabled={!canAnalyze}
            hint={!hasIntent ? 'Primero escribí la frase' : missing ? `Subí al menos ${MIN_REFS} referencias (faltan ${missing})` : undefined}
          />
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={e => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) props.onAddFiles(files);
          e.target.value = '';
        }}
      />
      {briefOpen && <BriefPanel brief={project.brief ?? ''} onSave={props.onSaveBrief} onClose={() => setBriefOpen(false)} />}
      {dragOver && (
        <div className="pointer-events-none absolute inset-4 z-30 flex items-center justify-center border-2 border-dashed border-bone bg-void/70">
          <span className="type-name text-[34px]">SOLTÁ · SE SUMAN A TUS REFERENCIAS</span>
        </div>
      )}
    </div>
  );
}
