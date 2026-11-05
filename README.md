# Camaleón

Camaleón es una tesis de Diseño Multimedial (UNLP). La app convierte un conjunto de imágenes de referencia en un sistema visual verificable. **El agente propone primero y el diseñador corrige.** Nada se confirma solo: lo que ubica el agente es una *sugerencia* (borde punteado) hasta que el diseñador la confirma.

## Configuración

1. Instalá [Node.js](https://nodejs.org) 20 o posterior.
2. En la carpeta del proyecto: `npm install`.
3. Copiá `.env.example` como `.env` y completá las claves:
   - **`GEMINI_API_KEY`** (obligatoria): analiza las referencias, redacta el brief, separa piezas y lee los colores. Se saca en Google AI Studio.
   - **`OPENAI_API_KEY`**: solo para *Generar con DALL·E*.
4. Abrí la app con `iniciar.bat` (Windows) o, en dos terminales, `npm run server` y `npm run dev`. Después entrá a `http://localhost:5173`.

Si al analizar aparece *"Falta la clave del agente"*, falta `GEMINI_API_KEY` en el `.env`.

## Cómo se usa: tres pantallas

Arriba al centro: **01 SUBIR · 02 ORDENAR · 03 SISTEMA**. Cada pantalla tiene un botón principal grande, abajo a la derecha.

**01 · Subir.** Escribís una frase de intención («hamburguesería cruda, de barrio») y el agente redacta el brief (se edita en *ver brief*). Subís tus imágenes (arrastrar, ⌘V o *+ Imágenes*). Con 6 referencias o más, **ANALIZAR**: en una sola pasada, el agente arma las piezas (tipografía, textura, color, personaje, composición), junta las que se repiten, cuenta en cuántas referencias aparece cada una y las ubica en una capa.

**02 · Ordenar.** Tres capas, de adelante hacia atrás:

| Capa | Qué va |
|---|---|
| **01 Núcleo** | lo que define el sistema |
| **02 Soporte** | lo que lo acompaña |
| **03 Acento** | detalles que aparecen poco y dan carácter |

La capa activa se ve de frente; las otras, como bordes detrás. Cada pieza muestra sus botones: **[⏎] Confirmar**, **[↑] Subir**, **[↓] Bajar**, **[X] Sacar** y **···** (unir, separar, renombrar, recortar de nuevo). Al elegir una pieza se iluminan las referencias de donde sale. **El agente notó** avisa en una línea cuando algo contradice la evidencia o una pieza repetida quedó sin capa; nunca bloquea. Lo que sacás va a *Fuera del sistema* y se puede recuperar.

**03 · Sistema.** La misma pila, de frente, como página: el Núcleo titula, el Soporte desarrolla en columnas y el Acento anota al margen. Las sugerencias sin confirmar aparecen en punteado. Al pasar el mouse se ve de qué referencias sale cada cosa. Desde acá: **Lineamientos**, **Prompt DALL·E**, **Imagen** y **Generar con DALL·E**.

La primera vez se abre el proyecto de ejemplo (Badder) ya ordenado, con una guía de tres carteles. **? Ayuda** la vuelve a mostrar.

## La capa cambia el resultado

- **DALL·E:** el pedido va en orden de capa; el Núcleo primero y dominante, el Acento como detalle menor.
- **Lineamientos:** el Núcleo lleva la regla completa con ejemplos, el Soporte una regla corta y el Acento una línea. Las sugerencias sin confirmar salen marcadas.
- **Paleta:** sale de los colores de tus referencias; el orden y la proporción siguen la capa.

## Atajos (aceleran, nunca son la única forma)

| Tecla | Acción |
|---|---|
| Rueda · W / S | cambiar de capa |
| ← / → | elegir pieza |
| ⏎ | confirmar |
| ↑ / ↓ | subir o bajar de capa |
| X | sacar del sistema |
| Espacio | ver el sistema / volver a ordenar |
| Esc | soltar la selección |
| ⌘V | pegar imágenes (en 01 Subir) |

## Identidad visual (dirección 1c «Gráfica»)

Color plano, tipografía dura y capas como señales: vacío `oklch(0.17 0.012 265)`, hueso `#F2EFE8`, naranja `oklch(0.7 0.19 45)` (Núcleo), azul `oklch(0.62 0.2 262)` (Acento y avisos del agente). Archivo (eje de ancho) para nombres y rótulos; Geist Mono para datos. Respeta `prefers-reduced-motion`. Referencia: `design_handoff_emergent_rework/Tesis Identidad Visual.dc.html`.

## Estructura

- `src/screens/`: `UploadScreen` (01), `OrderScreen` (02), `SystemScreen` (03), `PieceDialogs` (unir, separar, recortar), `Guide` y piezas comunes.
- `src/pieces/model.ts`: qué es una pieza o una sugerencia, la capa que sugiere la evidencia, las acciones y los avisos de *El agente notó*. `analyze.ts`: el pedido de análisis.
- `src/utils/layerRules.ts`, `stackExport.ts`: reglas por capa, paleta, prompt y lineamientos.
- `src/utils/projectStore.ts`: los proyectos se guardan en IndexedDB del navegador (los de localStorage se migran solos).
- `server.ts`: `/api/analyze-references`, `/api/draft-brief`, `/api/split-piece`, `/api/inspect-reference`, `/api/generate-application`.

Stack: React 19 + TypeScript + Vite + Tailwind 4 · Express 5 · Gemini · OpenAI.
