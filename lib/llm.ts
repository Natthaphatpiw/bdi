// Legacy text-LLM layer — Claude (claude-sonnet-5, official SDK). Gemini text
// fallback is disabled by default and requires LEGACY_ENABLE_GEMINI_TEXT_FALLBACK=true.
// STT and embeddings remain optional Gemini helpers outside the MVP reasoning path.
//
// Sonnet 5 API notes (per current Claude API):
//  - non-default temperature/top_p/top_k are REJECTED (400) → never send them
//  - thinking behavior is model-managed; omit legacy/manual thinking controls so
//    this compatibility layer stays valid as the provider evolves
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
      ...(opts.system ? { system: opts.system } : {}),
      messages: [{ role: "user", content: prompt }],
    });
    if (res.stop_reason === "refusal") return null;
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

/** Legacy text generation: Claude first; optional Gemini only behind its flag. */
export async function llmTextEx(prompt: string, opts: LlmOpts = {}): Promise<LlmResult | null> {
  if (featureFlags.hasClaude()) {
    const text = await claudeText(prompt, opts);
    if (text) return { text, provider: "claude" };
  }
  if (env.legacyGeminiTextFallback && featureFlags.hasGemini()) {
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

/** Legacy JSON generation with defensive parsing and an explicitly gated fallback. */
export async function llmJson<T>(prompt: string, fallback: T, opts: LlmOpts = {}): Promise<T> {
  if (featureFlags.hasClaude()) {
    const text = await claudeText(prompt, opts);
    if (text) {
      const parsed = safeParseJson<T | null>(text, null);
      if (parsed !== null) return parsed;
      console.error("[llm] claude JSON parse failed");
    }
  }
  if (env.legacyGeminiTextFallback && featureFlags.hasGemini()) {
    return geminiJson<T>(prompt, fallback, { maxOutputTokens: opts.maxOutputTokens });
  }
  return fallback;
}
