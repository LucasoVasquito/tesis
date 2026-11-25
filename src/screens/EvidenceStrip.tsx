import React, { createContext, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CropBox, Pattern, Project, Reference } from '../types';
import { Crop } from '../space/Crop';
import { LightboxModal } from '../components/LightboxModal';
import { compressImageString } from '../utils/imageCompressor';
import { cropFor } from '../utils/evidence';

/** Guarda dónde se ve una pieza en cada referencia (lo provee App, con updateProject). */
export const EvidenceCropsContext = createContext<((pieceId: string, crops: Record<string, CropBox | null>) => void) | null>(null);

/** Cuántas referencias se mandan por pedido (cada una viaja como imagen). */
const BATCH = 10;
/** Pedidos en curso o hechos en esta sesión, por pieza y referencias: no se repiten aunque el componente se monte de nuevo. */
const asked = new Set<string>();

export { cropFor };

/** ¿Falta saber dónde se ve la pieza en esta referencia? */
const pending = (piece: Pattern, project: Project, refId: string) => piece.evidenceCrops?.[refId] === undefined && !cropFor(piece, project, refId);

/**
 * Evidencia de una pieza como fila de recortes: lo que interesa de cada referencia, no la referencia entera.
 * Al tocar uno se abre la referencia completa con la zona marcada; ← → recorren la fila.
 * Si falta ubicar la pieza en alguna referencia, se le pide a la IA una vez (en tandas de 10).
 */
export function EvidenceStrip({ piece, project, className = '', size }: { piece: Pattern; project: Project; className?: string; size?: number }) {
  const save = useContext(EvidenceCropsContext);
  const refs = piece.evidence.map(id => project.references.find(r => r.id === id)).filter((r): r is Reference => !!r && !!r.image);
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

  return (
    <CropStrip
      items={refs.map(r => ({ ref: r, crop: cropFor(piece, project, r.id) }))}
      caption={piece.name}
      busy={busy ? 'Recortando lo que interesa de cada referencia…' : undefined}
      className={className}
      size={size}
    />
  );
}

/**
 * Fila de recortes de referencias; al tocar uno se abre la referencia completa con la zona marcada (← → recorren).
 * La usan las piezas (EvidenceStrip) y las reglas de estructura.
 */
export function CropStrip({ items, caption, busy, size = 84, className = '' }: { items: { ref: Reference; crop?: CropBox | null }[]; caption: string; busy?: string; size?: number; className?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const list = items.filter(x => !!x.ref.image);
  if (!list.length) return busy ? <span className="text-[0.8125rem] text-ink-2">{busy}</span> : null;
  const current = open !== null ? list[open] : null;
  const go = (d: number) => setOpen(i => (i === null ? null : (i + d + list.length) % list.length));

  return (
    <div className={`flex min-w-0 flex-col gap-2 ${className}`}>
      <ul className="m-0 flex list-none gap-2 overflow-x-auto p-0 pb-1" aria-label={`Dónde se ve: ${caption}`}>
        {list.map(({ ref: r, crop }, i) => (
          <li key={r.id} className="shrink-0">
            <button
              type="button"
              onClick={() => setOpen(i)}
              title={`${r.name || r.id} · ver en detalle`}
              className="block overflow-hidden rounded-[3px] bg-raised outline-offset-2 transition-transform duration-150 hover:scale-[1.04] focus-visible:outline-2"
              style={{ width: size, height: size, boxShadow: 'inset 0 0 0 1px var(--cc-line)' }}
            >
              <Crop image={r.image} crop={crop ?? undefined} fit="cover" alt={`${caption} en ${r.name || r.id}`} className="size-full" />
            </button>
          </li>
        ))}
      </ul>
      {busy && <span className="text-[0.8125rem] text-ink-2">{busy}</span>}
      {current &&
        createPortal(
          <LightboxModal
            reference={current.ref}
            highlight={current.crop ?? null}
            caption={caption}
            position={`${(open ?? 0) + 1} de ${list.length}`}
            onPrev={list.length > 1 ? () => go(-1) : undefined}
            onNext={list.length > 1 ? () => go(1) : undefined}
            onClose={() => setOpen(null)}
          />,
          document.body,
        )}
    </div>
  );
}
