"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const genai_1 = require("@google/genai");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = Number(process.env.PORT) || 3000;
// Set payload limit high enough for image uploads (moodboards with multiple references)
app.use(express_1.default.json({ limit: "50mb" }));
app.use(express_1.default.urlencoded({ extended: true, limit: "50mb" }));
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
function getGeminiClient() {
    dotenv_1.default.config({ override: true });
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || !apiKey.trim()) {
        throw new Error("La variable de entorno GEMINI_API_KEY no está configurada en el servidor.");
    }
    return new genai_1.GoogleGenAI({
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
async function resolveImagePart(imageStr, refId) {
    if (!imageStr)
        return null;
    // Handle Base64 Data URLs
    if (imageStr.startsWith("data:")) {
        try {
            const commaIdx = imageStr.indexOf(",");
            if (commaIdx !== -1) {
                const header = imageStr.slice(5, commaIdx); // e.g. "image/png;base64"
                const data = imageStr.slice(commaIdx + 1).trim();
                let mimeType = header.split(";")[0]?.toLowerCase().trim() || "image/jpeg";
                if (mimeType === "image/jpg")
                    mimeType = "image/jpeg";
                if (!VALID_GEMINI_MIME_TYPES.has(mimeType)) {
                    mimeType = "image/jpeg";
                }
                return {
                    mimeType,
                    data,
                    refId,
                };
            }
        }
        catch (err) {
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
            if (mimeType === "image/jpg")
                mimeType = "image/jpeg";
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
        }
        catch (err) {
            console.warn(`Timeout o error descargando imagen para ref ${refId}:`, err?.message || err);
        }
    }
    return null;
}
// Helper to safely parse JSON returned by the model
function parseModelJsonResponse(text) {
    let cleaned = text.trim();
    if (cleaned.startsWith("```json")) {
        cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    }
    else if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }
    return JSON.parse(cleaned);
}
// Helper to call Gemini using fast fallback candidate models on 503 high demand or 404
async function generateContentWithRetry(ai, request) {
    const candidateModels = [
        request.model,
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite",
        "gemini-3.5-flash",
        "gemini-3.6-flash",
        "gemini-3.7-flash",
    ].filter(Boolean);
    const uniqueModels = Array.from(new Set(candidateModels));
    let lastError = null;
    for (const model of uniqueModels) {
        try {
            console.log(`[Gemini API] Consultando modelo ${model}...`);
            const response = await ai.models.generateContent({
                ...request,
                model,
            });
            console.log(`[Gemini API] Éxito con modelo ${model}`);
            return response;
        }
        catch (err) {
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
        const { references = [], objective = "", projectName = "", description = "", previousPatterns = [], confirmedPatterns = [], discardedPatterns = [], feedback = [], } = req.body;
        if (!references || references.length === 0) {
            return res.status(400).json({
                error: "Se requiere al menos una referencia visual para el análisis.",
            });
        }
        let result = null;
        try {
            // Fetch and resolve all images in parallel for optimal speed
            const resolvedImages = await Promise.all(references.map(async (ref) => {
                try {
                    const imgPart = await resolveImagePart(ref.image, ref.id);
                    return { ref, imgPart };
                }
                catch {
                    return { ref, imgPart: null };
                }
            }));
            // Build multimodal parts
            const parts = [];
            const refSummaryList = [];
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
- Patrones ya confirmados por el diseñador: ${JSON.stringify(confirmedPatterns.map((p) => ({ id: p.id, name: p.name, category: p.category, assignedSystem: p.assignedSystemId })))}
- Patrones previamente descartados por el diseñador: ${JSON.stringify(discardedPatterns.map((p) => ({ id: p.id, name: p.name, reason: p.discardReason })))}
- Feedback explícito del diseñador: ${JSON.stringify(feedback.map((f) => ({ type: f.type, comment: f.comment, refId: f.referenceId, patternId: f.patternId })))}
- Patrones de análisis anterior: ${JSON.stringify(previousPatterns.map((p) => ({ id: p.id, name: p.name, evidenceCount: p.evidence?.length })))}
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
                        type: genai_1.Type.OBJECT,
                        properties: {
                            patterns: {
                                type: genai_1.Type.ARRAY,
                                items: {
                                    type: genai_1.Type.OBJECT,
                                    properties: {
                                        id: { type: genai_1.Type.STRING, description: "Identificador único, ej. pat_01" },
                                        name: { type: genai_1.Type.STRING, description: "Nombre conceptual y técnico preciso del patrón" },
                                        category: {
                                            type: genai_1.Type.STRING,
                                            description: "typography | color | texture | composition | logo_identity | packaging | photography_treatment | mascot_illustration | flyer_poster | social_media | graphic_elements",
                                        },
                                        description: { type: genai_1.Type.STRING, description: "Descripción profunda y relacional: cómo opera este patrón, tensiones que resuelve y diálogo entre soportes" },
                                        evidence: {
                                            type: genai_1.Type.ARRAY,
                                            items: { type: genai_1.Type.STRING },
                                            description: "Array de IDs exactos de las referencias del canvas que sostienen el hallazgo, ej: ['ref_01', 'ref_04']",
                                        },
                                        confidence: { type: genai_1.Type.NUMBER, description: "Nivel de confianza entre 0.0 y 1.0" },
                                        relatedObservations: {
                                            type: genai_1.Type.ARRAY,
                                            items: { type: genai_1.Type.STRING },
                                            description: "Características visuales concretas y técnicas observables",
                                        },
                                        systemHypothesis: {
                                            type: genai_1.Type.STRING,
                                            description: "Hipótesis de traducción del patrón en un subsistema reutilizable para soportes físicos y digitales",
                                        },
                                        suggestedSystemName: { type: genai_1.Type.STRING, description: "Nombre del sistema visual sugerido al que pertenece este patrón" },
                                        trend: {
                                            type: genai_1.Type.STRING,
                                            description: "new | strengthened | weakened | stable",
                                        },
                                    },
                                    required: ["id", "name", "category", "description", "evidence", "confidence", "relatedObservations", "systemHypothesis"],
                                },
                            },
                            suggestedSystems: {
                                type: genai_1.Type.ARRAY,
                                items: {
                                    type: genai_1.Type.OBJECT,
                                    properties: {
                                        id: { type: genai_1.Type.STRING },
                                        name: { type: genai_1.Type.STRING, description: "Nombre del sistema, ej: Sistema Identitario Urbano Kraft" },
                                        description: { type: genai_1.Type.STRING, description: "Fundamentación y descripción conceptual del sistema" },
                                        associatedPatternNames: {
                                            type: genai_1.Type.ARRAY,
                                            items: { type: genai_1.Type.STRING },
                                        },
                                        referenceIds: {
                                            type: genai_1.Type.ARRAY,
                                            items: { type: genai_1.Type.STRING },
                                        },
                                        aestheticPillars: {
                                            type: genai_1.Type.ARRAY,
                                            items: { type: genai_1.Type.STRING },
                                            description: "Pilares conceptuales y estilísticos clave",
                                        },
                                        systemDetails: {
                                            type: genai_1.Type.OBJECT,
                                            properties: {
                                                brandEssence: { type: genai_1.Type.STRING, description: "Concepto nuclear y tono de voz visual" },
                                                logoAndIdentity: { type: genai_1.Type.STRING, description: "Criterios de logotipos, isotipos y sellos identitarios" },
                                                packagingSystem: { type: genai_1.Type.STRING, description: "Criterios de packaging, empaques, etiquetas y sustratos" },
                                                photographyStyle: { type: genai_1.Type.STRING, description: "Criterios de fotografía y dirección de arte" },
                                                typographySystem: { type: genai_1.Type.STRING, description: "Familias, combinaciones y jerarquías tipográficas" },
                                                graphicApplications: { type: genai_1.Type.STRING, description: "Criterios de flyers, afiches, cartelería y menús" },
                                                mascotAndIllustration: { type: genai_1.Type.STRING, description: "Criterios de mascotas, personajes e ilustraciones" },
                                                digitalAndSocialMedia: { type: genai_1.Type.STRING, description: "Estructura de publicaciones y contenido para redes sociales" },
                                            },
                                        },
                                        suggestedPalette: {
                                            type: genai_1.Type.ARRAY,
                                            items: {
                                                type: genai_1.Type.OBJECT,
                                                properties: {
                                                    hex: { type: genai_1.Type.STRING },
                                                    name: { type: genai_1.Type.STRING },
                                                    role: { type: genai_1.Type.STRING },
                                                },
                                                required: ["hex", "name", "role"],
                                            },
                                        },
                                    },
                                    required: ["id", "name", "description", "referenceIds", "aestheticPillars"],
                                },
                            },
                            overallInsight: {
                                type: genai_1.Type.STRING,
                                description: "Diagnóstico general exhaustivo y articulado de la investigación visual y relaciones del branding",
                            },
                        },
                        required: ["patterns", "suggestedSystems", "overallInsight"],
                    },
                },
            });
            const rawText = response.text || "{}";
            result = parseModelJsonResponse(rawText);
        }
        catch (aiErr) {
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
    }
    catch (error) {
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
        let result = null;
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
                        type: genai_1.Type.OBJECT,
                        properties: {
                            colors: {
                                type: genai_1.Type.ARRAY,
                                items: {
                                    type: genai_1.Type.OBJECT,
                                    properties: {
                                        hex: { type: genai_1.Type.STRING },
                                        name: { type: genai_1.Type.STRING },
                                        role: { type: genai_1.Type.STRING, description: "predominant | accent | background | detail" },
                                        percentage: { type: genai_1.Type.STRING },
                                    },
                                    required: ["hex", "name", "role"],
                                },
                            },
                            typography: {
                                type: genai_1.Type.OBJECT,
                                properties: {
                                    hasText: { type: genai_1.Type.BOOLEAN },
                                    familyStyle: { type: genai_1.Type.STRING },
                                    classification: { type: genai_1.Type.STRING, description: "serif | sans-serif | display | script | monospaced | none | mixed" },
                                    treatment: { type: genai_1.Type.STRING },
                                    hierarchy: { type: genai_1.Type.STRING },
                                },
                                required: ["hasText", "familyStyle", "classification", "treatment", "hierarchy"],
                            },
                            texture: {
                                type: genai_1.Type.OBJECT,
                                properties: {
                                    type: { type: genai_1.Type.STRING },
                                    intensity: { type: genai_1.Type.STRING, description: "sutil | moderada | intensa | nula" },
                                    description: { type: genai_1.Type.STRING },
                                },
                                required: ["type", "intensity", "description"],
                            },
                            composition: {
                                type: genai_1.Type.OBJECT,
                                properties: {
                                    spatialDistribution: { type: genai_1.Type.STRING },
                                    negativeSpace: { type: genai_1.Type.STRING, description: "abundante | moderado | denso/saturado" },
                                    contrastLevel: { type: genai_1.Type.STRING, description: "muy alto | medio | bajo / tonal" },
                                    focalPoint: { type: genai_1.Type.STRING },
                                },
                                required: ["spatialDistribution", "negativeSpace", "contrastLevel", "focalPoint"],
                            },
                            graphicResources: {
                                type: genai_1.Type.ARRAY,
                                items: { type: genai_1.Type.STRING },
                            },
                            photoTreatment: { type: genai_1.Type.STRING },
                            formsAndGeometry: {
                                type: genai_1.Type.ARRAY,
                                items: { type: genai_1.Type.STRING },
                            },
                            observableSummary: { type: genai_1.Type.STRING },
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
        }
        catch (aiErr) {
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
    }
    catch (error) {
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
/** Esquema de una ficha de regla para la respuesta estructurada de Gemini. */
const RULE_SCHEMA = {
    type: genai_1.Type.OBJECT,
    properties: {
        title: { type: genai_1.Type.STRING },
        detail: { type: genai_1.Type.STRING },
        use: { type: genai_1.Type.ARRAY, items: { type: genai_1.Type.STRING } },
        avoid: { type: genai_1.Type.ARRAY, items: { type: genai_1.Type.STRING } },
        patternIds: { type: genai_1.Type.ARRAY, items: { type: genai_1.Type.STRING } },
        refIds: { type: genai_1.Type.ARRAY, items: { type: genai_1.Type.STRING } },
        exampleText: { type: genai_1.Type.STRING },
        gridCols: { type: genai_1.Type.NUMBER },
        gridRows: { type: genai_1.Type.NUMBER },
    },
    required: ["title", "detail", "patternIds"],
};
app.post("/api/synthesize-system", async (req, res) => {
    dotenv_1.default.config({ override: true });
    try {
        const { system, patterns = [], references = [], projectName = "", projectObjective = "", projectDescription = "", } = req.body;
        const sysName = system?.name || projectName || "Sistema Visual";
        const patternSummary = (patterns || [])
            .map((p) => `- [${p.id}] ${p.name} [Categoría: ${p.category}]: ${p.description}`)
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
3. "aestheticPillars": Array of 3 to 5 synthetic, impactful conceptual pillars (e.g. "Tensión Tipográfica Hipercondensada", "Sustratos Kraft & Tactilidad", "Reticulado Perimetral").
4. "colorPalette": Array of 4 to 6 color swatches extracted from evidence: {"hex": "#HEX", "name": "Nombre evocador", "role": "Rol en el sistema"}.
5. "typographyRules", 6. "textureRules", 7. "compositionRules": each an array of 1 to 3 RULE CARDS. Every rule card has:
   - "title": an imperative rule in Spanish of at most 6 words (e.g. "Display estirada en el eje vertical").
   - "detail": the rationale in 1-2 Spanish sentences.
   - "use": 0-3 short contexts where it applies (e.g. "títulos", "afiches").
   - "avoid": 0-2 short contexts where it must not be used (e.g. "textos de lectura").
   - "patternIds": IDs (in square brackets above) of the validated patterns that support it.
   - "refIds": IDs of the references that show it best (from the reference list).
   - Typography rules also have "exampleText": 1 to 3 words to render as a type specimen (the brand name or a short headline).
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
                    type: genai_1.Type.OBJECT,
                    properties: {
                        name: { type: genai_1.Type.STRING },
                        description: { type: genai_1.Type.STRING },
                        aestheticPillars: {
                            type: genai_1.Type.ARRAY,
                            items: { type: genai_1.Type.STRING },
                        },
                        colorPalette: {
                            type: genai_1.Type.ARRAY,
                            items: {
                                type: genai_1.Type.OBJECT,
                                properties: {
                                    hex: { type: genai_1.Type.STRING },
                                    name: { type: genai_1.Type.STRING },
                                    role: { type: genai_1.Type.STRING },
                                },
                                required: ["hex", "name", "role"],
                            },
                        },
                        typographyRules: { type: genai_1.Type.ARRAY, items: RULE_SCHEMA },
                        textureRules: { type: genai_1.Type.ARRAY, items: RULE_SCHEMA },
                        compositionRules: { type: genai_1.Type.ARRAY, items: RULE_SCHEMA },
                        pillarSources: { type: genai_1.Type.ARRAY, items: { type: genai_1.Type.ARRAY, items: { type: genai_1.Type.STRING } } },
                        systemDetails: {
                            type: genai_1.Type.OBJECT,
                            properties: {
                                brandEssence: { type: genai_1.Type.STRING },
                                logoAndIdentity: { type: genai_1.Type.STRING },
                                packagingSystem: { type: genai_1.Type.STRING },
                                photographyStyle: { type: genai_1.Type.STRING },
                                typographySystem: { type: genai_1.Type.STRING },
                                graphicApplications: { type: genai_1.Type.STRING },
                                mascotAndIllustration: { type: genai_1.Type.STRING },
                                digitalAndSocialMedia: { type: genai_1.Type.STRING },
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
            const validPatterns = new Set((patterns || []).map((p) => String(p.id)));
            const validRefs = new Set((references || []).map((r) => String(r.id)));
            const ids = (v, valid) => (Array.isArray(v) ? v.map(String).filter(id => valid.has(id)) : []);
            const pillars = Array.isArray(parsed.aestheticPillars) ? parsed.aestheticPillars : [];
            parsed.sources = { aestheticPillars: pillars.map((_, i) => ids(parsed.pillarSources?.[i], validPatterns)) };
            const toRules = (raw, prefix, kind) => (Array.isArray(raw) ? raw : []).map((r, i) => {
                const refIds = ids(r?.refIds, validRefs);
                const clamp = (n) => Math.min(6, Math.max(2, Math.round(Number(n) || 4)));
                return {
                    code: `${prefix}${i + 1}`,
                    title: String(r?.title || "").trim(),
                    detail: String(r?.detail || "").trim(),
                    use: Array.isArray(r?.use) ? r.use.map(String) : [],
                    avoid: Array.isArray(r?.avoid) ? r.avoid.map(String) : [],
                    patternIds: ids(r?.patternIds, validPatterns),
                    refIds,
                    example: kind === "type"
                        ? { kind, text: String(r?.exampleText || "").trim() || undefined }
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
    }
    catch (error) {
        console.error("Error en /api/synthesize-system:", error);
        return res.status(500).json({
            error: "Error sintetizando el sistema visual.",
            details: error.message || String(error),
        });
    }
});
const PIECES = {
    logo: {
        label: "Logotipo",
        size: "1024x1024",
        spec: "A final, production-ready logo as a senior brand identity designer would present it in a brand book: flat vector-style artwork presented alone and centered on a plain solid background, with generous clear space. Precise geometry, deliberate custom letterforms, optically balanced spacing, clean edges, legible at small sizes, built from at most two or three colors of the palette. Flat solid fills only. The brand text is spelled exactly as given.",
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
        size: "1024x1536",
        spec: "A finished printed poster designed by a professional graphic designer, seen straight on and filling the frame: clear typographic hierarchy, a strong focal point, deliberate grid, real print finish. Any text is short, legible and spelled exactly as given.",
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
        size: "1024x1024",
        spec: "A real, finished packaging design photographed as a product shot on a plain studio surface with soft natural light: believable printed materials and finishes, the brand applied with care, label hierarchy that reads instantly.",
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
        size: "1024x1024",
        spec: "A finished square social media post for the brand: flat 2D layout, clear hierarchy, platform-ready, any text short and spelled exactly.",
        detailKeys: ["digitalAndSocialMedia", "brandEssence"],
        directions: ["Direction A — typography-led.", "Direction B — image-led.", "Direction C — graphic pattern-led.", "Direction D — the most daring."],
    },
    story: {
        label: "Story",
        size: "1024x1536",
        spec: "A finished vertical social media story for the brand: flat 2D layout, clear hierarchy, safe margins, any text short and spelled exactly.",
        detailKeys: ["digitalAndSocialMedia", "brandEssence"],
        directions: ["Direction A — typography-led.", "Direction B — image-led.", "Direction C — graphic pattern-led.", "Direction D — the most daring."],
    },
    facade: {
        label: "Fachada",
        size: "1536x1024",
        spec: "An eye-level, natural-light architectural photograph of the storefront or space with the identity applied: realistic materials, signage built as it would really be fabricated, believable scale.",
        detailKeys: ["graphicApplications", "logoAndIdentity", "brandEssence"],
        directions: ["Direction A — signage-led.", "Direction B — material and color-led.", "Direction C — graphic resources applied to the architecture.", "Direction D — the most daring."],
    },
    web: {
        label: "Web",
        size: "1536x1024",
        spec: "A desktop website hero section shown as a flat screen capture: real layout, navigation, clear hierarchy, any text short and spelled exactly.",
        detailKeys: ["digitalAndSocialMedia", "typographySystem", "brandEssence"],
        directions: ["Direction A — typography-led.", "Direction B — image-led.", "Direction C — grid and graphic resources.", "Direction D — the most daring."],
    },
    other: {
        label: "Pieza",
        size: "auto",
        spec: "A finished, professional brand application presented clearly, exactly as requested.",
        detailKeys: ["graphicApplications", "brandEssence"],
        directions: ["Direction A — faithful.", "Direction B — bolder.", "Direction C — more minimal.", "Direction D — the most daring."],
    },
};
const DETAIL_LABEL = {
    brandEssence: "Brand essence",
    logoAndIdentity: "Logo and identity",
    packagingSystem: "Packaging",
    photographyStyle: "Photography",
    typographySystem: "Typography system",
    graphicApplications: "Graphic applications",
    mascotAndIllustration: "Illustration",
    digitalAndSocialMedia: "Digital and social",
};
const ART_DIRECTOR_INSTRUCTIONS = `You are a senior art director and brand identity designer.
You receive a visual system that a designer built from their own reference corpus (the attached images are evidence of the confirmed patterns), and a request for one piece.
Your job: translate the system into ONE finished, professional piece and generate it with the image_generation tool, exactly once.
- Read every rule. The palette HEX values, typography, texture and composition rules are constraints, not suggestions.
- The attached reference images are style evidence: inherit their palette, materials, textures and graphic language. Never copy their subject, layout or content.
- Before calling the tool, write a detailed image prompt in English: subject, medium and format, exact palette, typography treatment, texture, composition, lighting when relevant, and the exact text to render.
- Aim for the quality of a real agency deliverable, never a sketch or a generic stock image.
After the image, reply with two or three short sentences in Spanish explaining which rules of the system you applied and how.`;
function buildBrief(b, piece) {
    const s = b.system || {};
    const project = b.project || {};
    const asText = (x) => typeof x === "string"
        ? x
        : [x?.title, x?.detail && x.detail !== x.title ? x.detail : "", x?.use?.length ? `Use for: ${x.use.join(", ")}.` : "", x?.avoid?.length ? `Avoid for: ${x.avoid.join(", ")}.` : ""]
            .filter(Boolean)
            .join(" — ");
    const list = (title, items) => (Array.isArray(items) && items.length ? `${title}:\n${items.map((x) => `- ${asText(x)}`).join("\n")}` : "");
    const palette = (s.colorPalette || []).map((c) => `- ${String(c.hex).toUpperCase()}${c.name ? ` · ${c.name}` : ""}${c.role ? ` (${c.role})` : ""}`).join("\n");
    const r = b.resources || {};
    const details = piece.detailKeys
        .map(k => (s.systemDetails?.[k] ? `${DETAIL_LABEL[k]}: ${s.systemDetails[k]}` : ""))
        .filter(Boolean)
        .join("\n");
    const patterns = (b.patterns || []).map((p) => `- [${p.id}] ${p.name} (${p.category}): ${p.description}`).join("\n");
    return [
        `# Request`,
        `Piece: ${piece.label}.`,
        b.brandText ? `Brand text to render exactly: "${b.brandText}".` : "",
        b.details ? `Designer's notes: ${b.details}` : "",
        `Deliverable standard: ${piece.spec}`,
        b.transparent ? "Background: transparent, with the artwork alone." : "",
        ``,
        `# Brand`,
        `Project: ${project.name || ""}`,
        project.objective ? `Objective: ${project.objective}` : "",
        project.description ? `Context: ${project.description}` : "",
        ``,
        `# Visual system: ${s.name}`,
        s.description || "",
        list("Aesthetic pillars", s.aestheticPillars),
        r.palette !== false && palette ? `Color palette (inferred from the corpus; use only these):\n${palette}` : "",
        r.typography !== false ? list("Typography rules", s.typographyRules) : "",
        r.texture !== false ? list("Texture and material rules", s.textureRules) : "",
        r.composition !== false ? list("Composition rules", s.compositionRules) : "",
        details,
        patterns ? `Confirmed patterns (evidence attached as images):\n${patterns}` : "",
    ]
        .filter(x => x !== "")
        .join("\n");
}
function friendlyOpenAIError(msg) {
    const m = msg.toLowerCase();
    if (m.includes("incorrect api key") || m.includes("invalid api key"))
        return "La OPENAI_API_KEY del archivo .env no es válida.";
    if (m.includes("verif"))
        return "Tu organización de OpenAI tiene que estar verificada para generar imágenes (platform.openai.com → Settings → Organization → Verify).";
    if (m.includes("billing") || m.includes("quota") || m.includes("credit"))
        return "La cuenta de OpenAI no tiene saldo o alcanzó su límite (platform.openai.com → Billing).";
    if (m.includes("safety") || m.includes("moderation") || m.includes("rejected"))
        return "OpenAI rechazó el pedido por sus políticas de contenido. Probá reformular los detalles.";
    return msg;
}
/** data URL o http(s) → data URL (para enviar como input_image). */
async function toDataUrl(src, id) {
    if (!src)
        return null;
    if (src.startsWith("data:"))
        return src;
    const part = await resolveImagePart(src, id);
    return part ? `data:${part.mimeType};base64,${part.data}` : null;
}
const isModelProblem = (err) => {
    const m = String(err?.message || "").toLowerCase();
    return err?.status === 404 || m.includes("model") || m.includes("does not exist") || m.includes("not found") || m.includes("unsupported");
};
async function callResponses(key, body) {
    const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) {
        const err = new Error(data?.error?.message || `HTTP ${response.status}`);
        err.status = response.status;
        err.param = data?.error?.param;
        throw err;
    }
    const output = Array.isArray(data.output) ? data.output : [];
    const call = output.find(o => o.type === "image_generation_call" && o.result);
    if (!call) {
        const text = output.flatMap(o => (o.content || []).map((c) => c.text).filter(Boolean)).join(" ");
        throw new Error(`El modelo no generó una imagen.${text ? ` Respondió: ${text.slice(0, 300)}` : ""}`);
    }
    const rationale = output
        .filter(o => o.type === "message")
        .flatMap(o => (o.content || []).filter((c) => c.type === "output_text").map((c) => c.text))
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
async function generateWithResponses(key, opts) {
    const textModels = Array.from(new Set([opts.textModel, "gpt-5", "gpt-4.1"]));
    const imageModels = Array.from(new Set([opts.imageModel, "gpt-image-2", "gpt-image-1"]));
    let lastErr = null;
    for (const textModel of textModels) {
        for (const imageModel of imageModels) {
            for (const forceTool of [true, false]) {
                try {
                    const body = {
                        model: textModel,
                        instructions: ART_DIRECTOR_INSTRUCTIONS,
                        input: opts.input,
                        tools: [{ ...opts.tool, type: "image_generation", model: imageModel }],
                    };
                    if (forceTool)
                        body.tool_choice = { type: "image_generation" };
                    if (opts.previousResponseId)
                        body.previous_response_id = opts.previousResponseId;
                    const result = await callResponses(key, body);
                    return { ...result, textModel, imageModel };
                }
                catch (err) {
                    lastErr = err;
                    console.warn(`[Imagen] ${textModel} + ${imageModel}${forceTool ? "" : " (sin tool_choice)"} falló: ${err?.message}`);
                    if (forceTool && String(err?.param || err?.message || "").includes("tool_choice"))
                        continue;
                    if (!isModelProblem(err))
                        throw err; // saldo, verificación, contenido: no se resuelve cambiando de modelo
                    break;
                }
            }
        }
    }
    throw lastErr;
}
app.post("/api/generate-application", async (req, res) => {
    dotenv_1.default.config({ override: true });
    const b = req.body || {};
    try {
        if (!b.system || !b.system.name)
            return res.status(400).json({ error: "Se requiere un sistema visual para generar la pieza." });
        const key = (process.env.OPENAI_API_KEY || "").trim();
        if (!key)
            return res.status(400).json({ error: "Falta OPENAI_API_KEY en el archivo .env del servidor." });
        const pieceType = PIECES[b.pieceType] ? b.pieceType : "other";
        const piece = PIECES[pieceType];
        const textModel = (process.env.OPENAI_TEXT_MODEL || "gpt-5").trim();
        const imageModel = (process.env.OPENAI_IMAGE_MODEL || "gpt-image-2").trim();
        const quality = (process.env.OPENAI_IMAGE_QUALITY || "high").trim();
        const tool = { size: piece.size, quality };
        if (b.transparent)
            tool.background = "transparent";
        // ---------- Iteración sobre una variante ----------
        if (b.revision?.text) {
            const text = `Revise the last image: ${b.revision.text}. Keep everything else as it is, and keep following the visual system.`;
            let result;
            try {
                result = await generateWithResponses(key, {
                    input: [{ role: "user", content: [{ type: "input_text", text }] }],
                    previousResponseId: b.revision.responseId,
                    tool: { ...tool, action: "edit" },
                    textModel,
                    imageModel,
                });
            }
            catch (err) {
                // Si la conversación anterior ya no está disponible, se envía la imagen a editar.
                const image = b.revision.imageUrl ? await toDataUrl(b.revision.imageUrl, "pieza") : null;
                if (!image || !String(err?.message || "").toLowerCase().includes("previous"))
                    throw err;
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
        const refImages = [];
        for (const r of (b.references || []).slice(0, 4)) {
            const url = r?.image ? await toDataUrl(r.image, r.id) : null;
            if (url)
                refImages.push({ id: r.id, url });
        }
        const anchor = b.anchorImageUrl ? await toDataUrl(b.anchorImageUrl, "ancla") : null;
        const count = Math.max(1, Math.min(4, Number(b.variants) || 1));
        const directions = piece.directions.slice(0, count);
        console.log(`[Imagen] ${piece.label} · ${count} variantes · ${refImages.length} referencias · ${textModel} + ${imageModel}`);
        const settled = await Promise.allSettled(directions.map(direction => generateWithResponses(key, {
            input: [
                {
                    role: "user",
                    content: [
                        { type: "input_text", text: `${brief}\n\n# This variant\n${count > 1 ? direction : "Choose the strongest direction."}${anchor ? "\nKeep the visual language of the first attached image (approved earlier piece)." : ""}` },
                        ...(anchor ? [{ type: "input_image", image_url: anchor }] : []),
                        ...refImages.map(r => ({ type: "input_image", image_url: r.url })),
                    ],
                },
            ],
            tool,
            textModel,
            imageModel,
        }).then(r => ({ ...r, direction: count > 1 ? direction : "" }))));
        const variants = settled.filter(s => s.status === "fulfilled").map(s => s.value);
        const failures = settled.filter(s => s.status === "rejected").map(s => s.reason);
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
            },
        });
    }
    catch (error) {
        console.error("Error en /api/generate-application:", error);
        const msg = String(error?.message || error);
        return res.status(502).json({ error: friendlyOpenAIError(msg), details: msg });
    }
});
// Vite middleware & Static Serving
async function setupVite() {
    const fs = await Promise.resolve().then(() => __importStar(require("fs")));
    const distPath = path_1.default.join(process.cwd(), "dist");
    const assetsPath = path_1.default.join(process.cwd(), "assets");
    const setNoCache = (res) => {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
    };
    app.use("/assets", express_1.default.static(assetsPath, { setHeaders: setNoCache }));
    app.use("/assets", express_1.default.static(path_1.default.join(distPath, "assets"), { setHeaders: setNoCache }));
    app.use(express_1.default.static(distPath, { setHeaders: setNoCache }));
    app.use(express_1.default.static(process.cwd(), { setHeaders: setNoCache }));
    app.use((req, res) => {
        setNoCache(res);
        const distHtml = path_1.default.join(distPath, "index.html");
        if (fs.existsSync(distHtml)) {
            res.sendFile(distHtml);
        }
        else {
            res.sendFile(path_1.default.join(process.cwd(), "index.html"));
        }
    });
    app.listen(PORT, "0.0.0.0", () => {
        console.log(`[Emergent App] Server running on http://0.0.0.0:${PORT}`);
    });
}
setupVite();
