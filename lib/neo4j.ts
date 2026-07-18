// Legacy compatibility shim. The booth MVP deliberately has no Neo4j runtime
// dependency: lib/kg.ts receives an empty result and uses the versioned JSON
// path. A future implementation belongs behind KnowledgeProvider in
// lib/mvp/knowledge and must be enabled explicitly with KNOWLEDGE_PROVIDER.

export async function readCypher<T = Record<string, unknown>>(
  _cypher: string,
  _params: Record<string, unknown> = {},
): Promise<T[]> {
  return [];
}

export async function resetDriver(): Promise<void> {
  // No driver is loaded in the MVP runtime.
}

export async function neo4jHealthy(): Promise<boolean> {
  return false;
}
