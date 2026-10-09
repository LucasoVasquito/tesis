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

export interface VisualSystem {
  id: string;
  name: string;
  description: string;
  patternIds: string[]; // Confirmed pattern IDs
  referenceIds: string[]; // Supporting reference IDs
  status: 'active' | 'archived';
  colorPalette?: Array<{ hex: string; name: string; role: string }>;
  typographyRules?: string[];
  textureRules?: string[];
  compositionRules?: string[];
  aestheticPillars?: string[];
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
}

export type RightPanelTab = 'patterns' | 'systems' | 'breakdown' | 'feedback' | 'export';

export type ApplicationType =
  | 'wrapper'
  | 'facade'
  | 'instagram_post'
  | 'packaging'
  | 'flyer_poster'
  | 'interior'
  | 'website'
  | 'other';

export type AIEngineType = 'openai_dalle3' | 'huggingface_sdxl' | 'svg_vector';

export type RenderStyleType = 'photo_studio' | 'render_3d' | 'editorial' | 'craft_tactile' | 'architectural';

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
    colorPalette?: Array<{ hex: string; name: string; role: string }>;
    typographyRules?: string[];
    textureRules?: string[];
    compositionRules?: string[];
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
