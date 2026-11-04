# Prompt para Claude Code · Rework "Tesis"

Copiá todo lo que sigue debajo de la línea.

---

## Contexto

Trabajás sobre el repo `LucasoVasquito/tesis` (rama `main`). Stack: React 19 + TypeScript + Vite. Es mi tesis de Diseño Multimedial. El nombre provisorio de la app es **Tesis** (antes "Emergent"): cambialo en toda la interfaz.

La app convierte un corpus de imágenes de referencia en un sistema visual verificable. La IA analiza y propone; el diseñador decide y conserva la autoría. La IA nunca genera el sistema por su cuenta: todo lo que propone queda como sugerencia hasta que el diseñador lo confirma.

Antes de tocar código, leé en este orden:
1. Este documento, de punta a punta.
2. `design_handoff_emergent_rework/README.md`: rework anterior. **Siguen vigentes:** se elimina FLUX y queda DALL·E (con la sección "Mejorar DALL·E"), la paleta sale del corpus y no de colores fijos, y las sugerencias de la IA no se confirman solas. **Quedan reemplazados por este documento:** las 5 etapas en riel, el lienzo plano y el sistema visual gris neutro.
3. `Tesis Identidad Visual.dc.html`, sección 2 (pantallas 2a a 2d) y opción 1c: es la referencia visual obligatoria. Abrilo en el navegador.
4. El código actual: `src/utils/stages.ts`, `src/hooks/useAuditShortcuts.ts`, `src/components/canvas/CanvasArea.tsx` y `src/types.ts`.

Si algo de este documento choca con el código existente, frená y preguntame antes de decidir.

## El concepto

La app deja de ser un moodboard plano (no tiene que parecerse a Miro). El sistema visual es **una pila de tres láminas transparentes en el espacio**. La jerarquía es la profundidad: lo más importante va adelante.

- **01 · Núcleo**, adelante: define el sistema.
- **02 · Soporte**, al medio: lo acompaña.
- **03 · Acento**, atrás: aparece poco y da carácter.
- **Corpus**, al fondo de todo: las imágenes originales, apagadas. Es el suelo del que sale el sistema.

La pila se mira de dos maneras:
- **De costado:** ves las láminas separadas en profundidad. Acá ordenás.
- **De frente:** mirás a través de las láminas y ves el sistema compuesto como una página editorial. **Esta vista es la Síntesis.** No es una pantalla aparte: es la misma pila girada.

La tecla **Espacio** gira entre las dos vistas, con una animación de unos 500 ms.

El tamaño sale solo de la profundidad: lo que está adelante se ve más grande por perspectiva. No hay escalado manual.

## El flujo: tres momentos

Reemplaza las 5 etapas. No hay riel de etapas: hay un indicador de momento (`01 ARMAR · 02 REVELAR · 03 GIRAR`).

### 01 · Armar (pantallas 2a y 2b)
- **Estado vacío (2a):** un campo con una frase de intención ("Hamburguesería cruda, de barrio") y una zona para soltar imágenes. Las tres láminas vacías ya están visibles en el espacio. La IA redacta el brief completo a partir de la frase, y el diseñador puede editarlo después.
- Las imágenes soltadas caen al corpus, al fondo. Ahí todavía no pesan nada.
- **Desglose (2b):** con una imagen seleccionada, **D** la separa en fragmentos con la herramienta integrada: textura, tipografía, color, sello o mascota, etc. La IA propone los recortes y el diseñador los corrige.
- El diseñador lleva cada fragmento a una lámina. El movimiento es continuo, pero se imanta a las tres láminas.
- **Agrupar (G):** los fragmentos seleccionados quedan unidos, con la misma prioridad, y se mueven juntos.
- **Patrón (P):** convierte un grupo en patrón. Se le pone un nombre ("Crudo artesanal") y la IA usa ese grupo como definición para buscarlo en el resto del corpus.

Lo que arma el diseñador en este momento es su hipótesis: el brief, pero espacial.

### 02 · Revelar (pantalla 2c)
- La IA recorre todo el corpus buscando los patrones del diseñador y les suma evidencia ("14/24 refs").
- **Revelado:** aparecen patrones que el diseñador no marcó pero se repiten. Llegan con la etiqueta **NO LO MARCASTE** y quedan sin lámina hasta que el diseñador los ubica (1/2/3) o los descarta (X). Es el momento clave de la experiencia.
- **Espejo:** cuando la lámina que eligió el diseñador contradice la evidencia, aparece una sola línea abajo. Por ejemplo: "Pusiste el sello en soporte. Aparece en 11 de 24: la evidencia lo pone en el núcleo." No discute ni bloquea: solo muestra. Por ahora compara solo contra el corpus, sin historial de proyectos.
- **Auditoría:** no es una etapa. **A** sobre un patrón abre sus evidencias. Un patrón sin auditar lleva un punto gris en las dos vistas y aparece señalado en la exportación.
- **Trazabilidad:** al seleccionar un patrón se iluminan en el corpus las referencias de donde salió. Las demás se apagan.

### 03 · Girar (pantalla 2d)
- Vista de frente, como página editorial. El núcleo es el titular, en un bloque naranja con la imagen y una regla completa. El soporte es el cuerpo, en columnas con una regla corta. El acento es una nota al margen, de una línea.
- Exportar desde esta vista: lineamientos, prompts de DALL·E e imagen de la página.

## Consecuencias de la lámina

La lámina no es decorativa: cambia el resultado.

- **DALL·E:** el prompt se arma en orden de lámina. El núcleo va primero y con más peso, el soporte después y el acento al final, como un detalle menor.
- **Lineamientos exportados:** el núcleo lleva una regla completa con ejemplos, el soporte una regla corta y el acento una línea. Los patrones sin auditar llevan una marca.
- **Paleta:** sale del corpus. El orden y la proporción de los colores siguen la lámina de los patrones de color.

## Interacción: teclado y rueda, sin depender del mouse

Mantené siempre visible una barra de atajos fija abajo, que cambia según el momento.

- **Rueda / trackpad:** moverse en profundidad (Z)
- **W / S:** cambiar de lámina
- **← / →:** elegir patrón o fragmento
- **↑ / ↓:** mover el seleccionado de lámina
- **D:** desglosar la imagen seleccionada
- **G:** agrupar la selección
- **P:** crear patrón desde el grupo
- **A:** auditar (abrir evidencias)
- **1 / 2 / 3:** ubicar un patrón revelado en una lámina
- **X:** descartar
- **⏎:** aceptar la propuesta de la IA
- **Espacio:** girar costado ↔ frente
- **Esc:** soltar la selección o salir del modo actual

El foco tiene que ser siempre visible. Extendé `useAuditShortcuts` en lugar de crear otro sistema de atajos.

## Identidad visual: dirección "Gráfica" (opción 1c)

Viene de las interfaces espaciales Y2K, en especial de Wipeout y The Designers Republic. Se usan el color plano, la tipografía dura y las láminas como señales. No hay brillos, desenfoques ni glassmorphism. Copiá los valores exactos de `Tesis Identidad Visual.dc.html`.

### Paleta
- **Vacío (fondo):** `oklch(0.17 0.012 265)`
- **Hueso (soporte, texto, barra de atajos):** `#F2EFE8`
- **Naranja (núcleo):** `oklch(0.7 0.19 45)`
- **Azul (acento, revelado):** `oklch(0.62 0.2 262)`

### Tipografía
- **Archivo** (Google Fonts, eje de ancho variable):
  - Nombres y titulares: 900, `font-stretch: 62%`, en mayúsculas.
  - Rótulos: 800, `font-stretch: 75%`, `letter-spacing: .04em`.
  - Textos: 400.
- **Geist Mono** para datos y evidencia ("14/24 refs").

### Reglas
1. **Cada lámina es una señal:** un rótulo de color plano ("01 NÚCLEO") y una franja horizontal del mismo color.
2. **Jerarquía por masa de color:** el núcleo es un bloque lleno, el soporte y el acento son línea y rótulo.
3. **El corpus siempre en gris** (`grayscale(1)`, opacidad baja) para que no compita con el sistema.
4. **Fragmentos sin marco:** recortes limpios. Solo el elemento seleccionado lleva contorno del color de su lámina.
5. **Barra de atajos:** bloque hueso fijo abajo, con texto en color vacío y Archivo 800.
6. **Revelado y espejo:** el revelado es un bloque azul ("NO LO MARCASTE"). El espejo es una franja con el rótulo hueso "ESPEJO" y una sola línea de texto.
7. **Movimiento:** transiciones de cámara con desaceleración al final. Sin oscilaciones decorativas. Respetá `prefers-reduced-motion`.

## Modelo de datos (sumar a `src/types.ts`)

- **Fragmento:** `id`, `refId` (imagen de origen), `crop` (recorte), `type` (textura, tipografía, color, forma, etc.), `layer` (1, 2, 3 o null), `z` (posición continua dentro de la lámina), `groupId?`.
- **Grupo / Patrón:** `id`, `name`, `fragmentIds`, `layer`, `evidence` (refIds donde aparece), `origin` ('designer' | 'ai'), `aiSuggestedLayer`, `audited` (boolean), `revealed` (boolean: lo encontró la IA sin que el diseñador lo marcara).
- **Proyecto:** `intent` (la frase), `brief` (redactado por la IA y editable), `refs`, `fragments`, `patterns`, `view` ('side' | 'front').

Guardá siempre tanto la lámina que propuso la IA como la que eligió el diseñador: el espejo necesita las dos.

## Técnica

- Para el 3D, empezá con CSS 3D (`perspective`, `preserve-3d`, `translate3d`). Si con más de 40 imágenes no llega a 60 fps, proponeme pasar a three.js antes de hacerlo.
- Para el desglose (D), proponeme opciones antes de implementar: un modelo de segmentación, recorte asistido por el modelo de visión actual o recorte manual con sugerencias. Explicá el costo y la complejidad de cada una.
- No rompas las llamadas actuales a la IA. Adaptá los prompts para que devuelvan lámina sugerida y evidencia.

## Orden de trabajo (commits chicos)

1. **Identidad:** tokens de color y tipografía de 1c, cambio de nombre a "Tesis", barra de atajos.
2. **Modelo de datos:** fragmentos, grupos, patrones, láminas, origen y auditoría, con migración de los proyectos existentes.
3. **Escena espacial:** pila de tres láminas más corpus, navegación en Z con rueda y W/S, selección con flechas.
4. **Armar:** estado vacío (frase y soltar), desglose (D), mover entre láminas, agrupar (G), crear patrón (P).
5. **Revelar:** búsqueda de patrones en el corpus, revelados ("NO LO MARCASTE"), espejo, auditoría con A y trazabilidad.
6. **Girar:** vista de frente editorial con Espacio y animación.
7. **Consecuencias:** ponderación por lámina en DALL·E, lineamientos y paleta. Exportación.
8. **Limpieza:** eliminar el riel de 5 etapas, el lienzo plano y FLUX, y actualizar el README.

Al terminar cada commit, mostrame qué cambió y qué falta. Ante cualquier duda de diseño, la referencia es `Tesis Identidad Visual.dc.html`.

## Fuera de alcance por ahora

- Profundidad continua más allá del imán a tres láminas.
- Historial de sesgos entre proyectos.
- Usar el estado a mitad del giro como vista de trabajo.
- Modo presentación automático.
- Sonido.
