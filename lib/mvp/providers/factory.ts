import type { SupabaseClient } from "@supabase/supabase-js";
import type { MvpScheme, RouteEvidence } from "../contracts";
import { ClaudeModelProvider, type ClaudeModelProviderOptions } from "./claude";
import { JsonKnowledgeProvider, type JsonKnowledgeProviderOptions } from "./json";
import { Neo4jKnowledgeProvider } from "./neo4j";
import { SupabaseKnowledgeProvider } from "./supabase";
import { ThaiLLMModelProvider } from "./thaillm";
import type {
  BenefitFact,
  ConditionMatch,
  CoveredServiceFact,
  FacilityCandidateFact,
  FacilityMatchInput,
  FacilityReliability,
  KnowledgeProvider,
  KnowledgeRuntimeState,
  KnowledgeRight,
  ModelProvider,
} from "./types";

export interface ProviderEnvironment {
  [key: string]: string | undefined;
  MODEL_PROVIDER?: string;
  KNOWLEDGE_PROVIDER?: string;
  ENABLE_JSON_KNOWLEDGE_FALLBACK?: string;
}

export function createModelProvider(
  environment: ProviderEnvironment = process.env,
  options: ClaudeModelProviderOptions = {},
): ModelProvider {
  const selected = (environment.MODEL_PROVIDER ?? "claude").trim().toLowerCase();
  if (selected === "thaillm") return new ThaiLLMModelProvider();
  return new ClaudeModelProvider(options);
}

export function createKnowledgeProvider(options: {
  environment?: ProviderEnvironment;
  supabaseClient?: SupabaseClient;
  json?: JsonKnowledgeProviderOptions;
} = {}): KnowledgeProvider {
  const environment = options.environment ?? process.env;
  const selected = (environment.KNOWLEDGE_PROVIDER ?? "supabase").trim().toLowerCase();
  const fallbackEnabled = parseBoolean(environment.ENABLE_JSON_KNOWLEDGE_FALLBACK, true);
  const fallback = new JsonKnowledgeProvider(options.json);
  if (selected === "json") return fallback;
  const primary: KnowledgeProvider =
    selected === "neo4j"
      ? new Neo4jKnowledgeProvider()
      : new SupabaseKnowledgeProvider(options.supabaseClient);
  return fallbackEnabled ? new FallbackKnowledgeProvider(primary, fallback) : primary;
}

export class FallbackKnowledgeProvider implements KnowledgeProvider {
  private fallbackUsed = false;

  constructor(
    private readonly primary: KnowledgeProvider,
    private readonly fallback: KnowledgeProvider,
  ) {}

  createRequestScope(): KnowledgeProvider {
    return new FallbackKnowledgeProvider(this.primary, this.fallback);
  }

  getRuntimeState(): KnowledgeRuntimeState {
    return { degraded: this.fallbackUsed, fallbackUsed: this.fallbackUsed };
  }

  async resolveRight(scheme: MvpScheme, asOfDate?: string): Promise<KnowledgeRight | null> {
    return this.withFallback(
      () => this.primary.resolveRight(scheme, asOfDate),
      (value) => value !== null,
      () => this.fallback.resolveRight(scheme, asOfDate),
    );
  }

  async matchCondition(symptomIds: string[], asOfDate?: string): Promise<ConditionMatch[]> {
    return this.withFallback(
      () => this.primary.matchCondition(symptomIds, asOfDate),
      hasRows,
      () => this.fallback.matchCondition(symptomIds, asOfDate),
    );
  }

  async getCoveredServices(
    conditionIds: string[],
    scheme: MvpScheme,
    asOfDate?: string,
    serviceIds?: string[],
  ): Promise<CoveredServiceFact[]> {
    return this.withFallback(
      () => this.primary.getCoveredServices(conditionIds, scheme, asOfDate, serviceIds),
      hasRows,
      () => this.fallback.getCoveredServices(conditionIds, scheme, asOfDate, serviceIds),
    );
  }

  async matchFacilities(input: FacilityMatchInput): Promise<FacilityCandidateFact[]> {
    return this.withFallback(
      () => this.primary.matchFacilities(input),
      hasRows,
      () => this.fallback.matchFacilities(input),
    );
  }

  async getBenefits(
    conditionIds: string[],
    age: number | null,
    scheme: MvpScheme,
    asOfDate?: string,
  ): Promise<BenefitFact[]> {
    return this.withFallback(
      () => this.primary.getBenefits(conditionIds, age, scheme, asOfDate),
      hasRows,
      () => this.fallback.getBenefits(conditionIds, age, scheme, asOfDate),
    );
  }

  async getEvidence(entityIds: string[]): Promise<RouteEvidence[]> {
    try {
      const primary = await this.primary.getEvidence(entityIds);
      const supplemental = await this.fallback.getEvidence(entityIds);
      const primaryIds = new Set(primary.map((item) => item.id));
      const added = supplemental.filter((item) => !primaryIds.has(item.id));
      if (added.length) this.fallbackUsed = true;
      if (primary.length || added.length) return [...primary, ...added];
    } catch {
      // Continue with the repository snapshot below.
    }
    this.fallbackUsed = true;
    return this.fallback.getEvidence(entityIds);
  }

  async getFacilityReliability(facilityId: string): Promise<FacilityReliability | null> {
    return this.withFallback(
      () => this.primary.getFacilityReliability(facilityId),
      (value) => value !== null,
      () => this.fallback.getFacilityReliability(facilityId),
    );
  }

  private async withFallback<T>(
    primary: () => Promise<T>,
    usable: (value: T) => boolean,
    fallback: () => Promise<T>,
  ): Promise<T> {
    try {
      const value = await primary();
      if (usable(value)) return value;
    } catch {
      // The fallback is deterministic repo data and intentionally hides provider details.
    }
    this.fallbackUsed = true;
    return fallback();
  }
}

function hasRows(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value === "") return defaultValue;
  return !["false", "0", "off", "no"].includes(value.trim().toLowerCase());
}
