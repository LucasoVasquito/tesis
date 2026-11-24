# MEGAPROMPT · Camaleón Corpus · versión para testeo

Copiá todo lo que sigue debajo de la línea en Claude Code.

---

Sos el desarrollador de **Camaleón Corpus**, una herramienta que convierte referencias visuales en un sistema de marca jerarquizado. El diseñador decide qué es **Núcleo** (lo crucial), qué es **Soporte** (lo que lo acompaña) y qué es **Acento** (lo que lo caracteriza). El agente analiza y propone, y el diseñador decide.

El documento tiene dos partes:

- **Parte A:** decisiones nuevas. Si algo de la Parte B la contradice, **manda la Parte A**.
- **Parte B:** la base de interfaz y flujo (5 etapas, recorrido 3D en Capas, visibilidad del estado, deshacer, prevención, errores). Si todavía no está implementada, implementala primero.

La referencia visual es `design_handoff_emergent_rework/Camaleón Profundidad v2.dc.html`. Mantené el modelo de datos y los endpoints actuales.

**Contexto de entrega:** se testea la semana próxima con 5 estudiantes de diseño. Priorizá que el recorrido completo funcione de punta a punta sin trabas antes que pulir los detalles.

# PARTE A · Decisiones nuevas

## A.1 · Motor Camaleón (color de la interfaz)

La interfaz toma los colores del proyecto. Si las referencias son mayormente azules, la app se vuelve azul. Si el usuario cambia el color a negro, la app se vuelve negra.

### A.1.1 · De dónde salen los tres colores

Se combinan dos pasos:

1. **Propuesta por frecuencia.** El análisis devuelve los colores detectados con su presencia ponderada. **Las referencias del usuario pesan el doble que las inferencias del agente.** Se ordenan de mayor a menor: el 1.º es el primario, el 2.º el secundario y el 3.º el acento.
2. **Ajuste por jerarquía.** Una vez que hay piezas de color en las capas, la jerarquía manda sobre la frecuencia:
   - **Primario:** la pieza de color en **Núcleo** con mayor frecuencia.
   - **Secundario:** la pieza de color en **Soporte** con mayor frecuencia.
   - **Acento:** la pieza de color en **Acento** con mayor frecuencia.
   - Si una capa no tiene ninguna pieza de color, ese rol se completa con el siguiente color del ranking de frecuencia que no esté usado.
   - Si no hay colores detectados (proyecto vacío), se usa la paleta neutra actual: vacío `oklch(0.165 0.012 40)`, hueso `#F2EFE8` y los tres colores de capa de la Parte B.
   - Si el usuario editó un color a mano (ver A.1.5), **ese valor manda** sobre lo detectado.

Implementalo como una función pura `derivePalette(detectedColors, pieces, overrides) → { primary, secondary, accent }`, con tests unitarios para estos casos:
- solo frecuencia;
- capa sin color;
- override a negro;
- tres colores iguales;
- proyecto vacío.

### A.1.2 · Qué se tiñe y qué no

**Se tiñe:**

| Token | Uso | Cómo se deriva |
|---|---|---|
| `--cc-bg` | Fondo de la app | Tono del primario con luminosidad 0.165 y croma `min(C_primario, 0.02)`. Si el primario tiene L < 0.165, se usa su L. Si el croma es menor a 0.01 (gris o negro), el fondo queda neutro. |
| `--cc-surface` | Barras, tarjetas, avisos | `--cc-bg` con L + 0.06 |
| `--cc-l0` · `--cc-l1` · `--cc-l2` | Colores de Núcleo, Soporte y Acento (puntos, bordes de planos, marcadores, mini pila) | El primario, el secundario y el acento tal cual |
| `--cc-primary` | Botón primario | El primario tal cual |

**No se tiñe:**
- Tipografía y textos.
- Marcos, bordes neutros y separadores.
- Colores de estado: éxito `oklch(0.74 0.09 150)`, aviso `oklch(0.80 0.12 86)` y error `oklch(0.66 0.16 28)`.
- Las imágenes del usuario.

### A.1.3 · Contraste: se respeta el color, se ajusta lo demás

El color que eligió el usuario **nunca se corrige**. Lo que se adapta es lo que está encima o alrededor:

- `--cc-text`: si la L de `--cc-bg` es menor a 0.6, el texto va en hueso `#F2EFE8`. Si no, en tinta `#141210`.
- `--cc-text-muted`: `--cc-text` al 65%.
- `--cc-line`: `--cc-text` al 10% (al 14% en hover).
- `--cc-on-primary`: el mismo criterio de `--cc-text`, pero calculado sobre `--cc-primary`.
- **Color de capa igual al fondo:** si la diferencia de luminosidad entre un color de capa y `--cc-bg` es menor a 0.08 (por ejemplo, todo negro), ese color se dibuja con un contorno de 1px en `--cc-text` al 40%, para que el punto, el plano o el botón no desaparezcan.
- **Capas con el mismo color:** si dos o más capas comparten color, se distinguen por el nombre y el número, que siempre están visibles junto al punto. Nunca se identifica una capa solo por su color.

Calculá todo en OKLCH (`culori` o una función propia) y escribilo como variables CSS en `:root`. **Toda la interfaz consume las variables, sin colores fijos.**

### A.1.4 · Cuándo cambia: en vivo

- La paleta se recalcula **en cada cambio**: al terminar el análisis, al aceptar, descartar o mover una pieza de color, y al editar un color.
- Las variables CSS tienen `transition: background-color .4s, color .4s, border-color .4s` (registralas con `@property` como `<color>` para que se puedan animar).
- Con `prefers-reduced-motion`, el cambio es instantáneo.
- Cuando un cambio modifica el primario, aparece un aviso: "La interfaz ahora usa Azul cobalto como primario." con la acción `Deshacer`.

### A.1.5 · Dónde se edita: en Capas, sobre la pieza de color

- Las piezas de tipo color muestran, en la esquina inferior izquierda de la imagen, una **muestra de 20px** con su hex.
- Al hacer clic en la muestra (o con `C` si la pieza está seleccionada) se abre un panel flotante con:
  - una muestra grande;
  - un campo hex editable;
  - un selector nativo (`<input type="color">`);
  - una fila con los otros colores detectados en el proyecto, como atajo;
  - `Restaurar color detectado`, si hay un override.
- El cambio se ve en vivo mientras se arrastra el selector. Al cerrar el panel, se registra **una sola entrada** en el historial (deshacer).
- Aviso: "Cambiaste «Rojo tomate» a #000000." con `Deshacer`.
- El override se guarda en la pieza (`colorOverride`) y persiste.

## A.2 · Preguntas guía en cada capa

Cada capa tiene una pregunta que explica qué va ahí sin que haga falta aprender el vocabulario:

- **Núcleo:** "¿Sin esto deja de ser la marca?"
- **Soporte:** "¿La acompaña siempre, pero se podría cambiar?"
- **Acento:** "¿Aparece poco, pero la hace reconocible?"

Dónde aparecen:
- **Capas:** debajo del nombre de cada plano (14px, `--cc-text-muted`).
- **Revisar:** debajo del nombre en cada botón de capa (12px), así la decisión se toma respondiendo la pregunta.
- **Arrastre:** dentro de cada zona para soltar (A.3).
- **Barra lateral:** como sub-ítems de 03 Capas.

## A.3 · Arrastre con zonas para soltar entre capas

En **Capas** (vistas Recorrido y General):

1. **Inicio:** se presiona sobre una pieza y se arrastra más de 6px.
   - Aparece una "sombra" de la pieza que sigue al cursor (escala 0.6, rotación 2°, sombra marcada).
   - La pieza original queda al 30%.
2. **Zonas:** desde abajo suben tres **zonas para soltar** (en 200ms), arriba de la barra inferior y ocupando el ancho de la escena.
   - Cada zona tiene el color de capa, el nombre, el número y la pregunta guía.
   - La zona de la capa actual de la pieza queda deshabilitada, con "Está acá".
3. **Hover sobre una zona:** el fondo se llena con el color de capa al 25% y el borde pasa a 2px.
   - En el Recorrido, la cámara se acerca levemente a esa capa (`d` se desplaza 0.15 hacia ella) como anticipo.
4. **Soltar:** la pieza se mueve con `move()`. Hay aviso con `Deshacer` y la paleta se recalcula si la pieza es de color.
5. **Cancelar:** con `Esc`, o soltando fuera de una zona, la pieza vuelve a su lugar con una animación.

En la vista General también se puede soltar directamente sobre un plano.

Siguen funcionando los otros caminos: clic más "Mover a" en la barra inferior, y `1`/`2`/`3` con la pieza seleccionada.

En táctil, el arrastre empieza con una pulsación larga de 350ms y una vibración (`navigator.vibrate(10)` si está disponible).

## A.4 · Rueda y zoom en Moodboard (convención Figma/Miro)

- **Rueda o trackpad:** desplaza el lienzo (deltaX y deltaY).
- **Ctrl/Cmd + rueda o pellizco de trackpad:** zoom centrado en el cursor.
- **Espacio + arrastrar:** desplazar (además de arrastrar el fondo).
- **Línea de ayuda:** "Rueda para moverte, Ctrl + rueda para zoom. Arrastrá las esquinas para cambiar el tamaño."
- **En Capas** (la única otra etapa con rueda), la rueda recorre la profundidad. El cursor sobre la escena cambia a `ns-resize`, y la primera vez que se entra a Capas aparece un aviso: "En esta etapa la rueda te lleva hacia adentro y hacia afuera."

## A.5 · Voz del sistema (casi invisible)

**El sistema habla, no un personaje.** No hay "yo", ni nombre de agente, ni tono conversacional.

- **Estados en forma impersonal y descriptiva:** "Analizando colores · 4 de 11", "Se encontraron 6 piezas", "1 imagen no se pudo leer (archivo dañado)".
- **Instrucciones al usuario en voseo, cortas e imperativas:** "Elegí una pieza", "Arrastrá las esquinas…".
- **Cambios respecto de la Parte B:**
  - `SUGERENCIA DEL AGENTE` pasa a `SUGERENCIA`.
  - "El agente encontró 6 piezas" pasa a "Se encontraron 6 piezas".
  - Las etiquetas de origen `AGENTE` / `USUARIO` pasan a `DETECTADO` / `TUYO`.
  - "El agente está leyendo…" pasa a "Analizando referencias…".
- El motivo de cada sugerencia se escribe como un hecho observado: "La hamburguesa ocupa el centro del cuadro en 9 de 38 imágenes".

## A.6 · Exportar

**Botón `Exportar`** en la barra inferior de Sistema y Probar, como acción secundaria. Abre un menú con tres opciones:

1. **PNG de la pieza aprobada.** Disponible también en cada variante de Probar (`Descargar`).
   - Resolución de 2048px en el lado mayor.
   - Nombre: `{proyecto}-{pieza}-{n}.png`.
2. **PDF del sistema.** A4 vertical, generado en el cliente (`@react-pdf/renderer` o impresión de una ruta `/print`). Contenido:
   - Portada con el nombre del proyecto y la paleta, en el fondo Camaleón.
   - La paleta con los roles primario, secundario y acento, con hex y OKLCH.
   - Una página por capa con la pregunta guía, las piezas (imagen, nombre y regla) y la evidencia (`9 de 38 referencias`).
   - Las piezas aprobadas.
3. **Prompt / JSON para otra IA.** Un modal con dos pestañas, cada una con `Copiar` y `Descargar`:
   - **JSON**, con el esquema:
     ```json
     {
       "project": "Badder Hamburguesería",
       "palette": { "primary": "#C8472F", "secondary": "#E2B23C", "accent": "#5FB3AE" },
       "layers": {
         "nucleo":  { "question": "¿Sin esto deja de ser la marca?", "pieces": [{ "name": "Rojo tomate", "type": "color", "value": "#C8472F", "rule": "…", "evidence": "9/38", "source": "tuyo" }] },
         "soporte": { "question": "…", "pieces": [] },
         "acento":  { "question": "…", "pieces": [] }
       },
       "approved": [{ "kind": "logotipo", "variant": 1, "file": "badder-logotipo-1.png" }]
     }
     ```
   - **Prompt**, en texto natural, generado a partir del JSON: "Diseñá para Badder Hamburguesería. Obligatorio (Núcleo): … Usá cuando acompañe (Soporte): … Usá con moderación (Acento): … Paleta: primario #…, secundario #…, acento #…"

Toda exportación muestra el aviso "Se descargó {archivo}".

## A.7 · Responsive: escritorio, tablet y móvil

**Breakpoints:** escritorio desde 1024px, tablet de 768 a 1023px y móvil por debajo de 768px. **Las zonas táctiles miden 44px como mínimo** en tablet y móvil.

**Tablet:**
- La barra lateral se colapsa a 64px y muestra solo los marcadores. Al tocar uno se despliega como overlay con los nombres y estados.
- Todo lo demás queda igual que en escritorio.

**Móvil:**

- **Navegación:**
  - La barra lateral se reemplaza por una **barra de pasos arriba**, debajo de la barra superior: los 5 marcadores en línea (con sus estados ✓, !, actual) y el nombre de la etapa actual.
  - Al tocarla se abre una hoja inferior con la lista completa y sus estados.
- **Barra superior:**
  - La línea de estado pasa a ser una segunda línea de 12px debajo de la marca.
  - El indicador de guardado queda como un punto.
- **Barra inferior:** ocupa todo el ancho y se pega abajo, con `env(safe-area-inset-bottom)`.
  - Contiene el primario (ancho completo si no entra otra cosa) y un `⋯` que abre una hoja con las acciones secundarias.
- **Avisos:** aparecen arriba de la barra inferior, a todo el ancho menos 16px.
- **Moodboard:**
  - Un dedo sobre una imagen la mueve; un dedo sobre el fondo desplaza el lienzo.
  - Dos dedos hacen zoom con el pellizco.
  - Tocar una imagen la selecciona y muestra manijas de 24px.
  - `+ Imagen` abre el selector del sistema (cámara o galería).
- **Revisar:**
  - Una sola columna: imagen, nombre, evidencia y botones en grilla de 2×2 de 56px (Núcleo, Soporte, Acento y Descartar), con la pregunta guía en cada uno.
  - La mini pila 3D se oculta y la capa destino se indica con el color del botón.
- **Capas:**
  - El recorrido se mantiene. **Deslizar en vertical** controla la profundidad (`deltaY · 0.004`, y al soltar se acomoda a la capa más cercana).
  - La tarjeta "Estás en" se reemplaza por chips de capa fijos arriba de la escena.
  - Los planos ocupan el ancho menos 32px, con piezas en 2 columnas.
  - El arrastre entre capas funciona con pulsación larga (A.3), con las zonas para soltar como hoja inferior.
- **Sistema:** una columna, piezas de Soporte en 2 columnas.
- **Probar:**
  - Tres pasos apilados: la pieza en chips con scroll horizontal, la receta colapsada en una línea ("Receta automática · Ver") y el resultado.
  - Las variantes se ven de a una, con un deslizamiento horizontal entre ellas.
- **Vista General de Capas:** se oculta en móvil.

## A.8 · Modo testeo (para la semana próxima)

- **`?demo=badder`:** carga el proyecto de ejemplo Badder (11 referencias reales, sin analizar), para que todos los participantes empiecen igual.
- **`?test=1`:** activa el registro de eventos en localStorage (`cc-test-log`). Cada evento guarda la marca de tiempo y la etapa:
  - `stage_enter` y `stage_leave`;
  - `blocked_click` (clic en una etapa bloqueada);
  - `undo`;
  - `error_shown`;
  - `drag_start` y `drop` (con origen, destino o cancelado);
  - `color_edit`;
  - `approve`;
  - `export` (con el tipo);
  - `help_open`.
- **Atajo `Ctrl+Shift+E`:** descarga el registro como `test-{fecha}-{hora}.json`.
- **Atajo `Ctrl+Shift+R`:** reinicia el proyecto de ejemplo (con confirmación). Sirve para pasar al siguiente participante.
- **Sin `?test=1`** no se registra nada.

## A.9 · Orden de trabajo

Hacé commits chicos y mostrame una captura al final de cada punto:

1. Parte B completa, si falta algo. Lo crítico para el testeo: barra lateral con estados, deshacer, Revisar sin salto automático, Sistema y Probar separadas, Aprobar y Descargar.
2. A.8: modo testeo y proyecto de ejemplo (es barato y destraba el testeo).
3. A.1: motor Camaleón con `derivePalette` y tests, variables CSS, contraste, transición en vivo y edición en Capas.
4. A.5: pasada de textos con la voz del sistema.
5. A.2 y A.3: preguntas guía y arrastre con zonas para soltar.
6. A.4: rueda y zoom en Moodboard.
7. A.6: exportar PNG, PDF y Prompt/JSON.
8. A.7: responsive en tablet y móvil.
9. Revisión en 390×844, 820×1180, 1280×800 y 1440×900: nada tapado, zonas táctiles de 44px o más, sin scrollbars visibles y contraste correcto con las paletas azul/rojo/amarillo y todo negro.

## A.10 · Criterio de éxito (además de los de la Parte B)

- Con referencias mayormente azules, la interfaz se vuelve azul. Si cambio el primario a negro, la interfaz se vuelve negra, y el texto, los marcos y los planos se siguen leyendo.
- Puedo mover una pieza entre capas arrastrándola, sin que nadie me explique cómo.
- Entiendo qué va en cada capa leyendo la pregunta, sin conocer los términos.
- Me llevo un PNG, un PDF y un JSON o prompt que funciona en otra IA.
- El recorrido completo funciona en el teléfono.
- Al terminar cada sesión de test tengo un JSON con los tiempos por etapa.

# PARTE B · Base de interfaz y flujo

### B.0 · Contexto

Camaleón ya tiene implementado `PROMPT Camaleon Pulido Visual.md`. Este pedido reorganiza la navegación en **5 etapas**, convierte Capas en un **recorrido 3D en primera persona**, lleva el Moodboard a un **lienzo libre tipo Miro** y suma todo lo necesario para que el sistema **explique en qué estado está**: etapas completas, actividad en curso, guardado, vuelta atrás, deshacer, prevención y errores.

La referencia visual y de comportamiento es el prototipo `Camaleón Profundidad v2.dc.html` (handoff). Ante cualquier duda de medidas, textos o comportamiento, ese archivo manda. **Mantené los datos, los tipos y los endpoints actuales**: es un cambio de interfaz y de flujo, no de modelo.

Seguí usando los tokens del pulido visual: vacío `oklch(0.165 0.012 40)`, hueso `#F2EFE8`, Archivo y Geist Mono, escala de espaciado 4/8/12/16/24/32/48/64 y un solo botón primario por pantalla. Colores de capa (camaleón): Núcleo `oklch(0.68 0.14 33)`, Soporte `oklch(0.80 0.12 86)`, Acento `oklch(0.74 0.09 190)`.

### B.1 · Estructura de la pantalla

Hay tres zonas fijas y la escena:

- **Barra superior** (56px):
  - Izquierda: marca `CAMALEÓN CORPUS` y nombre del proyecto en Geist Mono.
  - Centro: **línea de estado** (ver §7).
  - Derecha: indicador de guardado y `? Ayuda`.
- **Barra lateral de etapas** (200px, a la izquierda, debajo de la barra superior): las 5 etapas, todas clickeables (ver §2).
- **Barra inferior flotante** (centrada sobre la escena, `bottom: 24px`, radio 14px, fondo `oklch(0.225 0.012 40)`):
  - Contiene **solo las acciones de la etapa actual** más el botón primario a la derecha.
  - Ya no contiene la navegación entre etapas.
- **Escena:** ocupa el resto. Solo se ve la etapa activa.
- **Línea de ayuda:** una línea de texto chica, encima de la barra inferior, con lo que se puede hacer ahora. Se oculta en Revisar, Sistema y Probar, porque ahí el contenido ya lo explica.
- **Cambio de etapa:** directo, sin animación de zoom. **El zoom y la profundidad quedan solo en 03 Capas.**

### B.2 · Barra lateral de etapas

Etapas, en orden:

1. Referencias · "Juntá todo lo que te inspira"
2. Revisar · "Decidí qué propone el agente"
3. Capas · "Ordená por importancia"
4. Sistema · "Mirá el resultado"
5. Probar · "Aplicalo a una pieza"

Cada ítem tiene un **marcador circular de 22px**, el nombre (14px, 600) y una **línea de estado** (12px). Los marcadores se unen con una línea vertical de 2px, que va en hueso al 45% hasta la etapa más avanzada alcanzada y al 10% después.

Estados del marcador:

| Estado | Marcador | Línea de estado |
|---|---|---|
| Actual | anillo de 1.5px hueso con el número | descripción o progreso |
| Completa | círculo hueso relleno con ✓ | resumen (ver abajo) |
| Pendiente | borde 1px al 25% con el número | descripción |
| Bloqueada | borde punteado al 25% | por qué está bloqueada |
| Desactualizada | círculo mostaza con `!` | "Cambiaste algo antes · revisalo" (mostaza) |
| Estabas acá | igual que pendiente | "Estabas acá" (mostaza) |

**Cuándo se completa cada etapa:**
- Referencias, al terminar el análisis.
- Revisar, cuando no quedan sugerencias.
- Capas, al avanzar de Capas a Sistema.
- Sistema, al avanzar a Probar.
- Probar, con al menos una variante aprobada.

**Resumen de las etapas completas:**
- `11 referencias`
- `5 aceptadas · 1 descartadas`
- `Núcleo 4 · Soporte 5 · Acento 3`
- `Revisado`
- `1 pieza aprobada`

Mientras Revisar está en curso, su línea dice `2 de 6 revisadas`.

**Bloqueos:**
- Revisar, Capas, Sistema y Probar quedan bloqueadas hasta analizar ("Se habilita al analizar").
- Sistema y Probar también se bloquean si el Núcleo está vacío ("Necesita al menos una pieza en Núcleo.").
- Hacer clic en una etapa bloqueada no navega: muestra un aviso con el motivo.

**Desactualizada:** si ya visitaste Sistema o Probar y después movés, aceptás, descartás o recuperás una pieza, esas etapas quedan desactualizadas hasta que las vuelvas a visitar.

### B.3 · 01 Referencias (Moodboard tipo Miro)

- **Lienzo infinito** con fondo de puntos (radial de 1px al 9%, cada 24px, que escala y se desplaza con la cámara).
- **Cámara** `{x, y, z}`:
  - Rueda = zoom centrado en el cursor (`z` entre 0.2 y 4).
  - Arrastrar el fondo = desplazar.
  - Al entrar por primera vez, ajustar la vista a todas las imágenes.
- **Imágenes:**
  - Posición y tamaño libres.
  - Arrastrar mueve la imagen. Al seleccionarla, pasa al frente.
  - Con la imagen seleccionada aparecen 4 manijas en las esquinas para redimensionar. Se mantiene la proporción y con Shift se deforma. El mínimo es 60px.
  - El contorno de selección es de 2px hueso (compensado por el zoom).
- **Teclado:** `Supr`/`Backspace` borra (con deshacer, ver §8), `+`/`-` hace zoom y `0` ajusta la vista.
- **Barra inferior:**
  - Acciones: `Volver a analizar` (solo si ya se analizó), `+ Imagen`, `−`, porcentaje de zoom (clic = 100%), `+` y `Ajustar`.
  - Primario: `Analizar referencias ⏎`.
- **La carga tiene que ser real:** arrastrar archivos desde el escritorio al lienzo y pegar una URL o una imagen (Ctrl+V). La imagen aparece en el centro de la vista.

### B.4 · 02 Revisar

- Una sugerencia por vez, con dos columnas.
- **Izquierda:**
  - Rótulo `SUGERENCIA DEL AGENTE · 1 DE 6`.
  - Imagen 4:3, con alto `clamp(80px, 100vh − 416px, 280px)`.
  - Nombre (Archivo 700, 32px).
  - `EN 9 DE 38 REFERENCIAS`.
  - Botones en **una sola fila**: Núcleo, Soporte, Acento y Descartar. El botón de la capa sugerida es el primario y lleva `⏎`.
- **Derecha:**
  - Mini pila 3D isométrica de las tres capas. Al pasar el mouse por un botón, se ilumina la capa destino y aparece la miniatura en ella.
  - Leyenda debajo: "ENTRARÍA EN NÚCLEO".
  - Debajo de la pila, el motivo del agente y 3 miniaturas de evidencia.
- **Teclado:** `1`/`2`/`3` asigna, `X` descarta y `Enter` acepta la sugerida.
- **No hay salto automático a Capas.** Al terminar se muestra:
  - `✓ ETAPA COMPLETA`, "Revisaste todas las sugerencias" y el resumen.
  - Lista de **Descartadas**, cada una con `Recuperar` (vuelve a su capa sugerida).
  - Primario: `Ver capas ⏎`.

### B.5 · 03 Capas (recorrido en primera persona)

Es la única etapa con profundidad. Por defecto se abre en la vista **Recorrido**. Hay una vista secundaria, **General** (isométrica, la actual).

**Geometría de Recorrido:**
- Contenedor con `perspective: 1000px` y `perspective-origin` arriba al centro de la escena (`calc(50% − 120px) 0%`).
- Planos de 640px de ancho, alto según contenido (mínimo 300px) y padding de 24px.
- Capa `i` en `translate3d(0, −i·40px, −i·900px)`. La cámara mueve la pila con `translate3d(0, d·40px, d·900px)`, donde `d` es la profundidad continua (0 a 2).
- La pila se escala según la ventana: `min(1.2, (ancho − 500)/640, (alto − 184)/440)`, con un mínimo de 0.5.
- Con esta geometría, las capas de atrás asoman por arriba de la activa, más chicas.

**Opacidad y foco según `rel = i − d`:**
- Las capas que ya pasaste (`rel < 0`) se desvanecen hasta 0 a `rel = −0.45`.
- Las de atrás tienen opacidad `max(0.22, 1 − rel·0.45)` y `blur(rel·2.2px)`.
- La activa tiene fondo opaco. Las de atrás, al 80%.
- **Marcos guía:** 10 rectángulos finos (1px al 6%, o del color de la capa en cada capa) espaciados cada 1/3 de capa. Dan sensación de túnel al avanzar.

**Movimiento:**
- La rueda mueve `d` de forma continua (`deltaY · 0.0016`) y, a los 180ms sin rueda, se acomoda a la capa más cercana.
- `↑`/`↓` y `1`/`2`/`3` saltan a una capa, con interpolación suave (`requestAnimationFrame`, factor 0.1).
- Hacer clic en una capa de atrás la trae adelante.

**Piezas:**
- Grilla de 3 columnas, con imagen 16:10, nombre de 15px y metadatos en Geist Mono 11px (`USUARIO · 9/38`).
- Clic en una pieza para seleccionarla. En la barra inferior aparece "Mover a" con las tres capas, que también se pueden elegir con `1`/`2`/`3`.
- **Arrastre entre capas (nuevo):** arrastrar la pieza hacia arriba o abajo de la escena cambia de capa. Al pasar el mouse por una pieza, mostrar tres puntos de color para enviarla directo.

**Tarjeta "Estás en"** (derecha, 220px):
- Lista de las tres capas con su punto de color. La activa va con fondo de su color al 20%.
- Una barra vertical de progreso que sigue a `d`.
- Botones `↑ Más cerca` y `↓ Más lejos`.
- Nota: "También con la rueda del mouse o las flechas."

**Barra inferior:**
- Acciones: `Recorrido / General` y, con una pieza seleccionada, `Mover a`.
- Primario: `Ver sistema ⏎`, que se deshabilita con "Núcleo vacío" si el Núcleo no tiene piezas.

### B.6 · 04 Sistema y 05 Probar (pantallas separadas)

- **Sistema:**
  - Una columna de lectura de 720px como máximo.
  - Núcleo con la imagen protagonista en 16:9 (alto máximo 46vh), el nombre en Archivo 900 condensada a 48px, la regla y una fila de 3 piezas.
  - Soporte en una grilla de 3 columnas.
  - Acento en una fila con miniaturas de 64px.
  - Un degradé al pie para que la barra inferior no tape el texto.
  - Primario: `Probar en una pieza ⏎`.
- **Probar:** dos columnas.
  - **Izquierda (380px):**
    - `PASO 1 · LA PIEZA`, "¿Qué querés probar?" y los chips Logotipo, Fachada, Packaging, Afiche y Post.
    - `PASO 2 · LA RECETA`, con la nota "Sale sola de tus capas" y una fila por capa. Núcleo lleva `OBLIGATORIO`; Soporte y Acento llevan `AUTOMÁTICO`.
    - `Editar` como acción terciaria.
  - **Derecha:** `PASO 3 · RESULTADO`.
    - Antes de generar: "Generá dos variantes de tu logotipo".
    - Generando: dos placeholders y una barra de progreso.
    - Resultado: dos variantes, cada una con el control del Núcleo, `Aprobar` y `Descargar`.
  - `Aprobar` cambia el botón a `✓ Aprobada` (verde `oklch(0.74 0.09 150)`), guarda la pieza en la marca y completa la etapa. `Descargar` descarga el PNG de verdad.
  - Primario: `Generar 2 variantes ⏎`, que pasa a `Generar otras 2` después del primer resultado.

### B.7 · Visibilidad del estado

- **Línea de estado (centro de la barra superior)** con un punto de 8px. Tiene tres modos:
  1. **Ubicación** (punto hueso al 30%), según la etapa:
     - `Etapa 1 de 5 · Referencias · 11 referencias en el tablero`
     - `Etapa 2 de 5 · Revisar · sugerencia 3 de 6`
     - `Etapa 3 de 5 · Capas · estás mirando Soporte`
     - `Etapa 4 de 5 · Sistema · leyendo el resultado`
     - `Etapa 5 de 5 · Probar · probando logotipo`
  2. **Actividad** (punto del color del Núcleo con halo): describe lo que hace el sistema en ese momento.
     - Análisis, con un mensaje cada ~400ms: `Leyendo colores · 1 de 11…`, `… 6 de 11…`, `… 11 de 11…`, `Detectando tipografías…`, `Buscando lo que se repite…`, `Armando 6 sugerencias…`.
     - Generación: `Armando la receta con tus capas…`, `Generando la variante 1 de 2…`, `Generando la variante 2 de 2…`, `Revisando que el Núcleo esté presente…`.
     - **Usá los eventos reales del backend** si existen. Si no, mostrá estas etapas en orden.
  3. **Vuelta atrás** (punto mostaza): si la etapa actual es anterior a la más avanzada alcanzada, dice `Volviste a Referencias`, con un botón secundario `Seguir en Probar →` que vuelve a la etapa más avanzada. En la barra lateral, esa etapa dice "Estabas acá".
- **Guardado** (Geist Mono 11px, a la derecha): muestra `Guardando…` en hueso durante 800ms después de cada cambio y luego `✓ Guardado` al 45%. **El guardado tiene que ser real:** persistir el proyecto (localStorage o backend) en cada cambio.

### B.8 · Deshacer y avisos

- **Historial global** con instantáneas de piezas, sugerencias revisadas, tablero, descartadas y aprobadas (máximo 40). `Ctrl/Cmd+Z` deshace.
- **Aviso flotante** arriba a la derecha (`top: 68px`, `right: 24px`, 380px de ancho máximo):
  - Muestra un texto, una acción opcional y una ✕. Se va solo a los 5 segundos.
  - **Nunca tapa la barra inferior ni los botones de decisión.**
  - Avisos con `Deshacer`:
    - "Descartaste «X»."
    - "«X» quedó en Soporte."
    - "Moviste «X» de Núcleo a Soporte."
    - "Borraste una referencia."
    - "Recuperaste «X» en Núcleo."
    - "Aprobaste logotipo · variante 1."

### B.9 · Prevención y errores

- **Analizar pide al menos 5 referencias.** Con menos, el primario se deshabilita con `Faltan 3 referencias` y al hacer clic explica por qué.
- **Después de analizar,** el primario de Referencias pasa a `Seguir en Revisar`. Volver a analizar es una acción secundaria y pide confirmar con un aviso: "Si volvés a analizar, se reinicia tu revisión de sugerencias. Tus capas no cambian." Acción: `Analizar igual`.
- **Núcleo vacío** bloquea `Ver sistema`, Sistema y Probar, explicando el motivo.
- **Estados de error a diseñar e implementar**, cada uno con causa en lenguaje simple y una acción:
  - Imagen que no se pudo leer: "El agente encontró 6 piezas. 1 imagen no se pudo leer (archivo dañado)." Acción `Ver cuál`, que lleva al lienzo y marca la imagen con borde rojo.
  - URL inválida: "No pudimos abrir esa dirección." Acción `Reintentar`.
  - Análisis fallido: "El análisis se cortó." Acción `Reintentar`. Las referencias se mantienen.
  - Generación fallida: "No pudimos generar la variante 2." Acción `Reintentar` (solo esa variante).

### B.10 · Ejemplos

Usá imágenes reales en todas las etapas (las fotos de Badder del proyecto de ejemplo o las del usuario). **Nada de cuadrados de color sueltos:**
- Las piezas de color se muestran sobre una foto donde ese color aparece, con una etiqueta de color abajo a la izquierda: fondo vacío al 78%, filete izquierdo del color y el hex en Geist Mono.
- Las piezas tipográficas muestran la palabra de la marca sobre la foto.

### B.Orden de trabajo (commits chicos)

1. Layout: barra lateral, barra inferior contextual, barra superior con estado y guardado, sistema de avisos.
2. Estados de etapa en la barra lateral: completa, actual, bloqueada, desactualizada y "Estabas acá", con la línea de progreso.
3. Historial y `Ctrl+Z`, con avisos de deshacer en todas las acciones.
4. 01 Moodboard: lienzo, cámara, mover, redimensionar y carga real (archivos, URL y pegar).
5. 02 Revisar: sin salto automático, pantalla de cierre con Descartadas y Recuperar.
6. 03 Capas: recorrido en primera persona, tarjeta "Estás en" y arrastre entre capas.
7. 04 Sistema y 05 Probar separadas, con Aprobar y Descargar funcionando.
8. Prevención y los 4 estados de error.
9. Revisión en 924×540, 1280×800 y 1440×900: nada tapado por la barra inferior ni por los avisos, sin scrollbars visibles.

Al terminar cada commit, mostrame una captura de la pantalla afectada.

### B.Criterio de éxito

- En cualquier momento, la barra superior dice en qué etapa estoy y qué está haciendo el sistema.
- Con solo mirar la barra lateral sé qué etapas terminé, cuál sigue y si algo quedó desactualizado.
- Si vuelvo atrás, el sistema me lo dice y me ofrece volver a donde estaba.
- Toda acción destructiva se puede deshacer.
- No hay acciones que fallen en silencio.
- Una persona nueva completa el recorrido de punta a punta sola: carga, analiza, revisa, ordena, mira el sistema, prueba, aprueba y descarga.

---

# Anexo · Guion de testeo (para vos, no para Claude Code)

**Participantes:** 5 estudiantes de diseño, sesiones de unos 20 minutos, con `?demo=badder&test=1`. Pensamiento en voz alta y sin ayuda del moderador.

**Tareas:**
1. "Analizá estas referencias." Mide si encuentran el primario y si entienden el progreso.
2. "Revisá lo que te propone la herramienta." Mide si entienden la evidencia y la pregunta guía.
3. "Pasá «Papel kraft» a Acento." Mide si descubren el arrastre.
4. "Hacé que la marca sea en blanco y negro." Mide si encuentran la edición de color y el efecto camaleón.
5. "Volvé a Referencias y después seguí donde estabas." Mide si entienden la vuelta atrás.
6. "Generá un logotipo, aprobá uno y llevate el sistema para otra IA." Mide si completan el recorrido.

**Qué mirar:**
- Tiempo por etapa (sale del registro).
- Clics en etapas bloqueadas.
- Cantidad de veces que usan deshacer.
- Si nombran las capas por la pregunta o por el término.

**Preguntas al cierre:**
- "¿Qué es Núcleo, con tus palabras?"
- "¿Notaste que cambió el color de la app? ¿Qué te pareció?"
- Escala SUS (10 preguntas).
