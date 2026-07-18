import { ProviderUnavailableError } from "./errors";
import type {
  BenefitFact,
  ConditionMatch,
  CoveredServiceFact,
  FacilityCandidateFact,
  FacilityMatchInput,
  FacilityReliability,
  KnowledgeProvider,
  KnowledgeRight,
} from "./types";
import type { MvpScheme, RouteEvidence } from "../contracts";

/** Future graph adapter skeleton. No neo4j package is imported and no call is made. */
export class Neo4jKnowledgeProvider implements KnowledgeProvider {
  async resolveRight(_scheme: MvpScheme, _asOfDate?: string): Promise<KnowledgeRight | null> {
    return unavailable();
  }
  async matchCondition(_symptomIds: string[], _asOfDate?: string): Promise<ConditionMatch[]> {
    return unavailable();
  }
  async getCoveredServices(
    _conditionIds: string[],
    _scheme: MvpScheme,
    _asOfDate?: string,
    _serviceIds?: string[],
  ): Promise<CoveredServiceFact[]> {
    return unavailable();
  }
  async matchFacilities(_input: FacilityMatchInput): Promise<FacilityCandidateFact[]> {
    return unavailable();
  }
  async getBenefits(
    _conditionIds: string[],
    _age: number | null,
    _scheme: MvpScheme,
    _asOfDate?: string,
  ): Promise<BenefitFact[]> {
    return unavailable();
  }
  async getEvidence(_entityIds: string[]): Promise<RouteEvidence[]> {
    return unavailable();
  }
  async getFacilityReliability(_facilityId: string): Promise<FacilityReliability | null> {
    return unavailable();
  }
}

function unavailable(): never {
  throw new ProviderUnavailableError(
    "Neo4j adapter is a future configuration stub and is not available in the MVP runtime",
    "knowledge",
    false,
  );
}
