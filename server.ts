import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Set payload limit high enough for image uploads (moodboards with multiple references)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Methods", "*");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Initialize Gemini Client Lazily with dynamic .env reloading
function getGeminiClient(): GoogleGenAI {
  dotenv.config({ override: true });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error("La variable de entorno GEMINI_API_KEY no está configurada en el servidor.");
  }
  return new GoogleGenAI({
    apiKey: apiKey.trim(),
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Supported MIME types for Gemini API inline data
const VALID_GEMINI_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

// Helper function to extract base64 and mimeType from data URL or fetch if HTTP URL
async function resolveImagePart(imageStr: string, refId: string) {
  if (!imageStr) return null;

  // Handle Base64 Data URLs
  if (imageStr.startsWith("data:")) {
    try {
      const commaIdx = imageStr.indexOf(",");
      if (commaIdx !== -1) {
        const header = imageStr.slice(5, commaIdx); // e.g. "image/png;base64"
        const data = imageStr.slice(commaIdx + 1).trim();
        let mimeType = header.split(";")[0]?.toLowerCase().trim() || "image/jpeg";
        if (mimeType === "image/jpg") mimeType = "image/jpeg";
        if (!VALID_GEMINI_MIME_TYPES.has(mimeType)) {
          mimeType = "image/jpeg";
        }
        return {
          mimeType,
          data,
          refId,
        };
      }
    } catch (err) {
      console.warn(`Error procesando data URL para ref ${refId}:`, err);
    }
  }

  // Handle HTTP / HTTPS URLs with 3.5s timeout
  if (imageStr.startsWith("http://") || imageStr.startsWith("https://")) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const response = await fetch(imageStr, {
        signal: controller.signal,
        headers: {
          Accept: "image/jpeg,image/png,image/webp,image/*;q=0.8",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`Fetch de imagen falló para ${refId} (${imageStr}) con status ${response.status}`);
        return null;
      }

      const rawContentType = response.headers.get("content-type") || "image/jpeg";
      let mimeType = rawContentType.split(";")[0]?.toLowerCase().trim() || "image/jpeg";
      if (mimeType === "image/jpg") mimeType = "image/jpeg";
      if (!VALID_GEMINI_MIME_TYPES.has(mimeType)) {
        mimeType = "image/jpeg";
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      return {
        mimeType,
        data: buffer.toString("base64"),
        refId,
      };
    } catch (err: any) {
      console.warn(`Timeout o error descargando imagen para ref ${refId}:`, err?.message || err);
    }
  }

  return null;
}

// Helper to safely parse JSON returned by the model
function parseModelJsonResponse(text: string) {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }
  return JSON.parse(cleaned);
}

// Helper to call Gemini using fast fallback candidate models on 503 high demand or 404
async function generateContentWithRetry(ai: GoogleGenAI, request: any) {
  const candidateModels = [
    request.model,
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.6-flash",
    "gemini-3.7-flash",
  ].filter(Boolean);

  const uniqueModels = Array.from(new Set(candidateModels));
  let lastError: any = null;

  for (const model of uniqueModels) {
    try {
      console.log(`[Gemini API] Consultando modelo ${model}...`);
      const response = await ai.models.generateContent({
        ...request,
        model,
      });
      console.log(`[Gemini API] Éxito con modelo ${model}`);
      return response;
    } catch (err: any) {
      lastError = err;
      const msg = err?.message || String(err);
      console.warn(`[Gemini API] Modelo ${model} notificó error (${msg.slice(0, 120)}...). Cambiando al siguiente modelo...`);
      // Pasar de inmediato al siguiente modelo candidato sin demoras
      continue;
    }
  }

  throw lastError;
}

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ==========================================
// 1. Multimodal Multi-Reference Pattern Discovery
// ==========================================
app.post("/api/analyze-references", async (req, res) => {
  try {
    const {
      references = [],
      objective = "",
      projectName = "",
      description = "",
      previousPatterns = [],
      confirmedPatterns = [],
      discardedPatterns = [],
      feedback = [],
      designerGroups = [],
    } = req.body;

    if (!references || references.length === 0) {
      return res.status(400).json({
        error: "Se requiere al menos una referencia visual para el análisis.",
      });
    }

    let result: any = null;

    try {
      // Fetch and resolve all images in parallel for optimal speed
      const resolvedImages = await Promise.all(
        references.map(async (ref: any) => {
          try {
            const imgPart = await resolveImagePart(ref.image, ref.id);
            return { ref, imgPart };
          } catch {
            return { ref, imgPart: null };
          }
        })
      );

      // Build multimodal parts
      const parts: any[] = [];
      const refSummaryList: string[] = [];

      for (const { ref, imgPart } of resolvedImages) {
        parts.push({
          text: ref.parentId
            ? `[REFERENCIA_VISUAL: ID="${ref.id}", Nombre="${ref.name || ref.id}", PARTE recortada de ${ref.parentId} (${ref.partKind || "parte"}), Notas="${ref.notes || 'Ninguna'}"]`
            : `[REFERENCIA_VISUAL: ID="${ref.id}", Nombre="${ref.name || ref.id}", Notas="${ref.notes || 'Ninguna'}"]`,
        });
        if (imgPart) {
          parts.push({
            inlineData: {
              mimeType: imgPart.mimeType,
              data: imgPart.data,
            },
          });
        }
        refSummaryList.push(`- ID: ${ref.id} (${ref.name || 'Sin título'})${ref.parentId ? ` · parte de ${ref.parentId}` : ''}`);
      }

      const previousContext = `
HISTORIAL DE DECISIONES PREVIAS DEL DISEÑADOR:
- Patrones ya confirmados por el diseñador: ${JSON.stringify(confirmedPatterns.map((p: any) => ({ id: p.id, name: p.name, category: p.category, assignedSystem: p.assignedSystemId })))}
- Patrones previamente descartados por el diseñador: ${JSON.stringify(discardedPatterns.map((p: any) => ({ id: p.id, name: p.name, reason: p.discardReason })))}
- Feedback explícito del diseñador: ${JSON.stringify(feedback.map((f: any) => ({ type: f.type, comment: f.comment, refId: f.referenceId, patternId: f.patternId })))}
- Patrones de análisis anterior: ${JSON.stringify(previousPatterns.map((p: any) => ({ id: p.id, name: p.name, evidenceCount: p.evidence?.length })))}
${designerGroups.length ? `
AGRUPACIONES DEL DISEÑADOR (diagrama de afinidad armado a mano en el lienzo):
${designerGroups.map((g: any) => `- [${g.id}] "${g.name}": ${(g.refIds || []).join(', ')}${g.note ? ` · por qué: ${g.note}` : ''}${g.hypothesis ? ` · hipótesis previa: ${g.hypothesis}` : ''}`).join('\n')}
Tratá cada grupo como una hipótesis del diseñador, no como una verdad. Para cada grupo, buscá en las imágenes si comparte rasgos formales concretos:
- si los comparte, generá (o reforzá) el patrón correspondiente citando esas referencias y marcá designerGroupId con el ID del grupo y groupVerdict "supports";
- si lo comparten solo en parte, generá el patrón con las referencias que sí lo sostienen y groupVerdict "refines" (explicá en la descripción qué referencia no encaja);
- si lo que las une no es formal (ej. solo el tema), generá igual un patrón breve que lo explique con groupVerdict "contradicts" y confianza baja.
` : ''}`;

      const nombre_proyecto = projectName || "Identidad Visual";
      const objetivo_proyecto = objective || "Exploración de identidad y universo estético";

      const instructions = `
Actuá como un Director de Arte senior, crítico de diseño visual y experto en branding e identidades multimediales. Estás evaluando un moodboard de trabajo recopilado por un diseñador para el proyecto '${nombre_proyecto}' (${objetivo_proyecto}).

El análisis no debe ser escueto ni superficial. Debes realizar un desglose minucioso, cruzando las referencias visuales del canvas para detectar patrones estructurales complejos que articulen logotipos, sistemas de packaging, tratamientos fotográficos, tipografías, flyers, publicaciones digitales y recursos gráficos/mascotas.

Para cada descubrimiento o patrón que detectes, analiza y detalla rigurosamente:

1. CATEGORÍA TÉCNICA: (Ej: Tipografía Display, Sistema de Logotipo, Fotografía Gastronómica, Packaging Estructurado, Ilustración de Personaje/Mascota, Composición/Grilla, Tratamiento Cromático).
   Usa una de las siguientes claves normalizadas:
   - 'logo_identity' (Sistema de Logotipo e Identidad)
   - 'packaging' (Packaging y Envases)
   - 'photography_treatment' (Fotografía y Tratamiento Visual)
   - 'typography' (Tipografía y Jerarquías)
   - 'flyer_poster' (Flyers, Afiches y Piezas Gráficas)
   - 'social_media' (Publicaciones y Redes Sociales)
   - 'mascot_illustration' (Mascotas, Personajes e Ilustración)
   - 'color' (Tratamiento Cromático y Paletas)
   - 'texture' (Textura, Grano y Materialidad)
   - 'composition' (Composición y Grilla)
   - 'graphic_elements' (Recursos Gráficos Secundarios)

2. NOMBRE DEL PATRÓN: Un título conceptual y técnico preciso (ej: "Tipografía display con deformaciones formales y alto impacto", "Mascotas estilo ilustración vintage cartoon").

3. DESCRIPCIÓN PROFUNDA Y RELACIONAL: Explica a fondo cómo opera este patrón, qué tensiones visuales resuelve y cómo dialoga entre diferentes soportes (por ejemplo, cómo la tipografía de los carteles se acopla con el packaging o cómo la fotografía complementa al sistema de marca).

4. RASGOS OBSERVABLES: Características visuales concretas y técnicas (ej: trazos porosos, grillas perimetrales, saturación controlada, iluminación cenital de estudio).

5. EVIDENCIA CRUZADA: Vincula explícitamente los IDs exactos de las referencias del canvas que sostienen este hallazgo (ej: [ref_01, ref_05, ref_06]).
   Algunas referencias son PARTES recortadas por el diseñador de otra referencia (ej. ref_07a es la tipografía de ref_07). Cuando un patrón trata justo sobre lo que muestra una parte, citá la parte (es evidencia más precisa); citá la referencia completa solo si el patrón depende de la pieza entera.

6. HIPÓTESIS DE SISTEMA VISUAL: Fundamenta cómo este descubrimiento puede traducirse en un subsistema reutilizable para soportes físicos (espacio, envoltorios) y digitales (web, redes).

No generalices. Si encuentras contradicciones estéticas entre referencias (ej. estilos tipográficos divergentes), señálalo como evidencia de múltiples sistemas visuales en tensión. Sé exhaustivo y riguroso.

DESCRIPCIÓN / CONTEXTO DEL PROYECTO:
"${description || 'Sin descripción adicional'}"

REFERENCIAS CARGADAS EN EL CANVAS:
${refSummaryList.join('\n')}

${previousContext}

Devuelve el análisis en formato JSON estricto cumpliendo el schema provisto.`;

      parts.push({ text: instructions });

      const ai = getGeminiClient();
      const response = await generateContentWithRetry(ai, {
        contents: [{ role: "user", parts }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              patterns: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING, description: "Identificador único, ej. pat_01" },
                    name: { type: Type.STRING, description: "Nombre conceptual y técnico preciso del patrón" },
                    category: {
                      type: Type.STRING,
                      description: "typography | color | texture | composition | logo_identity | packaging | photography_treatment | mascot_illustration | flyer_poster | social_media | graphic_elements",
                    },
                    description: { type: Type.STRING, description: "Descripción profunda y relacional: cómo opera este patrón, tensiones que resuelve y diálogo entre soportes" },
                    evidence: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: "Array de IDs exactos de las referencias del canvas que sostienen el hallazgo, ej: ['ref_01', 'ref_04']",
                    },
                    confidence: { type: Type.NUMBER, description: "Nivel de confianza entre 0.0 y 1.0" },
                    relatedObservations: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: "Características visuales concretas y técnicas observables",
                    },
                    systemHypothesis: {
                      type: Type.STRING,
                      description: "Hipótesis de traducción del patrón en un subsistema reutilizable para soportes físicos y digitales",
                    },
                    suggestedSystemName: { type: Type.STRING, description: "Nombre del sistema visual sugerido al que pertenece este patrón" },
                    trend: {
                      type: Type.STRING,
                      description: "new | strengthened | weakened | stable",
                    },
                    designerGroupId: { type: Type.STRING, description: "ID del grupo del diseñador al que responde este patrón (ej. grp_01), si responde a uno" },
                    groupVerdict: { type: Type.STRING, description: "supports | refines | contradicts (solo si hay designerGroupId)" },
                  },
                  required: ["id", "name", "category", "description", "evidence", "confidence", "relatedObservations", "systemHypothesis"],
                },
              },
              suggestedSystems: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    name: { type: Type.STRING, description: "Nombre del sistema, ej: Sistema Identitario Urbano Kraft" },
                    description: { type: Type.STRING, description: "Fundamentación y descripción conceptual del sistema" },
                    associatedPatternNames: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    referenceIds: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    aestheticPillars: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: "Pilares conceptuales y estilísticos clave",
                    },
                    systemDetails: {
                      type: Type.OBJECT,
                      properties: {
                        brandEssence: { type: Type.STRING, description: "Concepto nuclear y tono de voz visual" },
                        logoAndIdentity: { type: Type.STRING, description: "Criterios de logotipos, isotipos y sellos identitarios" },
                        packagingSystem: { type: Type.STRING, description: "Criterios de packaging, empaques, etiquetas y sustratos" },
                        photographyStyle: { type: Type.STRING, description: "Criterios de fotografía y dirección de arte" },
                        typographySystem: { type: Type.STRING, description: "Familias, combinaciones y jerarquías tipográficas" },
                        graphicApplications: { type: Type.STRING, description: "Criterios de flyers, afiches, cartelería y menús" },
                        mascotAndIllustration: { type: Type.STRING, description: "Criterios de mascotas, personajes e ilustraciones" },
                        digitalAndSocialMedia: { type: Type.STRING, description: "Estructura de publicaciones y contenido para redes sociales" },
                      },
                    },
                    suggestedPalette: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          hex: { type: Type.STRING },
                          name: { type: Type.STRING },
                          role: { type: Type.STRING },
                        },
                        required: ["hex", "name", "role"],
                      },
                    },
                  },
                  required: ["id", "name", "description", "referenceIds", "aestheticPillars"],
                },
              },
              overallInsight: {
                type: Type.STRING,
                description: "Diagnóstico general exhaustivo y articulado de la investigación visual y relaciones del branding",
              },
            },
            required: ["patterns", "suggestedSystems", "overallInsight"],
          },
        },
      });

      const rawText = response.text || "{}";
      result = parseModelJsonResponse(rawText);
    } catch (aiErr: any) {
      console.error("[Gemini API Error in analyze-references]:", aiErr?.message || aiErr);
      return res.status(500).json({
        error: `Error al procesar el análisis de referencias con Gemini: ${aiErr?.message || String(aiErr)}`,
      });
    }

    return res.json({
      success: true,
      data: result,
      analyzedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Error en /api/analyze-references:", error);
    return res.status(500).json({
      error: "Error al procesar el análisis de referencias con Gemini.",
      details: error.message,
    });
  }
});

// ==========================================
// 2. Individual Reference Breakdown (Deep Inspector)
// ==========================================
app.post("/api/inspect-reference", async (req, res) => {
  try {
    const { reference } = req.body;

    if (!reference || !reference.image) {
      return res.status(400).json({ error: "Se requiere una referencia con imagen para el desglose." });
    }

    let result: any = null;

    try {
      const imgPart = await resolveImagePart(reference.image, reference.id || "ref_inspect");
      const promptText = `
Analiza exhaustivamente esta imagen de referencia visual individual para un diseñador multimedial.
Provee un desglose formal y técnico riguroso de sus componentes visuales observables:
1. Paleta de color (colores dominantes, de acento y fondo con código HEX estimado y rol).
2. Tipografía visible (clasificación, presencia o ausencia de serif/sans/display, peso, tratamiento gráfico). Si no hay texto, indícalo claramente.
3. Textura y materialidad visual (grano, semitono, ruido analógico, limpieza digital).
4. Composición y distribución espacial (tipo de retícula, balance, peso visual, proporción de espacio negativo, contraste).
5. Recursos gráficos y geométricos (líneas, filetes, capas, marcos, formas).
6. Tratamiento fotográfico o ilustrativo (iluminación, virado cromático, contraste, estilo).
7. Resumen observable sintético.

No inventes nada que no esté presente en la imagen. Devuelve el resultado en JSON estructurado.
`;

      const ai = getGeminiClient();
      const response = await generateContentWithRetry(ai, {
        model: "gemini-3.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              { text: promptText },
              {
                inlineData: {
                  mimeType: imgPart.mimeType,
                  data: imgPart.data,
                },
              },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              colors: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    hex: { type: Type.STRING },
                    name: { type: Type.STRING },
                    role: { type: Type.STRING, description: "predominant | accent | background | detail" },
                    percentage: { type: Type.STRING },
                  },
                  required: ["hex", "name", "role"],
                },
              },
              typography: {
                type: Type.OBJECT,
                properties: {
                  hasText: { type: Type.BOOLEAN },
                  familyStyle: { type: Type.STRING },
                  classification: { type: Type.STRING, description: "serif | sans-serif | display | script | monospaced | none | mixed" },
                  treatment: { type: Type.STRING },
                  hierarchy: { type: Type.STRING },
                },
                required: ["hasText", "familyStyle", "classification", "treatment", "hierarchy"],
              },
              texture: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING },
                  intensity: { type: Type.STRING, description: "sutil | moderada | intensa | nula" },
                  description: { type: Type.STRING },
                },
                required: ["type", "intensity", "description"],
              },
              composition: {
                type: Type.OBJECT,
                properties: {
                  spatialDistribution: { type: Type.STRING },
                  negativeSpace: { type: Type.STRING, description: "abundante | moderado | denso/saturado" },
                  contrastLevel: { type: Type.STRING, description: "muy alto | medio | bajo / tonal" },
                  focalPoint: { type: Type.STRING },
                },
                required: ["spatialDistribution", "negativeSpace", "contrastLevel", "focalPoint"],
              },
              graphicResources: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              photoTreatment: { type: Type.STRING },
              formsAndGeometry: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              observableSummary: { type: Type.STRING },
            },
            required: [
              "colors",
              "typography",
              "texture",
              "composition",
              "graphicResources",
              "photoTreatment",
              "formsAndGeometry",
              "observableSummary",
            ],
          },
        },
      });

      const rawText = response.text || "{}";
      result = parseModelJsonResponse(rawText);
    } catch (aiErr: any) {
      console.error("[Gemini API Error in inspect-reference]:", aiErr?.message || aiErr);
      return res.status(500).json({
        error: `Error al inspeccionar la referencia con Gemini: ${aiErr?.message || String(aiErr)}`,
      });
    }

    return res.json({
      success: true,
      data: {
        ...result,
        analyzedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Error en /api/inspect-reference:", error);
    return res.status(500).json({
      error: "Error al desglosar la referencia individual con Gemini.",
      details: error.message,
    });
  }
});

// ==========================================
// 2c. Separar una referencia en partes (tipografía, mascota, logo...)
// ==========================================
// Gemini devuelve cajas normalizadas (0-1000, [ymin, xmin, ymax, xmax]); el recorte se hace en el navegador.
const PART_KINDS = ["typography", "logo", "mascot", "illustration", "photo", "texture", "graphic", "other"];

app.post("/api/segment-reference", async (req, res) => {
  dotenv.config({ override: true });
  try {
    const { reference, objective = "" } = req.body || {};
    if (!reference?.image) return res.status(400).json({ error: "Se requiere una referencia con imagen." });
    const imgPart = await resolveImagePart(reference.image, reference.id || "ref_segment");
    if (!imgPart) return res.status(400).json({ error: "No se pudo leer la imagen de la referencia." });

    const prompt = `You are helping a graphic designer take apart a reference image from their moodboard${objective ? ` (project goal: ${objective})` : ""}.
Find the visually distinct components that a designer would want to keep as separate evidence: the typography or lettering, the logo or emblem, a mascot or character, an illustration, a product photo, a texture or pattern sample, a graphic resource (badge, frame, sticker, ornament, stripe pattern).

Rules:
- Return between 1 and 6 parts, most important first. Only components that are really visible; never invent.
- Each box must tightly enclose ONE component, with a little margin. Do not return a box covering almost the whole image unless the image is a single component.
- Group a block of lettering that reads as one unit (e.g. a headline) into one part; do not split word by word.
- box_2d is [ymin, xmin, ymax, xmax] normalized 0-1000.
- kind is one of: ${PART_KINDS.join(", ")}.
- label: 2 to 5 words in Spanish naming the part concretely (e.g. "Lettering BUNKER VINYLS", "Mascota hamburguesa", "Sello circular rojo").
- description: one short sentence in Spanish about its formal qualities (shape, weight, line, color).`;

    const ai = getGeminiClient();
    const response = await generateContentWithRetry(ai, {
      model: "gemini-3.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType: imgPart.mimeType, data: imgPart.data } }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            parts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  box_2d: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                  kind: { type: Type.STRING },
                  label: { type: Type.STRING },
                  description: { type: Type.STRING },
                },
                required: ["box_2d", "kind", "label"],
              },
            },
          },
          required: ["parts"],
        },
      },
    });
    const parsed = parseModelJsonResponse(response.text || "{}");
    const raw: any[] = Array.isArray(parsed?.parts) ? parsed.parts : [];
    const parts = raw
      .map(p => {
        const b = Array.isArray(p?.box_2d) ? p.box_2d.map(Number) : [];
        if (b.length !== 4 || b.some((n: number) => !Number.isFinite(n))) return null;
        const [y0, x0, y1, x1] = b.map((n: number) => Math.min(1000, Math.max(0, n)) / 1000);
        const box = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
        if (box.w < 0.04 || box.h < 0.04) return null;
        return {
          kind: PART_KINDS.includes(p.kind) ? p.kind : "other",
          label: String(p.label || "Parte").slice(0, 60),
          description: p.description ? String(p.description).slice(0, 240) : undefined,
          box,
        };
      })
      .filter(Boolean)
      .slice(0, 6);
    return res.json({ success: true, data: { parts } });
  } catch (error: any) {
    console.error("Error en /api/segment-reference:", error);
    return res.status(500).json({ error: "No se pudo separar la referencia en partes.", details: error?.message });
  }
});

// ==========================================
// 2d. ¿Qué comparte un grupo armado por el diseñador?
// ==========================================
const PATTERN_CATEGORIES = ["typography", "color", "texture", "composition", "logo_identity", "packaging", "photography_treatment", "mascot_illustration", "flyer_poster", "social_media", "geometry", "graphic_elements", "mood"];

app.post("/api/group-hypothesis", async (req, res) => {
  dotenv.config({ override: true });
  try {
    const { group, references = [], objective = "" } = req.body || {};
    if (!group || !references.length) return res.status(400).json({ error: "Se requiere un grupo con referencias." });
    const parts: any[] = [];
    for (const ref of references) {
      const img = await resolveImagePart(ref.image, ref.id);
      parts.push({ text: `[${ref.id}] ${ref.name || ""}${ref.parentId ? ` (parte recortada de ${ref.parentId})` : ""}` });
      if (img) parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
    }
    parts.push({
      text: `A graphic designer grouped these ${references.length} references by hand on their moodboard and named the group "${group.name}"${group.note ? `, explaining: "${group.note}"` : ""}.${objective ? ` Project goal: ${objective}.` : ""}

As a rigorous design critic, say what these images really share in formal terms (type, shape, line, color, texture, composition, image treatment), only what is visible. Then say where they differ, and which reference fits the group least if any. Do not flatter the grouping: if what unites them is only the subject or the mood, say so.

Answer in Spanish:
- summary: one or two sentences with the hypothesis of what the group shares.
- sharedTraits: 2 to 5 concrete shared formal traits, each citing the reference IDs in brackets.
- differences: 0 to 3 differences or tensions, citing IDs.
- category: the closest one of ${PATTERN_CATEGORIES.join(", ")}.`,
    });
    const ai = getGeminiClient();
    const response = await generateContentWithRetry(ai, {
      model: "gemini-3.5-flash",
      contents: [{ role: "user", parts }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            sharedTraits: { type: Type.ARRAY, items: { type: Type.STRING } },
            differences: { type: Type.ARRAY, items: { type: Type.STRING } },
            category: { type: Type.STRING },
          },
          required: ["summary", "sharedTraits", "differences", "category"],
        },
      },
    });
    const parsed = parseModelJsonResponse(response.text || "{}");
    return res.json({
      success: true,
      data: {
        summary: String(parsed.summary || ""),
        sharedTraits: Array.isArray(parsed.sharedTraits) ? parsed.sharedTraits.map(String).slice(0, 5) : [],
        differences: Array.isArray(parsed.differences) ? parsed.differences.map(String).slice(0, 3) : [],
        category: PATTERN_CATEGORIES.includes(parsed.category) ? parsed.category : "mood",
        at: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Error en /api/group-hypothesis:", error);
    return res.status(500).json({ error: "No se pudo leer el grupo.", details: error?.message });
  }
});

// ==========================================
// Synthesize / Update Visual System Details with Gemini
// ==========================================
const SPECIMEN_STYLES = ["stretched", "hierarchy", "glitch", "italic", "rounded", "serif", "wide", "outline"];

/** Esquema de una ficha de regla para la respuesta estructurada de Gemini. */
const RULE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    detail: { type: Type.STRING },
    use: { type: Type.ARRAY, items: { type: Type.STRING } },
    avoid: { type: Type.ARRAY, items: { type: Type.STRING } },
    patternIds: { type: Type.ARRAY, items: { type: Type.STRING } },
    refIds: { type: Type.ARRAY, items: { type: Type.STRING } },
    exampleText: { type: Type.STRING },
    specimenStyle: { type: Type.STRING },
    specimenSubtext: { type: Type.STRING },
    gridCols: { type: Type.NUMBER },
    gridRows: { type: Type.NUMBER },
  },
  required: ["title", "detail", "patternIds"],
};

app.post("/api/synthesize-system", async (req, res) => {
  dotenv.config({ override: true });
  try {
    const {
      system,
      patterns = [],
      references = [],
      projectName = "",
      projectObjective = "",
      projectDescription = "",
    } = req.body;

    const sysName = system?.name || projectName || "Sistema Visual";
    const patternSummary = (patterns || [])
      .map((p: any) => `- [${p.id}] ${p.name} [Categoría: ${p.category}]: ${p.description}`)
      .join("\n");
    const refSummary = (references || [])
      .map((r: any) => `- Ref ID: ${r.id}, Nombre: ${r.name || r.id}, Notas: ${r.notes || "Sin notas"}`)
      .join("\n");

    const systemInstruction = `You are a Senior Art Director and World-Class Brand Identity Strategist.
A Visual System is being synthesized/updated for the brand "${projectName || sysName}".
Brand Objective: "${projectObjective}"
Brand Context: "${projectDescription}"

Current System Name: "${sysName}"

Validated Visual Patterns (${patterns.length}):
${patternSummary || "No patterns provided yet."}

Supporting Moodboard References (${references.length}):
${refSummary || "No references provided yet."}

YOUR TASK:
Synthesize a deep, cohesive, highly professional visual identity system based on these patterns and references.
All output text MUST be in natural, evocative Spanish.

Generate JSON containing:
1. "name": A refined, memorable name for this visual system.
2. "description": A comprehensive conceptual narrative (2-3 paragraphs) explaining how colors, typography, textures, and grid composition interact.
3. "aestheticPillars": Array of 3 to 5 synthetic, impactful conceptual pillars (e.g. "Tensión Tipográfica Hipercondensada", "Sustratos Kraft & Tactilidad", "Reticulado Perimetral").
4. "colorPalette": Array of 4 to 6 color swatches extracted from evidence: {"hex": "#HEX", "name": "Nombre evocador", "role": "Rol en el sistema"}.
5. "typographyRules", 6. "textureRules", 7. "compositionRules": each an array of 1 to 3 RULE CARDS. Every rule card has:
   - "title": an imperative rule in Spanish of at most 6 words (e.g. "Display estirada en el eje vertical").
   - "detail": the rationale in 1-2 Spanish sentences.
   - "use": 0-3 short contexts where it applies (e.g. "títulos", "afiches").
   - "avoid": 0-2 short contexts where it must not be used (e.g. "textos de lectura").
   - "patternIds": IDs (in square brackets above) of the validated patterns that support it.
   - "refIds": IDs of the references that show it best (from the reference list).
   - Typography rules also have a type specimen that must make THAT rule visible, different for each rule:
     "exampleText": 1 to 3 words to render (vary it across rules: the brand name, a short headline, a menu or event word).
     "specimenStyle": the one that best shows the rule, one of: "stretched" (display stretched vertically), "hierarchy" (condensed headline over a small sans line, for hierarchy rules), "glitch" (digital distortion, offset color ghosts), "italic" (slanted), "rounded" (rounded, curved terminals, organic), "serif" (display serif), "wide" (extended letters, open tracking), "outline" (outlined letters).
     "specimenSubtext": only for "hierarchy": the secondary line (e.g. "Viernes 23 · 00 h").
     Do not repeat the same specimenStyle in two rules unless the rules really demand it.
   - Composition rules also have "gridCols" and "gridRows": integers from 2 to 6 describing the underlying grid.
8. "pillarSources": for each aesthetic pillar, in the same order, the IDs of the validated patterns that support it.
9. "systemDetails": Object with rich text descriptions for:
   - "brandEssence"
   - "logoAndIdentity"
   - "packagingSystem"
   - "photographyStyle"
   - "typographySystem"
   - "graphicApplications"
   - "mascotAndIllustration"
   - "digitalAndSocialMedia"
`;

    const userPrompt = `Synthesize visual system "${sysName}" using ${patterns.length} patterns and ${references.length} references.`;
    const ai = getGeminiClient();
    const response = await generateContentWithRetry(ai, {
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            aestheticPillars: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            colorPalette: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  hex: { type: Type.STRING },
                  name: { type: Type.STRING },
                  role: { type: Type.STRING },
                },
                required: ["hex", "name", "role"],
              },
            },
            typographyRules: { type: Type.ARRAY, items: RULE_SCHEMA },
            textureRules: { type: Type.ARRAY, items: RULE_SCHEMA },
            compositionRules: { type: Type.ARRAY, items: RULE_SCHEMA },
            pillarSources: { type: Type.ARRAY, items: { type: Type.ARRAY, items: { type: Type.STRING } } },
            systemDetails: {
              type: Type.OBJECT,
              properties: {
                brandEssence: { type: Type.STRING },
                logoAndIdentity: { type: Type.STRING },
                packagingSystem: { type: Type.STRING },
                photographyStyle: { type: Type.STRING },
                typographySystem: { type: Type.STRING },
                graphicApplications: { type: Type.STRING },
                mascotAndIllustration: { type: Type.STRING },
                digitalAndSocialMedia: { type: Type.STRING },
              },
            },
          },
          required: [
            "name",
            "description",
            "aestheticPillars",
            "colorPalette",
            "typographyRules",
            "textureRules",
            "compositionRules",
            "systemDetails",
          ],
        },
      },
    });

    const rawText = response.text || "{}";
    const parsed = parseModelJsonResponse(rawText);
    if (parsed && parsed.description) {
      // Trazabilidad: solo IDs que realmente se enviaron.
      const validPatterns = new Set<string>((patterns || []).map((p: any) => String(p.id)));
      const validRefs = new Set<string>((references || []).map((r: any) => String(r.id)));
      const ids = (v: any, valid: Set<string>) => (Array.isArray(v) ? v.map(String).filter(id => valid.has(id)) : []);
      const pillars = Array.isArray(parsed.aestheticPillars) ? parsed.aestheticPillars : [];
      parsed.sources = { aestheticPillars: pillars.map((_: any, i: number) => ids(parsed.pillarSources?.[i], validPatterns)) };
      const toRules = (raw: any, prefix: string, kind: "type" | "evidence" | "grid") =>
        (Array.isArray(raw) ? raw : []).map((r: any, i: number) => {
          const refIds = ids(r?.refIds, validRefs);
          const clamp = (n: any) => Math.min(6, Math.max(2, Math.round(Number(n) || 4)));
          return {
            code: `${prefix}${i + 1}`,
            title: String(r?.title || "").trim(),
            detail: String(r?.detail || "").trim(),
            use: Array.isArray(r?.use) ? r.use.map(String) : [],
            avoid: Array.isArray(r?.avoid) ? r.avoid.map(String) : [],
            patternIds: ids(r?.patternIds, validPatterns),
            refIds,
            example:
              kind === "type"
                ? {
                    kind,
                    text: String(r?.exampleText || "").trim() || undefined,
                    style: SPECIMEN_STYLES.includes(r?.specimenStyle) ? r.specimenStyle : undefined,
                    subtext: String(r?.specimenSubtext || "").trim() || undefined,
                  }
                : kind === "grid"
                  ? { kind, cols: clamp(r?.gridCols), rows: clamp(r?.gridRows) }
                  : { kind, refIds },
          };
        });
      parsed.typographyRules = toRules(parsed.typographyRules, "T", "type");
      parsed.textureRules = toRules(parsed.textureRules, "X", "evidence");
      parsed.compositionRules = toRules(parsed.compositionRules, "C", "grid");
      delete parsed.pillarSources;
      return res.json({
        success: true,
        data: parsed,
      });
    }
    throw new Error("No se pudo parsear el resultado de la síntesis.");
  } catch (error: any) {
    console.error("Error en /api/synthesize-system:", error);
    return res.status(500).json({
      error: "Error sintetizando el sistema visual.",
      details: error.message || String(error),
    });
  }
});


// ==========================================
// 2b. Trazabilidad de pilares (para sistemas adoptados o redactados sin ella)
// ==========================================
app.post("/api/trace-pillars", async (req, res) => {
  dotenv.config({ override: true });
  try {
    const { pillars = [], patterns = [] } = req.body || {};
    if (!Array.isArray(pillars) || !pillars.length) return res.json({ success: true, data: { pillarSources: [] } });
    const valid = new Set<string>(patterns.map((p: any) => String(p.id)));
    const list = patterns.map((p: any) => `- [${p.id}] ${p.name} (${p.category}): ${p.description}`).join("\n");
    const prompt = `Validated visual patterns of a design corpus:
${list}

Aesthetic pillars of a visual system built from them:
${pillars.map((p: string, i: number) => `${i + 1}. ${p}`).join("\n")}

For each pillar, in the same order, return the IDs (in square brackets above) of the patterns that support it. Use only IDs from the list; a pillar can have one or several; if none really supports it, return an empty array.`;
    const ai = getGeminiClient();
    const response = await generateContentWithRetry(ai, {
      model: "gemini-3.5-flash-lite",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: { pillarSources: { type: Type.ARRAY, items: { type: Type.ARRAY, items: { type: Type.STRING } } } },
          required: ["pillarSources"],
        },
      },
    });
    const parsed = parseModelJsonResponse(response.text || "{}");
    const raw = Array.isArray(parsed?.pillarSources) ? parsed.pillarSources : [];
    const pillarSources = pillars.map((_: any, i: number) => (Array.isArray(raw[i]) ? raw[i].map(String).filter((id: string) => valid.has(id)) : []));
    return res.json({ success: true, data: { pillarSources } });
  } catch (error: any) {
    console.error("Error en /api/trace-pillars:", error);
    return res.status(500).json({ error: "No se pudo rastrear los pilares.", details: error?.message });
  }
});

// ==========================================
// 3. Verificación externa: piezas generadas con OpenAI
// ==========================================
// Funciona como ChatGPT: un modelo de texto (Responses API) lee los lineamientos completos y las
// referencias de evidencia como contexto, interpreta el pedido como director de arte y llama a la
// herramienta image_generation (modelos GPT Image). Cada variante es una llamada independiente con
// una dirección de diseño distinta. Las iteraciones continúan la conversación (previous_response_id).
//
// Configuración (.env):
//   OPENAI_TEXT_MODEL   modelo que razona el pedido      (por defecto gpt-5)
//   OPENAI_IMAGE_MODEL  modelo de la herramienta de imagen (por defecto gpt-image-2)
//   OPENAI_IMAGE_QUALITY low | medium | high               (por defecto high)
type PieceType = "logo" | "poster" | "packaging" | "post" | "story" | "facade" | "web" | "other";
type ImageSize = "1024x1024" | "1024x1536" | "1536x1024" | "auto";

interface PieceSpec {
  label: string;
  size: ImageSize;
  /** graphic: arte plano (las referencias guían el estilo). photo: fotografía realista de la marca aplicada. */
  mode: "graphic" | "photo";
  /** Familias de reglas que importan para este soporte (el resto no se envía). */
  rules: ("typography" | "texture" | "composition")[];
  /** Cómo se ve una entrega profesional de este soporte. */
  spec: string;
  /** Qué parte del desglose del sistema es más relevante. */
  detailKeys: string[];
  /** Direcciones para variantes: cada una explora una solución distinta. */
  directions: string[];
}

const PIECES: Record<PieceType, PieceSpec> = {
  logo: {
    label: "Logotipo",
    mode: "graphic",
    rules: ["typography"],
    size: "1024x1024",
    spec:
      "A final, production-ready logo as a senior brand identity designer would present it in a brand book: flat vector-style artwork presented alone and centered on a plain solid background, with generous clear space. Precise geometry, deliberate custom letterforms, optically balanced spacing, clean edges, legible at small sizes, built from at most two or three colors of the palette. Flat solid fills only. The brand text is spelled exactly as given.",
    detailKeys: ["logoAndIdentity", "typographySystem", "brandEssence"],
    directions: [
      "Direction A — a typographic wordmark: the brand name drawn as custom lettering that embodies the typography rules.",
      "Direction B — a symbol or monogram paired with a wordmark, in a horizontal lockup.",
      "Direction C — an emblem or seal that contains the name, drawing on the graphic resources of the system.",
      "Direction D — a bold, reduced mark: the most minimal expression of the system that still feels ownable.",
    ],
  },
  poster: {
    label: "Afiche",
    mode: "graphic",
    rules: ["typography", "texture", "composition"],
    size: "1024x1536",
    spec:
      "A finished printed poster designed by a professional graphic designer, seen straight on and filling the frame: clear typographic hierarchy, a strong focal point, deliberate grid, real print finish. Any text is short, legible and spelled exactly as given.",
    detailKeys: ["graphicApplications", "typographySystem", "brandEssence"],
    directions: [
      "Direction A — typography-led: the headline is the image.",
      "Direction B — image-led: one strong visual with restrained type.",
      "Direction C — graphic and systematic: built from the system's graphic resources and grid.",
      "Direction D — the most daring interpretation that still respects the rules.",
    ],
  },
  packaging: {
    label: "Packaging",
    mode: "photo",
    rules: ["typography", "texture"],
    size: "1024x1024",
    spec:
      "A photorealistic product photograph of the real packaging, indistinguishable from a professional studio or lifestyle shot: 50–85 mm lens, soft directional light, true printed materials (kraft, coated paper, foil, greaseproof paper) with folds, texture and slight imperfections. The brand graphics are printed on the package; the food, hands and surroundings keep their natural colors. No render, no 3D or CGI look.",
    detailKeys: ["packagingSystem", "brandEssence"],
    directions: [
      "Direction A — faithful to the reference materials and finishes.",
      "Direction B — bolder graphics covering the whole surface.",
      "Direction C — minimal and premium: mostly material, small precise brand marks.",
      "Direction D — a family of two or three coordinated pieces.",
    ],
  },
  post: {
    label: "Post",
    mode: "graphic",
    rules: ["typography", "composition"],
    size: "1024x1024",
    spec: "A finished square social media post for the brand: flat 2D layout, clear hierarchy, platform-ready, any text short and spelled exactly.",
    detailKeys: ["digitalAndSocialMedia", "brandEssence"],
    directions: ["Direction A — typography-led.", "Direction B — image-led.", "Direction C — graphic pattern-led.", "Direction D — the most daring."],
  },
  story: {
    label: "Story",
    mode: "graphic",
    rules: ["typography", "composition"],
    size: "1024x1536",
    spec: "A finished vertical social media story for the brand: flat 2D layout, clear hierarchy, safe margins, any text short and spelled exactly.",
    detailKeys: ["digitalAndSocialMedia", "brandEssence"],
    directions: ["Direction A — typography-led.", "Direction B — image-led.", "Direction C — graphic pattern-led.", "Direction D — the most daring."],
  },
  facade: {
    label: "Fachada",
    mode: "photo",
    rules: ["typography", "texture"],
    size: "1536x1024",
    spec:
      "A photorealistic architectural photograph of the real storefront with the identity applied, indistinguishable from a photo taken on location: eye-level or slight three-quarter view, full-frame camera with a 24–35 mm lens, natural daylight or blue-hour light with the shop lights on. The signage is built as it would really be fabricated (painted sheet metal, cut letters, lightbox, neon, vinyl on glass) at a believable scale, with real materials, wear, reflections in the glass, the street, sidewalk and neighbouring facades in their own natural colors. No render, no 3D or CGI look.",
    detailKeys: ["graphicApplications", "logoAndIdentity", "brandEssence"],
    directions: ["Direction A — signage-led.", "Direction B — material and color-led.", "Direction C — graphic resources applied to the architecture.", "Direction D — the most daring."],
  },
  web: {
    label: "Web",
    mode: "graphic",
    rules: ["typography", "composition"],
    size: "1536x1024",
    spec: "A desktop website hero section shown as a flat screen capture: real layout, navigation, clear hierarchy, any text short and spelled exactly.",
    detailKeys: ["digitalAndSocialMedia", "typographySystem", "brandEssence"],
    directions: ["Direction A — typography-led.", "Direction B — image-led.", "Direction C — grid and graphic resources.", "Direction D — the most daring."],
  },
  other: {
    label: "Pieza",
    mode: "graphic",
    rules: ["typography", "texture", "composition"],
    size: "auto",
    spec: "A finished, professional brand application presented clearly, exactly as requested.",
    detailKeys: ["graphicApplications", "brandEssence"],
    directions: ["Direction A — faithful.", "Direction B — bolder.", "Direction C — more minimal.", "Direction D — the most daring."],
  },
};

const DETAIL_LABEL: Record<string, string> = {
  brandEssence: "Brand essence",
  logoAndIdentity: "Logo and identity",
  packagingSystem: "Packaging",
  photographyStyle: "Photography",
  typographySystem: "Typography system",
  graphicApplications: "Graphic applications",
  mascotAndIllustration: "Illustration",
  digitalAndSocialMedia: "Digital and social",
};

const ART_DIRECTOR_INSTRUCTIONS = `You are a senior art director and brand identity designer working inside a design research tool.
You receive a request for one piece and, usually, the essentials of a visual system that a designer built from their own reference corpus.
Your job: turn it into ONE finished, professional piece and generate it with the image_generation tool, exactly once.

How to write the image prompt (in English, before calling the tool):
- Start from the designer's request. It is the brief; the system tells you HOW it should look, not WHAT to show.
- Choose the 3 to 5 decisions of the system that matter most for this piece and make them unmistakable. A few strong decisions beat a list of every rule.
- Describe like a professional: subject, format and framing, composition, typography (style, weight, case, how the letters are drawn), color with HEX values, materials and texture, lighting, and the exact text to render in quotes.
- For photographs: write it as a real photo brief (camera, lens, light, time of day, location, real materials, small imperfections). The palette belongs to the brand elements only; everything else keeps its natural real-world color.
- For graphic pieces: production-ready flat artwork seen straight on, not a mock-up, unless the request asks for one.
- Attached images: if one is marked as the approved logo or anchor, reproduce it faithfully; reference images are style evidence only, never copy their subject, layout or content.
- Spell every word exactly as given. Keep text short.
After the image, reply with two or three short sentences in Spanish explaining which decisions of the system you prioritized and why.`;

function buildBrief(b: any, piece: PieceSpec): string {
  const s = b.system || {};
  const project = b.project || {};
  const r = b.resources || {};
  const asText = (x: any) =>
    typeof x === "string"
      ? x
      : [
          // Si el título es el comienzo truncado del detalle ("Utilizar fuentes…"), alcanza con el detalle.
          x?.detail && x?.title && x.detail.startsWith(String(x.title).replace(/…$/, "")) ? "" : x?.title,
          x?.detail && x.detail !== x.title ? x.detail : "",
          x?.use?.length ? `Use for: ${x.use.join(", ")}.` : "", x?.avoid?.length ? `Avoid for: ${x.avoid.join(", ")}.` : ""]
          .filter(Boolean)
          .join(" — ");
  const list = (title: string, items?: any[], max = 4) =>
    Array.isArray(items) && items.length ? `${title}:\n${items.slice(0, max).map((x: any) => `- ${asText(x)}`).join("\n")}` : "";
  const palette = (s.colorPalette || []).map((c: any) => `- ${String(c.hex).toUpperCase()}${c.name ? ` · ${c.name}` : ""}${c.role ? ` (${c.role})` : ""}`).join("\n");
  const photo = piece.mode === "photo";
  const request = [
    `# Request`,
    `Piece: ${piece.label}.`,
    b.details ? `What the designer asks for: ${b.details}` : "",
    b.brandText ? `Text to render exactly: "${b.brandText}".` : "",
    `Deliverable standard: ${piece.spec}`,
    b.transparent ? "Background: transparent, with the artwork alone." : "",
  ];

  // Modo directo: el pedido del diseñador casi tal cual, como en ChatGPT (para comparar con el modo sistema).
  if (b.mode === "direct") {
    return [...request, r.palette !== false && palette ? `\nBrand colors:\n${palette}` : ""].filter(x => x !== "").join("\n");
  }

  const details = piece.detailKeys
    .map(k => (s.systemDetails?.[k] ? `${DETAIL_LABEL[k]}: ${s.systemDetails[k]}` : ""))
    .filter(Boolean)
    .join("\n");
  const wants = (fam: "typography" | "texture" | "composition") => piece.rules.includes(fam) && r[fam] !== false;
  return [
    ...request,
    `
# Brand`,
    `${project.name || ""}${project.objective ? ` — ${project.objective}` : ""}`,
    project.description ? `Context: ${project.description}` : "",
    `
# Visual system "${s.name}" (how it should look)`,
    s.description || "",
    list("Aesthetic pillars", s.aestheticPillars, 4),
    r.palette !== false && palette
      ? photo
        ? `Brand palette (for signage, packaging graphics, typography and brand elements only; the environment keeps natural colors):\n${palette}`
        : `Palette (use only these colors):\n${palette}`
      : "",
    wants("typography") ? list("Typography rules", s.typographyRules) : "",
    wants("texture") ? list(photo ? "Material and finish rules" : "Texture rules", s.textureRules) : "",
    wants("composition") ? list("Composition rules", s.compositionRules) : "",
    details,
  ]
    .filter(x => x !== "")
    .join("\n");
}

function friendlyOpenAIError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("incorrect api key") || m.includes("invalid api key")) return "La OPENAI_API_KEY del archivo .env no es válida.";
  if (m.includes("verif")) return "Tu organización de OpenAI tiene que estar verificada para generar imágenes (platform.openai.com → Settings → Organization → Verify).";
  if (m.includes("billing") || m.includes("quota") || m.includes("credit")) return "La cuenta de OpenAI no tiene saldo o alcanzó su límite (platform.openai.com → Billing).";
  if (m.includes("safety") || m.includes("moderation") || m.includes("rejected")) return "OpenAI rechazó el pedido por sus políticas de contenido. Probá reformular los detalles.";
  return msg;
}

/** data URL o http(s) → data URL (para enviar como input_image). */
async function toDataUrl(src: string, id: string): Promise<string | null> {
  if (!src) return null;
  if (src.startsWith("data:")) return src;
  const part = await resolveImagePart(src, id);
  return part ? `data:${part.mimeType};base64,${part.data}` : null;
}

interface ResponsesResult {
  imageUrl: string;
  responseId: string;
  revisedPrompt: string;
  rationale: string;
}

/** El modelo no existe, está retirado o la cuenta no tiene acceso: tiene sentido probar con otro. */
const isModelProblem = (err: any) => {
  const m = String(err?.message || "").toLowerCase();
  return (
    err?.status === 404 ||
    /does not exist|not found|model_not_found|deprecated|do not have access to (the )?model|not supported (for|with) (this )?model|unsupported model/.test(m)
  );
};

async function callResponses(key: string, body: any): Promise<ResponsesResult> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const err: any = new Error(data?.error?.message || `HTTP ${response.status}`);
    err.status = response.status;
    err.param = data?.error?.param;
    throw err;
  }
  const output: any[] = Array.isArray(data.output) ? data.output : [];
  const call = output.find(o => o.type === "image_generation_call" && o.result);
  if (!call) {
    const text = output.flatMap(o => (o.content || []).map((c: any) => c.text).filter(Boolean)).join(" ");
    throw new Error(`El modelo no generó una imagen.${text ? ` Respondió: ${text.slice(0, 300)}` : ""}`);
  }
  const rationale = output
    .filter(o => o.type === "message")
    .flatMap(o => (o.content || []).filter((c: any) => c.type === "output_text").map((c: any) => c.text))
    .join("\n")
    .trim();
  const format = call.output_format || "png";
  return {
    imageUrl: `data:image/${format};base64,${call.result}`,
    responseId: data.id,
    revisedPrompt: call.revised_prompt || "",
    rationale,
  };
}

/**
 * Una generación con la Responses API. Si el modelo de imagen o de texto configurado no está
 * disponible para la cuenta, reintenta con alternativas; si tool_choice no se admite, lo omite.
 */
async function generateWithResponses(key: string, opts: { input: any; previousResponseId?: string; tool: any; textModel: string; imageModel: string }): Promise<any> {
  const textModels = Array.from(new Set([opts.textModel, "gpt-5", "gpt-4.1"]));
  const imageModels = Array.from(new Set([opts.imageModel, "gpt-image-2", "gpt-image-1.5"]));
  // Se informa el primer error "real" (no el de un modelo de respaldo que no existe o está retirado).
  let firstErr: any = null;
  let lastErr: any = null;
  for (const textModel of textModels) {
    for (const imageModel of imageModels) {
      for (const forceTool of [true, false]) {
        try {
          const body: any = {
            model: textModel,
            instructions: ART_DIRECTOR_INSTRUCTIONS,
            input: opts.input,
            tools: [{ ...opts.tool, type: "image_generation", model: imageModel }],
          };
          if (forceTool) body.tool_choice = { type: "image_generation" };
          if (opts.previousResponseId) body.previous_response_id = opts.previousResponseId;
          const result = await callResponses(key, body);
          return { ...result, textModel, imageModel };
        } catch (err: any) {
          lastErr = err;
          const where = String(err?.param || "") + " " + String(err?.message || "");
          console.warn(`[Imagen] ${textModel} + ${imageModel}${forceTool ? "" : " (sin tool_choice)"} falló: ${err?.message}`);
          if (forceTool && where.includes("tool_choice")) continue;
          // Alta fidelidad a la imagen adjunta (logo aprobado): si el modelo no la admite, se reintenta sin ella.
          if (opts.tool.input_fidelity && (where.includes("fidelity") || (err?.status === 400 && String(err?.param || "").startsWith("tools")))) {
            const { input_fidelity, ...rest } = opts.tool;
            console.warn(`[Imagen] Reintento sin input_fidelity`);
            return generateWithResponses(key, { ...opts, tool: rest });
          }
          if (!isModelProblem(err)) throw err; // saldo, verificación, contenido o parámetro: no se resuelve cambiando de modelo
          if (!firstErr && !/deprecated|does not exist|not found/i.test(String(err?.message))) firstErr = err;
          break;
        }
      }
    }
  }
  throw firstErr ?? lastErr;
}

// ==========================================
// 4. Auditoría de una pieza generada contra el sistema (Gemini)
// ==========================================
app.post("/api/audit-piece", async (req, res) => {
  dotenv.config({ override: true });
  try {
    const { imageUrl, pieceType = "other", brandText = "", system = {} } = req.body || {};
    if (!imageUrl) return res.status(400).json({ error: "Se requiere la imagen de la pieza." });
    const img = await resolveImagePart(imageUrl, "pieza");
    if (!img) return res.status(400).json({ error: "No se pudo leer la imagen de la pieza." });
    const piece = PIECES[pieceType as PieceType] || PIECES.other;
    const fields: Record<string, string> = { typography: "typographyRules", texture: "textureRules", composition: "compositionRules" };
    const rules: { code: string; title: string; detail: string }[] = piece.rules.flatMap(fam =>
      (Array.isArray(system[fields[fam]]) ? system[fields[fam]] : [])
        .filter((r: any) => r && typeof r === "object" && r.code)
        .map((r: any) => ({ code: String(r.code), title: String(r.title || ""), detail: String(r.detail || "") })),
    );
    const prompt = `You are auditing a generated ${piece.label.toLowerCase()} (${piece.mode === "photo" ? "a photograph of the brand applied" : "a graphic piece"}) against the visual system "${system.name || ""}" it was supposed to follow. Be strict and concrete, like a design director reviewing an agency deliverable. Judge only what is visible.

${brandText ? `Expected text: "${brandText}". Read every word rendered in the image exactly as written (keep the model's spelling mistakes) and say whether the expected text appears spelled exactly.` : "There is no required text; transcribe any visible words."}

Rules to check:
${rules.length ? rules.map(r => `- [${r.code}] ${r.title}${r.detail && r.detail !== r.title ? ` — ${r.detail}` : ""}`).join("\n") : "- (no rules for this piece type)"}

Return, in Spanish unless stated:
- textRead: the words you read, exactly.
- textOk: true only if the expected text is spelled exactly (true if there is no expected text and no garbled words).
- textIssue: short description of any spelling or rendering problem, or empty.
- rules: for every rule above, { code, verdict: "cumple" | "parcial" | "no_cumple", reason: one short sentence pointing to what you see }.
- quality: one short sentence on the craft (realism or finish, legibility, artifacts).
- fixes: 1 to 4 short revision instructions IN ENGLISH, imperative, addressed to the image model, only for what fails (empty array if everything passes).`;

    const ai = getGeminiClient();
    const response = await generateContentWithRetry(ai, {
      model: "gemini-3.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType: img.mimeType, data: img.data } }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            textRead: { type: Type.STRING },
            textOk: { type: Type.BOOLEAN },
            textIssue: { type: Type.STRING },
            rules: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: { code: { type: Type.STRING }, verdict: { type: Type.STRING }, reason: { type: Type.STRING } },
                required: ["code", "verdict", "reason"],
              },
            },
            quality: { type: Type.STRING },
            fixes: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["textRead", "textOk", "rules", "quality", "fixes"],
        },
      },
    });
    const parsed = parseModelJsonResponse(response.text || "{}");
    const byCode = new Map(rules.map(r => [r.code, r]));
    const verdicts = ["cumple", "parcial", "no_cumple"];
    return res.json({
      success: true,
      data: {
        textRead: String(parsed.textRead || ""),
        textOk: !!parsed.textOk,
        textIssue: parsed.textIssue ? String(parsed.textIssue) : "",
        rules: (Array.isArray(parsed.rules) ? parsed.rules : [])
          .filter((r: any) => byCode.has(String(r?.code)))
          .map((r: any) => ({
            code: String(r.code),
            title: byCode.get(String(r.code))!.title,
            verdict: verdicts.includes(r.verdict) ? r.verdict : "parcial",
            reason: String(r.reason || ""),
          })),
        quality: String(parsed.quality || ""),
        fixes: (Array.isArray(parsed.fixes) ? parsed.fixes : []).map(String).slice(0, 4),
        at: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Error en /api/audit-piece:", error);
    return res.status(500).json({ error: "No se pudo auditar la pieza.", details: error?.message });
  }
});

app.post("/api/generate-application", async (req, res) => {
  dotenv.config({ override: true });
  const b = req.body || {};
  try {
    if (!b.system || !b.system.name) return res.status(400).json({ error: "Se requiere un sistema visual para generar la pieza." });
    const key = (process.env.OPENAI_API_KEY || "").trim();
    if (!key) return res.status(400).json({ error: "Falta OPENAI_API_KEY en el archivo .env del servidor." });

    const pieceType: PieceType = PIECES[b.pieceType as PieceType] ? b.pieceType : "other";
    const piece = PIECES[pieceType];
    const textModel = (process.env.OPENAI_TEXT_MODEL || "gpt-5").trim();
    const imageModel = (process.env.OPENAI_IMAGE_MODEL || "gpt-image-2").trim();
    const quality = (process.env.OPENAI_IMAGE_QUALITY || "high").trim();
    const tool: any = { size: piece.size, quality };
    if (b.transparent) tool.background = "transparent";

    // ---------- Iteración sobre una variante ----------
    if (b.revision?.text) {
      const text = `Revise the last image: ${b.revision.text}. Keep everything else as it is, and keep following the visual system.`;
      let result: any;
      try {
        result = await generateWithResponses(key, {
          input: [{ role: "user", content: [{ type: "input_text", text }] }],
          previousResponseId: b.revision.responseId,
          tool: { ...tool, action: "edit" },
          textModel,
          imageModel,
        });
      } catch (err: any) {
        // Si la conversación anterior ya no está disponible, se envía la imagen a editar.
        const image = b.revision.imageUrl ? await toDataUrl(b.revision.imageUrl, "pieza") : null;
        if (!image || !String(err?.message || "").toLowerCase().includes("previous")) throw err;
        result = await generateWithResponses(key, {
          input: [{ role: "user", content: [{ type: "input_text", text: `${buildBrief(b, piece)}\n\n${text}` }, { type: "input_image", image_url: image }] }],
          tool: { ...tool, action: "edit" },
          textModel,
          imageModel,
        });
      }
      return res.json({
        success: true,
        data: {
          variants: [{ ...result, direction: `Iteración: ${b.revision.text}` }],
          brief: text,
          size: piece.size,
          pieceType,
        },
      });
    }

    // ---------- Variantes nuevas ----------
    const brief = buildBrief(b, piece);
    const direct = b.mode === "direct";
    // En fotos y en el modo directo no se adjuntan las referencias gráficas: empujan el resultado hacia la ilustración.
    const refImages: { id: string; url: string }[] = [];
    if (!direct && piece.mode === "graphic") {
      for (const r of (b.references || []).slice(0, 4)) {
        const url = r?.image ? await toDataUrl(r.image, r.id) : null;
        if (url) refImages.push({ id: r.id, url });
      }
    }
    const anchor = b.anchorImageUrl ? await toDataUrl(b.anchorImageUrl, "ancla") : null;
    const anchorIsLogo = anchor && b.anchorPieceType === "logo" && pieceType !== "logo";
    const anchorNote = !anchor
      ? ""
      : anchorIsLogo
        ? "\nThe first attached image is the APPROVED LOGO of the brand. Wherever the brand appears, reproduce this exact logo faithfully (same letterforms, proportions and colors). Do not redesign it."
        : "\nThe first attached image is an approved earlier piece: keep its visual language.";
    const genTool = anchor ? { ...tool, input_fidelity: "high" } : tool;
    const count = Math.max(1, Math.min(4, Number(b.variants) || 1));
    const directions = piece.directions.slice(0, count);

    console.log(`[Imagen] ${piece.label} · ${direct ? "directo" : piece.mode} · ${count} variantes · ${refImages.length} referencias${anchor ? " · ancla" : ""} · ${textModel} + ${imageModel}`);
    const settled = await Promise.allSettled(
      directions.map(direction =>
        generateWithResponses(key, {
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: `${brief}\n\n# This variant\n${count > 1 ? direction : "Choose the strongest direction."}${anchorNote}` },
                ...(anchor ? [{ type: "input_image", image_url: anchor }] : []),
                ...refImages.map(r => ({ type: "input_image", image_url: r.url })),
              ],
            },
          ],
          tool: genTool,
          textModel,
          imageModel,
        }).then(r => ({ ...r, direction: count > 1 ? direction : "" })),
      ),
    );
    const variants = settled.filter(s => s.status === "fulfilled").map(s => (s as PromiseFulfilledResult<any>).value);
    const failures = settled.filter(s => s.status === "rejected").map(s => (s as PromiseRejectedResult).reason);
    if (!variants.length) {
      const msg = String(failures[0]?.message || "No se pudo generar la pieza.");
      return res.status(502).json({ error: friendlyOpenAIError(msg), details: msg, promptUsed: brief });
    }
    return res.json({
      success: true,
      data: {
        variants,
        failed: failures.length,
        failureMessage: failures.length ? friendlyOpenAIError(String(failures[0]?.message || "")) : undefined,
        brief,
        referencesUsed: refImages.map(r => r.id),
        size: piece.size,
        pieceType,
        renderMode: direct ? "direct" : piece.mode,
      },
    });
  } catch (error: any) {
    console.error("Error en /api/generate-application:", error);
    const msg = String(error?.message || error);
    return res.status(502).json({ error: friendlyOpenAIError(msg), details: msg });
  }
});

// Vite middleware & Static Serving
async function setupVite() {
  const fs = await import("fs");
  const distPath = path.join(process.cwd(), "dist");
  const assetsPath = path.join(process.cwd(), "assets");

  const setNoCache = (res: any) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  };

  app.use("/assets", express.static(assetsPath, { setHeaders: setNoCache }));
  app.use("/assets", express.static(path.join(distPath, "assets"), { setHeaders: setNoCache }));
  app.use(express.static(distPath, { setHeaders: setNoCache }));
  app.use(express.static(process.cwd(), { setHeaders: setNoCache }));

  app.use((req, res) => {
    setNoCache(res);
    const distHtml = path.join(distPath, "index.html");
    if (fs.existsSync(distHtml)) {
      res.sendFile(distHtml);
    } else {
      res.sendFile(path.join(process.cwd(), "index.html"));
    }
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Emergent App] Server running on http://0.0.0.0:${PORT}`);
  });
}

setupVite();
