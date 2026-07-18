import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  ExtractedCaseSchema,
  PrescreenResultSchema,
  type ExtractedCase,
  type PrescreenResult,
  type VerifiedCareRoute,
} from "../contracts";
import {
  EXTRACT_CASE_SYSTEM_PROMPT,
  buildExtractCasePrompt,
} from "../../ai/prompts/extract-case";
import {
  PRESCREEN_CASE_SYSTEM_PROMPT,
  buildPrescreenCasePrompt,
} from "../../ai/prompts/prescreen-case";
import {
  SYNTHESIZE_ROUTE_SYSTEM_PROMPT,
  buildSynthesizeRoutePrompt,
} from "../../ai/prompts/synthesize-route";
import { FOLLOW_UP_SYSTEM_PROMPT, buildFollowUpPrompt } from "../../ai/prompts/follow-up";
import { ProviderUnavailableError, ProviderValidationError } from "./errors";
import type {
  ExtractCaseInput,
  FollowUpModelAnswer,
  FollowUpModelInput,
  ModelProvider,
  PrescreenCaseInput,
} from "./types";

const FollowUpAnswerSchema = z.object({
  answerTh: z.string().min(1).max(1600),
  evidenceIds: z.array(z.string()).max(20),
  needsVerification: z.boolean(),
});

type StructuredSchema<T> = z.ZodType<T>;

export interface ClaudeModelProviderOptions {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  client?: Anthropic;
}

export class ClaudeModelProvider implements ModelProvider {
  private readonly anthropic: Anthropic;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly configured: boolean;

  constructor(options: ClaudeModelProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.CLAUDE_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? "";
    this.anthropic = options.client ?? new Anthropic({ apiKey, baseURL: "https://api.anthropic.com" });
    this.model = options.model ?? process.env.CLAUDE_MODEL ?? "claude-sonnet-5";
    this.timeoutMs = Math.min(Math.max(options.timeoutMs ?? 12_000, 1_000), 12_000);
    this.configured = Boolean(apiKey) || Boolean(options.client);
  }

  async extractCase(input: ExtractCaseInput): Promise<ExtractedCase> {
    const extracted = await this.structuredCall(
      EXTRACT_CASE_SYSTEM_PROMPT,
      buildExtractCasePrompt({ ...input, narrative: input.narrative.slice(0, 4_000) }),
      ExtractedCaseSchema,
      1_800,
    );
    return ExtractedCaseSchema.parse({
      ...extracted,
      patientRelation: input.confirmed?.patientRelation ?? extracted.patientRelation,
      scheme: input.confirmed?.scheme ?? extracted.scheme,
      area: input.confirmed?.area
        ? { ...extracted.area, name: input.confirmed.area }
        : extracted.area,
    });
  }

  async prescreenCase(input: PrescreenCaseInput): Promise<PrescreenResult> {
    return this.structuredCall(
      PRESCREEN_CASE_SYSTEM_PROMPT,
      buildPrescreenCasePrompt({
        extractedCase: input.extractedCase,
        urgencyFloor: input.urgencyFloor,
        safetyMatches: input.safetyMatches ?? [],
      }),
      PrescreenResultSchema,
      1_800,
    );
  }

  async synthesizeExplanation(route: VerifiedCareRoute): Promise<string> {
    const text = await this.textCall(
      SYNTHESIZE_ROUTE_SYSTEM_PROMPT,
      buildSynthesizeRoutePrompt(route),
      500,
    );
    return text.trim().slice(0, 1_200);
  }

  async answerFollowUp(input: FollowUpModelInput): Promise<FollowUpModelAnswer> {
    return this.structuredCall(
      FOLLOW_UP_SYSTEM_PROMPT,
      buildFollowUpPrompt({
        question: input.question.slice(0, 1_000),
        sanitizedSnapshot: input.sanitizedSnapshot,
      }),
      FollowUpAnswerSchema,
      900,
    );
  }

  private async structuredCall<T>(
    system: string,
    prompt: string,
    schema: StructuredSchema<T>,
    maxTokens: number,
  ): Promise<T> {
    let currentPrompt = prompt;
    let lastError: unknown;
    const deadline = Date.now() + this.timeoutMs;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;
      try {
        const raw = await this.callOnce(system, currentPrompt, maxTokens, remainingMs);
        let parsedJson: unknown;
        try {
          parsedJson = parseJson(raw);
        } catch {
          const issues = ["ผลลัพธ์ไม่ใช่ JSON ที่ parse ได้"];
          lastError = new ProviderValidationError("Claude output was not valid JSON", issues);
          currentPrompt = buildRepairPrompt(prompt, raw, issues);
          continue;
        }
        const parsed = schema.safeParse(parsedJson);
        if (parsed.success) return parsed.data;
        const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
        lastError = new ProviderValidationError("Claude structured output failed validation", issues);
        currentPrompt = buildRepairPrompt(prompt, raw, issues);
      } catch (error) {
        lastError = error;
        currentPrompt = prompt;
      }
    }
    if (lastError instanceof ProviderValidationError) throw lastError;
    throw new ProviderUnavailableError(
      `Claude request failed: ${lastError instanceof Error ? lastError.message : "unknown error"}`,
      "model",
    );
  }

  private async textCall(system: string, prompt: string, maxTokens: number): Promise<string> {
    let lastError: unknown;
    const deadline = Date.now() + this.timeoutMs;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;
      try {
        const text = await this.callOnce(system, prompt, maxTokens, remainingMs);
        if (text.trim()) return text;
      } catch (error) {
        lastError = error;
      }
    }
    throw new ProviderUnavailableError(
      `Claude request failed: ${lastError instanceof Error ? lastError.message : "empty response"}`,
      "model",
    );
  }

  private async callOnce(system: string, prompt: string, maxTokens: number, timeoutMs = this.timeoutMs): Promise<string> {
    if (!this.configured) {
      throw new ProviderUnavailableError("Claude API key is not configured", "model", false);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1, Math.min(timeoutMs, this.timeoutMs)));
    try {
      const response = await this.anthropic.messages.create(
        {
          model: this.model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: prompt }],
        },
        { signal: controller.signal },
      );
      if (response.stop_reason === "refusal") {
        throw new ProviderUnavailableError("Claude refused the request", "model", false);
      }
      return response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");
    } finally {
      clearTimeout(timer);
    }
  }
}

function parseJson(raw: string): unknown {
  let normalized = raw.trim();
  const fenced = normalized.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) normalized = fenced[1].trim();
  const firstObject = normalized.indexOf("{");
  const firstArray = normalized.indexOf("[");
  const first = [firstObject, firstArray].filter((value) => value >= 0).sort((a, b) => a - b)[0];
  const last = Math.max(normalized.lastIndexOf("}"), normalized.lastIndexOf("]"));
  if (first != null && last > first) normalized = normalized.slice(first, last + 1);
  return JSON.parse(normalized) as unknown;
}

function buildRepairPrompt(originalPrompt: string, raw: string, issues: string[]): string {
  return `${originalPrompt}\n\nผลลัพธ์ก่อนหน้าไม่ผ่าน schema โปรดซ่อม JSON เพียงครั้งเดียว ห้ามเพิ่มข้อความอื่น\nvalidationIssues=${JSON.stringify(
    issues,
  )}\ninvalidOutput=${JSON.stringify(raw.slice(0, 8_000))}`;
}
