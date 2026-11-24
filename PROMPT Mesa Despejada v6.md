# Camaleón Corpus · La mesa despejada: subpasos y foco (v6)

Prompt para Claude Code. Va encima del megaprompt y de los prompts Estética, v3, v4 y v5. Este documento cambia la **estructura de cada etapa**. Si algo de los anteriores contradice esto en layout o navegación, manda este documento. Los datos, el motor de color y la estética no cambian.

---

## 1. La idea

Trabajar como sobre una mesa: en el centro está solo lo que estás haciendo ahora. Lo demás queda guardado a mano en los bordes, sin ocupar lugar, y siempre sabés dónde está y cómo volver.

Cada etapa se divide en **subpasos**, y cada subpaso responde **una sola pregunta** y tiene **una sola acción principal**. Nada compite con el foco.

## 2. Anatomía de la pantalla

```
┌ barra superior: 6 etapas ──────────────────────────────────────┐
│ riel de subpasos:  ① Primario ✓ — ② Secundario ● — ③ Acento ○  │
├──────────────────────────────────────────────────────────────────┤
│▌                                                               ▐│
│▌ estante          LA MESA (foco único)               estante   ▐│
│▌ izq (cerrado)                                       der (cer.) ▐│
├ barra de acción: ← Anterior · estado · Siguiente → ─────────────┤
```

- **Riel de subpasos** (debajo de la barra superior, 40 px de alto, Manrope 14 px)
  - Muestra los subpasos de la etapa actual: hecho ✓, actual ●, pendiente ○.
  - Todos se pueden tocar. Saltar hacia adelante está permitido, salvo que el subpaso dependa de otro: en ese caso queda deshabilitado y al pasar el mouse explica por qué.
  - Cada subpaso hecho muestra su resumen de una línea al pasar el mouse (ej. "Primario · 2 piezas").
- **La mesa** (centro): solo el contenido del subpaso, centrado, con un ancho máximo según el contenido y aire generoso alrededor.
- **Estantes** (bordes izquierdo y derecho)
  - Están **cerrados por defecto**: se ven como una pestaña vertical de 40 px con su nombre ("Colores", "Capas", "Ayuda").
  - Al abrirlos se superponen a la mesa (ancho de 360 px) y la mesa se atenúa al 40 %.
  - Solo puede haber uno abierto a la vez. Se cierran con Esc o tocando la mesa.
  - Contenido típico: paleta actual, lista de capas, ayuda de la etapa.
- **Barra de acción** (fija abajo, 72 px de alto)
  - "← Anterior" a la izquierda y la acción del subpaso a la derecha.
  - En el centro, el estado: "Capas · paso 2 de 5".
  - El último subpaso de una etapa pasa a la siguiente etapa ("Seguir a Sistema →").

Teclado: → / Enter = siguiente, ← = anterior, Esc = cerrar estante.

## 3. Volver sin perderse

- **Migas:** al lado del nombre del proyecto se muestra "Capas › Secundario".
- **Memoria de lugar:**
  - Si el usuario salta a otra etapa o subpaso desde un enlace (ej. "Editar" en la receta de Probar), aparece una sola píldora arriba de la barra de acción: **"↩ Volver a Probar · Comparar"**.
  - La píldora desaparece al volver o al avanzar normalmente. Reemplaza al "Volviste a X · Seguir en Probar" actual.
- **Al reabrir el proyecto,** se vuelve exactamente al último subpaso.
- **Deshacer:** sigue global (barra superior) y funciona entre subpasos.

## 4. Subpasos por etapa

Cada subpaso indica: **pregunta** (título en la mesa, Display) · contenido · acción.

**0 Brief**
1. **¿Cómo se llama?** · Nombre del proyecto · "Siguiente"
2. **¿Qué es, en una frase?** · Un campo grande · "Siguiente"
3. **¿Qué querés lograr?** · Objetivo. Debajo, "Redactar con el agente" lo completa a partir de 1 y 2 · "Siguiente"
4. **¿Está bien así?** · Resumen de los tres campos, cada uno editable con un clic · "Seguir a Referencias →"

**1 Referencias**
1. **Traé tus referencias** · La mesa entera es la zona para soltar, con el contador ("12 imágenes") · "Ordenar en el lienzo" (se habilita desde 1 imagen)
2. **Ordenalas como quieras** · Lienzo a pantalla completa. Las herramientas (+ Imagen, zoom, Ajustar) van en la barra de acción a la izquierda · "Analizar"
3. **Lo que encontró el agente** · Los patrones aparecen de a uno mientras analiza ("Encontré: grillas industriales en 6 imágenes"). Al terminar, se ve la lista completa · "Revisar sugerencias →"

**2 Revisar**
1. **Sugerencia n de N** · Lo actual (pieza a la izquierda, capa propuesta a la derecha). Se acepta, cambia o descarta y pasa sola a la siguiente.
2. **Lo que decidiste** · Tres columnas: Aceptadas · Saltadas · Descartadas. Desde acá se puede recuperar una pieza descartada o volver a ver una saltada · "Seguir a Capas →"

**3 Capas**
1. **¿Esta es la jerarquía?** · Vista de profundidad 3D sola, a pantalla completa, para mirar el conjunto. Al tocar una capa se va a su subpaso · "Revisar capa por capa"
2. **Primario** · ¿Sin esto deja de ser la marca?
3. **Secundario** · ¿La acompaña siempre, pero se podría cambiar?
4. **Acento** · ¿Aparece poco, pero la hace reconocible?
   - En 2 a 4, las piezas de la capa llenan la mesa.
   - Para mover una pieza, se arrastra hacia el borde y aparecen dos zonas para soltar con el nombre de las otras capas ("→ Secundario", "→ Acento").
   - Las demás capas no se ven.
5. **Colores** · Las tres muestras grandes, cada una con su pieza de origen. Al tocar una muestra se edita · "Seguir a Sistema →"

**4 Sistema** (leer, no editar: cada subpaso tiene "Editar en Capas" que lleva al subpaso correspondiente y deja la píldora de volver)
1. **Paleta**
2. **Tipografía**
3. **Primario**, 4. **Secundario**, 5. **Acento** · Una pieza destacada y las demás en fila
6. **Reglas** · 3 a 5 reglas de uso
7. **Exportar** · PNG / PDF / Prompt-JSON como tres opciones grandes · "Probar en una pieza →"
   - Además, en este subpaso hay un conmutador **"Ver todo"** que muestra el pliego completo (como en v3) para quien quiera la vista general. Es la misma base que el PDF.

**5 Probar**
1. **¿Qué querés probar?** · Logotipo, Fachada, Packaging, Afiche y Post como cinco opciones grandes con su proporción dibujada
2. **¿Qué dice y qué pedís?** · Texto que aparece y pedido libre. La receta va en el estante izquierdo · "Generar 2 variantes"
3. **Compará** · Variantes A y B ocupando toda la mesa, cada una con su evaluación y "Aprobar esta"
4. **Listo** · La variante aprobada grande y Exportar · Al lado, "Probar otra pieza" vuelve al paso 1

## 5. Reglas para que nada compita

- Un título, un contenido y una acción principal por subpaso. Las acciones secundarias van en texto, nunca como un segundo botón lleno.
- Lo que no responde a la pregunta del subpaso va a un estante o no va.
- En la mesa nunca hay más de un bloque con fondo `--surface`.
- Sin paneles laterales fijos. El ancho de la mesa se ajusta al contenido: formularios unos 720 px, comparaciones y lienzo, el ancho completo.
- Transición entre subpasos: lo anterior sale hacia la izquierda y lo nuevo entra desde la derecha (24 px y fade en 300 ms). Al volver atrás, al revés. Así se percibe la dirección.

## 6. Criterios de aceptación

- [ ] En todo momento se ve una sola pregunta y una sola acción principal.
- [ ] Con los estantes cerrados, no hay información en los laterales.
- [ ] Desde cualquier subpaso se llega a cualquier otro en 1 o 2 clics (riel + barra superior).
- [ ] Después de un salto por enlace aparece "↩ Volver a …" y lleva al subpaso exacto.
- [ ] Al recargar la página se vuelve al mismo subpaso.
- [ ] En Capas, las capas que no se están editando no se ven, salvo en el subpaso 1.
- [ ] Un usuario experto puede recorrer Revisar y Capas solo con el teclado.
