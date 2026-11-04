# Tesis

Tesis de Diseño Multimedial (UNLP). La app convierte un corpus de imágenes de referencia en un sistema visual verificable. **La IA analiza y propone; el diseñador decide y conserva la autoría.** Nada que proponga la IA se confirma solo: queda como sugerencia hasta que el diseñador hace un gesto (↑↓, 1/2/3 o ⏎).

Stack: React 19 + TypeScript + Vite + Tailwind 4 · Express 5 · Gemini (análisis) · OpenAI / DALL·E (generación de piezas).

## El concepto: una pila de tres láminas

El sistema visual es una pila de láminas transparentes en el espacio. La jerarquía es la profundidad: lo más importante va adelante y se ve más grande por perspectiva. No hay escalado manual.

| Lámina | Lugar | Qué hace | Señal |
|---|---|---|---|
| **01 · Núcleo** | adelante | define el sistema | naranja, bloque lleno |
| **02 · Soporte** | al medio | lo acompaña | hueso, línea y rótulo |
| **03 · Acento** | atrás | aparece poco y da carácter | azul, línea y rótulo |
| **Corpus** | al fondo | las imágenes originales, en gris | — |

La pila se mira **de costado** (para ordenar) o **de frente** (la síntesis, como página editorial). **Espacio** gira entre las dos.

## Tres momentos

1. **01 · Armar.** Una frase de intención («Hamburguesería cruda, de barrio») y la IA redacta el brief, que se puede editar. Las imágenes que se sueltan o pegan caen al corpus. **D** desglosa la imagen elegida en fragmentos (la IA propone recortes y lámina; el diseñador corrige). **↑ / ↓** llevan cada fragmento a una lámina; **G** agrupa; **P** convierte el grupo en patrón con nombre.
2. **02 · Revelar.** La IA busca los patrones del diseñador en todo el corpus y les suma evidencia («14/24 refs»). Lo que se repite y nadie marcó llega como **NO LO MARCASTE**, sin lámina, hasta que se ubica (**1 / 2 / 3**) o se descarta (**X**). El **espejo** muestra en una línea cuándo la lámina elegida contradice la evidencia. **A** abre las evidencias de un patrón (auditar). Al elegir un patrón se iluminan sus referencias en el corpus.
3. **03 · Girar.** La pila de frente: el núcleo titula, el soporte desarrolla en columnas y el acento anota al margen. Desde acá se exportan los lineamientos (.md), el prompt de DALL·E y la imagen de la página (.png), y se generan piezas con DALL·E (**I**).

## La lámina cambia el resultado

- **DALL·E:** el prompt va en orden de lámina. El núcleo primero y dominante, el soporte después y el acento al final, como detalle menor.
- **Lineamientos:** el núcleo lleva una regla completa con ejemplos, el soporte una regla corta y el acento una línea. Lo que no se auditó lleva la marca `[SIN AUDITAR]`.
- **Paleta:** sale del corpus (los colores desglosados de la evidencia). El orden y la proporción siguen la lámina; si hay patrones de color en la pila, mandan ellos.

## Teclado

La barra de atajos de abajo cambia según el momento. Todo se puede hacer sin mouse.

| Tecla | Acción |
|---|---|
| Rueda / trackpad | moverse en profundidad (Z) |
| W / S | cambiar de lámina (W hacia el fondo, S hacia el núcleo) |
| ← / → | elegir patrón, fragmento o referencia · con ⇧ suma a la selección |
| ↑ / ↓ | mover lo seleccionado de lámina |
| D | desglosar la imagen elegida |
| G | agrupar la selección |
| P | crear patrón desde el grupo |
| A | auditar (abrir evidencias) |
| 1 / 2 / 3 | ubicar un patrón revelado |
| X | descartar · sobre una referencia, dos veces la borra |
| ⏎ | aceptar la propuesta de la IA |
| Espacio | girar costado ↔ frente |
| E / I | (de frente) exportar · generar con DALL·E |
| Esc | soltar la selección o salir del modo actual |

## Identidad visual (dirección 1c «Gráfica»)

Color plano, tipografía dura y láminas como señales (Wipeout, The Designers Republic). Sin brillos, desenfoques ni glassmorphism. Valores en `src/index.css`:

- Vacío `oklch(0.17 0.012 265)` · Hueso `#F2EFE8` · Naranja `oklch(0.7 0.19 45)` · Azul `oklch(0.62 0.2 262)`
- **Archivo** (eje de ancho): nombres 900 / 62 % en mayúsculas, rótulos 800 / 75 % / .04em, textos 400. **Geist Mono** para datos.
- Respeta `prefers-reduced-motion`.

Referencia: `design_handoff_emergent_rework/Tesis Identidad Visual.dc.html`.

## Cómo correrla

```bash
npm install
cp .env.example .env   # GEMINI_API_KEY y OPENAI_API_KEY
npm run server         # backend en :3000
npm run dev            # frontend en :5173
```

En Windows, `iniciar.bat` abre los dos.

## Estructura

- `src/space/`: la pila. `StackScene` (CSS 3D), `SpaceView` (navegación y atajos), `Breakdown` (desglose), `RevealHud` (revelado, espejo, auditoría), `FrontPage` (vista de frente), `ExportBar`, `actions.ts` (acciones puras de la pila), `reveal.ts` (búsqueda en el corpus).
- `src/utils/layers.ts`, `layerRules.ts`, `stackExport.ts`: láminas, reglas por lámina, paleta, prompt y lineamientos.
- `src/hooks/useAuditShortcuts.ts`: el sistema único de atajos (`useShortcuts`).
- `server.ts`: `/api/draft-brief`, `/api/segment-reference`, `/api/analyze-references` (acepta `stackPatterns`), `/api/inspect-reference`, `/api/generate-application` (acepta `stack`).

## Datos

Los proyectos viven en `localStorage` (claves `emergent_*`, heredadas del nombre anterior para no perder proyectos). Los proyectos de versiones anteriores se migran solos: las partes recortadas pasan a ser fragmentos, los patrones confirmados entran a la pila sin lámina (⏎ acepta la propuesta) y los pendientes de la IA llegan como revelados. Se guardan siempre la lámina que propuso la IA y la que eligió el diseñador: el espejo necesita las dos.

## Fuera de alcance por ahora

Profundidad continua más allá del imán a tres láminas · historial de sesgos entre proyectos · usar el estado a mitad del giro como vista de trabajo · modo presentación automático · sonido.
