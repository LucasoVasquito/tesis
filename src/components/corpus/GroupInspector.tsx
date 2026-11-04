import React, { useEffect, useRef, useState } from 'react';
import { Check, Sparkles, Ungroup, X } from 'lucide-react';
import { RefGroup, Reference } from '../../types';
import { Button, CategoryTag, ErrorState, IconButton, LoadingState, TextArea, TextInput } from '../ui';
import { groupColor, groupInk } from '../../utils/groups';
import { partKindInfo } from '../../utils/parts';

interface GroupInspectorProps {
  group: RefGroup;
  members: Reference[];
  read?: { status: 'loading' } | { status: 'error'; message: string };
  onUpdate: (updates: Partial<RefGroup>) => void;
  onRead: () => void;
  onRemoveMember: (refId: string) => void;
  onSelectReference: (refId: string) => void;
  onUngroup: () => void;
  /** Convertir el grupo en patrón propio, sin pasar por la IA. */
  onToPattern: () => void;
}

/** Panel de un grupo armado por el diseñador: nombre, motivo, miembros y la hipótesis de la IA. */
export function GroupInspector({ group: g, members, read, onUpdate, onRead, onRemoveMember, onSelectReference, onUngroup, onToPattern }: GroupInspectorProps) {
  const [name, setName] = useState(g.name);
  const [note, setNote] = useState(g.note ?? '');
  const [confirmUngroup, setConfirmUngroup] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const isDefaultName = /^Grupo \d+$/.test(g.name);

  useEffect(() => {
    setName(g.name);
    setNote(g.note ?? '');
    setConfirmUngroup(false);
  }, [g.id, g.name, g.note]);

  // Grupo recién creado: el foco va al nombre para bautizarlo.
  useEffect(() => {
    if (isDefaultName) {
      nameRef.current?.focus();
      nameRef.current?.select();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.id]);

  const commitName = () => {
    const v = name.trim();
    if (!v) setName(g.name);
    else if (v !== g.name) onUpdate({ name: v });
  };

  const h = g.hypothesis;

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-5 p-5">
        <TextInput
          ref={nameRef}
          label="Nombre del grupo"
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={e => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              e.preventDefault();
              setName(g.name);
            }
          }}
          hint={isDefaultName ? 'Nombralo por lo que ves en común: “Mascotas retro”, “Lettering inflado”.' : undefined}
        />
        <TextArea
          label="Por qué las agrupaste"
          optional
          rows={3}
          className="font-serif text-15"
          value={note}
          onChange={e => setNote(e.target.value)}
          onBlur={() => note.trim() !== (g.note ?? '') && onUpdate({ note: note.trim() })}
          hint="La IA lo lee en la próxima inducción."
        />
      </div>

      {/* Miembros */}
      <section aria-labelledby={`gm-${g.id}`} className="flex flex-col gap-3 border-t border-line p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 id={`gm-${g.id}`} className="m-0 text-13 font-medium text-ink">
            Referencias
          </h3>
          <span className="font-mono text-xs" style={{ color: groupInk(g) }}>
            {members.length}
          </span>
        </div>
        <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0">
          {members.map(r => (
            <li key={r.id} className="group/m relative">
              <button
                type="button"
                onClick={() => onSelectReference(r.id)}
                className="flex w-full flex-col gap-1 rounded-ctrl border border-line bg-surface p-1 text-left transition-[border-color] duration-120 hover:border-line-strong"
                aria-label={`${r.name} (${r.id})`}
              >
                <img src={r.image} alt="" className={`aspect-square w-full rounded-[4px] bg-raised ${r.parentId ? 'object-contain' : 'object-cover'}`} referrerPolicy="no-referrer" />
                <span className="truncate px-0.5 font-mono text-xs text-ink-2">
                  {r.id}
                  {r.parentId && <span style={{ color: partKindInfo(r.partKind).family.ink }}> · {partKindInfo(r.partKind).label}</span>}
                </span>
              </button>
              <IconButton
                label={`Sacar ${r.id} del grupo`}
                size="sm"
                onClick={() => onRemoveMember(r.id)}
                className="absolute right-1.5 top-1.5 bg-raised/90 opacity-0 transition-opacity duration-120 focus-visible:opacity-100 group-hover/m:opacity-100"
              >
                <X className="size-3.5" />
              </IconButton>
            </li>
          ))}
        </ul>
        <p className="m-0 text-xs text-ink-2">Arrastrá fichas al marco para sumarlas, o afuera para sacarlas.</p>
      </section>

      {/* Hipótesis de la IA */}
      <section aria-labelledby={`gh-${g.id}`} className="flex flex-col gap-4 border-t border-line p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 id={`gh-${g.id}`} className="m-0 text-13 font-medium text-ink">
            ¿Qué comparten?
          </h3>
          {h && read?.status !== 'loading' && <span className="font-mono text-xs text-ink-2">{new Date(h.at).toLocaleDateString('es-AR')}</span>}
        </div>

        {read?.status === 'loading' ? (
          <LoadingState
            meta="GRUPO · GEMINI"
            title={`Comparando ${members.length} referencias`}
            steps={[
              { label: 'rasgos comunes', state: 'current' },
              { label: 'diferencias', state: 'todo' },
            ]}
            note="Gemini mira solo las imágenes de este grupo."
            className="min-h-0"
          />
        ) : read?.status === 'error' ? (
          <ErrorState code="GRUPO" title="No se pudo leer el grupo" body="El grupo no se modificó." detail={read.message} onRetry={onRead} className="min-h-0" />
        ) : h ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 rounded-card border p-4" style={{ borderColor: groupColor(g, 0.35), background: groupColor(g, 0.05) }}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs" style={{ color: groupInk(g) }}>
                  HIPÓTESIS · IA
                </span>
                <CategoryTag category={h.category} />
              </div>
              <p className="m-0 font-serif text-base leading-normal text-ink">{h.summary}</p>
            </div>
            {h.sharedTraits.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-xs text-ink-2">Comparten</span>
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {h.sharedTraits.map((t, i) => (
                    <li key={i} className="flex gap-2 text-13 text-ink">
                      <span aria-hidden="true" className="text-confirmed-ink">
                        =
                      </span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {h.differences.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-xs text-ink-2">Difieren</span>
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {h.differences.map((t, i) => (
                    <li key={i} className="flex gap-2 text-13 text-ink">
                      <span aria-hidden="true" className="text-discarded-ink">
                        ≠
                      </span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="m-0 text-xs text-ink-2">Es una hipótesis, no un patrón: la próxima inducción la sostiene, la matiza o la discute con evidencia.</p>
            <Button size="sm" variant="ghost" icon={<Sparkles />} onClick={onRead} className="self-start">
              Volver a preguntar
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <p className="m-0 text-13 text-ink-2">Gemini compara solo estas imágenes y propone qué rasgos formales comparten y dónde difieren.</p>
            <Button size="sm" variant="secondary" icon={<Sparkles />} onClick={onRead} disabled={members.length < 2} title={members.length < 2 ? 'Hacen falta al menos 2 referencias' : undefined}>
              {members.length < 2 ? 'Sumá otra referencia para comparar' : '¿Qué comparten?'}
            </Button>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2 border-t border-line p-5">
        <Button size="sm" variant="confirm" icon={<Check />} onClick={onToPattern} disabled={members.length < 1} className="self-start">
          Convertir en patrón
        </Button>
        <p className="m-0 text-xs text-ink-2">Entra confirmado, con estas referencias. Además, la próxima inducción lee el grupo y puede sumar lo que encuentre.</p>
      </section>

      <section className="flex flex-col gap-3 border-t border-line p-5">
        {!confirmUngroup ? (
          <Button size="sm" variant="ghost" icon={<Ungroup />} onClick={() => setConfirmUngroup(true)} className="self-start">
            Desarmar grupo
          </Button>
        ) : (
          <div role="alert" className="flex flex-col gap-3 rounded-card border border-discarded/35 bg-discarded/5 p-4">
            <span className="text-13 text-ink">
              ¿Desarmar «{g.name}»? Las referencias quedan en el lienzo; se pierden el nombre{h ? ' y la hipótesis' : ''}.
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="discard" onClick={onUngroup} autoFocus>
                Desarmar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmUngroup(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
