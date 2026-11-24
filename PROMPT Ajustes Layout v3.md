# Camaleón Corpus · Ajustes de layout y pulido (v3)

Prompt para Claude Code. Va encima de `MEGAPROMPT Camaleon Corpus.md` y de `PROMPT Estetica Editorial Oscuro.md`. No cambia el flujo ni la estética: corrige errores, el aprovechamiento del ancho y la legibilidad. Prioridad: P0 (antes del test), P1 (si da el tiempo).

---

## P0 · Errores que van a confundir en el test

1. **Color primario sacado de una pieza descartada.** En Capas, "1 · Primario #FD9F01" dice venir de "Paleta cromática de alto contraste…", que el usuario descartó en Revisar. Los colores del sistema solo pueden derivarse de piezas aceptadas. Si se descarta la pieza fuente, se recalcula el color con las aceptadas y se avisa: "El primario cambió porque descartaste su pieza de origen. ↶ Deshacer".
2. **Piezas duplicadas.** "texturas plastico" aparece dos veces en Núcleo y en Sistema. Si dos sugerencias tienen el mismo título y la misma capa, se fusionan en una pieza con la suma de referencias, o el agente las nombra distinto (por ejemplo "Textura plástico · logotipo" y "Textura plástico · marco").
3. **Estado inferior contradictorio.** "Volviste a Referencias · Seguir en Probar →" aparece en la etapa 1. El botón "Seguir en…" solo aparece si el usuario saltó hacia atrás desde una etapa posterior y lleva a esa etapa, no siempre a Probar. Si no hubo salto, la línea muestra solo el estado del agente.
4. **Badge "!" en Sistema sin explicación.** Al pasar el mouse o tocarlo se explica qué falta (por ejemplo "Hay 2 piezas sin color confirmado"). Si no hay nada pendiente, no aparece.
5. **Superposiciones.**
   - Referencias: el título "REFERENCIAS" y el campo "Frase de intención" tapan imágenes del lienzo. Pasan a una franja fija arriba (altura de unos 160 px) y el lienzo empieza debajo. Al hacer zoom o moverse, el título se reduce a 32 px.
   - Capas: el texto de ayuda y "Ver sistema" tapan piezas. La ayuda se muestra una sola vez como aviso descartable y después vive en "? Ayuda". La barra inferior reserva su alto (`padding-bottom` del contenido igual al alto de la barra más 24 px).
   - Capas: la capa Soporte que asoma detrás del Núcleo arriba se lee como un error. Se muestra solo como pestaña con su nombre y cantidad ("SOPORTE · 4 →"), sin mostrar su contenido detrás.

## P0 · Escala de texto

A 1920 px de ancho hay mucho texto de 10–12 px (paneles de Capas, Sistema y Probar). Mínimos:
- Texto de interfaz y paneles: **14 px**. Etiquetas en mayúscula: **12 px** con +0.06 em.
- Descripciones: **15–16 px**, con un ancho máximo de 68 caracteres.
- Escala con `clamp()` según el viewport. En 1920 todo crece cerca de un 15 % respecto de 1440.
- Los títulos de pieza van en **Manrope 600** y no en Display. Big Shoulders queda solo para nombres de etapa y de capa. "PATRONES DE REPETICIÓN TIPOGRÁFICA Y TRAMAS…" en Display a 5 líneas no se lee.

## P0 · Etapa 4 Sistema: usar el ancho

Hoy es una columna de unos 460 px en 1920. Pasa a un pliego de revista de tres zonas:

```
| índice fijo 240px | contenido  minmax(0,1fr) | ficha fija 320px |
```

- **Índice (izquierda, sticky):** Núcleo / Soporte / Acento con su cantidad. Muestra la sección activa al hacer scroll y lleva a cada una al tocarla.
- **Contenido (centro):** cada capa abre con su titular a escala (Núcleo 132 px, Soporte 80, Acento 56).
  - Núcleo: pieza principal grande a la izquierda (unas 7 columnas de 12) con su título y descripción a la derecha (5 columnas). Debajo, el resto de las piezas en una grilla de 3–4 columnas.
  - Soporte: grilla de 4 columnas con miniaturas más chicas.
  - Acento: fila de 4–6 miniaturas.
  - La diferencia de tamaño entre capas tiene que ser evidente sin leer nada.
- **Ficha (derecha, sticky):** paleta (muestras grandes con hex y rol), tipografías detectadas (muestra "Aa" y nombre), reglas del sistema en 3–5 líneas, y Exportar (PNG / PDF / Prompt-JSON). Así la barra inferior queda solo con "Probar en una pieza".
- Por debajo de 1280 px la ficha baja al final y el índice pasa a pestañas arriba.

## P0 · Etapa 5 Probar: el resultado al centro

Hoy el resultado es una franja vacía arriba y una gran mancha de glow, con todos los controles apretados a la derecha. Nuevo layout:

```
| receta 300px | resultado  minmax(0,1fr) | pieza y pedido 340px |
```

- **Izquierda, "La receta":** las tres capas con lo que aporta cada una, en 14–15 px. "Editar" vuelve a Capas.
- **Centro, "Resultado":** dos marcos grandes lado a lado (Variante A / Variante B) con la proporción de la pieza elegida (logotipo cuadrado, afiche 4:5, fachada 16:9, post 1:1, packaging según la plantilla).
  - **Estado vacío:** los marcos muestran en tenue los colores y tipografías que se van a usar, más la frase "Generá dos variantes de tu logotipo". El vacío anticipa el resultado en lugar de verse roto.
  - **Generando:** esqueleto con el punto del agente latiendo y "Componiendo con Núcleo…".
  - **Listo:** "Aprobar esta" debajo de cada variante. Al aprobar, la otra se atenúa y se habilita "Exportar PNG".
- **Derecha:** "¿Qué querés probar?" (los chips), "Texto que aparece", "Pedido libre" y "Generar 2 variantes" como botón primario del panel. Se saca de la barra inferior.
- El glow va detrás de los marcos y es más chico (un 60 % del ancho del centro), no flotando en el vacío.

## P1 · Etapa 2 Revisar (pantalla de revisión completa)

- La columna queda contra la izquierda y deja vacía la mitad derecha. Se usan dos columnas: a la izquierda titular y conteo, a la derecha la lista de descartadas. Si no hay descartadas, se centra.
- La miniatura de "Paleta cromática…" muestra "#FFFFFF" sobre blanco. Las piezas de paleta muestran sus 3–4 colores en franjas, no un hex.
- Los títulos largos hacen salto a 2 líneas en lugar de cortarse con "…".

## P1 · Capas

- El panel derecho ("Estás en", "Colores") pasa a 14 px y suma separación entre bloques.
- El bloque Núcleo puede ocupar más ancho (hasta unos 1100 px) y mostrar 4 columnas en pantallas de 1600 px o más.

## Criterios de aceptación

- [ ] Ningún color del sistema proviene de una pieza descartada.
- [ ] No hay piezas con el mismo título dentro de la misma capa.
- [ ] Ningún título, campo o barra flotante tapa contenido en 1366, 1440 y 1920 px.
- [ ] Ningún texto de interfaz mide menos de 14 px (12 px las etiquetas en mayúscula).
- [ ] En 1920 px, Sistema y Probar usan al menos el 80 % del ancho útil.
- [ ] Probar en estado vacío muestra los dos marcos de variante.
- [ ] "Seguir en…" solo aparece después de un salto hacia atrás.
