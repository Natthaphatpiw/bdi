import { describe, expect, it } from "vitest";
import {
  FallbackKnowledgeProvider,
  JsonKnowledgeProvider,
  type KnowledgeProvider,
} from "@/lib/mvp/providers";

function unavailableProvider(): KnowledgeProvider {
  const unavailable = async (): Promise<never> => {
    throw new Error("knowledge unavailable");
  };
  return {
    resolveRight: unavailable,
    matchCondition: unavailable,
    getCoveredServices: unavailable,
    matchFacilities: unavailable,
    getBenefits: unavailable,
    getEvidence: unavailable,
    getFacilityReliability: unavailable,
  };
}

describe("knowledge fallback provenance", () => {
  it("marks only the isolated request scope degraded when JSON fallback is used", async () => {
    const provider = new FallbackKnowledgeProvider(
      unavailableProvider(),
      new JsonKnowledgeProvider(),
    );
    const scope = provider.createRequestScope();
    const right = await scope.resolveRight("UCS", "2026-07-18");

    expect(right?.id).toBe("right:ucs");
    expect(scope.getRuntimeState?.()).toEqual({ degraded: true, fallbackUsed: true });
    expect(provider.getRuntimeState()).toEqual({ degraded: false, fallbackUsed: false });
  });

  it("does not mark the repository JSON provider degraded when it is selected explicitly", async () => {
    const provider = new JsonKnowledgeProvider();
    expect((await provider.resolveRight("SSS", "2026-07-18"))?.id).toBe("right:sss");
    expect("getRuntimeState" in provider).toBe(false);
  });

  it("supplements partial primary evidence and records that repository data contributed", async () => {
    const json = new JsonKnowledgeProvider();
    const requested = ["doc:niems:1669", "doc:cgd:medical"];
    const first = (await json.getEvidence([requested[0]]))[0];
    if (!first) throw new Error("fixture source missing");
    const primary: KnowledgeProvider = {
      ...unavailableProvider(),
      getEvidence: async () => [first],
    };
    const scope = new FallbackKnowledgeProvider(primary, json).createRequestScope();

    const evidence = await scope.getEvidence(requested);

    expect(evidence.map((item) => item.id)).toEqual(expect.arrayContaining(requested));
    expect(scope.getRuntimeState?.()?.degraded).toBe(true);
  });
});
