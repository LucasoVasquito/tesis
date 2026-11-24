# Camaleón Corpus · Luces de clima (v7)

Prompt para Claude Code. Va encima del megaprompt y de los prompts Estética, v3 a v6. Este documento define el **fondo** de toda la app. Referencia visual: opción **2b** de `Camaleón Direcciones Estéticas.dc.html`. La estética editorial oscura se mantiene. Lo que cambia es que el fondo tiene luz de color.

---

## 1. Qué es

Detrás de toda la interfaz hay **tres luces difusas**, una por capa del proyecto, más una textura de grano encima.

- El **color** de cada luz es el color de su capa.
- El **tamaño** de cada luz es proporcional al peso de su capa (cantidad de referencias).
- La **posición** es siempre la misma, para que el usuario aprenda dónde está cada capa:
  - Capa 1: arriba a la izquierda, grande.
  - Capa 2: abajo a la derecha.
  - Capa 3: arriba a la derecha, chica.

Las luces son la "piel" del camaleón: reaccionan a lo que pasa en cada etapa.

## 2. Implementación

- Un componente `<Clima>` fijo detrás de todo (`position: fixed; inset: 0; z-index: 0; pointer-events: none`) que recibe un estado `{ luces: [{color, peso, foco}], intensidad, modo }`.
- Cada luz es un `div` circular con `filter: blur(120px)` (o un `<canvas>` con gradientes radiales si el blur rinde mal), con opacidad base de 0.35 a 0.75 según el peso.
- El grano es un SVG `feTurbulence` en mosaico, con `mix-blend-mode: overlay` y opacidad 0.15. Evita el banding y le da textura de papel impreso.
- **Fondo base:** `--bg` levemente tintado con el color de la capa 1 (L 0.13, croma 0.02).
- **Transiciones:** color, tamaño y posición interpolan en oklch durante 1.2 s con ease-in-out. Además, hay una deriva lenta permanente (±20 px en 20 s) para que el fondo "respire".
- `prefers-reduced-motion`: sin deriva y con cambios en fade de 300 ms.

## 3. Qué pasa en cada etapa

| Etapa | Las luces… | Por qué |
|---|---|---|
| **0 Brief** | Una sola luz neutra (gris cálido, opacidad 0.2). No hay colores todavía. | El camaleón está dormido: todavía no sabe nada del proyecto. |
| **1 Referencias · Traer** | Con cada imagen que se suma, aparece una luz pequeña de su color dominante, que se suma al fondo con un fade de 0.8 s. Con muchas imágenes se mezclan en hasta 6 luces. | El usuario ve que el sistema "absorbe" lo que carga. |
| **1 Referencias · Analizar** | Las luces se mueven y se fusionan mientras el agente trabaja. Al terminar, se ordenan en las 3 luces de capa. | **Este es el momento camaleón principal.** Hay que cuidarlo: debe tardar unos 2 s y verse claramente. |
| **2 Revisar** | Las 3 luces, con la de la capa propuesta para la sugerencia actual más grande. Si el usuario elige otra capa, la luz grande se pasa a esa. Al aceptar, un pulso corto. | El fondo confirma la decisión sin texto extra. |
| **3 Capas · Profundidad** | Las 3 luces balanceadas según su peso real. | Vista de conjunto. |
| **3 Capas · Constante / Variable / Ocasional** | La luz de la capa en foco crece al doble y las otras dos bajan a opacidad 0.2. | Igual que la opción 2b. |
| **3 Capas · Colores** | Al editar un color, su luz cambia en vivo mientras se mueve el selector. | Feedback inmediato del cambio. |
| **4 Sistema** | Las 3 luces quietas y exactas en su proporción, sin deriva. | Es el retrato final del proyecto. |
| **5 Probar** | Las luces bajan a intensidad 0.3 y se alejan de los marcos de variante. Al aprobar una variante, el fondo toma por 2 s los colores de esa variante y vuelve. | **Para juzgar color, el fondo no puede teñir la pieza.** Por eso se atenúan. |

## 4. Superficies y contraste

- Ningún texto va directo sobre una luz fuerte.
  - El contraste se calcula contra el **punto más claro** que puede quedar detrás del texto (fondo + luz a su opacidad máxima). Si no llega a 4.5:1, se baja la opacidad de esa luz, nunca la del texto.
  - Barra superior, riel y barra de acción: `--bg` al 70 % con `backdrop-filter: blur(12px)`.
- **Piezas e imágenes:** van siempre llenas y opacas, sin transparencia. La luz se ve solo alrededor, en el espacio vacío de la mesa.
- **Estantes abiertos:** `--bg` al 85 % con blur. Las luces se intuyen detrás.

## 5. Casos borde

- **Proyecto sin color** (todo en blanco y negro): las luces pasan a gris, con distintos valores de luminosidad según el peso. No se inventa color.
- **Colores casi iguales** (por ejemplo, tres rojos): se respetan igual. El fondo se ve monocromo y es correcto, porque así es el proyecto.
- **Fondo forzado a claro por el usuario:** las luces pasan a manchas con `mix-blend-mode: multiply` y opacidad 0.25, y el grano se mantiene.
- **Exportación PDF / PNG:** sin luces ni grano.
- **Rendimiento:** si el dispositivo es lento (FPS < 40 durante 2 s), se desactiva la deriva y se usa una imagen estática de las luces.

## 6. Criterios de aceptación

- [ ] Al cargar referencias, el fondo cambia de color en vivo, sin recargar la página.
- [ ] El análisis termina con una transición visible hacia las 3 luces de capa.
- [ ] En Capas, la luz de la capa en foco es claramente la dominante.
- [ ] En Probar, el fondo no altera la percepción de color de las variantes.
- [ ] Ningún texto baja de 4.5:1 en ningún punto de ninguna pantalla.
- [ ] Con `prefers-reduced-motion` no hay movimiento continuo.
- [ ] Un proyecto en blanco y negro se ve gris, no colorido.
