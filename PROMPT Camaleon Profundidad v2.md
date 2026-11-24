# Prompt para Claude Code · Camaleón, profundidad, etapas y visibilidad del sistema

Copiá todo lo que sigue debajo de la línea.

---

## Contexto

Camaleón ya tiene implementado `PROMPT Camaleon Pulido Visual.md`. Este pedido reorganiza la navegación en **5 etapas**, convierte Capas en un **recorrido 3D en primera persona**, lleva el Moodboard a un **lienzo libre tipo Miro** y suma todo lo necesario para que el sistema **explique en qué estado está**: etapas completas, actividad en curso, guardado, vuelta atrás, deshacer, prevención y errores.

La referencia visual y de comportamiento es el prototipo `Camaleón Profundidad v2.dc.html` (handoff). Ante cualquier duda de medidas, textos o comportamiento, ese archivo manda. **Mantené los datos, los tipos y los endpoints actuales**: es un cambio de interfaz y de flujo, no de modelo.

Seguí usando los tokens del pulido visual: vacío `oklch(0.165 0.012 40)`, hueso `#F2EFE8`, Archivo y Geist Mono, escala de espaciado 4/8/12/16/24/32/48/64 y un solo botón primario por pantalla. Colores de capa (camaleón): Núcleo `oklch(0.68 0.14 33)`, Soporte `oklch(0.80 0.12 86)`, Acento `oklch(0.74 0.09 190)`.

## 1 · Estructura de la pantalla

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

## 2 · Barra lateral de etapas

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

## 3 · 01 Referencias (Moodboard tipo Miro)

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

## 4 · 02 Revisar

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

## 5 · 03 Capas (recorrido en primera persona)

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

## 6 · 04 Sistema y 05 Probar (pantallas separadas)

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

## 7 · Visibilidad del estado

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

## 8 · Deshacer y avisos

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

## 9 · Prevención y errores

- **Analizar pide al menos 5 referencias.** Con menos, el primario se deshabilita con `Faltan 3 referencias` y al hacer clic explica por qué.
- **Después de analizar,** el primario de Referencias pasa a `Seguir en Revisar`. Volver a analizar es una acción secundaria y pide confirmar con un aviso: "Si volvés a analizar, se reinicia tu revisión de sugerencias. Tus capas no cambian." Acción: `Analizar igual`.
- **Núcleo vacío** bloquea `Ver sistema`, Sistema y Probar, explicando el motivo.
- **Estados de error a diseñar e implementar**, cada uno con causa en lenguaje simple y una acción:
  - Imagen que no se pudo leer: "El agente encontró 6 piezas. 1 imagen no se pudo leer (archivo dañado)." Acción `Ver cuál`, que lleva al lienzo y marca la imagen con borde rojo.
  - URL inválida: "No pudimos abrir esa dirección." Acción `Reintentar`.
  - Análisis fallido: "El análisis se cortó." Acción `Reintentar`. Las referencias se mantienen.
  - Generación fallida: "No pudimos generar la variante 2." Acción `Reintentar` (solo esa variante).

## 10 · Ejemplos

Usá imágenes reales en todas las etapas (las fotos de Badder del proyecto de ejemplo o las del usuario). **Nada de cuadrados de color sueltos:**
- Las piezas de color se muestran sobre una foto donde ese color aparece, con una etiqueta de color abajo a la izquierda: fondo vacío al 78%, filete izquierdo del color y el hex en Geist Mono.
- Las piezas tipográficas muestran la palabra de la marca sobre la foto.

## Orden de trabajo (commits chicos)

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

## Criterio de éxito

- En cualquier momento, la barra superior dice en qué etapa estoy y qué está haciendo el sistema.
- Con solo mirar la barra lateral sé qué etapas terminé, cuál sigue y si algo quedó desactualizado.
- Si vuelvo atrás, el sistema me lo dice y me ofrece volver a donde estaba.
- Toda acción destructiva se puede deshacer.
- No hay acciones que fallen en silencio.
- Una persona nueva completa el recorrido de punta a punta sola: carga, analiza, revisa, ordena, mira el sistema, prueba, aprueba y descarga.
