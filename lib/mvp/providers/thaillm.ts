import type { ExtractedCase, PrescreenResult, VerifiedCareRoute } from "../contracts";
import { ProviderUnavailableError } from "./errors";
import type {
  ExtractCaseInput,
  FollowUpModelAnswer,
  FollowUpModelInput,
  ModelProvider,
  PrescreenCaseInput,
} from "./types";

/** Future adapter contract only. It intentionally performs no network request. */
export class ThaiLLMModelProvider implements ModelProvider {
  async extractCase(_input: ExtractCaseInput): Promise<ExtractedCase> {
    return unavailable();
  }

  async prescreenCase(_input: PrescreenCaseInput): Promise<PrescreenResult> {
    return unavailable();
  }

  async synthesizeExplanation(_route: VerifiedCareRoute): Promise<string> {
    return unavailable();
  }

  async answerFollowUp(_input: FollowUpModelInput): Promise<FollowUpModelAnswer> {
    return unavailable();
  }
}

function unavailable(): never {
  throw new ProviderUnavailableError(
    "ThaiLLM adapter is a future configuration stub and is not available in the MVP runtime",
    "model",
    false,
  );
}
