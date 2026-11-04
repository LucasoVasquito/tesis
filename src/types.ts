export type PatternCategory =
  | 'typography'
  | 'color'
  | 'texture'
  | 'composition'
  | 'logo_identity'
  | 'packaging'
  | 'photography_treatment'
  | 'mascot_illustration'
  | 'flyer_poster'
  | 'social_media'
  | 'geometry'
  | 'graphic_elements'
  | 'space_environment'
  | 'mood';

export type PatternStatus = 'detected' | 'confirmed' | 'discarded';

export type PatternTrend = 'new' | 'strengthened' | 'weakened' | 'stable';

export interface ReferenceColor {
  hex: string;
  name: string;
  role: 'predominant' | 'accent' | 'background' | 'detail';
  percentage?: string;
}

export interface ReferenceBreakdown {
  analyzedAt: string;
  colors: ReferenceColor[];
  typography: {
    hasText: boolean;
    familyStyle: string; // e.g. "Serif clásico con serifas afiladas", "Sans-serif geométrica condensada", "Display distorsionada", "Sin texto"
    classification: 'serif' | 'sans-serif' | 'display' | 'script' | 'monospaced' | 'none' | 'mixed';
    treatment: string; // e.g. "Superposición masiva", "Bajo contraste", "Tracking abierto"
    hierarchy: string;
  };
  texture: {
    type: string; // e.g. "Grano fotográfico de 35mm", "Halftone / Semitono", "Vectorial limpia", "Desgaste analógico"
    intensity: 'sutil' | 'moderada' | 'intensa' | 'nula';
    description: string;
  };
  composition: {
    spatialDistribution: string; // e.g. "Reticular asimétrica", "Central jerárquica", "Collage estratificado"
    negativeSpace: 'abundante' | 'moderado' | 'denso/saturado';
    contrastLevel: 'muy alto' | 'medio' | 'bajo / tonal';
    focalPoint: string;
  };
  graphicResources: string[]; // e.g. ["Filetes tipográficos 0.5pt", "Cajas de texto rotadas 90°", "Inversión cromática"]
  photoTreatment: string; // e.g. "Monocromo de alto contraste con virado azul", "Flash directo sin sombra difusa", "Ilustración vectorial plana"
  formsAndGeometry: string[]; // e.g. ["Rectángulos angulares", "Líneas diagonales cortantes", "Círculos concéntricos"]
  observableSummary: string;
}

export interface Reference {
  id: string; // e.g. "ref_01"
  name: string;
  image: string; // Data URL or Web URL
  position: { x: number; y: number };
  width?: number;
  height?: number;
  aspectRatio?: number;
  createdAt: string;
  tags?: string[];
  notes?: string;
  isNew?: boolean; // Tag for incremental analysis
  breakdown?: ReferenceBreakdown;
  /** Si es una parte recortada de otra referencia: el ID de la original. */
  parentId?: string;
  /** Recorte dentro de la original, normalizado 0..1. */
  crop?: CropBox;
  /** Qué es la parte (tipografía, mascota...). */
  partKind?: PartKind;
}

export interface CropBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type PartKind = 'typography' | 'logo' | 'mascot' | 'illustration' | 'photo' | 'texture' | 'graphic' | 'other';

export interface Pattern {
  id: string;
  name: string;
  category: PatternCategory;
  description: string;
  evidence: string[]; // Reference IDs supporting this pattern (e.g. ["ref_01", "ref_03"])
  confidence: number; // 0.0 to 1.0
  status: PatternStatus;
  assignedSystemId?: string | null;
  relatedObservations: string[];
  systemHypothesis?: string; // Hipótesis de traducción del patrón en un subsistema reutilizable para soportes físicos y digitales
  suggestedSystemName?: string;
  trend?: PatternTrend;
  previousEvidenceCount?: number;
  discardReason?: string;
  designerNotes?: string;
  /** Si el patrón responde a un grupo armado por el diseñador: cuál (copia del nombre al inducir). */
  designerGroup?: { id: string; name: string; verdict?: 'supports' | 'refines' | 'contradicts' };
  /** 'designer': lo escribió el diseñador (nace confirmado y la IA no lo reescribe). */
  origin?: 'ai' | 'designer';
  /** El diseñador editó la evidencia a mano: una reinducción no la pisa. */
  evidenceLocked?: boolean;

  /* ---------- Pila de láminas ---------- */
  /** Fragmentos que lo definen (grupo armado con G). */
  fragmentIds?: string[];
  /** Lámina que eligió el diseñador. null = sin lámina (p. ej. revelado sin ubicar). */
  layer?: Layer | null;
  /** Lámina que propone la IA según la evidencia. Se guarda siempre: el espejo compara las dos. */
  aiSuggestedLayer?: Layer | null;
  /** El diseñador abrió y revisó sus evidencias (A). Sin auditar: punto gris y marca al exportar. */
  audited?: boolean;
  /** Lo encontró la IA sin que el diseñador lo marcara ("NO LO MARCASTE"). */
  revealed?: boolean;
  /** Todavía es solo un grupo (G), sin nombre de patrón (P). */
  isGroup?: boolean;
}

/* ---------- Pila de láminas ---------- */

/** 1 · Núcleo (adelante), 2 · Soporte (al medio), 3 · Acento (atrás). */
export type Layer = 1 | 2 | 3;

/** Los tres momentos del flujo (reemplazan a las 5 etapas). */
export type Moment = 'armar' | 'revelar' | 'girar';

/** Costado: láminas separadas en profundidad. Frente: la Síntesis, como página editorial. */
export type StackView = 'side' | 'front';

export type FragmentType =
  | 'texture'
  | 'typography'
  | 'color'
  | 'shape'
  | 'logo'
  | 'mascot'
  | 'illustration'
  | 'photo'
  | 'graphic'
  | 'other';

/**
 * Recorte de una referencia del corpus. No guarda imagen propia: se dibuja recortando
 * la referencia de origen (así no se duplican datos en localStorage).
 */
export interface Fragment {
  id: string;
  /** Imagen de origen. */
  refId: string;
  /** Recorte dentro de la imagen de origen, normalizado 0..1. */
  crop: CropBox;
  type: FragmentType;
  /** Nombre corto ("Textura kraft"). */
  label: string;
  description?: string;
  /** Lámina que eligió el diseñador. null = todavía en el corpus. */
  layer: Layer | null;
  /** Lámina que propuso la IA al desglosar. */
  aiSuggestedLayer?: Layer | null;
  /** Posición continua dentro de la lámina (se imanta a la lámina al soltar). */
  z: number;
  /** Grupo o patrón al que pertenece (ID de Pattern). */
  groupId?: string;
  /** 'ai': lo propuso el desglose; 'designer': lo marcó o corrigió el diseñador. */
  origin: 'ai' | 'designer';
  createdAt: string;
}

/** Hipótesis de la IA sobre qué comparte un grupo. No es un patrón hasta que la inducción la sostiene. */
export interface GroupHypothesis {
  summary: string;
  sharedTraits: string[];
  differences: string[];
  category: PatternCategory;
  at: string;
}

/** Grupo armado por el diseñador en el lienzo (diagrama de afinidad). */
export interface RefGroup {
  id: string;
  name: string;
  /** Por qué las agrupó (se usa en la inducción). */
  note?: string;
  refIds: string[];
  /** Índice de color del marco. */
  color: number;
  hypothesis?: GroupHypothesis;
  createdAt: string;
}

export interface VisualSystemDetails {
  brandEssence?: string;
  logoAndIdentity?: string;
  packagingSystem?: string;
  photographyStyle?: string;
  typographySystem?: string;
  graphicApplications?: string; // flyers, posters, menues, señalética
  mascotAndIllustration?: string;
  digitalAndSocialMedia?: string;
}

export interface PaletteColor {
  hex: string;
  name: string;
  role: string;
  /** Trazabilidad: ID de la referencia o del patrón de donde sale el color. */
  source?: string;
  /** Proporción del color en la evidencia (0..1), para la banda de paleta. */
  share?: number;
}

/** Estilos de espécimen que la interfaz sabe dibujar (aproximaciones con fuentes genéricas). */
export type SpecimenStyle = 'stretched' | 'hierarchy' | 'glitch' | 'italic' | 'rounded' | 'serif' | 'wide' | 'outline';

/** Ejemplo visual de una regla: espécimen tipográfico, recorte de evidencia o diagrama de retícula. */
export interface RuleExample {
  kind: 'type' | 'evidence' | 'grid';
  text?: string;
  /** Solo espécimen: cómo se dibuja y una línea secundaria (para jerarquías). */
  style?: SpecimenStyle;
  subtext?: string;
  refIds?: string[];
  cols?: number;
  rows?: number;
  /** Recorte de la primera referencia que muestra la regla (normalizado 0..1). */
  crop?: CropBox;
  /** Qué muestra el recorte (lo escribe Gemini). */
  cropNote?: string;
}

/** Regla del sistema como ficha: título imperativo corto, fundamento, usos y trazabilidad. */
export interface Rule {
  code: string;
  title: string;
  detail: string;
  use?: string[];
  avoid?: string[];
  example?: RuleExample;
  patternIds: string[];
  refIds: string[];
}

export type RuleField = 'typographyRules' | 'textureRules' | 'compositionRules';


export interface VisualSystem {
  id: string;
  name: string;
  description: string;
  patternIds: string[]; // Confirmed pattern IDs
  referenceIds: string[]; // Supporting reference IDs
  status: 'active' | 'archived';
  colorPalette?: PaletteColor[];
  typographyRules?: Rule[];
  textureRules?: Rule[];
  compositionRules?: Rule[];
  aestheticPillars?: string[];
  /** IDs de patrones que sostienen cada pilar, en el mismo orden. */
  sources?: {
    aestheticPillars?: string[][];
    /** Referencia que eligió el diseñador como imagen de cada pilar (null = sin elección). */
    pillarRefs?: (string | null)[];
  };
  /** Si el sistema nació de una sugerencia de la IA, su ID. */
  adoptedFrom?: string;
  systemDetails?: VisualSystemDetails;
  isSynthesizing?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface FeedbackItem {
  id: string;
  patternId?: string;
  referenceId?: string;
  type: 'pattern_rejection' | 'reference_exclusion' | 'scope_refinement' | 'designer_rule';
  comment: string;
  createdAt: string;
}

/** Sistema propuesto por la IA en la inducción. No es un sistema real hasta que el diseñador lo adopta. */
export interface SuggestedSystem {
  id: string;
  name: string;
  description: string;
  associatedPatternNames?: string[];
  referenceIds: string[];
  aestheticPillars: string[];
  systemDetails?: VisualSystemDetails;
  suggestedPalette?: PaletteColor[];
}

export type LogKind =
  | 'brief'
  | 'induce'
  | 'confirm'
  | 'discard'
  | 'restore'
  | 'note'
  | 'assign'
  | 'unassign'
  | 'system_create'
  | 'system_adopt'
  | 'system_dismiss'
  | 'system_delete'
  | 'synthesize'
  | 'import'
  | 'feedback'
  | 'split'
  | 'group'
  | 'pattern_add'
  | 'pattern_edit'
  | 'layer';

export interface LogItem {
  id: string;
  at: string;
  kind: LogKind;
  targetId: string;
  label: string;
  reason?: string;
  /** Si la entrada corresponde a un FeedbackItem, su ID (evita duplicados en la bitácora). */
  feedbackId?: string;
}

export type Stage = 'brief' | 'corpus' | 'induction' | 'audit' | 'synthesis' | 'application';
/** Etapas que se pueden visitar (Inducción es un estado transitorio). */
export type VisitableStage = Exclude<Stage, 'induction'>;

export interface Project {
  id: string;
  name: string;
  objective: string;
  description: string;
  status: 'draft' | 'analyzing' | 'analyzed' | 'updating';
  references: Reference[];
  patterns: Pattern[];
  systems: VisualSystem[];
  feedback: FeedbackItem[];
  createdAt: string;
  lastAnalyzedAt?: string;
  /** Última etapa visitada, para recuperarla al recargar. */
  uiStage?: VisitableStage;
  suggestedSystems?: SuggestedSystem[];
  log?: LogItem[];
  groups?: RefGroup[];
  /** Último respaldo completo descargado. */
  lastBackupAt?: string;
  /** Etapa 06: todo lo generado para cada sistema (las imágenes viven en IndexedDB). */
  applications?: Record<string, ApplicationSession>;

  /* ---------- Pila de láminas ---------- */
  /** Versión del esquema (2 = pila de láminas). */
  schema?: number;
  /** Frase de intención ("Hamburguesería cruda, de barrio"). */
  intent?: string;
  /** Brief redactado por la IA a partir de la intención; el diseñador lo edita. */
  brief?: string;
  /** Recortes de las referencias (desglose D). Las referencias son el corpus (`references`). */
  fragments?: Fragment[];
  /** Costado (ordenar) o frente (Síntesis). */
  view?: StackView;
  /** Último momento visitado. */
  moment?: Moment;
}

/* ---------- Etapa 06 · Aplicación ---------- */
export type PieceType = 'logo' | 'poster' | 'packaging' | 'post' | 'story' | 'facade' | 'web' | 'other';
/** system: el director de arte recibe lo esencial del sistema. direct: solo el pedido (para comparar). */
export type GenMode = 'system' | 'direct';

/** Una imagen generada (sin la imagen: se guarda aparte por ID). */
export interface GeneratedPiece {
  id: string;
  roundId: string;
  responseId: string;
  direction: string;
  rationale: string;
  revisedPrompt: string;
  model: string;
  pieceType: PieceType;
  mode: GenMode;
  parentId?: string;
  createdAt?: string;
}

/** Una tanda de variantes, o una iteración sobre una pieza. */
export interface GenerationRound {
  id: string;
  label: string;
  brief: string;
  /** Pedido del diseñador ("Qué querés ver") o el cambio pedido. */
  request?: string;
  referencesUsed: string[];
  pieces: GeneratedPiece[];
  failed: number;
  failureMessage?: string;
  createdAt?: string;
}

export interface ExtractedColor {
  hex: string;
  share: number;
}

export interface PaletteCheck {
  colors: ExtractedColor[];
  system: { hex: string; name: string; found: boolean; match?: string }[];
  outside: ExtractedColor[];
}

/** Auditoría de una pieza generada contra el sistema. */
export interface PieceAudit {
  textRead: string;
  textOk: boolean;
  textIssue: string;
  rules: { code: string; title: string; verdict: 'cumple' | 'parcial' | 'no_cumple'; reason: string }[];
  quality: string;
  fixes: string[];
  palette: PaletteCheck;
  at: string;
}

export interface ApplicationSession {
  rounds: GenerationRound[];
  /** Pieza aprobada por tipo. */
  approved: Partial<Record<PieceType, string>>;
  audits: Record<string, PieceAudit>;
  requests: Partial<Record<PieceType, string>>;
  brandText?: string;
}

export type ApplicationType =
  | 'wrapper'
  | 'facade'
  | 'instagram_post'
  | 'packaging'
  | 'flyer_poster'
  | 'interior'
  | 'website'
  | 'other';

export type SystemResourceKey =
  | 'palette'
  | 'typography'
  | 'texture'
  | 'composition'
  | 'graphic_elements'
  | 'illustration'
  | 'photography';

export interface SystemResourceItem {
  key: SystemResourceKey;
  label: string;
  category: PatternCategory;
  ruleSummary: string;
  evidenceRefIds: string[];
  selectedByDefault: boolean;
}

export interface ApplicationIteration {
  id: string;
  iterationPrompt?: string;
  promptUsed?: string;
  imageUrl: string;
  svgMockup?: string;
  appliedResources: string[];
  timestamp: string;
  aspectRatio?: string;
  note?: string;
  engineUsed?: string;
  renderStyle?: string;
}

export interface VisualSystemApplication {
  id: string;
  systemId: string;
  systemName: string;
  applicationType: ApplicationType;
  customApplicationType?: string;
  userDescription: string;
  selectedResources: Record<SystemResourceKey, boolean>;
  evidenceRefIds: string[];
  status: 'idle' | 'generating' | 'success' | 'error';
  currentImageUrl?: string;
  currentSvgMockup?: string;
  iterations: ApplicationIteration[];
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VisualSystemExportData {
  version: '1.0';
  exportedAt: string;
  system: {
    name: string;
    description: string;
    aestheticPillars: string[];
    colorPalette?: PaletteColor[];
    typographyRules?: Rule[] | string[];
    textureRules?: Rule[] | string[];
    compositionRules?: Rule[] | string[];
    graphicResources?: string[];
  };
  projectContext: {
    projectName: string;
    objective: string;
    description: string;
  };
  confirmedPatterns: Array<{
    id: string;
    name: string;
    category: PatternCategory;
    description: string;
    evidence: string[];
    designerNotes?: string;
  }>;
  supportingReferences: Array<{
    id: string;
    name: string;
    tags?: string[];
    notes?: string;
    image: string;
  }>;
}
