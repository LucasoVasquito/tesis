# Camaleón Corpus · Correcciones sobre la versión actual (v5)

Prompt para Claude Code. Va encima del megaprompt y de los prompts Estética, v3 y v4. **Varios puntos de v3 y v4 no se aplicaron todavía.** Este documento los repite solo donde siguen fallando y suma problemas nuevos vistos en la versión actual. Orden de prioridad: arriba lo más grave.

---

## P0 · Datos inconsistentes (rompen la confianza en el agente)

1. **Probar usa otra paleta.** El estado vacío muestra gris, negro, ocre, azul y bordó, pero el sistema dice Primario #F18535, Secundario #A92125 y Acento #FD9F01. Probar lee siempre la paleta del sistema (los mismos tokens de Capas y Sistema). No puede haber una paleta paralela.
2. **Receta de Probar: "Acento · Nada de esta capa"** cuando Acento tiene 6 piezas. La receta lista las piezas reales de cada capa. Si la plantilla elegida no usa Acento, dice "No se usa en un logotipo", no "Nada".
3. **Acento #FD9F01 sigue saliendo de "Paleta cromática de alto contraste…".** Verificar si esa pieza está aceptada. Si fue descartada, aplicar la regla de v3 (recalcular y avisar).
4. **Brief duplicado.**
   - "¿Qué es, en una frase?" y "Nombre del proyecto" tienen el mismo valor. Se unifican en un solo campo, "Nombre del proyecto", y se agrega "En una frase" como un campo distinto, con este placeholder: "Ej: hamburguesería urbana con estética de cartel industrial".
   - "Objetivo" y "Brief" contienen exactamente el mismo texto. Queda un solo campo, "Objetivo", y el agente redacta a partir de él.
   - En Sistema, "Objetivo" y "Descripción" también repiten el mismo texto. Queda uno solo.
5. **"Volviste a X · Seguir en Probar →"** sigue apareciendo en Brief, Referencias, Revisar, Capas y Sistema sin que haya habido un salto hacia atrás (ver v3, punto 3). En Probar ya funciona bien ("Etapa 5 de 5 · Probar · probando logotipo"). Ese mismo formato va en todas las etapas.

## P0 · Barra de acción fija (v4 §1, no aplicada)

El botón principal sigue flotando abajo al centro, dentro de una caja oscura. Pasa a una barra fija de ancho completo y 72 px de alto: a la izquierda el estado y a la derecha la acción principal. Aplica en todas las etapas:

- **Brief:** "Seguir a Referencias →"
- **Referencias:** a la izquierda las herramientas del lienzo (Volver a analizar · + Imagen · − 62 % + · Ajustar) y a la derecha "Seguir en Revisar →". La ayuda "Rueda para moverte…" aparece una vez como aviso y después vive en "? Ayuda". Hoy tapa imágenes.
- **Capas:** "Ver sistema →"
- **Sistema:** "Exportar ▾" y "Probar en una pieza →"
- **Probar:** "Exportar ▾" deshabilitado, con "Aprobá una variante para exportar", hasta que se apruebe una. Hoy "Exportar PNG" está activo antes de generar nada.

## P0 · Capas (v4 §2, no aplicada)

- Se quita la tarjeta contenedora. Las piezas llenan el ancho con `repeat(auto-fill, minmax(260px, 1fr))`.
- Se quitan las pestañas flotantes "SECUNDARIO · 5 →" y "ACENTO · 6 →". En la vista Secundario, la pestaña Acento tapa una pieza.
- La lista "Estás en" pasa al lateral izquierdo. El lateral derecho queda solo con Colores.
- Al hacer scroll, la tarjeta queda cortada bajo el banner "proyecto de ejemplo". El escenario no puede quedar debajo del banner ni de la barra superior.
- **Pieza sin imagen** ("Tipografía display curvada…"): hoy es un cuadro vacío con tres puntos y "BADDER HA…" cortado. Las piezas tipográficas muestran el nombre del proyecto en un espécimen que ajusta su tamaño para entrar completo (sin "…"), sobre `--surface`.
- Los títulos de pieza empiezan con mayúscula ("Texturas plástico"). Aplicar al guardar lo que escribe el usuario.

## P0 · Sistema (v4 §3, no aplicada)

- Se eliminan "SISTEMA" y el bloque Brief completo, que ya está en la etapa 0. Si hace falta, queda una línea arriba: "Badder Hamburguesería · Objetivo ▸", que se despliega.
- Una capa por pantalla, con el índice izquierdo como pestañas.
- La ficha derecha va en bloques plegables. Hoy "Reglas del sistema" repite los títulos y descripciones de las piezas: eso ya está en el centro. Las reglas tienen que ser **reglas**, de 3 a 5 frases cortas generadas por el agente. Ejemplos:
  - "El naranja nunca va sobre fotografía."
  - "La tipografía display solo en titulares."
  - "Los sellos circulares van una vez por pieza."
- "Tipografías detectadas" muestra estilos de letra ("Display condensada rotulada", "Mono técnica"), no títulos de pieza.

## P1 · Brief

- **Layout:** pasa a una sola columna centrada de unos 720 px de ancho, con tres campos (Nombre, En una frase, Objetivo) y "Redactar con el agente" debajo de Objetivo. Hoy la mitad derecha repite el texto y debajo queda un vacío grande.
- **Objetivo:** el textarea crece con el contenido. Hoy corta el texto con scroll interno.

## P1 · Revisar

- **Pieza:** la descripción se corta con "técnica…". Mostrarla completa, con hasta 4 líneas y "Ver más".
- **Miniaturas:** la tira queda cortada a la derecha. Usar `overflow-x: auto` con un desvanecido en el borde, o limitarla a las que entran y mostrar "+2".
- **Elección de capa:** en la lista, Secundario muestra un subrayado rojo aunque la sugerida es Primario. Solo se marca la opción elegida, con el mismo tratamiento para las tres.
- **Espacio:** abajo queda la mitad del alto vacía. Centrar el bloque verticalmente en el escenario.

## P1 · Probar

- Los marcos de variante crecen hasta llenar el alto disponible (v4 §4).
- Hoy el área bajo "Exportar" queda vacía.

## Criterios de aceptación

- [ ] La paleta es idéntica en Capas, Sistema y Probar.
- [ ] Ningún texto aparece repetido en dos campos o bloques de la misma pantalla.
- [ ] "Volviste a…" solo aparece después de un salto hacia atrás.
- [ ] En las 6 etapas, la acción principal está abajo a la derecha, en la barra fija, y nada la tapa ni queda debajo de ella.
- [ ] Capas no tiene pestañas flotantes ni tarjeta contenedora.
- [ ] Las reglas del sistema no repiten títulos de pieza.
- [ ] Exportar solo se habilita después de aprobar una variante.
