// Primary text-LLM layer — Claude (claude-sonnet-5, official SDK) with Gemini
// as automatic fallback. STT and embeddings stay on Gemini (Claude doesn't do
// audio transcription or embeddings).
//
// Sonnet 5 API notes (per current Claude API):
//  - non-default temperature/top_p/top_k are REJECTED (400) → never send them
//  - adaptive thinking runs by default when `thinking` is omitted → we disable
//    it explicitly for these short extraction/synthesis calls (latency + budget)
import Anthropic from "@anthropic-ai/sdk";
import { env, featureFlags } from "./env";
import { geminiText, geminiJson, safeParseJson } from "./gemini";

let _client: Anthropic | null = null;
function client(): Anthropic {
  // Explicit baseURL: the Mastra bridge sets ANTHROPIC_BASE_URL to a /v1-suffixed
  // URL (its gateway needs it), which would break the official SDK's own /v1 paths.
  if (!_client)
    _client = new Anthropic({ apiKey: env.claudeApiKey, baseURL: "https://api.anthropic.com" });
  return _client;
}

export interface LlmOpts {
  system?: string;
  maxOutputTokens?: number;
}

export interface LlmResult {
  text: string;
  provider: "claude" | "gemini";
}

async function claudeText(prompt: string, opts: LlmOpts): Promise<string | null> {
  try {
    const res = await client().messages.create({
      model: env.claudeModel,
      max_tokens: opts.maxOutputTokens ?? 1024,
      thinking: { type: "disabled" },
      ...(opts.system ? { system: opts.system } : {}),
      messages: [{ role: "user", content: prompt }],
    });
    if (res.stop_reason === "refusal") return null; // let Gemini try
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return text || null;
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      console.error(`[llm] claude ${e.status}:`, e.message.slice(0, 160));
    } else {
      console.error("[llm] claude:", (e as Error).message);
    }
    return null;
  }
}

/** Text generation: Claude first, Gemini fallback. Returns provider used. */
export async function llmTextEx(prompt: string, opts: LlmOpts = {}): Promise<LlmResult | null> {
  if (featureFlags.hasClaude()) {
    const text = await claudeText(prompt, opts);
    if (text) return { text, provider: "claude" };
  }
  if (featureFlags.hasGemini()) {
    try {
      const text = await geminiText(prompt, {
        system: opts.system,
        maxOutputTokens: opts.maxOutputTokens,
        temperature: 0.3,
      });
      if (text) return { text, provider: "gemini" };
    } catch (e) {
      console.error("[llm] gemini fallback:", (e as Error).message);
    }
  }
  return null;
}

export async function llmText(prompt: string, opts: LlmOpts = {}): Promise<string> {
  const r = await llmTextEx(prompt, opts);
  return r?.text ?? "";
}

/** JSON generation with defensive parsing: Claude first, Gemini fallback. */
export async function llmJson<T>(prompt: string, fallback: T, opts: LlmOpts = {}): Promise<T> {
  if (featureFlags.hasClaude()) {
    const text = await claudeText(prompt, opts);
    if (text) {
      const parsed = safeParseJson<T | null>(text, null);
      if (parsed !== null) return parsed;
      console.error("[llm] claude JSON parse failed, falling back to gemini");
    }
  }
  return geminiJson<T>(prompt, fallback, { maxOutputTokens: opts.maxOutputTokens });
}
