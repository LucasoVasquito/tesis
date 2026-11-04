# Tesis · Jerarquía en eje Z (dirección elegida: Túnel)

## Concepto
Tesis deja de ser un moodboard plano tipo Miro. El sistema visual se recorre en profundidad: lo más importante queda adelante y lo secundario atrás. La jerarquía no es un atributo escondido: es el espacio mismo.

- **Tres capas:** 1 · núcleo (define el sistema), 2 · soporte (lo acompaña), 3 · acento (aparece poco, da carácter).
- **Quién decide:** la IA propone en qué capa va cada patrón, con evidencia (en cuántas referencias aparece). El diseñador corrige. La autoría sigue siendo del diseñador.
- **Dónde vive:** atraviesa toda la app como vista principal. No es una etapa más.
- **Efecto en la síntesis:** la capa pondera el peso de cada patrón en los lineamientos, la paleta y los prompts de DALL·E.

## Túnel (1a)
- La cámara avanza hacia el fondo, una capa por vez. Cada capa ocupa la pantalla cuando llegás.
- Las capas de atrás se asoman arriba de la actual, más chicas y tenues, así siempre se ve qué hay detrás.
- Indicador de profundidad a la derecha (● 1 ○ 2 ○ 3).
- Contra: para comparar patrones de capas distintas hay que ir y volver. Se podría resolver con una vista de "todas las capas" (alejar la cámara al máximo).

## Interacción
Solo rueda/trackpad y teclado, sin depender del clic.

- **Rueda / trackpad:** avanzar o retroceder en Z
- **W / S:** cambiar de capa
- **← / →:** elegir patrón dentro de la capa
- **↑ / ↓:** subir o bajar el patrón seleccionado de capa
- **⏎:** aceptar el orden que propuso la IA
- **⇧⏎:** saltar la Auditoría (modo rápido)

## Modo rápido: de 5 etapas a 3 decisiones
Es para cuando querés ver un sistema borrador en minutos y auditarlo después. Las etapas siguen existiendo, pero el recorrido solo te frena donde hace falta tu criterio: elegir qué es núcleo.

1. **Brief + Corpus.** Una sola pantalla. Escribís una frase de intención y soltás las imágenes. La IA redacta el brief completo con eso y lo podés editar cuando quieras.
2. **Inducción.** La IA detecta los patrones y propone una capa para cada uno (núcleo, soporte o acento), con la evidencia: en cuántas referencias aparece.
3. **Auditoría (opcional, ⇧⏎ la salta).** Si la salteás, los patrones quedan marcados como «sin auditar» y los podés auditar después desde el túnel, uno por uno.
4. **Túnel → Síntesis.** Recorrés las capas con la rueda, corregís el orden con ↑↓ y aceptás con ⏎. La síntesis le da más peso a lo que está en el núcleo.

## Pendiente
- Llevar el Túnel a alta fidelidad con el sistema oscuro (#0B0B0D, Geist / Geist Mono / Newsreader, acentos oklch).
- Definir cómo se ve "sin auditar" dentro del túnel.
- Definir la vista alejada (todas las capas a la vez).
- Mostrar cómo cambia la Síntesis según la jerarquía.

Referencias: `Emergent Eje Z Wireframes.dc.html` (opción 1a), `Emergent Sistema Visual.dc.html`, repo `LucasoVasquito/tesis`.
