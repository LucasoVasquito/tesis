# Prompt para Claude Code · Corrección de Tesis (simplificación)

Copiá todo lo que sigue debajo de la línea.

---

## Contexto

Ya implementaste el rework de **Tesis** según `design_handoff_emergent_rework/PROMPT Claude Code.md`. Funciona, pero no se entiende: hizo falta un instructivo largo para explicar cómo usarlo, y eso indica que la interfaz no se explica sola. Este documento corrige la experiencia y **tiene prioridad sobre el prompt anterior** donde choquen.

Se mantienen:
- El concepto: tres hojas en profundidad (01 Núcleo adelante, 02 Soporte, 03 Acento) más las referencias al fondo.
- La identidad visual 1c: paleta, Archivo, rótulos de color plano y barra clara abajo.
- DALL·E, la paleta que sale del corpus y la regla de que la IA sugiere y el diseñador decide.

Cambian la navegación, el vocabulario, la cantidad de pasos y la forma de mostrar el 3D.

## Problemas detectados (no repetirlos)

1. **El 3D tapa en vez de mostrar.** Las hojas inclinadas se superponen, los rótulos se pisan, las hojas vacías ocupan media pantalla y el contenido real queda torcido al fondo.
2. **Todo depende de memorizar teclas.** Hay 13 atajos y casi ningún botón visible.
3. **Demasiados conceptos:** lámina, corpus, fragmento, grupo, patrón, propuesta, revelado, espejo, brief, mapa, bitácora.
4. **No está claro qué hacer en cada momento.** La acción principal ("aceptar 10 propuestas") está escondida en la barra de atajos.
5. **Callejones sin salida.** La vista de frente sale vacía si no se confirmó nada.
6. **El Mapa de trazabilidad usa la estética vieja** y parece otra app.

## Principios

- **Una pantalla, una pregunta, un botón principal grande.**
- **Todo lo que se hace con teclado tiene un botón visible.** El atajo se muestra dentro del botón, por ejemplo `[1] NÚCLEO`. La barra inferior queda solo como recordatorio de los atajos del momento.
- **La IA propone primero y el diseñador corrige.** El diseñador nunca arranca de una hoja vacía.
- **Nunca una pantalla vacía.** Si falta algo, se muestra la sugerencia en punteado o una acción clara para avanzar.
- **El 3D se tiene que leer.** La hoja activa está siempre de frente (sin inclinación) y es completamente legible. Las otras se ven como bordes detrás.

## Vocabulario (usar solo estas palabras en la interfaz)

- **Referencias:** las imágenes subidas. Reemplaza a "corpus".
- **Pieza:** cualquier elemento del sistema (tipografía, textura, color, personaje, composición). Reemplaza a "fragmento", "grupo", "patrón" y "propuesta".
- **Hoja:** Núcleo, Soporte, Acento. Reemplaza a "lámina".
- **Sugerencia:** pieza que ubicó la IA y el diseñador todavía no confirmó. Se muestra con borde punteado.
- **La IA notó:** todo aviso de la IA. Reemplaza a "revelado", "no lo marcaste" y "espejo".
- **Sistema:** la vista de frente con el resultado. Reemplaza a "girar" y "síntesis".

En el código, los tipos pueden conservar sus nombres internos, pero la interfaz muestra solo estas palabras.

## Estructura: tres pantallas

Arriba al centro, un indicador clickeable: `01 SUBIR · 02 ORDENAR · 03 SISTEMA`. Reemplaza a `ARMAR · REVELAR · GIRAR`.

Arriba a la derecha queda solo el menú del proyecto y la ayuda. **Mapa** y **Bitácora** salen de la barra superior (ver más abajo).

## Paso a paso

### Paso 1 · Empezar (pantalla 01 SUBIR, proyecto nuevo)
- **El diseñador:** escribe una frase de intención en un campo grande ("hamburguesería cruda, de barrio") y aprieta Enter o el botón **CONTINUAR**.
- **Tesis:** redacta el brief con la IA a partir de la frase.
- **Se ve:** la frase queda como título del proyecto, con un link chico "ver brief" que abre un panel editable.

### Paso 2 · Subir referencias (pantalla 01 SUBIR)
- **El diseñador:** arrastra, pega (⌘V) o elige imágenes con el botón **+ IMÁGENES**.
- **Tesis:** las guarda como referencias.
- **Se ve:** una grilla plana y legible de referencias, sin inclinar. Abajo a la derecha, un botón grande naranja: **ANALIZAR [⏎]**. Con menos de 6 imágenes, el botón está desactivado y dice "Subí al menos 6 referencias".

### Paso 3 · Analizar (transición entre 01 y 02)
- **El diseñador:** aprieta ANALIZAR.
- **Tesis**, en un solo proceso:
  1. Recorta cada referencia en piezas.
  2. Junta las piezas equivalentes de distintas referencias en una sola pieza.
  3. Cuenta en cuántas referencias aparece cada pieza (evidencia).
  4. Sugiere una hoja para cada pieza según su evidencia y el brief.
- **Se ve:** progreso real ("Analizando 12 de 39 referencias…"). Al terminar, pasa solo a 02 ORDENAR.
- **Error:** si falla la API, mostrar un mensaje en lenguaje simple ("No se pudo analizar. Revisá la conexión con la IA.") con el botón REINTENTAR. El detalle técnico va en un desplegable.

### Paso 4 · Ordenar (pantalla 02 ORDENAR, el corazón de la app)

**La escena:**
- La hoja activa está de frente, sin inclinación, y ocupa el centro. Sus piezas se ven como tarjetas grandes y legibles: imagen, nombre y evidencia ("14 de 39 referencias").
- Las otras dos hojas se ven detrás como bordes y rótulos desplazados arriba a la derecha, más chicos, como en el túnel 1a de `Emergent Eje Z Wireframes.dc.html`.
- Las referencias quedan al fondo, en gris, como franja inferior.
- A la izquierda, tres pestañas grandes: `01 NÚCLEO (4)`, `02 SOPORTE (5)`, `03 ACENTO (2)`, con la cantidad de piezas.
- Cambiar de hoja: clic en la pestaña, rueda o W/S. La transición es un desplazamiento en Z de unos 400 ms: la hoja activa se aleja y llega la siguiente.

**Cada pieza tiene tres acciones visibles** (al pasar el mouse o con la pieza seleccionada):
- `[⏎] CONFIRMAR`: queda fija. El borde pasa de punteado a lleno.
- `[↑] SUBIR` / `[↓] BAJAR`: la cambia de hoja.
- `[X] SACAR`: sale del sistema y va a una bandeja "Fuera del sistema", recuperable.

**Botón general:** `CONFIRMAR TODAS LAS SUGERENCIAS DE ESTA HOJA`.

**Al seleccionar una pieza:**
- Se iluminan en la franja de referencias las imágenes de donde salió, y las demás se apagan. Esto reemplaza a la auditoría.
- En un panel lateral se ven sus referencias en grande, para revisarlas.

**La IA notó** (siempre una sola línea, en una franja arriba de la barra de atajos, que se puede cerrar):
- Cuando el diseñador ubica una pieza en contra de la evidencia: "La IA notó: pusiste *Sello* en Soporte, pero aparece en 11 de 39 referencias."
- Cuando hay una pieza repetida que quedó sin hoja: "La IA notó: *Líneas de corte* se repite en 9 referencias. [UBICAR]".
- Nunca bloquea: es solo información.

**Botón principal:** abajo a la derecha, **VER SISTEMA [ESPACIO]**.

### Paso 5 · Ajustar piezas (opcional, dentro de 02 ORDENAR)
Están en un menú `···` de cada pieza. No son pasos obligatorios.
- **Unir con…:** junta dos piezas equivalentes. También se puede seleccionar varias con ⇧ + clic y apretar **UNIR**.
- **Separar:** divide una pieza que mezcla dos cosas. La IA propone la división y el diseñador la confirma.
- **Renombrar.**
- **Recortar de nuevo:** abre la referencia original para ajustar el recorte. Esto reemplaza al desglose manual con D.

### Paso 6 · Ver el sistema (pantalla 03 SISTEMA)
- **El diseñador:** aprieta VER SISTEMA o Espacio.
- **Tesis:** gira la pila (unos 500 ms) y la compone como una página editorial, según el wireframe 2d de `Tesis Identidad Visual.dc.html`:
  - **Núcleo:** titular grande en bloque naranja, con imagen y regla completa.
  - **Soporte:** cuerpo en columnas, con regla corta.
  - **Acento:** nota al margen, de una línea.
- **Nunca vacía:** las sugerencias sin confirmar aparecen en punteado con el rótulo "sugerencia". Si no hay nada en el Núcleo, se usa la pieza con más evidencia como sugerencia de titular.
- Al pasar el mouse por cualquier elemento de la página se ven sus referencias. Esto reemplaza a la pantalla Mapa.
- **Volver:** Espacio o `← ORDENAR`.

### Paso 7 · Usar el sistema (dentro de 03 SISTEMA)
Columna de botones a la derecha:
- **LINEAMIENTOS:** documento ordenado por hoja. El Núcleo lleva regla completa con ejemplos, el Soporte regla corta y el Acento una línea. Las sugerencias sin confirmar van marcadas.
- **PROMPT DALL·E:** construido en orden de hoja. El Núcleo va primero y con más peso.
- **GENERAR CON DALL·E:** genera piezas a partir del sistema.
- **IMAGEN:** exporta la página como PNG.

Cualquier cambio en Ordenar actualiza la página al volver.

## Mapa y Bitácora

- **Mapa:** sale de la barra superior. La trazabilidad se resuelve con el resaltado de referencias en Ordenar y en Sistema. Si se conserva como vista avanzada, va en el menú del proyecto y se rediseña con la identidad 1c: fondo vacío, Archivo, rótulos de color por hoja y líneas en el color de la hoja.
- **Bitácora:** pasa al menú del proyecto.

## Primera vez

- Si no hay proyectos, abrir el proyecto de ejemplo **Badder** ya analizado, en 02 ORDENAR, con un cartel: "Esto es un proyecto de ejemplo. [EMPEZAR EL MÍO]".
- Una guía de 3 carteles, solo la primera vez y salteable:
  1. "Estas son tus hojas: adelante va lo más importante."
  2. "La IA ya ubicó las piezas. Confirmá, subí o bajá."
  3. "Cuando estés listo, mirá tu sistema."

## Atajos (aceleradores, nunca la única forma)

- **Rueda / W / S:** cambiar de hoja
- **← / →:** elegir pieza
- **⏎:** confirmar
- **↑ / ↓:** subir o bajar de hoja
- **X:** sacar
- **Espacio:** ver sistema / volver
- **Esc:** soltar la selección
- **⌘V:** pegar imágenes (en 01 SUBIR)

**Quitar:** D, G, P, A y 1/2/3 como atajos principales. Sus funciones pasan al menú `···` de la pieza o a los botones de La IA notó.

La barra inferior muestra como máximo 5 atajos, solo los del momento.

## Orden de trabajo (commits chicos)

1. **Vocabulario y navegación:** renombrar textos de la interfaz, el indicador `SUBIR · ORDENAR · SISTEMA`, y sacar Mapa y Bitácora de la barra superior.
2. **01 Subir:** frase, grilla plana de referencias, botón ANALIZAR con mínimo de 6, progreso real y error en lenguaje simple.
3. **Análisis unificado:** un solo proceso que recorta, junta, cuenta y sugiere hoja. Las piezas llegan ya ubicadas como sugerencias.
4. **02 Ordenar, escena:** hoja activa de frente y legible, las otras como bordes detrás, pestañas laterales y transición en Z.
5. **02 Ordenar, acciones:** confirmar, subir, bajar y sacar con botones visibles y atajos. Confirmar todas. Resaltado de referencias y panel lateral.
6. **La IA notó:** avisos de contradicción y de piezas sin hoja.
7. **Ajustar piezas:** menú `···` con unir, separar, renombrar y recortar de nuevo.
8. **03 Sistema:** página editorial sin vacíos, trazabilidad al pasar el mouse y exportaciones.
9. **Primera vez:** proyecto de ejemplo y guía de 3 carteles.
10. **Limpieza:** eliminar el código del flujo anterior que ya no se usa. Actualizar el README con este flujo.

Al terminar cada commit, mostrame qué cambió y qué falta.

## Criterio de éxito

Alguien que nunca usó Tesis tiene que poder, sin leer nada:
1. subir imágenes,
2. entender que la IA ordenó las piezas por importancia,
3. corregir al menos una,
4. ver su sistema.

Todo en menos de 3 minutos. Si para algún paso hace falta explicar una tecla, ese paso tiene que tener un botón.

## Configuración

El error de análisis que aparece hoy es por falta de `GEMINI_API_KEY` en el `.env` del servidor. Agregá un `.env.example` con todas las variables necesarias y una sección "Configuración" en el README.
