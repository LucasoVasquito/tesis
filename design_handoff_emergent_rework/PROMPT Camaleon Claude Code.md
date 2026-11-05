# Prompt para Claude Code · Camaleón (moodboard en capas, color camaleón, Sistema y Probar)

Copiá todo lo que sigue debajo de la línea.

---

## Contexto

Trabajás sobre el repo `LucasoVasquito/tesis` (React 19 + TypeScript + Vite). Ya está implementado el flujo simplificado de `design_handoff_emergent_rework/PROMPT Correccion Claude Code.md`: tres pantallas SUBIR · ORDENAR · SISTEMA, piezas, hojas, "La IA notó" y la identidad 1c. **Conceptualmente funciona y se mantiene.** Este documento corrige lo visual, une Subir con Ordenar, suma el momento Probar y **tiene prioridad sobre los prompts anteriores** donde choquen.

Resumen de cambios:
1. La app pasa a llamarse **Camaleón**.
2. El moodboard pasa a ser tridimensional: tres capas apiladas más un panel de referencias. Subir y Ordenar quedan en una sola pantalla.
3. Los colores de Núcleo, Soporte y Acento dejan de ser fijos y salen de la paleta del proyecto (color camaleón).
4. Lo que ubica el usuario pesa más que lo que ubica el agente.
5. Se rediseña la pantalla Sistema.
6. "Generar con DALL·E" pasa a llamarse **Probar en un ejemplo** y se convierte en un momento propio, con una lógica que respeta la jerarquía.

## 1 · Nombre y vocabulario

- **Nombre:** reemplazá "Tesis" por **Camaleón** en toda la interfaz: marca en la barra superior, títulos, exportaciones y README. La marca se escribe CAMALEÓN, en Archivo 900 condensada.
- **Origen de cada elemento:** las etiquetas son **USUARIO** y **AGENTE**. No uses "vos", "IA" ni "La IA notó".
- **Avisos:** "La IA notó" pasa a ser **"El agente notó"**.
- **Capas:** "Hoja" pasa a ser **Capa** en toda la interfaz: Capa 1 · Núcleo, Capa 2 · Soporte, Capa 3 · Acento.
- **Se mantienen:** Referencias, Pieza, Patrón (un grupo de piezas o referencias con nombre) y Sugerencia (lo que ubicó el agente y el usuario todavía no confirmó).

## 2 · Navegación

Indicador arriba al centro: `01 MOODBOARD · 02 SISTEMA · 03 PROBAR`.

01 MOODBOARD reemplaza a 01 SUBIR y 02 ORDENAR.

## 3 · Pantalla 01 MOODBOARD (tridimensional)

### Estructura
- **Izquierda, ocupando la mayor parte:** la escena con las tres capas.
- **Derecha, columna fija de unos 320px:** el **panel de referencias**.
- **Abajo:** la barra de atajos y el botón principal.

### Las capas
- Cada capa es un plano rectangular con su rótulo ("CAPA 1 · NÚCLEO") arriba a la izquierda.
- **La capa activa** está de frente, sin inclinación, al centro, a tamaño completo y 100% legible. Es la única que recibe interacción directa.
- **Las otras dos asoman desplazadas y difuminadas**, para que nunca haya caos visual:
  - **Capa 2 · Soporte:** detrás, desplazada arriba a la izquierda, escala aproximada 0.85, `filter: blur(3px)`, opacidad 0.55.
  - **Capa 3 · Acento:** más atrás, desplazada arriba a la derecha, escala aproximada 0.7, `filter: blur(5px)`, opacidad 0.35.
  - El desplazamiento cambia según la capa activa: siempre se ven las otras dos asomando, nunca tapadas del todo por la activa.
- **Su rótulo nunca se difumina:** las capas de atrás muestran su rótulo nítido sobre el borde que asoma, para que el usuario siempre sepa qué hay detrás.
- **Indicador de profundidad:** a la derecha de la escena, tres marcas (1, 2, 3) con la activa resaltada. Además, el nombre de la capa activa va grande en el rótulo superior. El usuario tiene que saber en todo momento en qué capa está.
- **Cambiar de capa:**
  - Rueda del mouse o trackpad: entrar o salir de capas.
  - W/S.
  - Clic en el borde o el rótulo de una capa que asoma.
  - Clic en las marcas del indicador.
- **Transición entre capas:** unos 400 ms con desaceleración. La activa se aleja, gana desenfoque y se desplaza a su lugar, y la nueva avanza y se enfoca. Con `prefers-reduced-motion`, se usa un fundido de 150 ms.

### El panel de referencias (derecha)
- Grilla de miniaturas de 2 columnas con todas las referencias que todavía no están ubicadas en una capa.
- Arriba: título "REFERENCIAS · n" y los botones `+ IMÁGENES` y `POR URL`.
- **Toda referencia nueva cae acá automáticamente,** ya sea que entre por arrastre, por pegado (⌘V) o por URL. Se marca con un rótulo "NUEVA" hasta la próxima vez que se analiza.
- Abajo del panel va el botón principal: **ANALIZAR REFERENCIAS [⏎]**.

### Ubicar referencias (usuario)
- El usuario arrastra una miniatura del panel a la capa activa, o la suelta sobre el borde o el rótulo de una capa que asoma.
- **Teclado:** con una miniatura del panel seleccionada, 1/2/3 la manda a la capa correspondiente.
- Dentro de la capa activa, las referencias se pueden mover y redimensionar libremente. Es el espacio personal del usuario: no se acomodan solas en una grilla.
- Para devolver una referencia al panel, se la arrastra de vuelta al panel o se aprieta X.
- Toda referencia que ubica el usuario lleva borde lleno y la etiqueta **USUARIO**.

### Analizar (agente)
- Al apretar ANALIZAR REFERENCIAS, el agente:
  1. Analiza **todas** las referencias, las ubicadas y las del panel.
  2. Extrae las piezas y las agrupa en patrones (como hasta ahora).
  3. Ubica en capas las referencias que quedaron en el panel y las piezas extraídas.
- **Nunca mueve lo que ubicó el usuario.** Si la evidencia contradice una ubicación del usuario, solo avisa en la franja "El agente notó".
- Lo que ubica el agente lleva borde fino punteado y la etiqueta **AGENTE · SUGERENCIA**. El usuario lo confirma (⏎), lo mueve (↑↓ o arrastre) o lo saca (X).
- **Avisos del agente:** máximo uno visible a la vez, en una franja arriba de la barra de atajos. Por ejemplo: "El agente notó: ubicaste *Fotografía de producto* en Acento, pero aparece en 18 de 39 referencias." Con botones [MOVER A NÚCLEO] [IGNORAR].
- Durante el análisis, mostrar el progreso real ("Analizando 12 de 39…") sin bloquear la escena.

### Patrones dentro de una capa
- El usuario selecciona varios elementos de la capa activa (⇧ + clic o selección por arrastre) y aprieta **CREAR PATRÓN**: quedan agrupados con un contorno común y un nombre editable.
- Un patrón creado por el usuario lleva la etiqueta USUARIO y su propio peso. El agente puede sumarle evidencia, pero no lo desarma.
- Desde el menú `···` de un patrón se puede renombrar, desagrupar o moverlo de capa entero.

### Al seleccionar un elemento
Se iluminan en el panel (y en la capa) las referencias relacionadas, y un panel lateral desplegable muestra nombre, origen (USUARIO o AGENTE), evidencia ("14 de 39") y las referencias de donde sale.

### Botón principal
Abajo a la derecha: **VER SISTEMA [ESPACIO]**.

## 4 · Peso: el usuario sobre el agente

Calculá el peso de cada elemento así:

`peso = pesoCapa × pesoOrigen`

- **pesoCapa:** Núcleo 3, Soporte 2, Acento 1.
- **pesoOrigen:**
  - USUARIO: 2
  - AGENTE confirmado por el usuario: 1.5
  - AGENTE sin confirmar (sugerencia): 1

Reglas:
- Dentro de cada capa, ordenar siempre por peso: lo del usuario primero.
- En un conflicto, gana la ubicación del usuario y el aviso del agente queda registrado en la bitácora.
- El peso define el orden en Sistema, en Lineamientos y en Probar.

## 5 · Color camaleón

Los colores de capa ya no son fijos (fuera el naranja, hueso y azul de las capas). Salen de la paleta del proyecto, para que la interfaz no compita con el sistema y se camufle con él.

- **Antes del primer análisis:** tres neutros cálidos.
  - Núcleo `oklch(0.92 0.01 85)`
  - Soporte `oklch(0.78 0.01 85)`
  - Acento `oklch(0.64 0.01 85)`
- **Después del análisis:**
  1. Tomá la paleta extraída del corpus (ya existe).
  2. **Núcleo:** el color con más peso entre las piezas de Núcleo. Si el Núcleo no tiene piezas de color, usá el color dominante del corpus.
  3. **Soporte y Acento:** el siguiente color, cuyo tono esté a más de 40° de los ya elegidos.
  4. **Normalizá en oklch:** conservá solo el tono (H) y fijá luminosidad y saturación (Núcleo L 0.80 C 0.09, Soporte L 0.74 C 0.07, Acento L 0.68 C 0.06). Así nunca grita, siempre contrasta sobre el fondo oscuro y no compite con las referencias.
  5. Si la paleta tiene menos de 3 tonos distintos, completá con los neutros.
- Exponé los colores como variables CSS (`--capa-1`, `--capa-2`, `--capa-3`) y animá el cambio en unos 800 ms. El momento en que la interfaz cambia de color al terminar el análisis es parte de la identidad.
- **Uso del color de capa, solo en detalles:** rótulos, filetes, borde de selección, indicador de profundidad y marcas en el panel. **Nunca como fondo de bloques grandes.**
- El color nunca es el único diferenciador: cada capa conserva su número y su posición.
- La interfaz base (fondo vacío, texto hueso, barra de atajos) se mantiene igual.

## 6 · Pantalla 02 SISTEMA (rediseño)

La información actual está bien. El problema es estético: naranja en todo, bordes punteados en todo, títulos larguísimos y media página vacía.

- **Fondo oscuro** (el vacío de la app) en lugar de la página clara. Desaparecen los bloques de color llenos.
- **Grilla editorial de 12 columnas,** con márgenes generosos:
  - **Núcleo (columnas 1 a 8):** la imagen principal grande (relación 4:3 o la original), nombre en Archivo 900 condensada a unos 72px y la regla completa debajo en 2 o 3 líneas. Si hay varias piezas de Núcleo, la primera es protagonista y las otras van más chicas debajo.
  - **Soporte (columnas 1 a 8, debajo del Núcleo):** tarjetas en grilla de 2 o 3 columnas, cada una con imagen, nombre y regla corta.
  - **Acento (columnas 9 a 12, al costado):** columna al margen, con imagen chica, nombre y una línea.
- Cada sección se abre con un rótulo del color de su capa ("CAPA 1 · NÚCLEO") y un filete fino del mismo color.
- **Sugerencias:** sin bordes punteados. Llevan una etiqueta chica `AGENTE · SUGERENCIA` y la imagen con opacidad 0.85. Lo del usuario lleva `USUARIO`.
- **Nombres cortos:** pedile al agente nombres de 2 a 4 palabras ("Tipografía curvada", "Textura plástica") y la descripción por separado. Nunca truncar con puntos suspensivos los nombres: si son largos, están mal generados.
- **Sin espacio vacío:** la página se ajusta al contenido, sin altura fija.
- **Columna de acciones a la derecha:**
  - `LINEAMIENTOS`
  - `PROMPT`
  - `IMAGEN`
  - y separado, el botón destacado **PROBAR EN UN EJEMPLO**, que lleva a 03 PROBAR.
- Al pasar el mouse por cualquier elemento se iluminan sus referencias (como ahora).

## 7 · Pantalla 03 PROBAR (aplicar el sistema)

Cambiá "Generar con DALL·E" por **Probar en un ejemplo** en toda la app.

Esta pantalla sirve para verificar el sistema aplicándolo a una pieza concreta, no para generar por generar. Se rediseña con la identidad de Camaleón y deja atrás la estética vieja de la captura actual.

### Estructura en tres columnas
1. **Izquierda: la pieza.** Elegís el tipo: Logotipo, Fachada, Packaging, Afiche, Post, Story, Web u Otra. Abajo aparecen el formato sugerido, el texto que aparece en la pieza (opcional) y un pedido libre (opcional).
2. **Centro: la receta.** Es lo nuevo y lo más importante: muestra exactamente qué parte del sistema se va a usar, ordenada por capa y por peso.
   - **CAPA 1 · NÚCLEO:** entra todo y no se puede desmarcar. Rótulo "obligatorio".
   - **CAPA 2 · SOPORTE:** el agente preselecciona las 1 o 2 piezas que tienen sentido para el tipo de pieza (por ejemplo, el patrón de packaging entra en Packaging pero no en Logotipo). Lo del usuario va primero. El usuario puede marcar o desmarcar.
   - **CAPA 3 · ACENTO:** como máximo una pieza, preseleccionada solo si aplica. Rótulo "detalle".
   - Cada ítem muestra miniatura, nombre, origen (USUARIO o AGENTE) y un check.
   - Abajo, el botón **GENERAR 2 VARIANTES**.
3. **Derecha: los resultados.** Las variantes generadas, cada una con su control:
   - Por cada pieza del Núcleo: ✓ respetada / ✕ no respetada, evaluado por el agente con visión sobre la imagen generada.
   - Botones: `APROBAR`, `OTRA VARIANTE` y `DESCARGAR`.

La tira superior con las piezas aprobadas (Logotipo, Fachada, Packaging…) se mantiene, con la lógica actual: el logo aprobado se reutiliza en las demás.

### Lógica del pedido (prompt)
Construí el prompt en este orden, siempre:
1. **Tipo de pieza y formato.**
2. **Núcleo:** cada pieza como instrucción obligatoria ("debe tener…"), en orden de peso.
3. **Soporte:** las piezas marcadas, como instrucciones secundarias ("incorporar…").
4. **Acento:** como detalle menor ("un detalle de…, en poca superficie").
5. **Paleta:** los colores del proyecto, en proporción según la capa.
6. **Texto y pedido libre** del usuario.
7. **Restricciones:** "no agregar elementos ajenos al sistema".

Reglas:
- **Imágenes de referencia:** si el modelo de imagen lo permite (gpt-image-1 acepta imágenes de entrada), mandá como referencia visual las imágenes de las piezas del Núcleo, como máximo 3 y priorizando las del usuario. Si no lo permite, describilas en detalle en el texto.
- **Límite:** como máximo de 3 a 5 decisiones en total, para no saturar el pedido. Si hay más, entran por orden de peso.
- **Ver el prompt:** un desplegable "Ver pedido completo" muestra el prompt final, para transparencia y para la tesis.
- **Comparación opcional:** el modo "Con el sistema vs. Directo" pasa a un switch chico arriba de los resultados.

## 8 · Atajos

- **Rueda / W / S:** cambiar de capa
- **1 / 2 / 3:** mandar a una capa el elemento seleccionado del panel
- **← / →:** elegir elemento
- **⏎:** confirmar sugerencia / analizar
- **↑ / ↓:** mover de capa
- **X:** devolver al panel o sacar
- **G:** crear patrón con la selección
- **Espacio:** ver sistema / volver
- **Esc:** soltar la selección

La barra inferior muestra como máximo 5 atajos, solo los del momento. Todo atajo tiene su botón visible.

## 9 · Modelo de datos

- **Referencia y pieza:** sumar `layer` (1, 2, 3 o null si está en el panel), `origin` ('user' | 'agent'), `confirmed` (boolean), `position` (x, y, w, h dentro de la capa) y `agentSuggestedLayer`.
- **Patrón:** `id`, `name`, `memberIds`, `layer`, `origin`, `evidence`.
- **Proyecto:** `layerColors` (los tres colores calculados) y `isNew` en las referencias que todavía no se analizaron.
- Migrá los proyectos existentes: todo lo que ya estaba ubicado pasa a `origin: 'agent'` y `confirmed` según su estado actual.

## 10 · Orden de trabajo (commits chicos)

1. **Nombre y vocabulario:** Camaleón, USUARIO/AGENTE, "El agente notó", Capa.
2. **Modelo de datos:** origen, posición, peso y migración.
3. **Moodboard, escena:** tres capas con desplazamiento y desenfoque, rótulos nítidos, indicador de profundidad y transición.
4. **Moodboard, panel:** panel de referencias, caída automática de las nuevas, arrastre a capas, 1/2/3 y devolver al panel.
5. **Análisis:** respetar lo del usuario, ubicar el resto como sugerencia, avisos y patrones con G.
6. **Color camaleón:** cálculo, normalización, variables CSS y animación.
7. **Sistema:** rediseño editorial oscuro y nombres cortos.
8. **Probar:** tres columnas, receta por capas, lógica del prompt, imágenes de referencia y control de respeto del Núcleo.
9. **Limpieza:** eliminar la pantalla SUBIR y la ORDENAR vieja, y actualizar el README.

Al terminar cada commit, mostrame qué cambió y qué falta.

## Criterio de éxito

Alguien que nunca usó Camaleón tiene que poder:
1. arrastrar al menos una referencia al Núcleo,
2. analizar,
3. entender qué ubicó él y qué ubicó el agente,
4. ver su sistema,
5. probarlo en un logo.

Todo en menos de 4 minutos, sin leer instrucciones. En todo momento tiene que saber en qué capa está.
