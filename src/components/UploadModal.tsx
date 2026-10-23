import React, { useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { Reference } from '../types';
import { Button, TextInput } from './ui';
import { Modal } from './shell/Modal';
import { gridPosition, nextReferenceIds } from '../utils/project';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  existing: Reference[];
  onAddFiles: (files: File[]) => void;
  onAddReferences: (refs: Reference[]) => void;
}

type Tab = 'files' | 'url' | 'packs';

const u = (id: string) => `https://images.unsplash.com/${id}?q=80&w=800&auto=format&fit=crop`;

const PACKS: Record<string, { label: string; images: { name: string; url: string; tags: string[]; notes: string }[] }> = {
  badder_extra: {
    label: 'Disruptivo urbano',
    images: [
      { name: 'Composición asimétrica con tipografía display', url: u('photo-1541701494587-cb58502866ab'), tags: ['Display', 'Urbano', 'Color neón'], notes: 'Bloques tipográficos superpuestos y gradiente cobalto.' },
      { name: 'Retícula editorial minimalista', url: u('photo-1512820790803-83ca734da794'), tags: ['Editorial', 'Serif', 'Espacio negativo'], notes: 'Equilibrio asimétrico con margen superior dominante.' },
      { name: 'Textura de semitono analógico', url: u('photo-1579783900882-c0d3dad7b119'), tags: ['Halftone', 'Textura'], notes: 'Trama de puntos serigráfica con saturación profunda.' },
    ],
  },
  minimal_editorial: {
    label: 'Editorial mínimo',
    images: [
      { name: 'Editorial clásico, libro antiguo', url: u('photo-1457369804613-52c61a468e7d'), tags: ['Serif', 'Papel táctil', 'Monocromo'], notes: 'Serifas refinadas y márgenes de proporciones canónicas.' },
      { name: 'Póster minimalista con filetes finos', url: u('photo-1492684223066-81342ee5ff30'), tags: ['Filetes 0.5pt', 'Negro puro'], notes: 'Geometría ortogonal y alto contraste.' },
    ],
  },
  acid_urban: {
    label: 'Ácido nocturno',
    images: [
      { name: 'Gráfica urbana underground', url: u('photo-1509198397868-475647b2a1e5'), tags: ['Urbano', 'Collage', 'Ruido'], notes: 'Estética fotocopia xerox con tipografía distorsionada.' },
      { name: 'Iluminación neón magenta y azul cobalto', url: u('photo-1508739773434-c26b3d09e071'), tags: ['Azul eléctrico', 'Magenta'], notes: 'Relación cromática complementaria saturada.' },
    ],
  },
};

const TABS: { id: Tab; label: string }[] = [
  { id: 'files', label: 'Archivos' },
  { id: 'url', label: 'Desde URL' },
  { id: 'packs', label: 'Paquetes de ejemplo' },
];

export function UploadModal({ isOpen, onClose, existing, onAddFiles, onAddReferences }: UploadModalProps) {
  const [tab, setTab] = useState<Tab>('files');
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setUrl('');
    setName('');
    setTags('');
    setNotes('');
    setUrlError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const addFromUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const v = url.trim();
    if (!/^https?:\/\/\S+$/i.test(v)) {
      setUrlError('Pegá una dirección que empiece con http:// o https://');
      return;
    }
    const [id] = nextReferenceIds(existing, 1);
    const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
    onAddReferences([
      {
        id,
        name: name.trim() || `Referencia web ${id.replace('ref_', '')}`,
        image: v,
        position: gridPosition(existing.length),
        width: 260,
        height: 340,
        createdAt: new Date().toISOString(),
        tags: tagList.length ? tagList : ['Web'],
        notes: notes.trim() || undefined,
        isNew: true,
      },
    ]);
    close();
  };

  const addPack = (key: string) => {
    const imgs = PACKS[key].images;
    const ids = nextReferenceIds(existing, imgs.length);
    onAddReferences(
      imgs.map((it, i) => ({
        id: ids[i],
        name: it.name,
        image: it.url,
        position: gridPosition(existing.length + i),
        width: 260,
        height: 340,
        createdAt: new Date().toISOString(),
        tags: it.tags,
        notes: it.notes,
        isNew: true,
      })),
    );
    close();
  };

  return (
    <Modal open={isOpen} title="Agregar referencias" meta="02 · Corpus" onClose={close}>
      <div role="tablist" aria-label="Origen de las referencias" className="flex gap-1 border-b border-line px-5 py-3">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`upl-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`upl-panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`btn btn-sm px-3 ${tab === t.id ? 'btn-secondary' : 'btn-ghost'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'files' && (
        <div role="tabpanel" id="upl-panel-files" aria-labelledby="upl-tab-files" className="p-5">
          <div
            onDragOver={e => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault();
              setDragOver(false);
              const files = Array.from(e.dataTransfer.files || []);
              if (files.length) {
                onAddFiles(files);
                close();
              }
            }}
            className={`flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-card border border-dashed p-6 text-center transition-colors duration-120 ${
              dragOver ? 'border-ink/60 bg-white/[.03]' : 'border-line-strong'
            }`}
          >
            <span className="text-15 font-medium text-ink">Soltá imágenes acá</span>
            <span className="max-w-[260px] text-13 text-ink-2">JPG, PNG o WebP. También podés pegar con Ctrl + V sobre el lienzo.</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={e => {
                const files = Array.from(e.target.files || []);
                e.target.value = '';
                if (files.length) {
                  onAddFiles(files);
                  close();
                }
              }}
            />
            <Button size="sm" variant="secondary" icon={<ImagePlus />} onClick={() => fileRef.current?.click()} data-autofocus>
              Elegir archivos
            </Button>
          </div>
        </div>
      )}

      {tab === 'url' && (
        <form role="tabpanel" id="upl-panel-url" aria-labelledby="upl-tab-url" className="flex flex-col gap-4 p-5" onSubmit={addFromUrl} noValidate>
          <TextInput
            label="URL de la imagen"
            required
            type="url"
            placeholder="https://…"
            value={url}
            error={urlError}
            onChange={e => {
              setUrl(e.target.value);
              setUrlError(null);
            }}
            data-autofocus
          />
          <TextInput label="Nombre" optional value={name} onChange={e => setName(e.target.value)} />
          <TextInput label="Etiquetas" optional hint="Separadas por coma" value={tags} onChange={e => setTags(e.target.value)} />
          <TextInput label="Notas" optional value={notes} onChange={e => setNotes(e.target.value)} />
          <div className="flex justify-end">
            <Button type="submit" variant="secondary">
              Agregar referencia
            </Button>
          </div>
        </form>
      )}

      {tab === 'packs' && (
        <div role="tabpanel" id="upl-panel-packs" aria-labelledby="upl-tab-packs" className="flex flex-col gap-2 p-5">
          <p className="m-0 mb-2 text-13 text-ink-2">Conjuntos de imágenes de Unsplash para probar el método.</p>
          {Object.entries(PACKS).map(([key, pack]) => (
            <button
              key={key}
              type="button"
              onClick={() => addPack(key)}
              className="flex items-center gap-3 rounded-card border border-line bg-bg p-3 text-left transition-colors duration-120 hover:border-line-strong"
            >
              <span className="flex -space-x-2">
                {pack.images.slice(0, 3).map(img => (
                  <img key={img.url} src={img.url} alt="" className="size-10 rounded-ctrl border border-surface object-cover" referrerPolicy="no-referrer" loading="lazy" />
                ))}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-13 font-medium text-ink">{pack.label}</span>
                <span className="font-mono text-xs text-ink-2">{pack.images.length} referencias</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
