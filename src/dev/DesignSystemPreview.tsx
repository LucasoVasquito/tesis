import React, { useState } from 'react';
import { X } from 'lucide-react';
import {
  Button,
  IconButton,
  TextInput,
  TextArea,
  StatusPill,
  TrendTag,
  CategoryTag,
  ConfidenceBar,
  StageRail,
  StageRailCompact,
  ReferenceCard,
  PatternCard,
  Swatch,
  LogEntry,
  LogList,
  EmptyState,
  LoadingState,
  ErrorState,
  ZoomLevel,
  PatternCardMode,
  StageRailItem,
} from '../components/ui';
import { SAMPLE_PROJECT_BURGER_CLUB } from '../data/sampleProjects';

/** Vista de verificación del sistema visual. Solo en desarrollo: abrir con #ds. */
export default function DesignSystemPreview() {
  const refs = SAMPLE_PROJECT_BURGER_CLUB.references;
  const pattern = { ...SAMPLE_PROJECT_BURGER_CLUB.patterns[1], status: 'detected' as const };
  const [zoom, setZoom] = useState<ZoomLevel>('mid');
  const [mode, setMode] = useState<PatternCardMode>('idle');
  const stages: StageRailItem[] = [
    { id: 'brief', num: '01', label: 'Brief', state: 'done' },
    { id: 'corpus', num: '02', label: 'Corpus', state: 'done' },
    { id: 'induction', num: '03', label: 'Inducción', state: 'done', visitable: false },
    { id: 'audit', num: '04', label: 'Auditoría', state: 'current' },
    { id: 'synthesis', num: '05', label: 'Síntesis', state: 'locked', requirement: 'Necesitás 1 patrón confirmado' },
  ];

  const Section = ({ n, title, children }: { n: string; title: string; children: React.ReactNode }) => (
    <section className="grid gap-8 md:grid-cols-[200px_minmax(0,1fr)]">
      <div className="font-mono text-xs text-ink-2">
        {n} — {title}
      </div>
      <div className="flex min-w-0 flex-col gap-6">{children}</div>
    </section>
  );

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-[72px] px-4 pb-[120px] pt-12 md:px-10">
        <header className="flex flex-col gap-3 border-b border-line pb-10">
          <span className="font-mono text-xs text-ink-2">EMERGENT · Sistema visual · verificación</span>
          <h1 className="m-0 text-4xl font-medium leading-[1.1] tracking-[-0.02em]">Componentes base</h1>
          <p className="m-0 max-w-[640px] font-serif text-lg text-ink-2">
            La interfaz es neutra para que las referencias sean protagonistas.
          </p>
        </header>

        <Section n="04" title="Controles">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Inducir patrones</Button>
            <Button variant="primary" loading loadingText="Analizando 3/8">
              Inducir patrones
            </Button>
            <Button variant="primary" disabled>
              Inducir patrones
            </Button>
            <Button variant="secondary">Agregar referencias</Button>
            <Button variant="ghost">Ver bitácora</Button>
            <Button variant="confirm" kbd="C">
              Confirmar
            </Button>
            <Button variant="discard" kbd="D">
              Descartar
            </Button>
            <IconButton label="Cerrar inspector">
              <X className="size-4 stroke-[1.5]" />
            </IconButton>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <TextInput label="Nombre del proyecto" defaultValue="Burger Club" required />
            <TextInput label="Objetivo" hint="Foco" />
            <TextInput label="Motivo del descarte" placeholder="Requerido" error="Escribí por qué descartás este patrón." />
          </div>
          <TextArea label="Contexto" optional rows={3} />
        </Section>

        <Section n="05" title="Estado y progreso">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status="detected" />
            <StatusPill status="confirmed" />
            <StatusPill status="discarded" />
            <TrendTag trend="strengthened" />
            <TrendTag trend="new" />
            <TrendTag trend="weakened" />
            <TrendTag trend="stable" />
            <CategoryTag category="typography" />
            <CategoryTag category="texture" />
          </div>
          <StageRail stages={stages} onSelect={() => {}} />
          <StageRailCompact stages={stages} onSelect={() => {}} />
          <div className="max-w-[520px]">
            <ConfidenceBar value={0.94} />
          </div>
        </Section>

        <Section n="06" title="Ficha de referencia">
          <div role="group" aria-label="Nivel de zoom" className="flex w-fit overflow-hidden rounded-ctrl border border-line-mid">
            {(['far', 'mid', 'near'] as ZoomLevel[]).map(z => (
              <button
                key={z}
                type="button"
                aria-pressed={zoom === z}
                onClick={() => setZoom(z)}
                className={`h-8 px-3 font-mono text-xs font-medium ${zoom === z ? 'bg-ink text-bg' : 'text-ink-2'}`}
              >
                {z === 'far' ? 'lejos' : z === 'mid' ? 'medio' : 'cerca'}
              </button>
            ))}
          </div>
          <div className="dot-grid flex flex-wrap items-start gap-5 rounded-card border border-line p-8">
            {refs.slice(0, 3).map((r, i) => (
              <ReferenceCard
                key={r.id}
                reference={{ ...r, breakdown: i === 1 ? undefined : r.breakdown }}
                zoom={zoom}
                width={zoom === 'far' ? 96 : zoom === 'mid' ? 180 : 260}
                evidence={i === 1}
                selected={i === 2}
                analysis={{ tone: i === 2 ? 'pending' : 'confirmed', label: i === 2 ? 'Nueva' : 'Inducida' }}
              />
            ))}
          </div>
        </Section>

        <Section n="07" title="Ficha de patrón">
          <PatternCard
            pattern={pattern}
            index={1}
            total={6}
            references={refs}
            mode={mode}
            onModeChange={setMode}
            onConfirm={() => {}}
            onDiscard={() => setMode('idle')}
            onSaveNote={() => setMode('idle')}
            onRestore={() => {}}
          />
        </Section>

        <Section n="08" title="Muestra y bitácora">
          <div className="grid gap-8 md:grid-cols-2">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
              <Swatch hex="#141414" name="Negro Carbón Mate" source="pat_bc_01" />
              <Swatch hex="#E65100" name="Naranja Fuego" source="pat_bc_01" />
              <Swatch hex="#C89D7C" name="Kraft Cálido" source="ref_bc_06" />
              <Swatch hex="#F4F4F0" name="Blanco Tiza" source="ref_bc_02" />
            </div>
            <LogList label="Bitácora">
              <LogEntry time="00:14" target="pat_bc_03" action="Confirmado → Sistema Urbano" reason="Fundamental para envoltorio." tone="confirmed" />
              <LogEntry time="00:12" target="pat_bc_07" action="Descartado" reason="El neón responde a la fachada existente." tone="discarded" />
              <LogEntry time="00:09" target="corpus" action="Inducción · 8 referencias, 7 patrones" tone="pending" />
            </LogList>
          </div>
        </Section>

        <Section n="09" title="Vacío, carga, error">
          <div className="grid gap-3 md:grid-cols-3">
            <EmptyState
              meta="0 referencias"
              title="Soltá imágenes acá"
              body="Se necesitan al menos 3 referencias para inducir patrones."
              action={
                <Button size="sm" variant="secondary">
                  Elegir archivos
                </Button>
              }
            />
            <LoadingState
              meta="INDUCCIÓN · 3 / 8"
              title="Leyendo ref_bc_03"
              progress={0.38}
              steps={[
                { label: 'color', state: 'done' },
                { label: 'composición', state: 'done' },
                { label: 'tipografía', state: 'current' },
                { label: 'textura', state: 'todo' },
              ]}
            />
            <ErrorState
              code="ERROR 503"
              title="Gemini no respondió"
              body="Tus decisiones están guardadas. Se probaron 3 modelos alternativos."
              detail="503 Service Unavailable"
              onRetry={() => {}}
            />
          </div>
        </Section>
      </div>
    </div>
  );
}
