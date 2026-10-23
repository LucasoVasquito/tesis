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
}

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

/** Ejemplo visual de una regla: espécimen tipográfico, recorte de evidencia o diagrama de retícula. */
export interface RuleExample {
  kind: 'type' | 'evidence' | 'grid';
  text?: string;
  refIds?: string[];
  cols?: number;
  rows?: number;
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
  sources?: { aestheticPillars?: string[][] };
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
  | 'feedback';

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

export type Stage = 'brief' | 'corpus' | 'induction' | 'audit' | 'synthesis';
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
