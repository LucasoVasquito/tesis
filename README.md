# Camaleón

Camaleón es una tesis de Diseño Multimedial (UNLP). La app convierte un conjunto de imágenes de referencia en un sistema visual verificable. **El usuario ubica; el agente analiza y completa.** Lo que ubica el usuario pesa más que lo que ubica el agente, y el agente nunca lo mueve: solo avisa. Lo que ubica el agente es una *sugerencia* hasta que el usuario la confirma.

## Configuración

1. Instalá [Node.js](https://nodejs.org) 20 o posterior.
2. En la carpeta del proyecto: `npm install`.
3. Copiá `.env.example` como `.env` y completá las claves:
   - **`GEMINI_API_KEY`** (obligatoria): analiza las referencias, redacta el brief, separa piezas, lee los colores y revisa si lo generado respeta el Núcleo. Se saca en Google AI Studio.
   - **`OPENAI_API_KEY`**: solo para *Probar en un ejemplo* (03 PROBAR).
4. Abrí la app con `iniciar.bat` (Windows) o, en dos terminales, `npm run server` y `npm run dev`. Después entrá a `http://localhost:5173`.

Si al analizar aparece *"Falta la clave del agente"*, falta `GEMINI_API_KEY` en el `.env`.

## Cómo se usa: tres pantallas

Arriba al centro: **01 MOODBOARD · 02 SISTEMA · 03 PROBAR**. Cada pantalla tiene un botón principal grande.

### 01 · Moodboard

Una escena con tres capas apiladas y, a la derecha, el panel de referencias.

| Capa | Qué va |
|---|---|
| **Capa 1 · Núcleo** | lo que define el sistema |
| **Capa 2 · Soporte** | lo que lo acompaña |
| **Capa 3 · Acento** | detalles que aparecen poco y dan carácter |

- **La capa activa** está de frente y es la única con interacción. Las otras dos asoman detrás, desplazadas y difuminadas, con su rótulo siempre nítido. A la derecha, las marcas 1 · 2 · 3 indican en qué capa estás. Se cambia con la rueda, **W / S**, un clic en el borde o el rótulo de una capa que asoma, o las marcas.
- **El panel de referencias** recibe todo lo nuevo (arrastrar, ⌘V, *+ Imágenes* o *Por URL*). Una referencia se ubica arrastrándola a la capa activa, soltándola sobre otra capa, o con **1 / 2 / 3**. Para devolverla al panel: arrastrarla de vuelta o **X**. Lo que ubica el usuario lleva borde lleno y la etiqueta **USUARIO**; dentro de su capa se mueve y se agranda libremente.
- **ANALIZAR REFERENCIAS [⏎]:** el agente analiza todas las referencias, extrae las piezas, las agrupa en patrones y ubica en capas lo que quedó en el panel. Nunca mueve lo que ubicó el usuario. Lo suyo lleva borde fino punteado y la etiqueta **AGENTE · SUGERENCIA**: el usuario lo confirma (⏎), lo mueve (↑ ↓) o lo saca (X).
- **El agente notó:** una franja, de a un aviso, cuando algo contradice la evidencia (por ejemplo, ubicaste una pieza en Acento pero aparece en 18 de 39 referencias). Nunca bloquea.
- **Patrones:** con varios elementos de la capa seleccionados (⇧ + clic), **G** crea un patrón con nombre editable. Lleva USUARIO y su propio peso; el agente puede sumarle evidencia, pero no lo desarma.

### Peso: el usuario sobre el agente

`peso = pesoCapa × pesoOrigen`

| | Peso |
|---|---|
| Capa | Núcleo 3 · Soporte 2 · Acento 1 |
| Origen | USUARIO 2 · AGENTE confirmado 1,5 · AGENTE sin confirmar 1 |

El peso ordena cada capa, el Sistema, los Lineamientos y la receta de Probar. En un conflicto gana la ubicación del usuario y el aviso del agente queda en la bitácora.

### Color camaleón

Antes del primer análisis la interfaz usa tres neutros cálidos. Después, los colores de capa (`--capa-1`, `--capa-2`, `--capa-3`) salen de la paleta del proyecto: el Núcleo toma el color de más peso entre sus piezas; Soporte y Acento, los siguientes tonos a más de 40° de los ya elegidos. Solo se conserva el tono: la luminosidad y la saturación son fijas por capa (Núcleo L 0,80 C 0,09 · Soporte L 0,74 C 0,07 · Acento L 0,68 C 0,06), así nunca grita y siempre contrasta. El cambio se anima ~800 ms. El color de capa se usa solo en detalles (rótulos, filetes, bordes, indicador).

### 02 · Sistema

Una página editorial oscura en grilla de 12 columnas: el Núcleo titula (columnas 1–8, nombre grande y regla completa), el Soporte se desarrolla debajo en tarjetas y el Acento anota al margen (columnas 9–12). Las sugerencias del agente llevan su etiqueta; lo del usuario, `USUARIO`. Al pasar el mouse se ve de qué referencias sale cada cosa. A la derecha: **Lineamientos**, **Prompt**, **Imagen** y, aparte, **Probar en un ejemplo**.

Los nombres de las piezas son cortos (2 a 4 palabras) y el detalle va en la descripción.

### 03 · Probar

Verifica el sistema aplicándolo a una pieza concreta, no genera por generar. Tres columnas:

1. **La pieza:** tipo (Logotipo, Fachada, Packaging, Afiche, Post, Story, Web u Otra), formato sugerido, texto que aparece y pedido libre.
2. **La receta:** qué parte del sistema se usa, por capa y por peso. El Núcleo entra entero y no se desmarca; el agente preselecciona 1 o 2 piezas de Soporte que tienen sentido para ese tipo de pieza y, solo si aplica, un Acento. Máximo 5 decisiones. *Ver pedido completo* muestra el prompt final.
3. **Los resultados:** las variantes, cada una con ✓ respetada / ✕ no respetada por cada pieza del Núcleo (lo evalúa el agente con visión), y los botones **Aprobar**, **Otra variante** y **Descargar**. Un switch chico alterna entre *Con el sistema* y *Directo* para comparar.

El pedido sigue siempre este orden: tipo de pieza y formato → Núcleo (obligatorio) → Soporte (secundario) → Acento (detalle menor) → paleta en proporción según la capa → texto y pedido libre → restricciones. Las imágenes de las piezas del Núcleo (como máximo 3, priorizando las del usuario) viajan como referencia visual. El logo aprobado se reutiliza en las demás piezas.

## Atajos (aceleran, nunca son la única forma)

| Tecla | Acción |
|---|---|
| Rueda · W / S | cambiar de capa |
| 1 / 2 / 3 | mandar a una capa lo elegido |
| ← / → | elegir elemento |
| ⏎ | confirmar sugerencia / analizar |
| ↑ / ↓ | mover de capa |
| X | devolver al panel o sacar |
| G | crear patrón con la selección |
| Espacio | ver el sistema / volver |
| Esc | soltar la selección |
| ⌘V | pegar imágenes |

## Identidad visual (dirección 1c «Gráfica»)

Color plano, tipografía dura y capas como señales: vacío `oklch(0.17 0.012 265)`, hueso `#F2EFE8`. La marca se escribe CAMALEÓN, en Archivo 900 condensada; Geist Mono para datos. Respeta `prefers-reduced-motion` (entre capas, un fundido de 150 ms). Referencia: `design_handoff_emergent_rework/Tesis Identidad Visual.dc.html`.

## Estructura

- `src/screens/`: `MoodboardScreen` (01), `SystemScreen` (02), `ProbarScreen` (03), `PieceDialogs` (unir, separar, recortar), `Guide` y piezas comunes.
- `src/pieces/model.ts`: piezas, referencias y patrones en capas, el peso, las acciones y los avisos de *El agente notó*. `analyze.ts`: el pedido de análisis.
- `src/utils/camaleon.ts`: el color camaleón. `probar.ts`: la receta y el pedido de 03 PROBAR. `layerRules.ts`, `stackExport.ts`: reglas por capa, paleta, prompt y lineamientos.
- `src/utils/projectStore.ts`: los proyectos se guardan en IndexedDB del navegador (los de localStorage se migran solos). El esquema 5 migra los proyectos anteriores: lo que escribió el diseñador queda como `user`; lo demás, como `agent`.
- `server.ts`: `/api/analyze-references`, `/api/draft-brief`, `/api/split-piece`, `/api/inspect-reference`, `/api/generate-application`, `/api/check-core`.

Stack: React 19 + TypeScript + Vite + Tailwind 4 · Express 5 · Gemini · OpenAI.
