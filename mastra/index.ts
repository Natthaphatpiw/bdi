import { Mastra } from "@mastra/core";
import { casePassportAgent } from "./agents/casePassport";

// Central Mastra instance — registers our agents (Case Passport for now).
// Stateless: session memory lives in Supabase and is fed to the agent per call.
export const mastra = new Mastra({
  agents: { casePassport: casePassportAgent },
});
