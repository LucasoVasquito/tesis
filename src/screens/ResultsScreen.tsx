import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from '../components/shell/Modal';
import { ImportedResult, Project, Verdict } from '../types';
import { isLayer } from '../utils/layers';
import { SHEET_NAME, livePieces } from '../pieces/model';
import { loadPieceImage, savePieceImage } from '../utils/pieceStore';
import { VERDICT_LABEL } from '../utils/results';
import { Notify } from './types';

interface Props {
  project: Project;
  onChange: (fn: (results: ImportedResult[]) => ImportedResult[]) => void;
  notify: Notify;
  /** Resultado que se abre al entrar (por ejemplo, el que se acaba de crear desde Probar). */
  focusId?: string;
}

const AIS = ['ChatGPT', 'Claude', 'Gemini', 'Diseñador', 'Otro'];
const NAMED = ['Diseñador', 'Otro'];
const VERDICTS: Verdict[] = ['worked', 'failed', 'ignored'];

function useImages(projectId: string, ids: string[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = ids.join('|');
  useEffect(() => {
    let alive = true;
    Promise.all(ids.map(async id => [id, await loadPieceImage(projectId, id)] as const)).then(found => {
      if (alive) setUrls(Object.fromEntries(found.filter((f): f is readonly [string, string] => !!f[1])));
    });
    return () => {
      alive = false;
    };
  }, [projectId, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return urls;
}

function nextVerdicts(cur: Record<string, Verdict>, pid: string, v: Verdict) {
  const next = { ...cur };
  if (next[pid] === v) delete next[pid];
  else next[pid] = v;
  return next;
}

/** Bitácora de resultados hechos por otras IA con el sistema exportado, y su evaluación pieza por pieza. */
export function ResultsScreen({ project, onChange, notify, focusId }: Props) {
  const results = project.results ?? [];
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(focusId ?? null);
  useEffect(() => {
    if (focusId) setOpen(focusId);
  }, [focusId]);
  const openResult = results.find(r => r.id === open) ?? null;
  const pieces = livePieces(project).filter(x => isLayer(x.layer) && (x.confirmed || x.origin === 'user'));

  return (
    <div className="h-full overflow-y-auto px-6 pb-16 pt-8 lg:px-12">
      <div className="mx-auto flex max-w-[1100px] flex-col gap-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 data-headline className="type-stage m-0" style={{ fontSize: 'clamp(36px, 4.5vw, 64px)', lineHeight: 0.95 }}>
              Resultados
            </h1>
            <p className="m-0 max-w-[60ch] text-[1rem] text-ink-2">Lo que otras IA u otros diseñadores hicieron con tu sistema. Cargalos como bitácora y marcá qué piezas funcionaron.</p>
          </div>
          {!adding && (
            <button type="button" data-guide="import-result" onClick={() => setAdding(true)} className="inline-flex h-10 items-center rounded-full bg-ink/10 px-5 text-[0.9375rem] font-semibold text-ink hover:bg-ink/20">
              + Importar resultado
            </button>
          )}
        </header>

        {adding && (
          <ImportForm
            project={project}
            onCancel={() => setAdding(false)}
            onSave={r => {
              onChange(list => [r, ...list]);
              setAdding(false);
              setOpen(r.id);
              notify(`Guardaste el resultado de ${r.ai}.`);
            }}
          />
        )}

        {!results.length && !adding && <p className="m-0 py-10 text-[1.0625rem] text-ink-2">Todavía no cargaste ningún resultado.</p>}

        <ul className="m-0 grid list-none gap-x-6 gap-y-8 p-0" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
          {results.map(r => (
            <ResultTile key={r.id} project={project} result={r} total={pieces.length} onOpen={() => setOpen(r.id)} />
          ))}
        </ul>
        {openResult &&
          createPortal(
            <ResultModal
              project={project}
              result={openResult}
              pieces={pieces}
              onClose={() => setOpen(null)}
              onVerdict={(pid, v) => onChange(list => list.map(x => (x.id === openResult.id ? { ...x, verdicts: nextVerdicts(x.verdicts, pid, v) } : x)))}
              onCaption={caption => onChange(list => list.map(x => (x.id === openResult.id ? { ...x, caption } : x)))}
              onDelete={() => {
                if (window.confirm(`¿Borrar el resultado de ${openResult.ai}?`)) {
                  onChange(list => list.filter(x => x.id !== openResult.id));
                  setOpen(null);
                }
              }}
            />,
            document.body,
          )}
      </div>
    </div>
  );
}

/** Tarjeta de la grilla: la imagen, quién la hizo y cuánto se evaluó. El detalle va en un modal. */
function ResultTile({ project, result: r, total, onOpen }: { project: Project; result: ImportedResult; total: number; onOpen: () => void }) {
  const urls = useImages(project.id, r.imageIds.slice(0, 1));
  const first = urls[r.imageIds[0]];
  const live = new Set(livePieces(project).map(x => x.id));
  const rated = Object.keys(r.verdicts).filter(id => live.has(id)).length;
  return (
    <li className="min-w-0">
      <button type="button" onClick={onOpen} aria-haspopup="dialog" className="group flex w-full flex-col gap-3 text-left">
        <span className="relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-[4px] bg-raised transition-transform duration-150 group-hover:scale-[1.01]">
          {first ? <img src={first} alt={`Resultado de ${r.ai}`} className="size-full object-cover" /> : <span className="text-[0.875rem] text-ink-2">{r.imageIds.length ? 'Cargando…' : 'Solo texto'}</span>}
          {r.imageIds.length > 1 && <span className="type-data absolute right-2 top-2 rounded-[3px] bg-void/80 px-2 py-[2px] text-[0.8125rem] text-bone">{r.imageIds.length} imágenes</span>}
        </span>
        <span className="flex flex-col gap-1">
          <span className="text-[1.125rem] font-semibold leading-snug underline-offset-4 group-hover:underline">{r.ai}</span>
          <span className="type-data text-[0.875rem] text-ink-2">
            {new Date(r.createdAt).toLocaleDateString('es')} · {rated ? `${rated} de ${total} evaluadas` : 'sin evaluar'}
          </span>
          {r.caption?.trim() && <span className="line-clamp-2 text-[0.9375rem] text-ink-2">{r.caption.trim()}</span>}
        </span>
      </button>
    </li>
  );
}

/** El resultado completo: la imagen ampliada a un lado; el comentario, tu epígrafe y la evaluación al otro. */
function ResultModal({ project, result: r, pieces, onClose, onVerdict, onCaption, onDelete }: { project: Project; result: ImportedResult; pieces: ReturnType<typeof livePieces>; onClose: () => void; onVerdict: (pid: string, v: Verdict) => void; onCaption: (c: string) => void; onDelete: () => void }) {
  const urls = useImages(project.id, r.imageIds);
  const rated = pieces.filter(x => r.verdicts[x.id]).length;
  // El epígrafe se guarda 600 ms después de dejar de escribir (y al cerrar), no en cada tecla.
  const [caption, setCaption] = useState(r.caption ?? '');
  const latest = useRef({ caption, saved: r.caption ?? '' });
  latest.current.caption = caption;
  latest.current.saved = r.caption ?? '';
  useEffect(() => {
    const t = setTimeout(() => caption !== (r.caption ?? '') && onCaption(caption), 600);
    return () => clearTimeout(t);
  }, [caption]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () => () => {
      if (latest.current.caption !== latest.current.saved) onCaption(latest.current.caption);
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  return (
    <Modal open title={r.ai} meta={`${new Date(r.createdAt).toLocaleDateString('es')} · ${rated ? `${rated} de ${pieces.length} piezas evaluadas` : 'sin evaluar'}`} width={1180} onClose={onClose}>
      <div className="grid gap-0 lg:h-[calc(88vh-72px)] lg:grid-cols-[minmax(0,1fr)_minmax(380px,500px)]">
        <div className="flex min-h-0 flex-col items-center gap-4 overflow-y-auto bg-bg p-4 lg:justify-start lg:p-6">
          {r.imageIds.length === 0 && <p className="m-0 text-[1rem] text-ink-2">Este resultado no tiene imágenes.</p>}
          {r.imageIds.map(id =>
            urls[id] ? (
              <a key={id} href={urls[id]} target="_blank" rel="noreferrer" title="Abrir la imagen en su tamaño original" className="block">
                <img src={urls[id]} alt={`Resultado de ${r.ai}`} className="mx-auto max-h-[calc(88vh-72px-3rem)] w-auto max-w-full rounded-[4px] object-contain" />
              </a>
            ) : (
              <span key={id} className="block aspect-[4/5] w-full rounded-[4px] bg-raised" />
            ),
          )}
        </div>

        <div className="flex min-h-0 flex-col gap-6 overflow-y-auto p-5 lg:p-6">
          {r.comment?.trim() && (
            <section className="flex flex-col gap-2">
              <h3 className="type-label m-0 text-[0.75rem] text-ink-2">Lo que comentó</h3>
              <p className="m-0 max-w-[62ch] whitespace-pre-wrap text-[1rem] leading-[1.65]">{r.comment.trim()}</p>
            </section>
          )}

          <label className="flex flex-col gap-2">
            <span className="type-label text-[0.75rem] text-ink-2">Tu epígrafe · lo que el sistema debe tener en cuenta</span>
            <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={3} className="field-input" style={{ resize: 'vertical' }} placeholder="Ej.: el logo quedó bien pero ignoró la tipografía en cadena" />
          </label>

          <section className="flex flex-col gap-1">
            <h3 className="type-label m-0 text-[0.75rem] text-ink-2">Qué pasó con cada pieza del sistema</h3>
            <ul className="m-0 flex list-none flex-col p-0">
              {pieces.map(x => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line py-3">
                  <span className="text-[1rem] font-medium leading-snug">
                    {x.name} <span className="type-data text-[0.8125rem] font-normal text-ink-2">· {SHEET_NAME[x.layer as 1 | 2 | 3]}</span>
                  </span>
                  <span className="flex shrink-0 gap-1" role="group" aria-label={`Evaluación de ${x.name}`}>
                    {VERDICTS.map(v => (
                      <button key={v} type="button" aria-pressed={r.verdicts[x.id] === v} onClick={() => onVerdict(x.id, v)} className={`h-8 rounded-[4px] px-3 text-[0.8125rem] font-medium ${r.verdicts[x.id] === v ? 'bg-bone text-void' : 'bg-ink/10 text-ink-2 hover:text-ink'}`}>
                        {VERDICT_LABEL[v]}
                      </button>
                    ))}
                  </span>
                </li>
              ))}
              {!pieces.length && <li className="py-3 text-[0.9375rem] text-ink-2">No hay piezas aceptadas para evaluar.</li>}
            </ul>
          </section>

          <button type="button" onClick={onDelete} className="self-start text-[0.875rem] text-ink-2 underline underline-offset-4 hover:text-ink">
            Borrar este resultado
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ImportForm({ project, onSave, onCancel }: { project: Project; onSave: (r: ImportedResult) => void; onCancel: () => void }) {
  const [ai, setAi] = useState('ChatGPT');
  const [other, setOther] = useState('');
  const [comment, setComment] = useState('');
  const [caption, setCaption] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const previews = React.useMemo(() => files.map(f => URL.createObjectURL(f)), [files]);
  // Las vistas previas se liberan al cambiar la lista o al cerrar el formulario.
  useEffect(() => () => previews.forEach(u => URL.revokeObjectURL(u)), [previews]);
  const name = NAMED.includes(ai) ? (other.trim() ? (ai === 'Diseñador' ? `Diseñador · ${other.trim()}` : other.trim()) : ai) : ai;
  const canSave = files.length > 0 || !!comment.trim() || !!caption.trim();
  const addFiles = (list: FileList | File[] | null) => list && setFiles(f => [...f, ...Array.from(list).filter(x => x.type.startsWith('image/'))]);

  // Pegar una captura desde el portapapeles.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => addFiles(Array.from(e.clipboardData?.files ?? []));
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  const save = async () => {
    setSaving(true);
    const id = `res_${Date.now().toString(36)}`;
    const imageIds = files.map((_, i) => `${id}_${i}`);
    await Promise.all(
      files.map(async (f, i) => {
        const u = URL.createObjectURL(f);
        try {
          await savePieceImage(project.id, imageIds[i], u);
        } finally {
          URL.revokeObjectURL(u);
        }
      }),
    );
    onSave({ id, ai: name, createdAt: new Date().toISOString(), comment: comment.trim() || undefined, caption: caption.trim() || undefined, imageIds, verdicts: {} });
  };

  return (
    <section className="flex flex-col gap-5 rounded-[4px] border border-line p-5" aria-label="Importar resultado">
      <div className="flex flex-wrap items-center gap-2">
        <span className="type-label text-[0.75rem] text-ink-2">Quién lo hizo</span>
        {AIS.map(a => (
          <button key={a} type="button" aria-pressed={ai === a} onClick={() => setAi(a)} className={`h-8 rounded-full px-4 text-[0.875rem] font-medium ${ai === a ? 'bg-bone text-void' : 'bg-ink/10 text-ink-2 hover:text-ink'}`}>
            {a}
          </button>
        ))}
        {NAMED.includes(ai) && <input value={other} onChange={e => setOther(e.target.value)} placeholder={ai === 'Diseñador' ? 'Nombre (opcional)' : 'Nombre'} className="h-8 rounded-[4px] border border-line bg-transparent px-2 text-[0.875rem]" />}
      </div>

      <div className="flex flex-col gap-2">
        <span className="type-label text-[0.75rem] text-ink-2">Imágenes · subilas, arrastralas o pegá una captura (Ctrl+V)</span>
        <div
          className="flex flex-wrap gap-3"
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }}
        >
          {previews.map((u, i) => (
            <span key={u} className="relative">
              <img src={u} alt="" className="h-[120px] w-auto rounded-[4px] bg-raised" />
              <button type="button" aria-label="Quitar imagen" onClick={() => setFiles(f => f.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded-full bg-void/80 px-2 text-[0.875rem] text-bone">
                ×
              </button>
            </span>
          ))}
          <button type="button" onClick={() => input.current?.click()} className="flex h-[120px] min-w-[120px] items-center justify-center rounded-[4px] border border-dashed border-line px-4 text-[0.875rem] text-ink-2 hover:text-ink">
            + Agregar
          </button>
          <input
            ref={input}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={e => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      <label className="flex flex-col gap-1">
        <span className="type-label text-[0.75rem] text-ink-2">Comentario de quien lo hizo · pegalo tal cual</span>
        <textarea value={comment} onChange={e => setComment(e.target.value)} rows={4} className="w-full resize-y rounded-[4px] border border-line bg-transparent p-2 text-[0.9375rem]" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="type-label text-[0.75rem] text-ink-2">Tu epígrafe · lo que el sistema debe tener en cuenta</span>
        <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={2} className="w-full resize-y rounded-[4px] border border-line bg-transparent p-2 text-[0.9375rem]" />
      </label>

      <div className="flex gap-3">
        <button type="button" disabled={!canSave || saving} onClick={save} className="inline-flex h-10 items-center rounded-full bg-bone px-5 text-[0.9375rem] font-semibold text-void disabled:opacity-50">
          {saving ? 'Guardando…' : 'Guardar resultado'}
        </button>
        <button type="button" onClick={onCancel} className="text-[0.9375rem] text-ink-2 underline underline-offset-4 hover:text-ink">
          Cancelar
        </button>
      </div>
    </section>
  );
}
