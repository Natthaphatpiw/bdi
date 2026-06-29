// Gemini wrapper — orchestrator NLU + synthesis (replaces ThaiLLM-8B-MedApp for
// cost), batch STT (voice→text), and embeddings (gemini-embedding-001 @768).
import { GoogleGenAI } from "@google/genai";
import { env, featureFlags } from "./env";

let _ai: GoogleGenAI | null = null;
function ai(): GoogleGenAI {
  if (!_ai) _ai = new GoogleGenAI({ apiKey: env.geminiApiKey });
  return _ai;
}

export interface GenOpts {
  system?: string;
  temperature?: number;
  maxOutputTokens?: number;
  json?: boolean;
  /** Hidden reasoning budget. Default 0 — these are extraction/formatting tasks,
   *  so we disable "thinking" to guarantee visible text + cut cost/latency. */
  thinkingBudget?: number;
}

/** Plain text generation. */
export async function geminiText(prompt: string, opts: GenOpts = {}): Promise<string> {
  const res = await ai().models.generateContent({
    model: env.geminiModel,
    contents: prompt,
    config: {
      ...(opts.system ? { systemInstruction: opts.system } : {}),
      temperature: opts.temperature ?? 0.4,
      maxOutputTokens: opts.maxOutputTokens ?? 2048,
      thinkingConfig: { thinkingBudget: opts.thinkingBudget ?? 0 },
      ...(opts.json ? { responseMimeType: "application/json" } : {}),
    },
  });
  return res.text ?? "";
}

/** JSON generation with defensive parsing. Returns `fallback` on any failure. */
export async function geminiJson<T>(
  prompt: string,
  fallback: T,
  opts: GenOpts = {}
): Promise<T> {
  if (!featureFlags.hasGemini()) return fallback;
  try {
    const raw = await geminiText(prompt, { ...opts, json: true, temperature: opts.temperature ?? 0.2 });
    return safeParseJson<T>(raw, fallback);
  } catch (e) {
    console.error("[gemini] geminiJson failed:", (e as Error).message);
    return fallback;
  }
}

export function safeParseJson<T>(raw: string, fallback: T): T {
  if (!raw) return fallback;
  let s = raw.trim();
  // strip ```json fences if present
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // grab the outermost JSON object/array
  const first = s.search(/[[{]/);
  const lastObj = s.lastIndexOf("}");
  const lastArr = s.lastIndexOf("]");
  const last = Math.max(lastObj, lastArr);
  if (first >= 0 && last > first) s = s.slice(first, last + 1);
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

/** Batch STT: transcribe a single audio clip to Thai text. */
export async function transcribeAudio(base64: string, mime: string): Promise<string> {
  if (!featureFlags.hasGemini()) return "";
  const res = await ai().models.generateContent({
    model: env.geminiModel,
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              "ถอดเสียงพูดต่อไปนี้เป็นข้อความภาษาไทยให้ถูกต้องที่สุด " +
              "ตอบเฉพาะข้อความที่ถอดได้เท่านั้น ห้ามมีคำอธิบายอื่น",
          },
          { inlineData: { mimeType: mime, data: base64 } },
        ],
      },
    ],
    config: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
  });
  return (res.text ?? "").trim();
}

// ---- embeddings (L2-normalized for truncated dims) -------------------------
export async function embedTexts(
  texts: string[],
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" = "RETRIEVAL_QUERY"
): Promise<number[][]> {
  if (!featureFlags.hasGemini() || texts.length === 0) return texts.map(() => []);
  const out: number[][] = [];
  for (const text of texts) {
    const res = await ai().models.embedContent({
      model: env.embedModel,
      contents: text,
      config: { outputDimensionality: env.embedDim, taskType },
    });
    const v = res.embeddings?.[0]?.values ?? [];
    out.push(l2normalize(v));
  }
  return out;
}

export async function embedOne(
  text: string,
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" = "RETRIEVAL_QUERY"
): Promise<number[]> {
  const [v] = await embedTexts([text], taskType);
  return v ?? [];
}

function l2normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return norm > 0 ? v.map((x) => x / norm) : v;
}
