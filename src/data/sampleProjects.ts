import { Project, Reference, Pattern, VisualSystem } from '../types';

export const SAMPLE_PROJECT_BURGER_CLUB: Project = {
  id: 'proj_burger_club',
  name: 'BURGER CLUB — Identidad Visual Urbana',
  objective: 'Crear una identidad visual para una hamburguesería urbana y contemporánea que pueda aplicarse de forma coherente en comunicación digital, packaging y espacio físico.',
  description: 'Universo estético que articula la nobleza del papel kraft y la serigrafía artesanal con la potencia visual de una gráfica tipográfica nocturna, audaz y contemporánea.',
  status: 'analyzed',
  createdAt: new Date().toISOString(),
  lastAnalyzedAt: new Date().toISOString(),
  feedback: [],
  references: [
    {
      id: 'ref_bc_01',
      name: 'Envoltorio Kraft con Sello y Tipografía',
      image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?q=80&w=800&auto=format&fit=crop',
      position: { x: 60, y: 80 },
      width: 270,
      height: 340,
      createdAt: new Date().toISOString(),
      tags: ['Packaging', 'Kraft', 'Sello Tinta', 'Urbano'],
      notes: 'Papel kraft cálido con estampación monocroma en tinta negra y detalle de monograma circular.'
    },
    {
      id: 'ref_bc_02',
      name: 'Póster Tipográfico Sans Condensada Bold',
      image: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?q=80&w=800&auto=format&fit=crop',
      position: { x: 360, y: 70 },
      width: 270,
      height: 350,
      createdAt: new Date().toISOString(),
      tags: ['Tipografía', 'Sans Bold', 'Alto Contraste', 'Bloque'],
      notes: 'Titulares en caja alta hipercondensada, tracking ajustado y acentos en naranja tostado.'
    },
    {
      id: 'ref_bc_03',
      name: 'Fachada Urbana con Neón Ámbar y Toldo Negro',
      image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?q=80&w=800&auto=format&fit=crop',
      position: { x: 660, y: 90 },
      width: 280,
      height: 340,
      createdAt: new Date().toISOString(),
      tags: ['Fachada', 'Espacio Físico', 'Neón', 'Negro Mate'],
      notes: 'Estructura exterior en negro mate con letrero lumínico cálido y gráfica en cristaleras.'
    },
    {
      id: 'ref_bc_04',
      name: 'Sistema de Grilla y Recursos Gráficos',
      image: 'https://images.unsplash.com/photo-1586717791821-3f44a563fa4c?q=80&w=800&auto=format&fit=crop',
      position: { x: 970, y: 80 },
      width: 270,
      height: 350,
      createdAt: new Date().toISOString(),
      tags: ['Grilla', 'Stickers', 'Sellos', 'Composición'],
      notes: 'Composición perimetral con sellos de autenticidad, líneas de corte punteadas y numeración de pedido.'
    },
    {
      id: 'ref_bc_05',
      name: 'Fotografía Cenital con Fondo de Hormigón',
      image: 'https://images.unsplash.com/photo-1550547660-d9450f859349?q=80&w=800&auto=format&fit=crop',
      position: { x: 80, y: 620 },
      width: 260,
      height: 330,
      createdAt: new Date().toISOString(),
      tags: ['Fotografía', 'Instagram', 'Luz Dura', 'Textura'],
      notes: 'Fotografía de producto con iluminación cenital de alto contraste sobre textura de cemento pulido.'
    },
    {
      id: 'ref_bc_06',
      name: 'Caja de Hamburguesa Kraft y Estampado',
      image: 'https://images.unsplash.com/photo-1521305916504-4a1121188589?q=80&w=800&auto=format&fit=crop',
      position: { x: 370, y: 610 },
      width: 270,
      height: 340,
      createdAt: new Date().toISOString(),
      tags: ['Packaging', 'Cartón Kraft', 'Naranja Quemado'],
      notes: 'Packaging de cartón microcorrugado con franja naranja quemada y tipografía en bloque.'
    },
    {
      id: 'ref_bc_07',
      name: 'Interior Industrial con Cartelería Tipográfica',
      image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=800&auto=format&fit=crop',
      position: { x: 670, y: 620 },
      width: 270,
      height: 340,
      createdAt: new Date().toISOString(),
      tags: ['Espacio', 'Interior', 'Hormigón', 'Señalética'],
      notes: 'Menú de pared modular con rieles negros y tipografía magnética contrastada.'
    },
    {
      id: 'ref_bc_08',
      name: 'Detalle de Textura de Tinta y Papel Rugoso',
      image: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?q=80&w=800&auto=format&fit=crop',
      position: { x: 970, y: 620 },
      width: 260,
      height: 330,
      createdAt: new Date().toISOString(),
      tags: ['Textura', 'Tinta Sangrada', 'Serigrafía', 'Artesanal'],
      notes: 'Macro de impresión con bordes levemente sangrados e imperfección táctil controlada.'
    }
  ],
  patterns: [
    {
      id: 'pat_bc_01',
      name: 'Paleta Urbana Tostada (Negro Carbón, Naranja Fuego, Kraft Cálido)',
      category: 'color',
      description: 'Combinación cromática de alto impacto que equilibra fondos oscuros (#141414) y base kraft (#C89D7C) con acentos de naranja fuego tostado (#E65100) y blanco tiza (#F4F4F0).',
      evidence: ['ref_bc_01', 'ref_bc_02', 'ref_bc_06'],
      confidence: 0.96,
      status: 'confirmed',
      assignedSystemId: 'sys_bc_01',
      relatedObservations: ['Contraste térmico alto', 'Dominancia oscura en soportes digitales y base kraft en packaging'],
      trend: 'strengthened',
      designerNotes: 'Aprobado como paleta oficial para packaging, fachada y redes sociales.'
    },
    {
      id: 'pat_bc_02',
      name: 'Tipografía Sans-Serif Condensada en Bloque Compacto',
      category: 'typography',
      description: 'Titulares en caja alta hipercondensada (Grotesk bold) con tracking cerrado, alineaciones justificadas en bloque y micro-interlínea.',
      evidence: ['ref_bc_02', 'ref_bc_04', 'ref_bc_07'],
      confidence: 0.94,
      status: 'confirmed',
      assignedSystemId: 'sys_bc_01',
      relatedObservations: ['Jerarquía dominante de gran escala', 'Excelente legibilidad en envoltorios y letreros'],
      trend: 'strengthened',
      designerNotes: 'Núcleo de la identidad para envoltorios, señalética y posteos.'
    },
    {
      id: 'pat_bc_03',
      name: 'Textura Kraft Táctil y Serigrafía con Desgaste',
      category: 'texture',
      description: 'Superficie de papel kraft absorbente con estampación de tinta negra densa y leve sangrado en los bordes de impresión.',
      evidence: ['ref_bc_01', 'ref_bc_06', 'ref_bc_08'],
      confidence: 0.92,
      status: 'confirmed',
      assignedSystemId: 'sys_bc_01',
      relatedObservations: ['Evita el aspecto digital sintético', 'Aporta calidez artesanal y autenticidad'],
      trend: 'strengthened',
      designerNotes: 'Fundamental para envoltorio, conos de papas y packaging.'
    },
    {
      id: 'pat_bc_04',
      name: 'Composición Reticular Perimetral con Anclajes en Esquinas',
      category: 'composition',
      description: 'Distribución espacial que enmarca el plano ubicando textos técnicos, numeración y sellos en las cuatro esquinas, dejando el centro libre para el foco principal.',
      evidence: ['ref_bc_04', 'ref_bc_02', 'ref_bc_05'],
      confidence: 0.89,
      status: 'confirmed',
      assignedSystemId: 'sys_bc_01',
      relatedObservations: ['Estructura limpia inspirada en fichas técnicas industriales', 'Adaptable a cualquier formato (cuadrado, vertical, faja)'],
      trend: 'strengthened',
      designerNotes: 'Regla de composición maestra para piezas gráficas.'
    },
    {
      id: 'pat_bc_05',
      name: 'Recursos Gráficos: Sellos Circulares, Monograma BC y Líneas Punteadas',
      category: 'graphic_elements',
      description: 'Familia de sellos de calidad circular ("BURGER CLUB • EST 2026"), monograma "BC" enmarcado y filetes con perforación gráfica.',
      evidence: ['ref_bc_01', 'ref_bc_04', 'ref_bc_06'],
      confidence: 0.91,
      status: 'confirmed',
      assignedSystemId: 'sys_bc_01',
      relatedObservations: ['Funciona como elemento de cierre o sticker de sellado', 'Refuerza la personalidad de club gastronómico'],
      trend: 'strengthened',
      designerNotes: 'Aprobado para stickers de envoltorio, menú y avatares.'
    },
    {
      id: 'pat_bc_06',
      name: 'Fotografía Cenital con Iluminación Dura y Sombras Nítidas',
      category: 'photography_treatment',
      description: 'Tomas cenitales y rasantes de producto con flash o luz dura lateral, resaltando brillos de salsas y textura de panes sobre fondos de hormigón.',
      evidence: ['ref_bc_05', 'ref_bc_08'],
      confidence: 0.87,
      status: 'confirmed',
      assignedSystemId: 'sys_bc_01',
      relatedObservations: ['Estilo editorial gastronómico crudo y apetitoso', 'Alto impacto en feeds de Instagram'],
      trend: 'strengthened',
      designerNotes: 'Criterio para producción fotográfica digital.'
    }
  ],
  systems: [
    {
      id: 'sys_bc_01',
      name: 'Burger Club — Sistema Visual Urbano & Contemporáneo',
      description: 'Sistema integral de identidad que articula calidez artesanal (kraft + sellos) con contundencia gráfica urbana (sans condensada + naranja quemado). Diseñado para comportarse de forma coherente en packaging, fachada y medios digitales.',
      patternIds: ['pat_bc_01', 'pat_bc_02', 'pat_bc_03', 'pat_bc_04', 'pat_bc_05', 'pat_bc_06'],
      referenceIds: ['ref_bc_01', 'ref_bc_02', 'ref_bc_03', 'ref_bc_04', 'ref_bc_05', 'ref_bc_06', 'ref_bc_07', 'ref_bc_08'],
      status: 'active',
      aestheticPillars: [
        'Autenticidad material (papel kraft, serigrafía y tinta)',
        'Contundencia tipográfica condensada y modular',
        'Acromía profunda con acento térmico naranja fuego',
        'Reticulado perimetral inspirado en fichas técnicas'
      ],
      colorPalette: [
        { hex: '#141414', name: 'Negro Carbón Mate', role: 'Base y fondos oscuros' },
        { hex: '#E65100', name: 'Naranja Fuego Tostado', role: 'Acento y foco de atención' },
        { hex: '#C89D7C', name: 'Papel Kraft Cálido', role: 'Soporte físico y packaging' },
        { hex: '#F4F4F0', name: 'Blanco Tiza', role: 'Tipografía de alto contraste' },
        { hex: '#333333', name: 'Gris Asfalto', role: 'Filetes y tipografía secundaria' }
      ],
      typographyRules: [
        'Titulares en Sans-Serif Hipercondensada Extra Bold en caja alta.',
        'Textos técnicos y metadatos en Monospace o Sans geométrica en cuerpo pequeño.',
        'Tracking negativo (-0.02em a -0.04em) en títulos principales.'
      ],
      textureRules: [
        'Soporte base con grano sutil de papel kraft y fibras visibles.',
        'Impresión con textura de serigrafía o sello de goma con micro-desgaste en bordes.'
      ],
      compositionRules: [
        'Estructura perimetral: información clave en las esquinas y márgenes.',
        'Jerarquía binaria: un elemento dominante de gran escala vs. detalles técnicos mínimos.'
      ],
      createdAt: new Date().toISOString()
    }
  ]
};

export const SAMPLE_PROJECT_BADDER: Project = {
  id: 'proj_badder',
  name: 'Identidad Visual de Badder',
  objective: 'Construir un universo estético y sistema visual para publicaciones editoriales, Instagram y sitio web interactivo.',
  description: 'Exploración de dos tensiones estéticas: una línea editorial oscura y minimalista con serifas afiladas, y una línea urbana disruptiva con alto contraste, acentos de color eléctrico y texturas analógicas.',
  status: 'draft',
  createdAt: new Date().toISOString(),
  feedback: [],
  systems: [],
  patterns: [],
  references: [
    {
      id: 'ref_01',
      name: 'Póster Tipográfico Editorial 01',
      image: 'https://images.unsplash.com/photo-1544717305-2782549b5136?q=80&w=800&auto=format&fit=crop',
      position: { x: 80, y: 100 },
      width: 260,
      height: 340,
      createdAt: new Date().toISOString(),
      tags: ['Serif', 'Editorial', 'Monocromo', 'Alto Contraste'],
      notes: 'Uso de espacio negativo amplio y tipografía serif clásica con números en estilo antiguo.'
    },
    {
      id: 'ref_02',
      name: 'Composición Editorial Nocturna',
      image: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?q=80&w=800&auto=format&fit=crop',
      position: { x: 380, y: 80 },
      width: 280,
      height: 360,
      createdAt: new Date().toISOString(),
      tags: ['Negro Profundo', 'Azul Eléctrico', 'Minimalista'],
      notes: 'Fondo oscuro con iluminación azul cobalto de acento. Retícula sobria.'
    },
    {
      id: 'ref_03',
      name: 'Textura Analógica y Grano 35mm',
      image: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=800&auto=format&fit=crop',
      position: { x: 700, y: 120 },
      width: 250,
      height: 320,
      createdAt: new Date().toISOString(),
      tags: ['Grano', 'Textura', 'Monocromo', 'Misterio'],
      notes: 'Grano denso en sombras, viñeteado óptico y atmósfera cruda.'
    },
    {
      id: 'ref_04',
      name: 'Layout Revista con Serifa Elegante',
      image: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?q=80&w=800&auto=format&fit=crop',
      position: { x: 1000, y: 90 },
      width: 290,
      height: 350,
      createdAt: new Date().toISOString(),
      tags: ['Editorial', 'Serif', 'Blanco y Negro', 'Reticular'],
      notes: 'Jerarquía tipográfica estricta con titulares itálicos de gran escala.'
    },
    {
      id: 'ref_05',
      name: 'Afiche Urbano Cyberpunk / Acid',
      image: 'https://images.unsplash.com/photo-1514565131-fce0801e5785?q=80&w=800&auto=format&fit=crop',
      position: { x: 100, y: 660 },
      width: 270,
      height: 350,
      createdAt: new Date().toISOString(),
      tags: ['Urbano', 'Azul Cobalto', 'Luz de Neón', 'Disruptivo'],
      notes: 'Superposición tipográfica display, reflejos lumínicos saturados en asfalto.'
    },
    {
      id: 'ref_06',
      name: 'Gráfica Experimental Alto Contraste',
      image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800&auto=format&fit=crop',
      position: { x: 420, y: 650 },
      width: 260,
      height: 330,
      createdAt: new Date().toISOString(),
      tags: ['Gradiente Oscuro', 'Fluido', 'Azul Eléctrico', '3D'],
      notes: 'Formas orgánicas oscuras con refracción cromática azul y turquesa.'
    },
    {
      id: 'ref_07',
      name: 'Portada Libro Tipografía Display',
      image: 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?q=80&w=800&auto=format&fit=crop',
      position: { x: 730, y: 640 },
      width: 260,
      height: 340,
      createdAt: new Date().toISOString(),
      tags: ['Editorial', 'Serif', 'Mínimo', 'Papel Táctil'],
      notes: 'Títulos condensados con serifa estilizada y detalle de numeración lateral.'
    },
    {
      id: 'ref_08',
      name: 'Fotografía de Moda Noir con Luz Cenital',
      image: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?q=80&w=800&auto=format&fit=crop',
      position: { x: 1040, y: 640 },
      width: 270,
      height: 350,
      createdAt: new Date().toISOString(),
      tags: ['Noir', 'Alto Contraste', 'Sombras Duras', 'Moda'],
      notes: 'Silueta recortada con luz rasante y alto contraste tonal sin medios tonos.'
    }
  ]
};

/** Proyecto vacío: nombre y objetivo en blanco para que arranque en la Etapa 1 (Brief). */
export function createEmptyProject(): Project {
  return {
    id: `proj_${Date.now()}`,
    name: '',
    objective: '',
    description: '',
    status: 'draft',
    createdAt: new Date().toISOString(),
    feedback: [],
    systems: [],
    patterns: [],
    references: [],
    suggestedSystems: [],
    log: [],
  };
}

export const SAMPLE_PROJECTS: Project[] = [SAMPLE_PROJECT_BURGER_CLUB, SAMPLE_PROJECT_BADDER];
export const SAMPLE_SHORT_NAME: Record<string, string> = { proj_burger_club: 'Burger Club', proj_badder: 'Badder' };

/** Textos de relleno que tenía el proyecto vacío antes del rework (se limpian al migrar). */
export const LEGACY_PLACEHOLDER_NAME = 'Nuevo Proyecto de Identidad';
export const LEGACY_PLACEHOLDER_OBJECTIVE_PREFIX = 'Definir el objetivo del universo visual';
export const LEGACY_PLACEHOLDER_DESCRIPTION_PREFIX = 'Agrega referencias visuales arrastrándolas';
