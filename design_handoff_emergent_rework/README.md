# Handoff: Rework de Emergent (UX + sistema visual)

Repo: `LucasoVasquito/tesis` (rama `main`). Stack actual: React 19 + TypeScript + Vite + Express 5 + Gemini + DALL·E 3. **No cambiar el stack.**

## Overview
Emergent es un instrumento de inducción y auditoría: la IA detecta patrones formales en el corpus de referencias del diseñador, con trazabilidad a cada imagen, y el diseñador confirma o descarta cada hallazgo. El rework tiene tres objetivos:
1. Que el flujo principal (happy path) sea lineal y obvio.
2. Que cada etapa tenga su propia vista y que el usuario vea solo lo necesario en cada momento (progressive disclosure).
3. Un sistema visual coherente: tokens, componentes y estados.

## Sobre los archivos de diseño
`Emergent Sistema Visual.html` es una **referencia de diseño hecha en HTML**: muestra el aspecto y el comportamiento buscados. No es código para copiar. La tarea es recrearlo en el proyecto React existente, con sus patrones (Tailwind o CSS, componentes en `src/components`). Para abrir el archivo, ponelo junto a `support.js` y abrilo en el navegador.

## Fidelidad
**Alta fidelidad para tokens y componentes.** Colores, tipografía, espaciado, radios y estados son finales.
**Las pantallas de cada etapa no tienen mock todavía.** Se describen abajo con precisión suficiente para implementarlas.

---

## Orden de trabajo (un commit por paso)
1. `feat(ds): tokens y componentes base`. Tokens CSS, fuentes y los componentes Button, Input, StatusPill, CategoryTag, ConfidenceBar, StageRail, ReferenceCard, PatternCard, Swatch, LogEntry, EmptyState, LoadingState y ErrorState.
2. `refactor(app): arquitectura por etapas`. Agregar `stage` al estado, el riel de etapas, una vista por etapa y el panel acoplable único.
3. `feat(onboarding): brief integrado`. Eliminar `assets/onboarding.js` y crear `BriefStage.tsx`.
4. `feat(audit): auditoría de a un patrón`, con atajos de teclado y evidencia resaltada en el lienzo.
5. `feat(synthesis): sistemas por agrupación` y paleta inferida del corpus.
6. `feat(export): exportación unificada` y bitácora.
7. `chore(server): quitar Hugging Face`. Borrar FLUX/SDXL, `@huggingface/inference` y `HUGGINGFACE_TOKEN`.
8. `feat(motion): transiciones y estados`, respetando `prefers-reduced-motion`.

Después de cada paso: correr `npm run dev` y `npm run server`, recorrer el happy path y verificar que no haya errores en consola.

---

## Decisiones aprobadas por el autor
- **Quitar FLUX/SDXL (Hugging Face).** DALL·E 3 queda. Hay que eliminar `aiEngine === "huggingface_sdxl"`, el tipo `AIEngineType`, el selector de motor de la UI y la dependencia. Ver "Mejorar DALL·E" más abajo.
- **Reemplazar la paleta fija de `handleConsolidateVisualSystem`.** Hoy son `#18181b`, `#fafafa`, `#10b981`, `#6366f1` y `#f59e0b`, que no salen del corpus. La paleta nueva se infiere así:
  1. Tomar los colores de `reference.breakdown.colors` de las referencias que son evidencia de los patrones confirmados.
  2. Sumar los HEX que aparezcan en la descripción de los patrones de categoría `color`.
  3. Agrupar colores cercanos (distancia en Lab < 10) y ordenar por frecuencia.
  4. Quedarse con 4 a 6 colores, cada uno con `source` (el `refId` o `patternId` de origen).

  Si a una referencia le falta el breakdown, llamar a `/api/inspect-reference` antes de consolidar. Agregar `source?: string` al tipo del color de la paleta.
- **Los `suggestedSystems` del análisis quedan solo como sugerencias.** No se crean en `project.systems`. Se guardan en `project.suggestedSystems` (campo nuevo) y se muestran en Síntesis como "Sugerencia de la IA", con un botón "Adoptar". Un sistema real solo existe cuando el diseñador lo crea o adopta una sugerencia, y solo con patrones confirmados.
- **Integrar el onboarding.** Eliminar `assets/onboarding.js` y su `<script>` en `index.html`. El brief pasa a ser la Etapa 1, dentro de React y sin `window.location.reload()`. La edición del brief queda en un solo lugar: el menú de proyecto abre la Etapa 1.

## Cambios que NO se hacen
Se mantienen: la multi-proyecto en localStorage (`emergent_projects_list_v4`), los proyectos de ejemplo, los 4 endpoints (solo se recorta HF), la exportación .md / .json / PDF, la importación de sistemas desde JSON, el feedback y el caché del inspector.

---

## Arquitectura nueva

### Layout global (desktop ≥ 1024px)
```
┌ TopBar 56px ─────────────────────────────────────────────┐
│ [Proyecto ▾]     [StageRail 5 etapas]     [Bitácora] [?]  │
├──────────────────────────────────────────┬───────────────┤
│                                          │ DockPanel     │
│   Vista de la etapa (lienzo o página)    │ 380px, opc.   │
│                                          │               │
├──────────────────────────────────────────┴───────────────┤
│ ActionBar 64px: [estado / ayuda]          [CTA primario] │
└──────────────────────────────────────────────────────────┘
```
- **Una sola acción primaria por etapa**, siempre en la ActionBar inferior derecha. Es el único botón con fondo `#EDEDEF`.
- **Se elimina el Sidebar izquierdo.** La lista de referencias pasa a un modo "Lista" dentro del lienzo (toggle Lienzo/Lista arriba a la izquierda del lienzo).
- **Se elimina el RightPanel con pestañas.** En su lugar hay un `DockPanel` con un solo contenido según el contexto: inspector de referencia en Corpus, patrón actual en Auditoría, detalle del sistema en Síntesis. Cierra con `Esc`.
- Navbar actual → TopBar. Botones que salen de la TopBar: "Agregar refs" (pasa a Corpus), "Analizar" (pasa a la ActionBar), exportar (pasa a la Etapa 5) y los toggles de paneles.
- El marco de la tesis (`ThesisConceptModal`) queda detrás del botón `?` de la TopBar y se convierte en una vista "Acerca del método".

### Mobile y tablet (< 1024px)
- El StageRail se compacta a "04 / 05 · Auditoría" con un menú.
- El DockPanel se convierte en una hoja inferior (bottom sheet) al 70% de la altura.
- El lienzo se reemplaza por el modo Lista (grilla de 2 columnas).
- La ActionBar queda fija abajo. Áreas táctiles de 44px como mínimo.

### Estado nuevo en `App.tsx`
```ts
type Stage = 'brief' | 'corpus' | 'induction' | 'audit' | 'synthesis';
const [stage, setStage] = useState<Stage>(deriveStage(project));
const [dock, setDock] = useState<null | { kind: 'reference' | 'pattern' | 'system'; id: string }>(null);
const [auditIndex, setAuditIndex] = useState(0);
const [isLogOpen, setIsLogOpen] = useState(false);
```
`deriveStage`:
- Sin `name` u `objective` → `brief`.
- Sin patrones → `corpus`.
- Con patrones `detected` → `audit`.
- En otro caso → `synthesis`.

Se pueden visitar las etapas ya cumplidas. Las siguientes están bloqueadas hasta que se cumple su requisito.

Persistir `stage` por proyecto (`project.uiStage`) para que se recupere al recargar.

---

## Etapas

### 01 · Brief
- **Propósito:** definir nombre, objetivo y contexto.
- **Layout:** columna centrada de 560px como máximo, con padding vertical de 96px.
- **Contenido, de arriba a abajo:**
  - Label mono "01 · Brief" (12px, `#6B6B73`).
  - H1 "Definí el proyecto" (36px, peso 500, tracking -2%).
  - Párrafo en Newsreader 18px `#A1A1AA`: "Esta información orienta la lectura del corpus. Podés cambiarla después."
  - Tres campos Input, con gap de 20px:
    - Nombre *, con placeholder "Ej: KROM — Indumentaria utilitaria".
    - Objetivo *.
    - Contexto: textarea de 4 filas, marcado como opcional.
- **Ejemplos:** debajo del formulario, un link fantasma "Abrir un proyecto de ejemplo" con Burger Club y Badder.
- **CTA:** "Continuar al corpus". Se deshabilita mientras falte nombre u objetivo.
- **Validación:** el error aparece debajo del campo al salir de él (on blur), no al cargar la página.

### 02 · Corpus
- **Propósito:** cargar y organizar las referencias.
- **Lienzo:** fondo `#0B0B0D` con una retícula de puntos (`radial-gradient(rgba(255,255,255,.06) 1px, transparent 1px)`, 24px).
- **Zoom semántico** (ver la sección 06 del archivo de diseño):
  - Escala < 0.5 (lejos): la ficha muestra solo el bloque del color dominante (`breakdown.colors[role=predominant]` o el promedio de la imagen) y el ID corto.
  - Entre 0.5 y 1.2 (medio): imagen 4:5, ID en mono y nombre.
  - Escala > 1.2 (cerca): agrega las notas en Newsreader, la tira de paleta y las etiquetas.
- **Barra del lienzo** (flotante, arriba a la izquierda): toggle Lienzo/Lista · "Agregar referencias" (secundario) · zoom − / % / + / Ajustar.
- **Seleccionar una ficha** abre el DockPanel "Referencia", con:
  - La imagen.
  - Un campo de nombre editable.
  - Las notas.
  - La sección "Desglose", con el botón "Desglosar con IA" o el resultado: colores con su porcentaje, tipografía, textura, composición y recursos.
  - Las acciones Lightbox y Eliminar. Eliminar pide confirmación inline, no con `alert`.
- **Drag & drop** de archivos sobre el lienzo. Se mantiene `handleDropFiles`.
- **Estado vacío:** el componente EmptyState de la sección 09, centrado en el lienzo.
- **ActionBar:**
  - Texto de la izquierda: "8 referencias · 2 nuevas".
  - CTA: "Inducir patrones". Se habilita con 3 referencias o más; si hay patrones previos y referencias nuevas, dice "Reinducir con 2 nuevas".

### 03 · Inducción (estado transitorio, no es una pantalla que se visite)
- **Reemplaza `AnalysisProgressModal`:** no hay modal, el lienzo sigue visible.
- **Lienzo:** las fichas se atenúan al 40%. La ficha "en lectura" vuelve al 100% y recibe un borde de evidencia `oklch(0.74 0.09 250 / .7)`. Se recorren una por una, en un ciclo visual, mientras se espera la respuesta.
- **DockPanel:** muestra LoadingState (sección 09) con "INDUCCIÓN · n / N", el nombre de la referencia y la lista de categorías en curso.
- **ActionBar:** el CTA queda en estado "cargando" y aparece un botón fantasma "Cancelar" que llama a `AbortController.abort()`.
- **Error:** ErrorState en el panel. Deja la etapa en Corpus, con Reintentar.
- **Al terminar,** pasa a Auditoría con `auditIndex = 0`.

### 04 · Auditoría
- **Propósito:** juzgar cada hallazgo. Es el núcleo de la tesis.
- **Layout:** lienzo a la izquierda y DockPanel de 420px con la PatternCard del patrón actual (sección 07).
- **Navegación entre patrones:** arriba del panel, "← 2 de 6 →" y un filtro por estado (Pendientes / Todos / Confirmados / Descartados).
- **Evidencia en el lienzo:**
  - Las referencias de `pattern.evidence` quedan al 100% con borde azul de evidencia; el resto baja al 30%.
  - Se dibujan líneas SVG de 1px, en `rgba(255,255,255,.18)`, desde el centro de cada ficha de evidencia hasta un nodo con la etiqueta del patrón (pastilla mono).
  - El lienzo se encuadra automáticamente sobre la evidencia.
- **Acciones:**
  - **Confirmar** (`C`): marca el patrón como `confirmed` y avanza al siguiente pendiente. **Ya no abre `AssignSystemModal`:** la asignación a un sistema se mueve a Síntesis.
  - **Descartar** (`D`): despliega inline un Input "Motivo del descarte" (obligatorio) y "Guardar" (`Enter`). Se guarda en `discardReason` y en el feedback, como hoy.
  - **Anotar** (`N`): textarea inline que guarda en `designerNotes`.
  - **Navegación:** `←` / `→` para moverse, `Esc` para cerrar el input.
  - **Restaurar:** los patrones ya juzgados muestran "Restaurar a pendiente".
- **Toast** de 3 s en la ActionBar después de cada decisión, del tipo "Confirmado · pat_bc_02 · Deshacer".
- **ActionBar:**
  - Texto de la izquierda: "4 confirmados · 1 descartado · 1 pendiente".
  - CTA: "Pasar a síntesis". Se habilita con 1 confirmado o más; si quedan pendientes, muestra el aviso "quedan 1 sin juzgar" sin bloquear.

### 05 · Síntesis y lineamientos
- **Propósito:** armar sistemas divergentes y exportarlos.
- **Layout (sin lienzo), con dos columnas:**
  - Izquierda, 320px: "Patrones confirmados", como lista de fichas compactas que se pueden arrastrar.
  - Derecha: los sistemas en columnas comparables (2 o 3, con `minmax(300px,1fr)`).
- **Columna de sistema:**
  - Nombre editable.
  - La zona de soltado de patrones.
  - La paleta inferida, con Swatches (sección 08) que indican su `source`.
  - Pilares, reglas y la descripción en Newsreader.
  - Acciones: "Redactar con IA" (`/api/synthesize-system`), "Ver lineamientos" y "Eliminar".
  - En el texto redactado por la IA, cada pilar o regla muestra al pie las IDs de los patrones en mono (`← pat_bc_02`).
- **Rediseño v2 (ver `Emergent Síntesis v2.html`, sección B).** El sistema se muestra como tablero, no como texto corrido:
  1. **Banda de paleta** de 120px a sangre arriba de la tarjeta; cada color ocupa un ancho proporcional a su `percentage`, con HEX y `← ref_xx`.
  2. **Cabecera:** nombre 28/600, descripción recortada a una línea en Newsreader, acciones "Redactar con IA" (señal) y "Ver lineamientos".
  3. **Pilares** como tiles 4:5 con imagen de evidencia, familia, nombre en Newsreader 22 y `← pat_xx`.
  4. **Reglas** en pestañas por familia (Tipografía · Textura · Composición · Color). Cada regla es una ficha con: ejemplo visual arriba (espécimen tipográfico, recorte de evidencia o diagrama de retícula), código (`T1`, `X2`…), título imperativo de una línea, chips Sí / No de uso y trazabilidad. El texto largo de la IA queda como "fundamento", oculto por defecto con un toggle "Ver fundamentos".
  - **Cambio de esquema necesario:** `typographyRules`, `textureRules` y `compositionRules` pasan de `string[]` a `Rule[]`: `{ code, title, detail, use?: string[], avoid?: string[], example?: { kind: 'type'|'evidence'|'grid', text?, refIds? }, patternIds, refIds }`. Ajustar el prompt de `/api/synthesize-system` para que devuelva `title` corto (≤ 6 palabras) separado de `detail`. Mantener compatibilidad: si llega un string, usarlo como `detail` y derivar `title` de las primeras palabras.
  - Los ejemplos tipográficos usan la paleta del corpus y una display condensada genérica; los de textura recortan las imágenes de `refIds`.
- **Sugerencias:** las `suggestedSystems` aparecen como columnas fantasma (borde punteado en `--signal / .45`, pastilla "Sugerencia de la IA" en señal) con "Adoptar" y "Descartar". A la derecha, mosaico de 4 imágenes de evidencia y la banda de paleta; los pilares como chips con el color de su familia (sección C).
- **Asignación de patrones:** arrastrando, o con el teclado: foco en un patrón, `Enter`, elegir el sistema. Esto reemplaza `AssignSystemModal`.
- **"Ver lineamientos"** abre en pantalla completa la vista del manual, que es el contenido actual de `ExportBrandGuidelinesModal`, convertido en página con el sistema visual nuevo. Exportación unificada: PDF (print), .md, copiar y .json del sistema. Se elimina la exportación de la TopBar y de la pestaña Export.
- **Maqueta de verificación (DALL·E):** botón secundario dentro de los lineamientos, "Probar en una pieza". Abre la vista actual de `SystemApplicationView` simplificada: sin selector de motor y con DALL·E fijo. Va etiquetada en mono "VERIFICACIÓN EXTERNA · no forma parte del sistema".

### Bitácora (global)
- Se abre desde la TopBar como drawer derecho de 420px.
- Lista cronológica inversa de LogEntry (sección 08), con hora en mono, objetivo (ID), acción y motivo en Newsreader itálica.
- Fuentes: el `feedback` actual, más los eventos de confirmar, descartar, inducir, crear o adoptar un sistema y redactar. Agregar `project.log: LogItem[]` (`{id, at, kind, targetId, label, reason?}`).
- Se exporta dentro del .md académico.

---

## Design tokens

### Color
| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#0B0B0D` | Lienzo y página |
| `--surface` | `#111114` | Paneles y fichas |
| `--raised` | `#17171B` | Flotantes, ítem activo |
| `--border` | `rgba(255,255,255,.07)` | Borde base |
| `--border-strong` | `rgba(255,255,255,.14)` | Hover, secundarios |
| `--ink` | `#EDEDEF` | Texto primario, CTA |
| `--ink-2` | `#A1A1AA` | Texto secundario |
| `--ink-3` | `#6B6B73` | Metadatos e inactivos (no usar para texto de lectura) |
| `--pending` | `oklch(0.74 0.09 80)` | Detectado |
| `--confirmed` | `oklch(0.74 0.09 155)` | Confirmado |
| `--discarded` | `oklch(0.74 0.09 25)` | Descartado, error |
| `--signal` | `oklch(0.74 0.19 350)` | IA y trazabilidad: evidencia activa en el lienzo, chips `← pat_xx`, etapa actual, "Redactar con IA", sugerencias. **Reemplaza a `--evidence` (250).** |
| `--signal-ink` | `oklch(0.86 0.12 350)` | Texto sobre tinte de señal |
| texto sobre estado | `oklch(0.84 0.08 h)` | Texto de los botones de estado |

**Familias de categoría** (`oklch(0.80 0.11 h)`, texto `oklch(0.86 0.08 h)`): agrupan las 13 `PatternCategory` en 5 familias. Se usan en el CategoryTag, en un filete izquierdo de 3px de cada ficha de patrón y en las pestañas de reglas de Síntesis.
| Familia | h | Categorías |
|---|---|---|
| Tipografía | 285 | typography, flyer_poster |
| Composición | 230 | composition, geometry, graphic_elements |
| Materia | 60 | texture, packaging |
| Identidad | 110 | logo_identity, mascot_illustration |
| Imagen | 195 | photography_treatment, social_media, mood |
| Color | — | color: muestra 3 colores de la paleta del corpus |

Ver `Emergent Síntesis v2.html`, sección A.

**Reglas de color:**
- Sin degradados ni glows grandes. Eliminar las clases `glow-*`, `bg-gradient-*` y el logo con degradado.
- Punto de estado: 6–8px, con `box-shadow: 0 0 6px <color>`.
- Fondos tintados de los botones de estado: `<color> / .08`, que pasa a `/ .14` en hover. Borde: `<color> / .35`.
- El único relleno sólido de la interfaz es el CTA primario. Excepción: la paleta del corpus, que en Síntesis se muestra a sangre (ver abajo).

### Tipografía
Google Fonts: `Geist:400,500,600`, `Geist Mono:400,500` y `Newsreader:opsz 6..72, 400, 500, 400 italic`. **Quitar Plus Jakarta Sans y Space Grotesk.**

| Rol | Familia | Tamaño / peso / tracking |
|---|---|---|
| Display | Geist | 36 / 500 / -0.02em, lh 1.1 |
| H2 | Geist | 24 / 500 / -0.01em |
| H3 (patrón) | Geist | 18 / 500 / -0.01em, lh 1.3 |
| Lectura | Newsreader | 16–18 / 400, lh 1.5, `text-wrap: pretty` |
| UI | Geist | 14 / 400; etiquetas 13 / 500 |
| Dato | Geist Mono | 12 / 400–500, `font-variant-numeric: tabular-nums` |

**Mínimo absoluto: 12px.** Eliminar todos los `text-[10px]` y `text-[11px]`.

### Espaciado, forma y elevación
- **Espaciado:** escala de 4 · 8 · 12 · 16 · 20 · 24 · 32 · 48 · 72. Sin valores intermedios como `py-1.5` o `px-2.5`.
- **Radios:** 6px en controles e inputs, 10px en fichas y paneles, 999px en pastillas de estado, 4px en tags de categoría y kbd.
- **Sombra de flotantes:** `0 12px 32px -8px rgba(0,0,0,.6)`. **Sombra de fichas en el lienzo:** `0 8px 24px -12px rgba(0,0,0,.7)`.
- **Movimiento:**
  - 120ms en hover y foco; 180ms en paneles y pastillas; 240ms en el cambio de etapa.
  - Easing `cubic-bezier(.2,.7,.2,1)`. Animar solo `opacity` y `transform`.
  - Con `prefers-reduced-motion: reduce`, todo pasa a 0ms.

---

## Componentes (ver el archivo de diseño, secciones 04 a 09)

### Button
Altura de 36px (32px en la variante compacta), padding horizontal de 14px, radio de 6px, Geist 13/500.

| Variante | Fondo | Texto | Borde | Hover |
|---|---|---|---|---|
| primary | `#EDEDEF` | `#0B0B0D` | — | `#FFFFFF` |
| secondary | `#111114` | `#EDEDEF` | `--border-strong` | fondo `#17171B`, borde `.22` |
| ghost | transparente | `#A1A1AA` | — | fondo `rgba(255,255,255,.05)`, texto `#EDEDEF` |
| confirm | tinte `--confirmed` | `oklch(.84 .08 155)` | `--confirmed / .35` | tinte `.14` |
| discard | ídem con `--discarded` | | | |

Además:
- **Botones de solo ícono:** 36×36 con `aria-label` obligatorio.
- **kbd** dentro de los botones de estado: mono 12, padding 0 5px, radio 4, borde del color del estado.
- **Estado cargando:** spinner de 12px y el texto con el progreso ("Analizando 3/8").
- **Estado deshabilitado:** fondo transparente, borde `--border`, texto `#6B6B73`, `cursor: not-allowed`.

### Foco (global)
`:focus-visible { outline: 2px solid #EDEDEF; outline-offset: 3px; }` en todos los elementos interactivos. **Quitar el `select-none` global** del body y de `App`; dejarlo solo en el lienzo mientras se arrastra.

### Input
- 40px de alto, padding 0 12px, radio 6, fondo `#0B0B0D`, borde `rgba(255,255,255,.1)`.
- **Foco:** borde `.4` y `box-shadow: 0 0 0 3px rgba(255,255,255,.08)`.
- **Error:** borde `--discarded / .6` y mensaje de 12px en `oklch(.82 .08 25)`, vinculado con `aria-describedby`.
- **Label:** arriba, 13px `#A1A1AA`.

### StatusPill y CategoryTag
- **StatusPill:** 24px de alto, padding 0 9px, radio 999, borde `.1`, punto de 6px, texto de 12px.
- **CategoryTag:** mono 12, radio 4, borde `.1`.
- **Tendencia:** mono 12 sobre fondo `rgba(255,255,255,.05)`, con los textos "↑ reforzado", "+ nuevo", "↓ debilitado" y "= estable".

### StageRail
- `<nav aria-label="Etapas del método">` con 5 botones de `flex: 1 0 140px`.
- Cada botón muestra arriba, en mono 12, "01 · hecho / actual / bloqueado" con un punto, y debajo el label en 14/500.
- La etapa actual lleva fondo `#17171B` y `aria-current="step"`.
- Las etapas bloqueadas van con texto `#6B6B73`, `aria-disabled` y un tooltip que dice el requisito ("Necesitás 3 referencias").

### ReferenceCard
- Radio 10, fondo `#111114`, borde `--border`.
- Si es evidencia: borde `--evidence / .7`. Si está seleccionada: borde `#EDEDEF`.
- Tres niveles de zoom, como se describe en Corpus.

### PatternCard
Ancho máximo de 560px, con cuatro bloques separados por bordes `--border`:
1. **Cabecera:** ID y posición ("pat_bc_02 · 2 de 6") en mono; tag de categoría y pastilla de estado; título H3; descripción en Newsreader 16.
2. **Evidencia:** "Evidencia · n referencias" y la confianza en mono; grilla de 3 columnas con miniaturas 1:1, borde de evidencia e ID debajo. Al hacer clic en una miniatura, el lienzo enfoca esa ficha.
3. **Rasgos observables:** lista con viñetas de 13px.
4. **Acciones:** Confirmar · Descartar · Anotar (este último alineado a la derecha).

La hipótesis de sistema (`systemHypothesis`) va en un bloque plegable "Hipótesis de sistema".

### ConfidenceBar
Track de 4px en `rgba(255,255,255,.07)`, relleno `#EDEDEF` y el valor en mono a la derecha.

### Swatch
Bloque de 64px con el color, HEX en mono 12/500, nombre en 12px `#A1A1AA` y `← source` en mono `#6B6B73`.

### LogEntry
Línea vertical a la izquierda de 1px en `.1`, con un punto de estado en cada entrada. Contenido: hora e ID en mono 12 `#6B6B73`, la acción en 13/500 y el motivo en Newsreader 15 itálica `#A1A1AA`.

### EmptyState / LoadingState / ErrorState
Ver la sección 09 del archivo de diseño, con el copy exacto.
- **EmptyState:** borde punteado `.14`.
- **ErrorState:** `role="alert"`, tinte `--discarded / .05`, con las acciones Reintentar (primary) y Ver detalle (ghost).
- **Reemplazos:** el banner rojo global de `errorMessage` se reemplaza por ErrorState contextual en el panel, o por un toast en la ActionBar. Reemplazar también todos los `alert()`.

---

## Accesibilidad (checklist)
- **Contraste:** texto de lectura de 4.5:1 como mínimo (`#A1A1AA` sobre `#111114` = 7.4:1). `#6B6B73` solo se usa en metadatos o inactivos.
- **Teclado:** todo debe ser operable con el teclado. En el lienzo, `Tab` recorre las fichas, `Enter` abre el inspector y las flechas mueven la ficha 8px (16px con `Shift`).
- **`aria-live="polite"`** en la ActionBar, para los toasts y el progreso de la inducción.
- **DockPanel:** se comporta como `role="complementary"`. En mobile, la hoja inferior funciona como `role="dialog"` con *focus trap*.
- **`scrollIntoView` en `handleFocusReferenceOnCanvas`:** reemplazarlo por un paneo del lienzo, ajustando su transform o `scrollTo`.
- **`alt`** con el nombre de la referencia en todas las imágenes.

---

## Mejorar DALL·E (`/api/generate-application`)
Los resultados salen pobres por tres motivos:
1. El prompt mezcla reglas largas en español con instrucciones `--no` estilo Midjourney, que DALL·E ignora.
2. No usa las imágenes del corpus.
3. Fuerza 1:1.

Propuesta, sin cambiar de proveedor:
- **Reescribir el prompt maestro en inglés, corto y descriptivo.** Estructura: sujeto · soporte o formato · paleta HEX (3 o 4 colores) · una regla tipográfica · una regla de textura · la composición. Sin `--no`; las restricciones se expresan en positivo ("flat 2D print on plain background").
- **Pedir `quality: "hd"` y `style: "natural"`**, que dan menos look "render", y elegir el tamaño según el soporte: `1024x1792` para afiches y `1792x1024` para fachadas.
- **Opcional, con mejora fuerte:** usar `gpt-image-1` (mismo `OPENAI_API_KEY`) con el endpoint `images/edits`, pasando 2 o 3 referencias de evidencia como imágenes de entrada. Así el resultado hereda textura y paleta reales. Requiere verificar la organización de OpenAI.
- **Devolver siempre `promptUsed`** y mostrarlo en la UI, para la trazabilidad.

## Server: cambios puntuales
- Quitar el import de `InferenceClient` y la rama `huggingface_sdxl`.
- Quitar `@huggingface/inference` de `package.json`.
- En `/api/analyze-references` no cambia nada del lado del servidor. El cliente guarda `suggestedSystems` en `project.suggestedSystems` y no en `systems`.
- El SVG de respaldo se puede mantener como último recurso si DALL·E falla, etiquetado "Boceto vectorial de respaldo".

---

## Assets
- **Imágenes:** las de los proyectos de ejemplo son URLs de Unsplash, ya definidas en `src/data/sampleProjects.ts`.
- **Íconos:** se sigue con `lucide-react`, a 16px y `stroke-width` 1.5, siempre acompañados de texto o `aria-label`.
- **Logo:** se elimina el logo "EM" con degradado. En su lugar va el texto "Emergent" en Geist 14/600.

## Archivos
- `Emergent Sistema Visual.html`: referencia de alta fidelidad de tokens y componentes, con sus estados. El zoom semántico es interactivo en la sección 06.
- `support.js`: runtime necesario para abrir el HTML localmente.
