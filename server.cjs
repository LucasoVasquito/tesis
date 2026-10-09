var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_genai = require("@google/genai");
var import_inference = require("@huggingface/inference");
var import_dotenv = __toESM(require("dotenv"), 1);
import_dotenv.default.config();
var app = (0, import_express.default)();
var PORT = 3e3;
app.use(import_express.default.json({ limit: "50mb" }));
app.use(import_express.default.urlencoded({ extended: true, limit: "50mb" }));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Methods", "*");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});
function getGeminiClient() {
  import_dotenv.default.config({ override: true });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error("La variable de entorno GEMINI_API_KEY no est\xE1 configurada en el servidor.");
  }
  return new import_genai.GoogleGenAI({
    apiKey: apiKey.trim(),
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}
var VALID_GEMINI_MIME_TYPES = /* @__PURE__ */ new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif"
]);
async function resolveImagePart(imageStr, refId) {
  if (!imageStr) return null;
  if (imageStr.startsWith("data:")) {
    try {
      const commaIdx = imageStr.indexOf(",");
      if (commaIdx !== -1) {
        const header = imageStr.slice(5, commaIdx);
        const data = imageStr.slice(commaIdx + 1).trim();
        let mimeType = header.split(";")[0]?.toLowerCase().trim() || "image/jpeg";
        if (mimeType === "image/jpg") mimeType = "image/jpeg";
        if (!VALID_GEMINI_MIME_TYPES.has(mimeType)) {
          mimeType = "image/jpeg";
        }
        return {
          mimeType,
          data,
          refId
        };
      }
    } catch (err) {
      console.warn(`Error procesando data URL para ref ${refId}:`, err);
    }
  }
  if (imageStr.startsWith("http://") || imageStr.startsWith("https://")) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const response = await fetch(imageStr, {
        signal: controller.signal,
        headers: {
          Accept: "image/jpeg,image/png,image/webp,image/*;q=0.8",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        console.warn(`Fetch de imagen fall\xF3 para ${refId} (${imageStr}) con status ${response.status}`);
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
        refId
      };
    } catch (err) {
      console.warn(`Timeout o error descargando imagen para ref ${refId}:`, err?.message || err);
    }
  }
  return null;
}
function parseModelJsonResponse(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }
  return JSON.parse(cleaned);
}
async function generateContentWithRetry(ai, request) {
  const candidateModels = [
    request.model,
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.6-flash",
    "gemini-3.7-flash"
  ].filter(Boolean);

  const uniqueModels = Array.from(new Set(candidateModels));
  let lastError = null;

  for (const model of uniqueModels) {
    try {
      console.log(`[Gemini API] Consultando modelo ${model}...`);
      const response = await ai.models.generateContent({
        ...request,
        model
      });
      console.log(`[Gemini API] \xC9xito con modelo ${model}`);
      return response;
    } catch (err) {
      lastError = err;
      const msg = err?.message || String(err);
      console.warn(`[Gemini API] Modelo ${model} notific\xF3 error (${msg.slice(0, 120)}...). Cambiando al siguiente modelo...`);
      continue;
    }
  }

  throw lastError;
}
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
});
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
      feedback = []
    } = req.body;
    if (!references || references.length === 0) {
      return res.status(400).json({
        error: "Se requiere al menos una referencia visual para el an\xE1lisis."
      });
    }
    let result = null;
    try {
      const resolvedImages = await Promise.all(
        references.map(async (ref) => {
          try {
            const imgPart = await resolveImagePart(ref.image, ref.id);
            return { ref, imgPart };
          } catch {
            return { ref, imgPart: null };
          }
        })
      );
      const parts = [];
      const refSummaryList = [];
      for (const { ref, imgPart } of resolvedImages) {
        parts.push({
          text: `[REFERENCIA_VISUAL: ID="${ref.id}", Nombre="${ref.name || ref.id}", Notas="${ref.notes || "Ninguna"}"]`
        });
        if (imgPart) {
          parts.push({
            inlineData: {
              mimeType: imgPart.mimeType,
              data: imgPart.data
            }
          });
        }
        refSummaryList.push(`- ID: ${ref.id} (${ref.name || "Sin t\xEDtulo"})`);
      }
      const previousContext = `
HISTORIAL DE DECISIONES PREVIAS DEL DISE\xD1ADOR:
- Patrones ya confirmados por el dise\xF1ador: ${JSON.stringify(confirmedPatterns.map((p) => ({ id: p.id, name: p.name, category: p.category, assignedSystem: p.assignedSystemId })))}
- Patrones previamente descartados por el dise\xF1ador: ${JSON.stringify(discardedPatterns.map((p) => ({ id: p.id, name: p.name, reason: p.discardReason })))}
- Feedback expl\xEDcito del dise\xF1ador: ${JSON.stringify(feedback.map((f) => ({ type: f.type, comment: f.comment, refId: f.referenceId, patternId: f.patternId })))}
- Patrones de an\xE1lisis anterior: ${JSON.stringify(previousPatterns.map((p) => ({ id: p.id, name: p.name, evidenceCount: p.evidence?.length })))}
`;
      const nombre_proyecto = projectName || "Identidad Visual";
      const objetivo_proyecto = objective || "Exploraci\xF3n de identidad y universo est\xE9tico";
      const instructions = `
Actu\xE1 como un Director de Arte senior, cr\xEDtico de dise\xF1o visual y experto en branding e identidades multimediales. Est\xE1s evaluando un moodboard de trabajo recopilado por un dise\xF1ador para el proyecto '${nombre_proyecto}' (${objetivo_proyecto}).

El an\xE1lisis no debe ser escueto ni superficial. Debes realizar un desglose minucioso, cruzando las referencias visuales del canvas para detectar patrones estructurales complejos que articulen logotipos, sistemas de packaging, tratamientos fotogr\xE1ficos, tipograf\xEDas, flyers, publicaciones digitales y recursos gr\xE1ficos/mascotas.

Para cada descubrimiento o patr\xF3n que detectes, analiza y detalla rigurosamente:

1. CATEGOR\xCDA T\xC9CNICA: (Ej: Tipograf\xEDa Display, Sistema de Logotipo, Fotograf\xEDa Gastron\xF3mica, Packaging Estructurado, Ilustraci\xF3n de Personaje/Mascota, Composici\xF3n/Grilla, Tratamiento Crom\xE1tico).
   Usa una de las siguientes claves normalizadas:
   - 'logo_identity' (Sistema de Logotipo e Identidad)
   - 'packaging' (Packaging y Envases)
   - 'photography_treatment' (Fotograf\xEDa y Tratamiento Visual)
   - 'typography' (Tipograf\xEDa y Jerarqu\xEDas)
   - 'flyer_poster' (Flyers, Afiches y Piezas Gr\xE1ficas)
   - 'social_media' (Publicaciones y Redes Sociales)
   - 'mascot_illustration' (Mascotas, Personajes e Ilustraci\xF3n)
   - 'color' (Tratamiento Crom\xE1tico y Paletas)
   - 'texture' (Textura, Grano y Materialidad)
   - 'composition' (Composici\xF3n y Grilla)
   - 'graphic_elements' (Recursos Gr\xE1ficos Secundarios)

2. NOMBRE DEL PATR\xD3N: Un t\xEDtulo conceptual y t\xE9cnico preciso (ej: "Tipograf\xEDa display con deformaciones formales y alto impacto", "Mascotas estilo ilustraci\xF3n vintage cartoon").

3. DESCRIPCI\xD3N PROFUNDA Y RELACIONAL: Explica a fondo c\xF3mo opera este patr\xF3n, qu\xE9 tensiones visuales resuelve y c\xF3mo dialoga entre diferentes soportes (por ejemplo, c\xF3mo la tipograf\xEDa de los carteles se acopla con el packaging o c\xF3mo la fotograf\xEDa complementa al sistema de marca).

4. RASGOS OBSERVABLES: Caracter\xEDsticas visuales concretas y t\xE9cnicas (ej: trazos porosos, grillas perimetrales, saturaci\xF3n controlada, iluminaci\xF3n cenital de estudio).

5. EVIDENCIA CRUZADA: Vincula expl\xEDcitamente los IDs exactos de las referencias del canvas que sostienen este hallazgo (ej: [ref_01, ref_05, ref_06]).

6. HIP\xD3TESIS DE SISTEMA VISUAL: Fundamenta c\xF3mo este descubrimiento puede traducirse en un subsistema reutilizable para soportes f\xEDsicos (espacio, envoltorios) y digitales (web, redes).

No generalices. Si encuentras contradicciones est\xE9ticas entre referencias (ej. estilos tipogr\xE1ficos divergentes), se\xF1\xE1lalo como evidencia de m\xFAltiples sistemas visuales en tensi\xF3n. S\xE9 exhaustivo y riguroso.

DESCRIPCI\xD3N / CONTEXTO DEL PROYECTO:
"${description || "Sin descripci\xF3n adicional"}"

REFERENCIAS CARGADAS EN EL CANVAS:
${refSummaryList.join("\n")}

${previousContext}

Devuelve el an\xE1lisis en formato JSON estricto cumpliendo el schema provisto.`;
      parts.push({ text: instructions });
      const ai = getGeminiClient();
      const response = await generateContentWithRetry(ai, {
        contents: [{ role: "user", parts }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: import_genai.Type.OBJECT,
            properties: {
              patterns: {
                type: import_genai.Type.ARRAY,
                items: {
                  type: import_genai.Type.OBJECT,
                  properties: {
                    id: { type: import_genai.Type.STRING, description: "Identificador \xFAnico, ej. pat_01" },
                    name: { type: import_genai.Type.STRING, description: "Nombre conceptual y t\xE9cnico preciso del patr\xF3n" },
                    category: {
                      type: import_genai.Type.STRING,
                      description: "typography | color | texture | composition | logo_identity | packaging | photography_treatment | mascot_illustration | flyer_poster | social_media | graphic_elements"
                    },
                    description: { type: import_genai.Type.STRING, description: "Descripci\xF3n profunda y relacional: c\xF3mo opera este patr\xF3n, tensiones que resuelve y di\xE1logo entre soportes" },
                    evidence: {
                      type: import_genai.Type.ARRAY,
                      items: { type: import_genai.Type.STRING },
                      description: "Array de IDs exactos de las referencias del canvas que sostienen el hallazgo, ej: ['ref_01', 'ref_04']"
                    },
                    confidence: { type: import_genai.Type.NUMBER, description: "Nivel de confianza entre 0.0 y 1.0" },
                    relatedObservations: {
                      type: import_genai.Type.ARRAY,
                      items: { type: import_genai.Type.STRING },
                      description: "Caracter\xEDsticas visuales concretas y t\xE9cnicas observables"
                    },
                    systemHypothesis: {
                      type: import_genai.Type.STRING,
                      description: "Hip\xF3tesis de traducci\xF3n del patr\xF3n en un subsistema reutilizable para soportes f\xEDsicos y digitales"
                    },
                    suggestedSystemName: { type: import_genai.Type.STRING, description: "Nombre del sistema visual sugerido al que pertenece este patr\xF3n" },
                    trend: {
                      type: import_genai.Type.STRING,
                      description: "new | strengthened | weakened | stable"
                    }
                  },
                  required: ["id", "name", "category", "description", "evidence", "confidence", "relatedObservations", "systemHypothesis"]
                }
              },
              suggestedSystems: {
                type: import_genai.Type.ARRAY,
                items: {
                  type: import_genai.Type.OBJECT,
                  properties: {
                    id: { type: import_genai.Type.STRING },
                    name: { type: import_genai.Type.STRING, description: "Nombre del sistema, ej: Sistema Identitario Urbano Kraft" },
                    description: { type: import_genai.Type.STRING, description: "Fundamentaci\xF3n y descripci\xF3n conceptual del sistema" },
                    associatedPatternNames: {
                      type: import_genai.Type.ARRAY,
                      items: { type: import_genai.Type.STRING }
                    },
                    referenceIds: {
                      type: import_genai.Type.ARRAY,
                      items: { type: import_genai.Type.STRING }
                    },
                    aestheticPillars: {
                      type: import_genai.Type.ARRAY,
                      items: { type: import_genai.Type.STRING },
                      description: "Pilares conceptuales y estil\xEDsticos clave"
                    },
                    systemDetails: {
                      type: import_genai.Type.OBJECT,
                      properties: {
                        brandEssence: { type: import_genai.Type.STRING, description: "Concepto nuclear y tono de voz visual" },
                        logoAndIdentity: { type: import_genai.Type.STRING, description: "Criterios de logotipos, isotipos y sellos identitarios" },
                        packagingSystem: { type: import_genai.Type.STRING, description: "Criterios de packaging, empaques, etiquetas y sustratos" },
                        photographyStyle: { type: import_genai.Type.STRING, description: "Criterios de fotograf\xEDa y direcci\xF3n de arte" },
                        typographySystem: { type: import_genai.Type.STRING, description: "Familias, combinaciones y jerarqu\xEDas tipogr\xE1ficas" },
                        graphicApplications: { type: import_genai.Type.STRING, description: "Criterios de flyers, afiches, carteler\xEDa y men\xFAs" },
                        mascotAndIllustration: { type: import_genai.Type.STRING, description: "Criterios de mascotas, personajes e ilustraciones" },
                        digitalAndSocialMedia: { type: import_genai.Type.STRING, description: "Estructura de publicaciones y contenido para redes sociales" }
                      }
                    },
                    suggestedPalette: {
                      type: import_genai.Type.ARRAY,
                      items: {
                        type: import_genai.Type.OBJECT,
                        properties: {
                          hex: { type: import_genai.Type.STRING },
                          name: { type: import_genai.Type.STRING },
                          role: { type: import_genai.Type.STRING }
                        },
                        required: ["hex", "name", "role"]
                      }
                    }
                  },
                  required: ["id", "name", "description", "referenceIds", "aestheticPillars"]
                }
              },
              overallInsight: {
                type: import_genai.Type.STRING,
                description: "Diagn\xF3stico general exhaustivo y articulado de la investigaci\xF3n visual y relaciones del branding"
              }
            },
            required: ["patterns", "suggestedSystems", "overallInsight"]
          }
        }
      });
      const rawText = response.text || "{}";
      result = parseModelJsonResponse(rawText);
    } catch (aiErr) {
      console.error("[Gemini API Error in analyze-references]:", aiErr?.message || aiErr);
      return res.status(500).json({
        error: `Error al procesar el an\xE1lisis de referencias con Gemini: ${aiErr?.message || String(aiErr)}`
      });
    }
    return res.json({
      success: true,
      data: result,
      analyzedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (error) {
    console.error("Error en /api/analyze-references:", error);
    return res.status(500).json({
      error: "Error al procesar el an\xE1lisis de referencias con Gemini.",
      details: error.message
    });
  }
});
app.post("/api/inspect-reference", async (req, res) => {
  try {
    const { reference } = req.body;
    if (!reference || !reference.image) {
      return res.status(400).json({ error: "Se requiere una referencia con imagen para el desglose." });
    }
    let result = null;
    try {
      const imgPart = await resolveImagePart(reference.image, reference.id || "ref_inspect");
      const promptText = `
Analiza exhaustivamente esta imagen de referencia visual individual para un dise\xF1ador multimedial.
Provee un desglose formal y t\xE9cnico riguroso de sus componentes visuales observables:
1. Paleta de color (colores dominantes, de acento y fondo con c\xF3digo HEX estimado y rol).
2. Tipograf\xEDa visible (clasificaci\xF3n, presencia o ausencia de serif/sans/display, peso, tratamiento gr\xE1fico). Si no hay texto, ind\xEDcalo claramente.
3. Textura y materialidad visual (grano, semitono, ruido anal\xF3gico, limpieza digital).
4. Composici\xF3n y distribuci\xF3n espacial (tipo de ret\xEDcula, balance, peso visual, proporci\xF3n de espacio negativo, contraste).
5. Recursos gr\xE1ficos y geom\xE9tricos (l\xEDneas, filetes, capas, marcos, formas).
6. Tratamiento fotogr\xE1fico o ilustrativo (iluminaci\xF3n, virado crom\xE1tico, contraste, estilo).
7. Resumen observable sint\xE9tico.

No inventes nada que no est\xE9 presente en la imagen. Devuelve el resultado en JSON estructurado.
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
                  data: imgPart.data
                }
              }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: import_genai.Type.OBJECT,
            properties: {
              colors: {
                type: import_genai.Type.ARRAY,
                items: {
                  type: import_genai.Type.OBJECT,
                  properties: {
                    hex: { type: import_genai.Type.STRING },
                    name: { type: import_genai.Type.STRING },
                    role: { type: import_genai.Type.STRING, description: "predominant | accent | background | detail" },
                    percentage: { type: import_genai.Type.STRING }
                  },
                  required: ["hex", "name", "role"]
                }
              },
              typography: {
                type: import_genai.Type.OBJECT,
                properties: {
                  hasText: { type: import_genai.Type.BOOLEAN },
                  familyStyle: { type: import_genai.Type.STRING },
                  classification: { type: import_genai.Type.STRING, description: "serif | sans-serif | display | script | monospaced | none | mixed" },
                  treatment: { type: import_genai.Type.STRING },
                  hierarchy: { type: import_genai.Type.STRING }
                },
                required: ["hasText", "familyStyle", "classification", "treatment", "hierarchy"]
              },
              texture: {
                type: import_genai.Type.OBJECT,
                properties: {
                  type: { type: import_genai.Type.STRING },
                  intensity: { type: import_genai.Type.STRING, description: "sutil | moderada | intensa | nula" },
                  description: { type: import_genai.Type.STRING }
                },
                required: ["type", "intensity", "description"]
              },
              composition: {
                type: import_genai.Type.OBJECT,
                properties: {
                  spatialDistribution: { type: import_genai.Type.STRING },
                  negativeSpace: { type: import_genai.Type.STRING, description: "abundante | moderado | denso/saturado" },
                  contrastLevel: { type: import_genai.Type.STRING, description: "muy alto | medio | bajo / tonal" },
                  focalPoint: { type: import_genai.Type.STRING }
                },
                required: ["spatialDistribution", "negativeSpace", "contrastLevel", "focalPoint"]
              },
              graphicResources: {
                type: import_genai.Type.ARRAY,
                items: { type: import_genai.Type.STRING }
              },
              photoTreatment: { type: import_genai.Type.STRING },
              formsAndGeometry: {
                type: import_genai.Type.ARRAY,
                items: { type: import_genai.Type.STRING }
              },
              observableSummary: { type: import_genai.Type.STRING }
            },
            required: [
              "colors",
              "typography",
              "texture",
              "composition",
              "graphicResources",
              "photoTreatment",
              "formsAndGeometry",
              "observableSummary"
            ]
          }
        }
      });
      const rawText = response.text || "{}";
      result = parseModelJsonResponse(rawText);
    } catch (aiErr) {
      console.error("[Gemini API Error in inspect-reference]:", aiErr?.message || aiErr);
      return res.status(500).json({
        error: `Error al inspeccionar la referencia con Gemini: ${aiErr?.message || String(aiErr)}`
      });
    }
    return res.json({
      success: true,
      data: {
        ...result,
        analyzedAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
  } catch (error) {
    console.error("Error en /api/inspect-reference:", error);
    return res.status(500).json({
      error: "Error al desglosar la referencia individual con Gemini.",
      details: error.message
    });
  }
});
app.post("/api/synthesize-system", async (req, res) => {
  import_dotenv.default.config({ override: true });
  try {
    const {
      system,
      patterns = [],
      references = [],
      projectName = "",
      projectObjective = "",
      projectDescription = ""
    } = req.body;

    const sysName = system?.name || projectName || "Sistema Visual";
    const patternSummary = (patterns || [])
      .map((p) => `- ${p.name} [Categor\xEDa: ${p.category}]: ${p.description}`)
      .join("\n");
    const refSummary = (references || [])
      .map((r) => `- Ref ID: ${r.id}, Nombre: ${r.name || r.id}, Notas: ${r.notes || "Sin notas"}`)
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
3. "aestheticPillars": Array of 3 to 5 synthetic, impactful conceptual pillars (e.g. "Tensi\xF3n Tipogr\xE1fica Hipercondensada", "Sustratos Kraft & Tactilidad", "Reticulado Perimetral").
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
          type: import_genai.Type.OBJECT,
          properties: {
            name: { type: import_genai.Type.STRING },
            description: { type: import_genai.Type.STRING },
            aestheticPillars: {
              type: import_genai.Type.ARRAY,
              items: { type: import_genai.Type.STRING }
            },
            colorPalette: {
              type: import_genai.Type.ARRAY,
              items: {
                type: import_genai.Type.OBJECT,
                properties: {
                  hex: { type: import_genai.Type.STRING },
                  name: { type: import_genai.Type.STRING },
                  role: { type: import_genai.Type.STRING }
                },
                required: ["hex", "name", "role"]
              }
            },
            typographyRules: {
              type: import_genai.Type.ARRAY,
              items: { type: import_genai.Type.STRING }
            },
            textureRules: {
              type: import_genai.Type.ARRAY,
              items: { type: import_genai.Type.STRING }
            },
            compositionRules: {
              type: import_genai.Type.ARRAY,
              items: { type: import_genai.Type.STRING }
            },
            systemDetails: {
              type: import_genai.Type.OBJECT,
              properties: {
                brandEssence: { type: import_genai.Type.STRING },
                logoAndIdentity: { type: import_genai.Type.STRING },
                packagingSystem: { type: import_genai.Type.STRING },
                photographyStyle: { type: import_genai.Type.STRING },
                typographySystem: { type: import_genai.Type.STRING },
                graphicApplications: { type: import_genai.Type.STRING },
                mascotAndIllustration: { type: import_genai.Type.STRING },
                digitalAndSocialMedia: { type: import_genai.Type.STRING }
              }
            }
          },
          required: [
            "name",
            "description",
            "aestheticPillars",
            "colorPalette",
            "typographyRules",
            "textureRules",
            "compositionRules",
            "systemDetails"
          ]
        }
      }
    });

    const rawText = response.text || "{}";
    const parsed = parseModelJsonResponse(rawText);
    if (parsed && parsed.description) {
      return res.json({
        success: true,
        data: parsed
      });
    }
    throw new Error("No se pudo parsear el resultado de la s\xEDntesis.");
  } catch (error) {
    console.error("Error en /api/synthesize-system:", error);
    return res.status(500).json({
      error: "Error sintetizando el sistema visual.",
      details: error.message || String(error)
    });
  }
});
app.post("/api/suggest-inspirations", async (req, res) => {
  import_dotenv.default.config({ override: true });
  try {
    const {
      projectName = "",
      objective = "",
      description = "",
      system,
      confirmedPatterns = []
    } = req.body;
    const nombreProyecto = projectName || system?.name || "Proyecto de Identidad Visual";
    const objetivoProyecto = objective || "Branding y Sistema de Identidad Visual";
    const descripcionProyecto = description || system?.description || "";
    const activePatternsSummary = (confirmedPatterns || []).map((p) => `${p.name} (${p.category}): ${p.description}`).join("; ");
    const systemInstruction = `You are a World-Class Creative Art Director and Brand Strategist.
Analyze the user's specific brand project and visual system:
- Brand Name: "${nombreProyecto}"
- Brand Objective: "${objetivoProyecto}"
- Brand Description: "${descripcionProyecto}"
- System Name: "${system?.name || ""}"
- Confirmed Visual Patterns: "${activePatternsSummary}"

Your task is to generate EXACTLY 4 highly specific, creative visual application shortcut suggestions tailored uniquely to THIS brand.

DO NOT output generic ideas or hardcoded templates. For example:
- If the project is about clothing/apparel -> suggest t-shirt mockup, hangtag, tote bag, lookbook.
- If the project is about gastronomy/burgers -> suggest packaging wrapper, storefront sign, Instagram product shot, print poster.
- If the project is about perfume/cosmetics -> suggest glass bottle packaging, tactile box, editorial campaign poster, store display.
- If the project is about tech/software -> suggest mobile app UI, landing page hero, vector brand mark, presentation deck.

OUTPUT FORMAT:
Return ONLY a JSON object with this structure:
{
  "suggestions": [
    {
      "id": "sug_1",
      "label": "<Emoji + Short Title in Spanish, max 25 chars>",
      "category": "<Category>",
      "userDescription": "<Detailed graphic directive prompt in Spanish describing how to apply the visual system to this specific support>"
    }
  ]
}`;
    const userPrompt = `Generate 4 tailored creative application shortcuts for brand "${nombreProyecto}" with objective "${objetivoProyecto}".`;
    const ai = getGeminiClient();
    const response = await generateContentWithRetry(ai, {
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: import_genai.Type.OBJECT,
          properties: {
            suggestions: {
              type: import_genai.Type.ARRAY,
              items: {
                type: import_genai.Type.OBJECT,
                properties: {
                  id: { type: import_genai.Type.STRING },
                  label: { type: import_genai.Type.STRING },
                  category: { type: import_genai.Type.STRING },
                  userDescription: { type: import_genai.Type.STRING }
                },
                required: ["id", "label", "category", "userDescription"]
              }
            }
          },
          required: ["suggestions"]
        }
      }
    });
    const rawText = response.text || "{}";
    const parsed = parseModelJsonResponse(rawText);
    if (parsed && Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0) {
      return res.json({
        success: true,
        suggestions: parsed.suggestions
      });
    }
    throw new Error("No se obtuvieron sugerencias de Gemini.");
  } catch (err) {
    console.warn("Error en /api/suggest-inspirations:", err?.message || err);
    return res.json({
      success: true,
      suggestions: [
        {
          id: "sug_f1",
          label: `\u{1F3F7}\uFE0F Isotipo ${req.body.projectName || "Marca"}`,
          category: "Branding",
          userDescription: `Isotipo gr\xE1fico vectorial limpio aislado sobre fondo neutro, aplicando las proporciones y formas geom\xE9tricas del sistema visual de ${req.body.projectName || "la marca"}.`
        },
        {
          id: "sug_f2",
          label: `\u{1F4E6} Mockup de Packaging`,
          category: "Packaging",
          userDescription: `Pieza de packaging o embalaje de producto con acabado de material t\xE1ctil, aplicando la paleta de colores y reglas de marca de ${req.body.projectName || "la marca"}.`
        },
        {
          id: "sug_f3",
          label: `\u{1F4F1} Post para Redes`,
          category: "Social Media",
          userDescription: `Composici\xF3n gr\xE1fica cuadrada para redes sociales con jerarqu\xEDa tipogr\xE1fica, grilla balanceada y elementos del sistema visual.`
        },
        {
          id: "sug_f4",
          label: `\u{1F4C4} Afiche Editorial`,
          category: "Editorial",
          userDescription: `P\xF3ster de dise\xF1o gr\xE1fico 2D con composici\xF3n reticular suiza, titulares de alto contraste y sello de autenticidad del sistema visual.`
        }
      ]
    });
  }
});
function buildFallbackMasterPrompt(params) {
  const { projectName, system, confirmedPatterns = [], userDescription, iterationPrompt } = params;
  const rawUserText = iterationPrompt ? `${userDescription} (Ajuste: ${iterationPrompt})` : userDescription;
  const textLower = rawUserText.toLowerCase().trim();
  const isLogo = /\b(logo|logotipo|isotipo|monograma|sello|emblema|marca|isologo)\b/i.test(textLower);
  const isFlyer = /\b(flyer|afiche|poster|volante|folleto|publicidad|aviso)\b/i.test(textLower);
  const isPackaging = /\b(envoltorio|papel|packaging|bolsa|caja|vaso|servilleta|etiqueta|envase)\b/i.test(textLower);
  const isSpatial = /\b(pared|fachada|marquesina|local|interior|mostrador|cartel|espacio)\b/i.test(textLower);
  const isApparel = /\b(remera|campera|ropa|indumentaria|prenda|tshirt|shirt|hoodie|chaqueta|pantalon|tote|bag)\b/i.test(textLower);
  const hasMascot = /\b(mascota|personaje|ilustracion|ilustración|dibujo|character)\b/i.test(textLower);
  const cleanSubject = rawUserText.replace(/^aplicar el sistema (gráfico|visual) a /i, "").replace(/^apply the visual system to /i, "").trim();
  const hexColors = (system.colorPalette || []).map((c) => `${c.name ? `${c.name} ` : ""}(${c.hex})`).join(", ");
  const mascotPattern = confirmedPatterns.find((p) => p.category === "mascot_illustration" || /\bmascota\b/i.test(p.name));
  const mascotDetail = system.systemDetails?.mascotAndIllustration || system.systemDetails?.mascotOrIllustration || (mascotPattern ? mascotPattern.description : "");
  let formatDirective = "";
  if (isLogo) {
    formatDirective = `Clean minimalist 2D flat vector logo mark design for ${cleanSubject}. CRISP VECTOR GRAPHIC ICON isolated on a solid clean neutral background. NO 3D scene, NO room, NO wall, NO store interior, NO product mockup environment.`;
  } else if (isApparel) {
    formatDirective = `Studio product photography mockup of ${cleanSubject}, displayed flat lay on a clean neutral background. Realistic fabric texture, tactile woven labels, industrial embroidery and print detail.`;
  } else if (isPackaging) {
    formatDirective = `Photorealistic product packaging mockup of ${cleanSubject}, studio flat lay photography, tactile paper / material texture with softbox studio lighting. ${hasMascot ? `Features repeated graphic pattern of the brand mascot (${mascotDetail || "stylized character illustration"}) printed on packaging surface.` : ""}`;
  } else if (isFlyer) {
    formatDirective = `2D graphic design print flyer poster layout of ${cleanSubject}, editorial grid composition, crisp typography, clean paper texture.`;
  } else if (isSpatial) {
    formatDirective = `Environmental graphic design architectural store mockup of ${cleanSubject}, interior wall signage with realistic lighting.`;
  } else {
    formatDirective = `Professional studio product representation of ${cleanSubject}.`;
  }
  const promptParts = [
    formatDirective,
    `Brand Context: "${projectName}"`,
    hexColors ? `Color Palette (HEX): ${hexColors}` : "",
    (system.typographyRules || []).slice(0, 2).join(". "),
    (system.textureRules || []).slice(0, 2).join(". "),
    (system.compositionRules || []).slice(0, 1).join(". "),
    "Strict directive: Do NOT print any unwanted literal text or Spanish labels on the image. High resolution master quality."
  ].filter(Boolean);
  return promptParts.join(". ");
}
async function synthesizeMasterPromptWithGemini(params) {
  const {
    projectName,
    objective,
    context,
    system,
    confirmedPatterns = [],
    selectedResources = {},
    userDescription,
    iterationPrompt
  } = params;
  const colorSummary = (system.colorPalette || []).map((c) => `${c.name || "Color"} (${c.hex}) - Role: ${c.role || "general"}`).join("; ");
  const pillarsSummary = (system.aestheticPillars || []).join(". ");
  const typographySummary = (system.typographyRules || []).join(". ");
  const textureSummary = (system.textureRules || []).join(". ");
  const compositionSummary = (system.compositionRules || []).join(". ");
  const sysDetails = system.systemDetails || {};
  const detailsSummary = [
    sysDetails.brandEssence ? `Brand Essence: ${sysDetails.brandEssence}` : "",
    sysDetails.logoAndIdentity || sysDetails.logoRules ? `Logo & Identity Guidelines: ${sysDetails.logoAndIdentity || sysDetails.logoRules}` : "",
    sysDetails.packagingSystem || sysDetails.packagingDesign ? `Packaging Guidelines: ${sysDetails.packagingSystem || sysDetails.packagingDesign}` : "",
    sysDetails.mascotAndIllustration || sysDetails.mascotOrIllustration ? `Mascot & Illustration Style: ${sysDetails.mascotAndIllustration || sysDetails.mascotOrIllustration}` : "",
    sysDetails.photographyStyle || sysDetails.photographyDirection ? `Photography Style: ${sysDetails.photographyStyle || sysDetails.photographyDirection}` : "",
    sysDetails.graphicApplications || sysDetails.flyersAndPosters ? `Graphic Applications / Editorial: ${sysDetails.graphicApplications || sysDetails.flyersAndPosters}` : ""
  ].filter(Boolean).join("\n");
  const activePatternsSummary = confirmedPatterns.map((p) => `- [${p.category}] ${p.name}: ${p.description} ${p.systemHypothesis ? `(Translation: ${p.systemHypothesis})` : ""}`).join("\n");
  const activeResourcesSummary = Object.entries(selectedResources).filter(([_, enabled]) => enabled).map(([key]) => key).join(", ");
  const systemInstruction = `You are a World-Class Art Director and Senior Prompt Specialist for DALL-E 3 and FLUX image generation.
Your mission is to take a designer's application request (written in Spanish) and synthesize it with the Brand Visual System to produce a single, cohesive ENGLISH prompt for DALL-E 3.

ABSOLUTE CRITICAL RULES FOR DALL-E 3 PROMPT SYNTHESIS:
1. THE REQUESTED SUBJECT IS SACROSANCT AND MUST BE THE PRIMARY CORE OBJECT OF THE PROMPT:
   - Identify the exact physical object requested by the designer (e.g. "campera de trabajo utilitaria de lona pesada" -> "A studio flat lay product photography mockup of a heavy canvas utility workwear jacket").
   - The prompt MUST start explicitly by describing this EXACT requested physical item.
   - DO NOT substitute, alter, or replace the requested physical item with unrelated objects from moodboard patterns (e.g. DO NOT render a sound recorder interface, audio cassette, vinyl record, or poster when the designer asked for a jacket, t-shirt, or packaging!).

2. APPLY THE BRAND'S VISUAL IDENTITY ONTO THAT REQUESTED PHYSICAL OBJECT:
   - Apply the brand's visual identity rules ONTO the requested object as graphic prints, embroidered details, woven tags, typographic stamps, or material finishes.
   - Incorporate the brand's exact HEX color palette (${colorSummary}) for the object's body, accents, and graphic details.
   - Incorporate typography rules, texture treatments, and graphic resources onto the surface of the item.

3. DO NOT PRINT UNWANTED SPANISH WORDS OR META LABELS:
   - DO NOT print literal Spanish words like "campera", "envoltura", "mascota", "logo", "dise\xF1o" on the graphic unless explicitly surrounded by quotation marks indicating literal text.

4. FORMAT SPECIFICATIONS BY ITEM TYPE:
   - APPAREL / INDUMENTARIA / CAMPERA / REMERA: "Studio product photography mockup of [item description] displayed flat lay on a clean neutral studio background. Featuring [graphic prints, woven tags, embroidered details, exact HEX colors]. Soft lighting, ultra detailed fabric texture."
   - LOGO / ISOTIPO: "Clean 2D flat vector logo mark icon design isolated on a solid neutral background. High resolution vector graphic. NO 3D mockup, NO room, NO wall, NO store."
   - PACKAGING / ENVOLTORIO: "Studio flat lay photorealistic product packaging mockup of [item description] with tactile material finish."
   - POSTER / AFICHE: "2D graphic design print poster layout preview, editorial grid composition, crisp typography."

5. OUTPUT FORMAT:
   Return ONLY a JSON object with this exact structure:
   {
     "englishPrompt": "<Detailed single-paragraph English prompt starting directly with the requested physical item and applying all visual identity features>",
     "rationale": "<1-sentence Spanish summary explaining how the requested subject was synthesized with the visual system rules>"
   }`;
  const userPromptText = `
Brand Name: "${projectName}"
Brand Objective: "${objective}"
Designer's Application Request: "${userDescription}"
${iterationPrompt ? `Iteration Adjustment Required: "${iterationPrompt}"` : ""}

VISUAL SYSTEM METADATA:
System Name: ${system.name}
System Description: ${system.description || ""}
Aesthetic Pillars: ${pillarsSummary}
Color Palette: ${colorSummary}
Typography Rules: ${typographySummary}
Texture Rules: ${textureSummary}
Composition Rules: ${compositionSummary}

SYSTEM GUIDELINES:
${detailsSummary}

CONFIRMED VISUAL PATTERNS:
${activePatternsSummary || "No specific pattern overrides."}

ACTIVE SELECTED RESOURCES BY DESIGNER:
${activeResourcesSummary || "All resources active."}
`;
  try {
    const ai = getGeminiClient();
    const response = await generateContentWithRetry(ai, {
      contents: [{ role: "user", parts: [{ text: userPromptText }] }],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: import_genai.Type.OBJECT,
          properties: {
            englishPrompt: { type: import_genai.Type.STRING },
            rationale: { type: import_genai.Type.STRING }
          },
          required: ["englishPrompt", "rationale"]
        }
      }
    });
    const rawText = response.text || "{}";
    const parsed = parseModelJsonResponse(rawText);
    if (parsed && parsed.englishPrompt) {
      return {
        englishPrompt: parsed.englishPrompt.trim(),
        rationale: parsed.rationale || "Prompt sintetizado aplicando el sistema visual sobre el objeto solicitado."
      };
    }
  } catch (err) {
    console.warn("Gemini prompt synthesis warning, using fallback synthesizer:", err?.message || err);
  }
  return {
    englishPrompt: buildFallbackMasterPrompt(params),
    rationale: "Prompt generado mediante sintetizador de respaldo del sistema visual."
  };
}
app.post("/api/generate-application", async (req, res) => {
  import_dotenv.default.config({ override: true });
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
      prompt = ""
    } = req.body;
    console.log("ENGINE:", aiEngine);
    console.log("OPENAI KEY PRESENTE:", !!process.env.OPENAI_API_KEY);
    if (!system || !system.name) {
      return res.status(400).json({
        error: "Se requiere un sistema visual confirmado para generar una aplicaci\xF3n."
      });
    }
    const nombreProyecto = projectName || system.name || "Proyecto de Identidad Visual";
    const objetivoProyecto = objective || "Branding y Sistema de Identidad Visual";
    const textoUsuario = iterationPrompt ? `${userDescription} (Ajuste / Iteraci\xF3n requerida: ${iterationPrompt})` : userDescription || "Aplicar el sistema visual a una pieza de identidad de marca fotorrealista con alta fidelidad de materiales.";
    const synthesisResult = await synthesizeMasterPromptWithGemini({
      projectName: nombreProyecto,
      objective: objetivoProyecto,
      context,
      system,
      confirmedPatterns,
      selectedResources,
      userDescription: textoUsuario,
      iterationPrompt
    });
    const visualPrompt = synthesisResult.englishPrompt;
    console.log("==========================================");
    console.log("PROMPT MAESTRO SINTETIZADO CON SISTEMA VISUAL:");
    console.log(visualPrompt);
    console.log("JUSTIFICACI\xD3N:", synthesisResult.rationale);
    console.log("==========================================");
    const aspectRatio = "1:1";
    let generatedImageBase64 = null;
    let modelUsed = "OpenAI DALL-E 3";
    let engineUsed = aiEngine || "openai_dalle3";
    if (aiEngine === "huggingface_sdxl") {
      const hfToken = process.env.HUGGINGFACE_TOKEN ? process.env.HUGGINGFACE_TOKEN.trim() : "";
      if (!hfToken) {
        return res.status(400).json({
          error: "No se encontr\xF3 la variable HUGGINGFACE_TOKEN en el archivo .env. Por favor agreg\xE1 tu token de Hugging Face."
        });
      }
      try {
        console.log("Generando imagen con Hugging Face Inference API...");
        const hfClient = new import_inference.InferenceClient(hfToken);
        let imageRes = null;
        let selectedModel = "black-forest-labs/FLUX.1-schnell";
        try {
          imageRes = await hfClient.textToImage({
            model: selectedModel,
            inputs: visualPrompt
          });
        } catch (fluxErr) {
          console.warn("FLUX.1-schnell failed, attempting SDXL fallback:", fluxErr?.message || fluxErr);
          selectedModel = "stabilityai/stable-diffusion-xl-base-1.0";
          imageRes = await hfClient.textToImage({
            model: selectedModel,
            inputs: visualPrompt
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
      } catch (err) {
        console.error("Hugging Face connection error:", err?.message || err);
        return res.status(500).json({
          error: `Error de conexi\xF3n con Hugging Face: ${err.message || "No se pudo generar la imagen con Hugging Face"}`
        });
      }
    } else if (aiEngine === "openai_dalle3") {
      const openaiKey = process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.trim() : "";
      if (!openaiKey) {
        return res.status(400).json({
          error: "No se encontr\xF3 la variable OPENAI_API_KEY en el archivo .env. Por favor agrega tu clave de OpenAI."
        });
      }
      try {
        console.log("Generando imagen con OpenAI...");
        const candidateModels = ["gpt-image-1", "chatgpt-image-latest", "dall-e-3"];
        let lastError = null;
        for (const modelCandidate of candidateModels) {
          console.log(`Intentando generaci\xF3n de imagen con modelo OpenAI: ${modelCandidate}`);
          const response = await fetch("https://api.openai.com/v1/images/generations", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${openaiKey}`
            },
            body: JSON.stringify({
              model: modelCandidate,
              prompt: visualPrompt,
              n: 1,
              size: "1024x1024"
            })
          });
          const data = await response.json();
          if (data.error) {
            console.warn(`Error con modelo ${modelCandidate}:`, data.error.message);
            lastError = data.error;
            if (data.error.message && data.error.message.includes("does not exist")) {
              continue;
            } else {
              let userMsg = data.error.message || JSON.stringify(data.error);
              return res.status(400).json({
                error: `Error de OpenAI: ${userMsg}`,
                details: data.error
              });
            }
          }
          if (data.data && data.data[0]?.b64_json) {
            generatedImageBase64 = `data:image/png;base64,${data.data[0].b64_json}`;
          } else if (data.data && data.data[0]?.url) {
            const imgResponse = await fetch(data.data[0].url);
            const arrayBuf = await imgResponse.arrayBuffer();
            const base64 = Buffer.from(arrayBuf).toString("base64");
            generatedImageBase64 = `data:image/png;base64,${base64}`;
          }
          modelUsed = `OpenAI (${modelCandidate})`;
          engineUsed = "openai_dalle3";
          break;
        }
        if (!generatedImageBase64 && lastError) {
          let userMsg = lastError.message || JSON.stringify(lastError);
          return res.status(400).json({
            error: `Error de OpenAI: ${userMsg}`,
            details: lastError
          });
        }
      } catch (err) {
        console.error("OpenAI connection error:", err?.message || err);
        return res.status(500).json({
          error: `Error de conexi\xF3n con OpenAI: ${err.message}`
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
          appliedResources: Object.keys(selectedResources).filter((k) => selectedResources[k]),
          systemName: system.name,
          promptUsed: visualPrompt,
          promptRationale: synthesisResult.rationale,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }
      });
    }
    console.warn("Generating SVG vector application mockup...");
    const fallbackColors = system.colorPalette && system.colorPalette.length > 0 ? system.colorPalette.map((c) => c.hex) : ["#141414", "#E65100", "#C89D7C", "#F4F4F0"];
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
        AUTENTICADO \u2022 ULTRA HD
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
            EST. 2024 \u2022 CRAFT IDENTITY
          </textPath>
        </text>
      </g>

      <!-- User Instruction Label Banner -->
      <g transform="translate(100, 770)">
        <rect width="800" height="90" rx="12" fill="${primaryColor}" />
        <text x="30" y="38" font-family="system-ui, sans-serif" font-weight="800" font-size="15" fill="${accentColor}" letter-spacing="1">
          APLICACI\xD3N SOLICITADA POR EL USUARIO:
        </text>
        <text x="30" y="65" font-family="system-ui, sans-serif" font-size="14" fill="${lightColor}" font-weight="500">
          ${textoUsuario.slice(0, 85)}${textoUsuario.length > 85 ? "..." : ""}
        </text>
      </g>

      <!-- Bottom Palette Swatches and Technical Tag -->
      <g transform="translate(80, 895)">
        <rect x="0" y="0" width="36" height="36" rx="6" fill="${primaryColor}" stroke="#fff" stroke-width="1.5" />
        <rect x="46" y="0" width="36" height="36" rx="6" fill="${accentColor}" stroke="#fff" stroke-width="1.5" />
        <rect x="92" y="0" width="36" height="36" rx="6" fill="${tertiaryColor}" stroke="#fff" stroke-width="1.5" />
        <rect x="138" y="0" width="36" height="36" rx="6" fill="${lightColor}" stroke="#141414" stroke-width="1.5" />
        <text x="190" y="24" font-family="monospace" font-size="12" fill="${primaryColor}" font-weight="bold">
          HEX: ${fallbackColors.slice(0, 4).join(" \u2022 ")}
        </text>
      </g>
    </svg>`;
    const fallbackSvgBase64 = `data:image/svg+xml;utf8,${encodeURIComponent(svgVectorCode)}`;
    return res.json({
      success: true,
      data: {
        imageUrl: fallbackSvgBase64,
        svgCode: svgVectorCode,
        aspectRatio: "1:1",
        modelUsed: "Vector SVG Engine",
        engineUsed: "svg_vector",
        appliedResources: Object.keys(selectedResources).filter((k) => selectedResources[k]),
        systemName: system.name,
        promptUsed: visualPrompt,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
  } catch (error) {
    console.error("Error in /api/generate-application:", error);
    return res.status(500).json({
      error: "Error interno al generar la aplicaci\xF3n visual.",
      details: error.message
    });
  }
});
async function setupVite() {
  const fs = require("fs");
  const distPath = import_path.default.join(process.cwd(), "dist");
  const assetsPath = import_path.default.join(process.cwd(), "assets");

  const setNoCache = (res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  };

  app.use("/assets", import_express.default.static(assetsPath, { setHeaders: setNoCache }));
  app.use("/assets", import_express.default.static(import_path.default.join(distPath, "assets"), { setHeaders: setNoCache }));
  app.use(import_express.default.static(distPath, { setHeaders: setNoCache }));
  app.use(import_express.default.static(process.cwd(), { setHeaders: setNoCache }));

  app.use((req, res) => {
    setNoCache(res);
    const distHtml = import_path.default.join(distPath, "index.html");
    if (fs.existsSync(distHtml)) {
      res.sendFile(distHtml);
    } else {
      res.sendFile(import_path.default.join(process.cwd(), "index.html"));
    }
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Emergent App] Servidor corriendo en http://localhost:${PORT}`);
  });
}
setupVite();
//# sourceMappingURL=server.cjs.map
