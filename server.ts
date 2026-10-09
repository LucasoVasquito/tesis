import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import { InferenceClient } from "@huggingface/inference";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

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
          text: `[REFERENCIA_VISUAL: ID="${ref.id}", Nombre="${ref.name || ref.id}", Notas="${ref.notes || 'Ninguna'}"]`,
        });
        if (imgPart) {
          parts.push({
            inlineData: {
              mimeType: imgPart.mimeType,
              data: imgPart.data,
            },
          });
        }
        refSummaryList.push(`- ID: ${ref.id} (${ref.name || 'Sin título'})`);
      }

      const previousContext = `
HISTORIAL DE DECISIONES PREVIAS DEL DISEÑADOR:
- Patrones ya confirmados por el diseñador: ${JSON.stringify(confirmedPatterns.map((p: any) => ({ id: p.id, name: p.name, category: p.category, assignedSystem: p.assignedSystemId })))}
- Patrones previamente descartados por el diseñador: ${JSON.stringify(discardedPatterns.map((p: any) => ({ id: p.id, name: p.name, reason: p.discardReason })))}
- Feedback explícito del diseñador: ${JSON.stringify(feedback.map((f: any) => ({ type: f.type, comment: f.comment, refId: f.referenceId, patternId: f.patternId })))}
- Patrones de análisis anterior: ${JSON.stringify(previousPatterns.map((p: any) => ({ id: p.id, name: p.name, evidenceCount: p.evidence?.length })))}
`;

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
// Synthesize / Update Visual System Details with Gemini
// ==========================================
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
      .map((p: any) => `- ${p.name} [Categoría: ${p.category}]: ${p.description}`)
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
5. "typographyRules": Array of 2-4 key typography guidelines.
6. "textureRules": Array of 2-4 key texture/finish guidelines.
7. "compositionRules": Array of 2-4 key layout/grid guidelines.
8. "systemDetails": Object with rich text descriptions for:
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
            typographyRules: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            textureRules: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            compositionRules: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
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
// 3. Visual System Application & Visualization Generator
// ==========================================
app.post("/api/generate-application", async (req, res) => {
  dotenv.config({ override: true });
  try {
    const {
      objective = "",
      context = "",
      system,
      projectName = "",
      confirmedPatterns = [],
      selectedResources = {},
      relevantReferences = [],
      userDescription = "",
      iterationPrompt = "",
      previousImageUrl = "",
      aiEngine = "openai_dalle3",
      prompt = "",
    } = req.body;

    console.log("ENGINE:", aiEngine);
    console.log("OPENAI KEY PRESENTE:", !!process.env.OPENAI_API_KEY);

    if (!system || !system.name) {
      return res.status(400).json({
        error: "Se requiere un sistema visual confirmado para generar una aplicación.",
      });
    }

    // 1. Extract visual system parameters
    const nombreProyecto = projectName || system.name || "Proyecto de Identidad Visual";
    const objetivoProyecto = objective || "Branding y Sistema de Identidad Visual";
    const textoUsuario = iterationPrompt
      ? `${userDescription} (Ajuste / Iteración requerida: ${iterationPrompt})`
      : (userDescription || 'Aplicar el sistema visual a una pieza de identidad de marca fotorrealista con alta fidelidad de materiales.');
    const activeUserText = textoUsuario;

    // Extraer el sujeto limpio
    const cleanSubject = activeUserText
      .replace(/^aplicar el sistema visual a /i, '')
      .replace(/^apply the visual system to /i, '')
      .trim()
      .slice(0, 100);

    const textLower = cleanSubject.toLowerCase();
    const isLogo = /\b(logo|logotipo|isotipo|monograma|sello|emblema|marca|isologo)\b/i.test(textLower);
    const isFlyer = /\b(flyer|afiche|poster|volante|folleto|publicidad|aviso)\b/i.test(textLower);
    const isPackaging = /\b(envoltorio|papel|packaging|bolsa|caja|vaso|servilleta|etiqueta|envase)\b/i.test(textLower);
    const isSpatial = /\b(pared|fachada|marquesina|local|interior|mostrador|cartel|espacio)\b/i.test(textLower);

    const colorString = (system.colorPalette && system.colorPalette.length > 0)
      ? `exact color palette ${system.colorPalette.map((c: any) => `${c.name ? `${c.name} ` : ''}${c.hex}`).join(' ')}`
      : '';

    let promptMaestroReal = "";
    if (isLogo) {
      promptMaestroReal = [
        `Clean minimalist 2D flat vector logo mark design for brand "${nombreProyecto}"`,
        `Subject: ${cleanSubject}`,
        colorString,
        (system.typographyRules || []).slice(0, 2).join(', '),
        'solid clean neutral background, crisp vector graphic icon, high resolution',
        '--no 3D scene, no room, no wall, no store interior, no mockup environment, no photography, no plastic'
      ].filter(Boolean).join(', ').trim();
    } else if (isFlyer) {
      promptMaestroReal = [
        `2D graphic design print flyer poster layout for "${nombreProyecto}"`,
        `Subject: ${cleanSubject}`,
        colorString,
        (system.typographyRules || []).slice(0, 2).join(', '),
        'flat 2D print layout, crisp typography, clean paper composition',
        '--no 3D scene, no room, no store interior'
      ].filter(Boolean).join(', ').trim();
    } else if (isPackaging) {
      promptMaestroReal = [
        `Product packaging mockup for "${nombreProyecto}": ${cleanSubject}`,
        colorString,
        (system.typographyRules || []).slice(0, 1).join(', '),
        (system.textureRules || []).slice(0, 2).join(', ') || 'tactile paper finish',
        'studio flat lay photography, softbox lighting, photorealistic product packaging',
        '--no store interior, no room, no plastic'
      ].filter(Boolean).join(', ').trim();
    } else if (isSpatial) {
      promptMaestroReal = [
        `Environmental graphic design and store interior architectural mockup for "${nombreProyecto}": ${cleanSubject}`,
        colorString,
        'realistic store interior wall signage, cinematic lighting, photorealistic',
        '--no CGI, no watermark'
      ].filter(Boolean).join(', ').trim();
    } else {
      promptMaestroReal = [
        cleanSubject || 'commercial visual application design',
        colorString,
        (system.typographyRules || []).slice(0, 2).join(', '),
        'clean direct focus strictly on the requested subject',
        '--no plastic, no generic stock, no watermark'
      ].filter(Boolean).join(', ').trim();
    }

    // Use prompt from request payload if provided, or generated master prompt
    const visualPrompt = (prompt && typeof prompt === 'string' && prompt.trim())
      ? prompt.trim()
      : promptMaestroReal;

    const aspectRatio: '1:1' | '3:4' | '4:3' | '9:16' | '16:9' = '1:1';

    let generatedImageBase64: string | null = null;
    let modelUsed = "OpenAI DALL-E 3";
    let engineUsed = aiEngine || "openai_dalle3";

    if (aiEngine === "huggingface_sdxl") {
      const hfToken = process.env.HUGGINGFACE_TOKEN ? process.env.HUGGINGFACE_TOKEN.trim() : "";
      if (!hfToken) {
        return res.status(400).json({
          error: "No se encontró la variable HUGGINGFACE_TOKEN en el archivo .env. Por favor agregá tu token de Hugging Face.",
        });
      }

      try {
        console.log("Generando imagen con Hugging Face Inference API...");
        const hfClient = new InferenceClient(hfToken);
        
        let imageRes: any = null;
        let selectedModel = "black-forest-labs/FLUX.1-schnell";
        try {
          imageRes = await hfClient.textToImage({
            model: selectedModel,
            inputs: visualPrompt,
          });
        } catch (fluxErr: any) {
          console.warn("FLUX.1-schnell failed, attempting SDXL fallback:", fluxErr?.message || fluxErr);
          selectedModel = "stabilityai/stable-diffusion-xl-base-1.0";
          imageRes = await hfClient.textToImage({
            model: selectedModel,
            inputs: visualPrompt,
          });
        }

        if (typeof imageRes === "string") {
          generatedImageBase64 = imageRes.startsWith("data:") ? imageRes : `data:image/jpeg;base64,${imageRes}`;
        } else if (imageRes && typeof imageRes.arrayBuffer === "function") {
          const arrayBuffer = await imageRes.arrayBuffer();
          const base64 = Buffer.from(arrayBuffer).toString("base64");
          generatedImageBase64 = `data:image/jpeg;base64,${base64}`;
        }
        modelUsed = selectedModel.includes("FLUX") ? "FLUX.1 Schnell (Hugging Face)" : "Stable Diffusion XL (Hugging Face)";
        engineUsed = "huggingface_sdxl";
      } catch (err: any) {
        console.error("Hugging Face connection error:", err?.message || err);
        return res.status(500).json({
          error: `Error de conexión con Hugging Face: ${err.message || "No se pudo generar la imagen con Hugging Face"}`,
        });
      }
    } else if (aiEngine === "openai_dalle3") {
      const openaiKey = process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.trim() : "";
      if (!openaiKey) {
        return res.status(400).json({
          error: "No se encontró la variable OPENAI_API_KEY en el archivo .env. Por favor agrega tu clave de OpenAI.",
        });
      }

      try {
        console.log("Generando imagen con OpenAI DALL-E 3...");
        const response = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: "dall-e-3",
            prompt: visualPrompt,
            n: 1,
            size: "1024x1024",
          }),
        });

        const data = await response.json();

        if (data.error) {
          console.error("OpenAI DALL-E 3 API error:", data.error);
          let userMsg = data.error.message || JSON.stringify(data.error);
          if (userMsg.includes("does not exist")) {
            userMsg = "Tu cuenta de OpenAI no tiene saldo prepago cargado. OpenAI requiere cargar crédito (mínimo $5) en platform.openai.com/settings/organization/billing para habilitar DALL-E 3.";
          }
          return res.status(400).json({
            error: `Error de OpenAI DALL-E 3: ${userMsg}`,
            details: data.error,
          });
        }

        if (data.data && data.data[0]?.b64_json) {
          generatedImageBase64 = `data:image/png;base64,${data.data[0].b64_json}`;
        } else if (data.data && data.data[0]?.url) {
          const imgResponse = await fetch(data.data[0].url);
          const arrayBuf = await imgResponse.arrayBuffer();
          const base64 = Buffer.from(arrayBuf).toString("base64");
          generatedImageBase64 = `data:image/png;base64,${base64}`;
        }
        modelUsed = "OpenAI DALL-E 3";
        engineUsed = "openai_dalle3";
      } catch (err: any) {
        console.error("OpenAI DALL-E 3 connection error:", err?.message || err);
        return res.status(500).json({
          error: `Error de conexión con OpenAI: ${err.message}`,
        });
      }
    }

    if (generatedImageBase64) {
      return res.json({
        success: true,
        data: {
          imageUrl: generatedImageBase64,
          aspectRatio,
          modelUsed,
          engineUsed,
          appliedResources: Object.keys(selectedResources).filter((k) => selectedResources[k as keyof typeof selectedResources]),
          systemName: system.name,
          promptUsed: visualPrompt,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // 5. SVG Vector Engine (Only if explicitly selected or if all external APIs fail)
    console.warn("Generating SVG vector application mockup...");
    const fallbackColors = system.colorPalette && system.colorPalette.length > 0
      ? system.colorPalette.map((c: any) => c.hex)
      : ["#141414", "#E65100", "#C89D7C", "#F4F4F0"];

    const primaryColor = fallbackColors[0] || "#141414";
    const accentColor = fallbackColors[1] || "#E65100";
    const tertiaryColor = fallbackColors[2] || "#C89D7C";
    const lightColor = fallbackColors[3] || "#F4F4F0";

    const svgVectorCode = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="100%" height="100%">
      <defs>
        <filter id="craft-noise" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="4" result="noise"/>
          <feColorMatrix type="matrix" values="0 0 0 0 0.8  0 0 0 0 0.6  0 0 0 0 0.45  0 0 0 0.12 0" in="noise" result="coloredNoise"/>
          <feComposite operator="in" in2="SourceGraphic"/>
        </filter>
        <pattern id="kraft-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="${primaryColor}" stroke-width="0.5" stroke-opacity="0.08"/>
        </pattern>
      </defs>
      
      <!-- Background Kraft Stock -->
      <rect width="1000" height="1000" fill="${tertiaryColor}" />
      <rect width="1000" height="1000" fill="url(#kraft-grid)" />
      
      <!-- Outer Frame & Trim Marks -->
      <rect x="40" y="40" width="920" height="920" fill="none" stroke="${primaryColor}" stroke-width="3" />
      <rect x="52" y="52" width="896" height="896" fill="none" stroke="${accentColor}" stroke-width="1.5" stroke-dasharray="8 6" />
      
      <!-- Corner Registration Marks -->
      <path d="M 30 40 L 50 40 M 40 30 L 40 50" stroke="${primaryColor}" stroke-width="2"/>
      <path d="M 950 40 L 970 40 M 960 30 L 960 50" stroke="${primaryColor}" stroke-width="2"/>
      <path d="M 30 960 L 50 960 M 40 950 L 40 970" stroke="${primaryColor}" stroke-width="2"/>
      <path d="M 950 960 L 970 960 M 960 950 L 960 970" stroke="${primaryColor}" stroke-width="2"/>

      <!-- Header Label / System Info -->
      <text x="80" y="95" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="14" fill="${primaryColor}" letter-spacing="4">
        SISTEMA VISUAL: ${system.name.toUpperCase()}
      </text>
      <text x="920" y="95" text-anchor="end" font-family="monospace" font-size="12" fill="${accentColor}" font-weight="bold">
        AUTENTICADO • ULTRA HD
      </text>

      <!-- Centerpiece Stamp / Monogram -->
      <g transform="translate(500, 470)">
        <circle r="220" fill="${primaryColor}" />
        <circle r="205" fill="none" stroke="${lightColor}" stroke-width="2" stroke-dasharray="6 4" />
        <circle r="190" fill="none" stroke="${accentColor}" stroke-width="3" />
        
        <!-- Big Brand Monogram -->
        <text x="0" y="35" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="110" fill="${lightColor}" letter-spacing="-3">
          ${system.name.slice(0, 3).toUpperCase()}
        </text>
        
        <!-- Circular Stamp Arc Text -->
        <path id="curveTop" d="M -150 -40 A 150 150 0 0 1 150 -40" fill="none" />
        <text font-family="system-ui, sans-serif" font-size="16" font-weight="bold" fill="${accentColor}" letter-spacing="6">
          <textPath href="#curveTop" startOffset="50%" text-anchor="middle">
            CALIDAD ARTESANAL CONFIRMADA
          </textPath>
        </text>

        <path id="curveBottom" d="M -140 70 A 140 140 0 0 0 140 70" fill="none" />
        <text font-family="monospace" font-size="13" fill="${lightColor}" letter-spacing="4">
          <textPath href="#curveBottom" startOffset="50%" text-anchor="middle">
            EST. 2024 • CRAFT IDENTITY
          </textPath>
        </text>
      </g>

      <!-- User Instruction Label Banner -->
      <g transform="translate(100, 770)">
        <rect width="800" height="90" rx="12" fill="${primaryColor}" />
        <text x="30" y="38" font-family="system-ui, sans-serif" font-weight="800" font-size="15" fill="${accentColor}" letter-spacing="1">
          APLICACIÓN SOLICITADA POR EL USUARIO:
        </text>
        <text x="30" y="65" font-family="system-ui, sans-serif" font-size="14" fill="${lightColor}" font-weight="500">
          ${activeUserText.slice(0, 85)}${activeUserText.length > 85 ? '...' : ''}
        </text>
      </g>

      <!-- Bottom Palette Swatches and Technical Tag -->
      <g transform="translate(80, 895)">
        <rect x="0" y="0" width="36" height="36" rx="6" fill="${primaryColor}" stroke="#fff" stroke-width="1.5" />
        <rect x="46" y="0" width="36" height="36" rx="6" fill="${accentColor}" stroke="#fff" stroke-width="1.5" />
        <rect x="92" y="0" width="36" height="36" rx="6" fill="${tertiaryColor}" stroke="#fff" stroke-width="1.5" />
        <rect x="138" y="0" width="36" height="36" rx="6" fill="${lightColor}" stroke="#141414" stroke-width="1.5" />
        <text x="190" y="24" font-family="monospace" font-size="12" fill="${primaryColor}" font-weight="bold">
          HEX: ${fallbackColors.slice(0, 4).join(' • ')}
        </text>
      </g>
    </svg>`;

    const fallbackSvgBase64 = `data:image/svg+xml;utf8,${encodeURIComponent(svgVectorCode)}`;

    return res.json({
      success: true,
      data: {
        imageUrl: fallbackSvgBase64,
        svgCode: svgVectorCode,
        aspectRatio: '1:1',
        modelUsed: "Vector SVG Engine",
        engineUsed: "svg_vector",
        appliedResources: Object.keys(selectedResources).filter((k) => selectedResources[k as keyof typeof selectedResources]),
        systemName: system.name,
        promptUsed: visualPrompt,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Error in /api/generate-application:", error);
    return res.status(500).json({
      error: "Error interno al generar la aplicación visual.",
      details: error.message,
    });
  }
});

// Vite middleware & Static Serving
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
