# Camaleon Corpus

Camaleon Corpus es una tesis de Diseño Multimedial (UNLP). La app convierte un conjunto de imágenes de referencia en un sistema visual verificable. **El usuario ubica; el agente analiza y completa.** Lo que ubica el usuario pesa más que lo que ubica el agente, y el agente nunca lo mueve: solo avisa. Lo que ubica el agente es una *sugerencia* hasta que el usuario la confirma.

## Configuración

1. Instalá [Node.js](https://nodejs.org) 20 o posterior.
2. En la carpeta del proyecto: `npm install`.
3. Copiá `.env.example` como `.env` y completá las claves:
   - **`GEMINI_API_KEY`** (obligatoria): analiza las referencias, redacta el brief, separa piezas, lee los colores y revisa si lo generado respeta el Núcleo. Se saca en Google AI Studio.
   - **`OPENAI_API_KEY`**: solo para *Probar en un ejemplo* (03 PROBAR).
4. Abrí la app con `iniciar.bat` (Windows) o, en dos terminales, `npm run server` y `npm run dev`. Después entrá a `http://localhost:5173`.

Si al analizar aparece *"Falta la clave del agente"*, falta `GEMINI_API_KEY` en el `.env`.

## Cómo se usa: cinco etapas

A la izquierda, la barra de etapas: **01 Referencias · 02 Revisar · 03 Capas · 04 Sistema · 05 Probar**. Las cinco se pueden abrir cuando se quiera; la que todavía no corresponde explica por qué está bloqueada. Cada una muestra su estado: completa (con un resumen), actual, pendiente, bloqueada, desactualizada (`!`, porque cambiaste algo antes) o «Estabas acá». Abajo, una barra flotante con solo las acciones de la etapa y un botón primario.

Arriba, al centro, una **línea de estado** dice siempre dónde estás, qué está haciendo el sistema (analizando, generando, revisando el Núcleo) o que volviste atrás, con un botón para seguir donde estabas. A la derecha, el guardado (`Guardando…` / `✓ Guardado`, real: cada cambio se persiste en el navegador). **Ctrl/Cmd + Z** deshace (hasta 40 pasos) y los avisos de lo que hiciste traen el botón *Deshacer*.

### 01 · Referencias
Un lienzo infinito tipo Miro con fondo de puntos. La rueda hace zoom en el cursor, arrastrar el fondo desplaza, arrastrar una imagen la mueve y, con la imagen elegida, las manijas de las esquinas la redimensionan (⇧ la deforma). `Supr` borra, `+` / `−` zoom y `0` ajusta la vista. Se carga arrastrando archivos, pegando una URL o una imagen (Ctrl+V) o con *+ Imagen*. **Analizar** pide al menos 5 referencias; después el botón principal pasa a *Seguir en Revisar* y *Volver a analizar* pide confirmar.

### 02 · Revisar
Una sugerencia del agente por vez: imagen, nombre, en cuántas referencias aparece y cuatro botones (Núcleo, Soporte, Acento, Descartar; el de la capa sugerida es el principal). Una mini pila 3D muestra dónde entraría. Al terminar no salta a otra etapa: muestra el resumen y las **Descartadas**, que se pueden recuperar.

### 03 · Capas
La única etapa con profundidad: un recorrido en primera persona. La rueda, ↑ ↓ o 1 · 2 · 3 mueven la cámara entre Núcleo, Soporte y Acento. Se elige una pieza con un clic, se manda a otra capa con 1 · 2 · 3, con los tres puntos de color al pasar el mouse o arrastrándola hacia arriba o abajo. La vista *General* es la pila isométrica.

### 04 · Sistema
Una columna de lectura de 720 px: el Núcleo titula con su imagen en 16:9, el Soporte va en tres columnas y el Acento en una fila de miniaturas. Desde la barra inferior: **Lineamientos**, **Prompt** e **Imagen**.

### 05 · Probar
Dos columnas: a la izquierda *Paso 1 · La pieza* y *Paso 2 · La receta* (sale sola de las capas; *Editar* abre el detalle); a la derecha *Paso 3 · Resultado*, con dos variantes. Cada una trae el control del Núcleo (✓ / ✕ por pieza), **Aprobar** y **Descargar**. Si una variante falla, se reintenta solo esa.

### Peso: el usuario sobre el agente

`peso = pesoCapa × pesoOrigen`

| | Peso |
|---|---|
| Capa | Núcleo 3 · Soporte 2 · Acento 1 |
| Origen | USUARIO 2 · AGENTE confirmado 1,5 · AGENTE sin confirmar 1 |

El peso ordena cada capa, el Sistema, los Lineamientos y la receta de Probar.

### Color camaleón
Antes del primer análisis la interfaz usa coral, mostaza y turquesa. Después, el tono de cada capa sale de la paleta del proyecto; la luminosidad y la saturación son fijas por capa (Núcleo L 0,68 C 0,14 · Soporte L 0,80 C 0,12 · Acento L 0,74 C 0,09). El cambio se anima ~800 ms.

### Errores
Cada error dice la causa en lenguaje simple y trae una acción: imagen que no se pudo leer (*Ver cuál*, la marca con borde rojo en el lienzo), URL inválida, análisis cortado y variante que no se generó (*Reintentar*).

## Atajos (aceleran, nunca son la única forma)

| Tecla | Acción |
|---|---|
| ⏎ | botón principal de la etapa |
| Ctrl/Cmd + Z | deshacer |
| 1 / 2 / 3 | Revisar: asignar a una capa · Capas: ir a una capa o mover la pieza elegida |
| X | Revisar: descartar |
| ↑ / ↓ | Capas: más cerca / más lejos |
| Supr · + · − · 0 | Referencias: borrar · zoom · ajustar |
| Esc | soltar la selección |
| Ctrl+V | pegar imágenes o una URL |

## Identidad visual (dirección 1c «Gráfica»)

Color plano, tipografía dura y capas como señales: vacío `oklch(0.17 0.012 265)`, hueso `#F2EFE8`. La marca se escribe CAMALEON CORPUS, en Archivo 900 condensada; Geist Mono para datos. Respeta `prefers-reduced-motion` (entre capas, un fundido de 150 ms). Referencia: `design_handoff_emergent_rework/Tesis Identidad Visual.dc.html`.

## Estructura

- `src/screens/`: `ReferencesScreen` (01), `ReviewScreen` (02), `LayersScreen` (03), `SystemScreen` (04), `ProbarScreen` (05), `Guide` y piezas comunes. `src/components/shell/`: barra superior, barra de etapas, barra inferior y avisos. `src/utils/steps.ts`: estado de las etapas.
- `src/pieces/model.ts`: piezas, referencias y patrones en capas, el peso, las acciones y los avisos de *El agente notó*. `analyze.ts`: el pedido de análisis.
- `src/utils/camaleon.ts`: el color camaleón. `probar.ts`: la receta y el pedido de 03 PROBAR. `layerRules.ts`, `stackExport.ts`: reglas por capa, paleta, prompt y lineamientos.
- `src/utils/projectStore.ts`: los proyectos se guardan en IndexedDB del navegador (los de localStorage se migran solos). El esquema 5 migra los proyectos anteriores: lo que escribió el diseñador queda como `user`; lo demás, como `agent`.
- `server.ts`: `/api/analyze-references`, `/api/draft-brief`, `/api/split-piece`, `/api/inspect-reference`, `/api/generate-application`, `/api/check-core`.

Stack: React 19 + TypeScript + Vite + Tailwind 4 · Express 5 · Gemini · OpenAI.
