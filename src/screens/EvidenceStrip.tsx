import React, { createContext, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CropBox, Pattern, Project, Reference } from '../types';
import { Crop } from '../space/Crop';
import { LightboxModal } from '../components/LightboxModal';
import { compressImageString } from '../utils/imageCompressor';

/** Guarda dónde se ve una pieza en cada referencia (lo provee App, con updateProject). */
export const EvidenceCropsContext = createContext<((pieceId: string, crops: Record<string, CropBox | null>) => void) | null>(null);

/** Cuántas referencias se mandan por pedido (cada una viaja como imagen). */
const BATCH = 10;
/** Pedidos en curso o hechos en esta sesión, por pieza y referencias: no se repiten aunque el componente se monte de nuevo. */
const asked = new Set<string>();

/** El recorte de una referencia: lo que marcó la IA; si no, el de la portada o el de un fragmento de la pieza. */
export function cropFor(piece: Pattern, project: Project, refId: string): CropBox | undefined {
  const located = piece.evidenceCrops?.[refId];
  if (located) return located;
  if (located === null) return undefined;
  if (piece.cover?.refId === refId && piece.cover.crop) return piece.cover.crop;
  const frag = (project.fragments ?? []).find(f => f.refId === refId && ((piece.fragmentIds ?? []).includes(f.id) || f.groupId === piece.id));
  return frag?.crop;
}

/** ¿Falta saber dónde se ve la pieza en esta referencia? */
const pending = (piece: Pattern, project: Project, refId: string) => piece.evidenceCrops?.[refId] === undefined && !cropFor(piece, project, refId);

/**
 * Evidencia de una pieza como fila de recortes: lo que interesa de cada referencia, no la referencia entera.
 * Al tocar uno se abre la referencia completa con la zona marcada; ← → recorren la fila.
 * Si falta ubicar la pieza en alguna referencia, se le pide a la IA una vez (en tandas de 10).
 */
export function EvidenceStrip({ piece, project, className = '' }: { piece: Pattern; project: Project; className?: string }) {
  const save = useContext(EvidenceCropsContext);
  const refs = piece.evidence.map(id => project.references.find(r => r.id === id)).filter((r): r is Reference => !!r && !!r.image);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const missing = refs.filter(r => pending(piece, project, r.id));
  // La clave es la evidencia entera (no lo que falta): al guardar una tanda no cambia, y la tanda siguiente no se pide dos veces.
  const key = `${project.id}:${piece.id}:${refs.map(r => r.id).join(',')}`;
  useEffect(() => {
    if (!save || !missing.length || piece.category === 'color' || asked.has(key)) return;
    asked.add(key);
    let alive = true;
    setBusy(true);
    (async () => {
      for (let i = 0; i < missing.length; i += BATCH) {
        try {
          const references = await Promise.all(
            missing.slice(i, i + BATCH).map(async r => ({ id: r.id, image: await compressImageString(r.image, { maxWidth: 768, maxHeight: 768, quality: 0.75 }).catch(() => r.image) })),
          );
          const res = await fetch('/api/locate-piece', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ piece: { name: piece.name, description: piece.description, category: piece.category }, references }),
          });
          const result = await res.json().catch(() => ({}));
          if (!res.ok || !result.success) throw new Error(result.details || result.error || `HTTP ${res.status}`);
          save(piece.id, result.data.crops ?? {});
        } catch (err) {
          // Sin recorte se muestra la referencia entera: no es un error para el usuario.
          console.warn('No se pudo ubicar la pieza en sus referencias:', err);
        }
      }
      if (alive) setBusy(false);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, save]);

  if (!refs.length) return null;
  const current = open !== null ? refs[open] : null;
  const go = (d: number) => setOpen(i => (i === null ? null : (i + d + refs.length) % refs.length));

  return (
    <div className={`flex min-w-0 flex-col gap-2 ${className}`}>
      <ul className="m-0 flex list-none gap-2 overflow-x-auto p-0 pb-1" aria-label={`Dónde se ve ${piece.name}`}>
        {refs.map((r, i) => (
          <li key={r.id} className="shrink-0">
            <button
              type="button"
              onClick={() => setOpen(i)}
              title={`${r.name || r.id} · ver en detalle`}
              className="block size-[84px] overflow-hidden rounded-[3px] bg-raised outline-offset-2 transition-transform duration-150 hover:scale-[1.04] focus-visible:outline-2"
              style={{ boxShadow: 'inset 0 0 0 1px var(--cc-line)' }}
            >
              <Crop image={r.image} crop={cropFor(piece, project, r.id)} fit="cover" alt={`${piece.name} en ${r.name || r.id}`} className="size-full" />
            </button>
          </li>
        ))}
      </ul>
      {busy && <span className="text-[0.8125rem] text-ink-2">Recortando lo que interesa de cada referencia…</span>}
      {current &&
        createPortal(
          <LightboxModal
            reference={current}
            highlight={cropFor(piece, project, current.id) ?? null}
            caption={piece.name}
            position={`${(open ?? 0) + 1} de ${refs.length}`}
            onPrev={refs.length > 1 ? () => go(-1) : undefined}
            onNext={refs.length > 1 ? () => go(1) : undefined}
            onClose={() => setOpen(null)}
          />,
          document.body,
        )}
    </div>
  );
}
