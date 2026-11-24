# Camaleón Corpus · Dirección estética: Editorial oscuro

Prompt para Claude Code. Se aplica **encima** de `MEGAPROMPT Camaleon Corpus.md`. Este documento solo cambia la capa visual: no toca flujo, lógica del agente, heurísticas ni exportaciones. Si algo de acá contradice al megaprompt en lo **visual**, manda este documento. En todo lo demás manda el megaprompt.

Referencia visual: opción **1b** de `Camaleón Direcciones Estéticas.dc.html`.

---

## 1. Objetivo

Sacar la app del look actual (fondo crema, acento terracota, serif humanista, tarjetas redondeadas, espaciado parejo) y llevarla a un lenguaje **editorial oscuro**: fondo casi negro, el color de las referencias es lo único que brilla y la jerarquía se marca con el **tamaño de la tipografía**, no con cajas.

Inspiración: Cosmos.so (lienzo sin cajas), Spotify / Apple Music (la interfaz toma el color del contenido), revistas de diseño (titulares condensados enormes).

## 2. Principios

1. **El contenido es el color.** La interfaz es neutra y oscura, y los colores detectados por el agente son los únicos protagonistas.
2. **Jerarquía por escala.** Núcleo > Soporte > Acento se lee primero por el tamaño del titular de cada capa y después por el tamaño de sus piezas.
3. **Sin cajas.** Nada de tarjetas con borde y sombra para agrupar. Se agrupa con espacio, alineación y tipografía. Las piezas sí son bloques de color llenos.
4. **Un solo brillo.** Cada pantalla tiene como máximo un resplandor difuso (radial) con el color Núcleo, en una esquina. No hay gradientes en botones ni textos.
5. **Camaleón intacto.** Todo lo de abajo son tokens que el motor de color recalcula en vivo. Nada de colores hardcodeados en componentes.

## 3. Tokens de color (derivados, no fijos)

Reemplazar los tokens actuales por estos. Valores por defecto entre paréntesis (proyecto de ejemplo: hamburguesería).

| Token | Regla de derivación | Default |
|---|---|---|
| `--bg` | Tono más oscuro de la paleta, mezclado hacia negro: `oklch(L 0.012 H)` con L = 0.14, H = tono del Núcleo | `#0D0C0C` |
| `--surface` | `--bg` con L + 0.06 (solo para piezas vacías, inputs y lienzo) | `#1E1C1B` |
| `--ink` | Blanco cálido con el tono del Núcleo, croma 0.01 | `#F4F1EC` |
| `--ink-2` | `--ink` al 75 % de opacidad. **Nunca menos**: es el mínimo para texto secundario | — |
| `--rule` | `--ink` al 12 % (filetes, retícula del lienzo) | — |
| `--layer-core` | Color dominante del Núcleo | `#C8472F` |
| `--layer-support` | Color dominante del Soporte | `#E2B23C` |
| `--layer-accent` | Color dominante del Acento | `#5FB3AE` |
| `--glow` | `radial-gradient(closest-side, var(--layer-core) 33 %, transparent)` | — |

Reglas:
- **Contraste automático.** Para cada texto se calcula el contraste contra su fondo real (incluido el bloque de color de una pieza). Si es menor a 4.5:1 (3:1 en titulares de 40 px o más), se invierte a `--bg` o `--ink`, el que dé más contraste. Esto ya existe en el megaprompt: mantenerlo y aplicarlo también a los titulares de capa coloreados (SOPORTE en mostaza, ACENTO en verde agua).
- **Override del usuario.** Si el diseñador cambia el fondo (por ejemplo a blanco o a un color de marca), se respeta tal cual y `--ink`, `--surface`, `--rule` y el glow se recalculan desde ese fondo. El modo oscuro es el default, no una imposición.
- Si un color de capa es demasiado oscuro para leerse como titular sobre `--bg` (contraste menor a 3:1), el titular usa `--ink` y el color pasa a un subrayado de 4 px debajo.

## 4. Tipografía

Dos familias (Google Fonts):

- **Display:** `Big Shoulders Display` 700 / 900, en mayúsculas, interletrado −0.01 em, interlineado 0.82–0.85.
- **Texto e interfaz:** `Manrope` 400 / 500 / 700.

Escala:

| Uso | Familia | Tamaño |
|---|---|---|
| Titular de capa Núcleo | Display 900 | 132 px (clamp 72–132) |
| Titular de capa Soporte | Display 700 | 64 px |
| Titular de capa Acento | Display 700 | 40 px |
| Título de etapa (Moodboard, Sistema…) | Display 900 | 96 px |
| Logo "CAMALEÓN" | Display 900 | 22 px, +0.04 em |
| Pregunta guía de capa | Manrope 500 | 22 / 16 / 15 px según la capa |
| Texto de interfaz | Manrope 400–500 | 13–15 px |
| Etiqueta de pieza | Manrope 500–700 | 12–18 px |
| Datos (9/38 refs, 3 piezas) | Manrope 500, cifras tabulares | 12–14 px |

No usar serif en ninguna parte. Eliminar la familia serif actual del proyecto.

## 5. Forma y espacio

- Radio: **4 px** en piezas grandes, **3 px** en miniaturas, **999 px** solo en el botón primario y en los stickers circulares. Ningún otro radio.
- Sin bordes en contenedores. Los filetes (`--rule`, 1 px) solo separan zonas del lienzo o filas de listas.
- Sombras: solo la pieza principal del Núcleo lleva `0 30px 80px` con su propio color al 33 %, como luz y no como elevación.
- Márgenes de pantalla de 40 px y separación entre columnas de 40 px. Ritmo vertical irregular a propósito: más aire arriba de cada titular de capa que abajo.

## 6. Componentes

**Barra superior** (sin fondo, flota sobre `--bg`)
- Izquierda: logo. Centro: las 5 etapas en Manrope 13 px. La etapa actual va en `--ink` con subrayado de 2 px en `--layer-core`, las completadas en `--ink-2` y las pendientes en `--ink` al 75 %. Derecha: "↶ Deshacer".
- Si el texto de las etapas pendientes no llega a 4.5:1, subirlo. Nunca usar opacidad menor a 0.75 para texto.

**Botón primario:** píldora en `--ink` con texto `--bg`, Manrope 700 14 px y padding de 14 × 22 px. Hover: el fondo pasa a `--layer-core` y el texto se ajusta por contraste.
**Botón secundario:** solo texto Manrope 500 con subrayado al hacer hover.

**Pieza**
- Bloque de color lleno con la etiqueta adentro, abajo a la izquierda, y el dato (9/38 refs) abajo a la derecha. El color de la etiqueta se calcula por contraste.
- Las piezas tipográficas usan `--surface` con una muestra de la tipografía detectada.
- Al tocar la muestra se abre la edición de color (definido en el megaprompt). El popover va en `--surface`, sin borde y con radio de 4 px.

**Zonas para soltar** (arrastre entre capas): al arrastrar, el titular de la capa destino se enciende en su color y aparece un filete punteado de 1 px `--ink` alrededor del área. No usar fondos de color en la zona.

**Toasts / estado del agente:** línea de texto en Manrope 14 px abajo a la izquierda, con un punto de 8 px en `--layer-core` que late mientras el agente trabaja. Sin cajas.

## 7. Por etapa

1. **Moodboard:** lienzo `--bg` con retícula de puntos en `--rule` cada 24 px. Las imágenes van sin marco y se ven a sangre. El título "MOODBOARD" en Display 96 px queda fijo arriba a la izquierda y se desvanece al hacer zoom. El glow arranca neutro y toma el color Núcleo apenas el agente detecta el primer patrón (transición de 1.2 s). Esa es la primera vez que el usuario ve el camaleón en acción.
2. **Revisar:** una sugerencia por vez, a pantalla completa. A la izquierda la pieza en grande y a la derecha el titular de la capa propuesta en Display, más la razón del agente en Manrope 22 px. Aceptar (botón primario) / Cambiar capa / Descartar.
3. **Capas:** igual que la referencia 1b. Columna izquierda Núcleo (grilla 2fr / 1fr con la pieza principal a doble alto) y columna derecha Soporte y Acento, cada una más chica. La vista 3D de profundidad (megaprompt) se mantiene como modo alternativo con el conmutador "Plano / Profundidad". En Profundidad, los planos son bloques `--surface` sin borde, separados en Z, y el Núcleo lleva el glow.
4. **Sistema:** página tipo revista. Titular "SISTEMA" en Display, las tres capas como secciones con su titular a escala, y paleta, tipografías y reglas como texto corrido con muestras. Esta vista es la base del PDF exportado, así que tiene que verse igual impresa (en impresión, `--bg` pasa a blanco y se recalcula todo por contraste).
5. **Probar:** la pieza de prueba centrada sobre `--bg` con el glow detrás. A la derecha, controles mínimos en texto y "Exportar PNG" como botón primario.

## 8. Movimiento

- Cambio de paleta: todos los tokens interpolan en oklch durante 600 ms con ease-out. No debe haber parpadeo.
- Cambio de etapa: el titular entra desde abajo 24 px con fade en 400 ms. El resto aparece en fade de 250 ms.
- Arrastre: la pieza se levanta con scale 1.03 y su sombra de color. Al soltarla, reacomodo con spring corto.
- Respetar `prefers-reduced-motion`: sin desplazamientos, solo fades de 150 ms.

## 9. Qué eliminar

- La paleta crema / terracota y cualquier color fijo en componentes.
- Las tarjetas con borde, sombra gris y radio de 12–16 px.
- Las tipografías serif.
- Los íconos decorativos que solo acompañan texto. Se quedan solo los funcionales (deshacer, zoom, cerrar).

## 10. Criterios de aceptación

- [ ] Con la paleta de ejemplo, Capas se ve como la referencia 1b.
- [ ] Al cargar un moodboard con otra paleta (por ejemplo azules), toda la app se recolorea sin tocar código, y glow, titulares y subrayados toman los nuevos colores.
- [ ] Si se fuerza el fondo a blanco, la app sigue siendo legible: ningún texto queda por debajo de 4.5:1 (o 3:1 en titulares de 40 px o más).
- [ ] No hay ningún texto con opacidad menor a 0.75.
- [ ] La jerarquía Núcleo > Soporte > Acento se entiende con la pantalla en escala de grises, solo por tamaño.
- [ ] El PDF del sistema exporta legible en papel blanco.
- [ ] No queda ninguna fuente serif ni ningún radio fuera de 3 / 4 / 999 px.

## 11. Orden de trabajo sugerido

1. Tokens y motor de contraste (secciones 3 y 4) → verificar con dos paletas opuestas.
2. Barra superior, botones y piezas.
3. Capas (es la pantalla de referencia).
4. Moodboard → Revisar → Sistema → Probar.
5. Movimiento y reduced-motion.
6. Pasar los criterios de la sección 10 antes del test con estudiantes.
