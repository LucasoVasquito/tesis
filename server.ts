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
5. "typographyRules": Array of 2-4 key typography guidelines.
6. "textureRules": Array of 2-4 key texture/finish guidelines.
7. "compositionRules": Array of 2-4 key layout/grid guidelines.
8. "sources": Traceability. For each item of aestheticPillars, typographyRules, textureRules and compositionRules, list the IDs (in square brackets above, e.g. "pat_bc_02") of the validated patterns that support it. Use only IDs from the list. Shape: {"aestheticPillars": [["pat_x"], ...], "typographyRules": [[...]], "textureRules": [[...]], "compositionRules": [[...]]}, one inner array per item, same order.
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
            sources: {
              type: Type.OBJECT,
              properties: {
                aestheticPillars: { type: Type.ARRAY, items: { type: Type.ARRAY, items: { type: Type.STRING } } },
                typographyRules: { type: Type.ARRAY, items: { type: Type.ARRAY, items: { type: Type.STRING } } },
                textureRules: { type: Type.ARRAY, items: { type: Type.ARRAY, items: { type: Type.STRING } } },
                compositionRules: { type: Type.ARRAY, items: { type: Type.ARRAY, items: { type: Type.STRING } } },
              },
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
      // Trazabilidad: solo IDs de patrones que realmente se enviaron, alineados con cada ítem.
      const validIds = new Set((patterns || []).map((p: any) => p.id));
      const fields = ["aestheticPillars", "typographyRules", "textureRules", "compositionRules"];
      const sources: Record<string, string[][]> = {};
      for (const f of fields) {
        const items = Array.isArray(parsed[f]) ? parsed[f] : [];
        const raw = Array.isArray(parsed.sources?.[f]) ? parsed.sources[f] : [];
        sources[f] = items.map((_: any, i: number) => (Array.isArray(raw[i]) ? raw[i] : []).map(String).filter((id: string) => validIds.has(id)));
      }
      parsed.sources = sources;
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
// 3. Verificación externa: pieza generada con OpenAI (GPT Image)
// ==========================================
// DALL·E 3 fue retirado de la API de OpenAI el 12/05/2026. Se usa la familia GPT Image con la
// misma OPENAI_API_KEY. El modelo se configura con OPENAI_IMAGE_MODEL (por defecto gpt-image-2)
// y, si no está disponible para la cuenta, se reintenta con gpt-image-1.
type ImageSize = "1024x1024" | "1024x1536" | "1536x1024";

interface PieceFormat {
  id: string;
  size: ImageSize;
  phrase: string;
}

/** Detecta el soporte pedido para elegir formato y tamaño. */
function detectFormat(text: string): PieceFormat {
  const t = text.toLowerCase();
  const has = (re: RegExp) => re.test(t);
  if (has(/\b(logo|logotipo|isotipo|isologo|monograma|emblema|sello)\b/))
    return { id: "logo", size: "1024x1024", phrase: "a flat 2D logo mark presented alone on a plain background, crisp vector-like edges" };
  if (has(/\b(afiche|poster|póster|flyer|volante|cartel publicitario)\b/))
    return { id: "poster", size: "1024x1536", phrase: "a vertical printed poster, flat 2D graphic layout seen straight on, edge to edge" };
  if (has(/\b(fachada|frente|marquesina|vidriera|local|interior|mostrador|señalética|senaletica|pared|mural)\b/))
    return { id: "space", size: "1536x1024", phrase: "a natural-light architectural photograph of the physical space, eye-level, realistic materials" };
  if (has(/\b(web|website|sitio|landing|home ?page)\b/))
    return { id: "web", size: "1536x1024", phrase: "a desktop website hero section shown as a flat screen capture" };
  if (has(/\b(story|stories|historia)\b/))
    return { id: "story", size: "1024x1536", phrase: "a vertical social media story, flat 2D layout" };
  if (has(/\b(instagram|post|redes|feed)\b/))
    return { id: "post", size: "1024x1024", phrase: "a square social media post, flat 2D layout" };
  if (has(/\b(packaging|envase|envoltorio|caja|bolsa|vaso|etiqueta|servilleta|lata|botella)\b/))
    return { id: "packaging", size: "1024x1024", phrase: "a product packaging photograph on a plain studio surface, soft natural light, real printed materials" };
  if (has(/\b(menú|menu|carta|folleto|editorial|revista|libro|tapa)\b/))
    return { id: "print", size: "1024x1536", phrase: "a printed editorial piece photographed flat from above on a plain surface" };
  return { id: "piece", size: "1024x1024", phrase: "a single brand application presented clearly on a plain background" };
}

const firstOf = (arr?: string[]) => (Array.isArray(arr) && arr.length ? String(arr[0]).trim() : "");
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

/**
 * Prompt en inglés, corto y descriptivo:
 * sujeto · soporte · paleta HEX (3-4) · una regla tipográfica · una de textura · composición.
 * Las restricciones se expresan en positivo.
 */
function buildImagePrompt(opts: {
  subject: string;
  projectName: string;
  system: any;
  patterns: any[];
  resources: Record<string, boolean>;
  format: PieceFormat;
  hasReferences: boolean;
  revision?: string;
  hasAnchor?: boolean;
}): string {
  const { system, resources, patterns } = opts;
  const lines: string[] = [];
  lines.push(`${clip(opts.subject, 220)}, for the brand "${opts.projectName || system?.name}".`);
  lines.push(`Format: ${opts.format.phrase}.`);

  const palette = (system?.colorPalette || []).map((c: any) => String(c.hex || "").toUpperCase()).filter(Boolean).slice(0, 4);
  if (resources.palette !== false && palette.length) lines.push(`Color palette limited to ${palette.join(", ")}, used as flat solid colors.`);

  const typo = firstOf(system?.typographyRules) || patterns.find((p: any) => p.category === "typography")?.description || "";
  if (resources.typography !== false && typo) lines.push(`Typography: ${clip(typo, 180)}.`);

  const texture = firstOf(system?.textureRules) || patterns.find((p: any) => p.category === "texture")?.description || "";
  if (resources.texture !== false && texture) lines.push(`Surface and texture: ${clip(texture, 160)}.`);

  const comp = firstOf(system?.compositionRules) || patterns.find((p: any) => p.category === "composition")?.description || "";
  if (resources.composition !== false && comp) lines.push(`Composition: ${clip(comp, 160)}.`);

  if (resources.graphic_elements) {
    const g = patterns.filter((p: any) => p.category === "graphic_elements" || p.category === "logo_identity").map((p: any) => p.name).slice(0, 2);
    if (g.length) lines.push(`Graphic elements: ${g.join("; ")}.`);
  }
  if (resources.photography) {
    const ph = system?.systemDetails?.photographyStyle || patterns.find((p: any) => p.category === "photography_treatment")?.description;
    if (ph) lines.push(`Image treatment: ${clip(ph, 140)}.`);
  }
  if (resources.illustration) {
    const il = system?.systemDetails?.mascotAndIllustration || patterns.find((p: any) => p.category === "mascot_illustration")?.description;
    if (il) lines.push(`Illustration: ${clip(il, 140)}.`);
  }

  if (opts.revision) {
    lines.push(`Revise the first attached image: ${clip(opts.revision, 200)}. Keep everything else as it is.`);
  } else if (opts.hasAnchor) {
    lines.push("Keep the same visual language, materials and lighting as the first attached image.");
  }
  if (opts.hasReferences) {
    lines.push("The attached reference images are style evidence: match their palette, materials, textures and graphic language, with a new composition and original content.");
  }
  lines.push("Text in the image, if any, is short, legible and spelled exactly as given.");
  return lines.join("\n");
}

/** data URL o http(s) → Blob para multipart. */
async function imageToBlob(src: string, name: string): Promise<{ blob: Blob; name: string } | null> {
  const part = await resolveImagePart(src, name);
  if (!part) return null;
  const ext = part.mimeType.split("/")[1] || "png";
  const type = ["image/png", "image/jpeg", "image/webp"].includes(part.mimeType) ? part.mimeType : "image/png";
  return { blob: new Blob([Buffer.from(part.data, "base64")], { type }), name: `${name}.${ext === "jpeg" ? "jpg" : ext}` };
}

function friendlyOpenAIError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("incorrect api key") || m.includes("invalid api key")) return "La OPENAI_API_KEY del archivo .env no es válida.";
  if (m.includes("verif")) return "Tu organización de OpenAI tiene que estar verificada para usar los modelos GPT Image (platform.openai.com → Settings → Organization → Verify).";
  if (m.includes("billing") || m.includes("quota") || m.includes("credit")) return "La cuenta de OpenAI no tiene saldo o alcanzó su límite (platform.openai.com → Billing).";
  if (m.includes("safety") || m.includes("moderation") || m.includes("rejected")) return "OpenAI rechazó el pedido por sus políticas de contenido. Probá reformular la descripción.";
  return msg;
}

async function callOpenAIImage(opts: {
  key: string;
  model: string;
  prompt: string;
  size: ImageSize;
  quality: string;
  images: { blob: Blob; name: string }[];
}): Promise<string> {
  const { key, model, prompt, size, quality, images } = opts;
  let response: Response;
  if (images.length) {
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", prompt);
    form.append("size", size);
    form.append("quality", quality);
    form.append("n", "1");
    // gpt-image-1 admite fidelidad alta a las imágenes de entrada; gpt-image-2 la aplica siempre.
    if (model === "gpt-image-1") form.append("input_fidelity", "high");
    images.forEach(img => form.append("image[]", img.blob, img.name));
    response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
  } else {
    response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, prompt, size, quality, n: 1 }),
    });
  }
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const err: any = new Error(data?.error?.message || `HTTP ${response.status}`);
    err.status = response.status;
    err.code = data?.error?.code;
    throw err;
  }
  const b64 = data?.data?.[0]?.b64_json;
  if (b64) return `data:image/png;base64,${b64}`;
  const url = data?.data?.[0]?.url;
  if (url) {
    const img = await fetch(url);
    return `data:image/png;base64,${Buffer.from(await img.arrayBuffer()).toString("base64")}`;
  }
  throw new Error("OpenAI no devolvió ninguna imagen.");
}

app.post("/api/generate-application", async (req, res) => {
  dotenv.config({ override: true });
  try {
    const {
      system,
      projectName = "",
      confirmedPatterns = [],
      selectedResources = {},
      references = [],
      userDescription = "",
      iterationPrompt = "",
      previousImageUrl = "",
      anchorImageUrl = "",
    } = req.body || {};

    if (!system || !system.name) {
      return res.status(400).json({ error: "Se requiere un sistema visual para generar la pieza." });
    }
    const key = (process.env.OPENAI_API_KEY || "").trim();
    if (!key) {
      return res.status(400).json({ error: "Falta OPENAI_API_KEY en el archivo .env del servidor." });
    }

    const subject = String(userDescription || "").trim() || `A key brand piece for ${system.name}`;
    const format = detectFormat(`${subject} ${iterationPrompt}`);
    const revision = String(iterationPrompt || "").trim();

    // Imágenes de entrada: primero la pieza a revisar (o el ancla de estilo), luego hasta 3 referencias de evidencia.
    const inputs: { blob: Blob; name: string }[] = [];
    const base = revision ? previousImageUrl : anchorImageUrl;
    if (base) {
      const b = await imageToBlob(base, revision ? "pieza_anterior" : "ancla_estilo");
      if (b) inputs.push(b);
    }
    const usedRefs: string[] = [];
    for (const r of (references || []).slice(0, 3)) {
      if (!r?.image) continue;
      const b = await imageToBlob(r.image, r.id || "ref");
      if (b) {
        inputs.push(b);
        usedRefs.push(r.id);
      }
    }

    const prompt = buildImagePrompt({
      subject,
      projectName,
      system,
      patterns: confirmedPatterns,
      resources: selectedResources,
      format,
      hasReferences: usedRefs.length > 0,
      revision: revision || undefined,
      hasAnchor: !revision && !!anchorImageUrl && inputs.length > usedRefs.length,
    });

    const preferred = (process.env.OPENAI_IMAGE_MODEL || "gpt-image-2").trim();
    const quality = (process.env.OPENAI_IMAGE_QUALITY || "high").trim();
    const models = Array.from(new Set([preferred, "gpt-image-1"]));
    let imageUrl = "";
    let modelUsed = "";
    let lastErr: any = null;
    for (const model of models) {
      try {
        console.log(`[Imagen] ${model} · ${format.size} · ${inputs.length} imágenes de entrada`);
        imageUrl = await callOpenAIImage({ key, model, prompt, size: format.size, quality, images: inputs });
        modelUsed = model;
        break;
      } catch (err: any) {
        lastErr = err;
        const msg = String(err?.message || "").toLowerCase();
        const modelProblem = err?.status === 404 || msg.includes("model") || msg.includes("does not exist") || msg.includes("not found");
        console.warn(`[Imagen] ${model} falló: ${err?.message}`);
        if (!modelProblem) break; // errores de contenido, saldo o verificación no se resuelven cambiando de modelo
      }
    }

    if (!imageUrl) {
      return res.status(502).json({
        error: friendlyOpenAIError(String(lastErr?.message || "No se pudo generar la imagen.")),
        details: lastErr?.message,
        promptUsed: prompt,
      });
    }

    return res.json({
      success: true,
      data: {
        imageUrl,
        modelUsed,
        size: format.size,
        format: format.id,
        referencesUsed: usedRefs,
        appliedResources: Object.keys(selectedResources).filter(k => selectedResources[k]),
        systemName: system.name,
        promptUsed: prompt,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Error en /api/generate-application:", error);
    return res.status(500).json({ error: "Error interno al generar la pieza.", details: error?.message });
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
