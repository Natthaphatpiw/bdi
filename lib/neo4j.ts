// Neo4j Aura driver (read-only Cypher against the Civic Knowledge Graph).
// Lazily created; safe to import even when Neo4j isn't configured.
import neo4j, { type Driver } from "neo4j-driver";
import { env, featureFlags } from "./env";

let _driver: Driver | null = null;

function driver(): Driver | null {
  if (!featureFlags.hasNeo4j()) return null;
  if (!_driver) {
    _driver = neo4j.driver(env.neo4jUri, neo4j.auth.basic(env.neo4jUser, env.neo4jPassword), {
      maxConnectionPoolSize: 10,
      connectionAcquisitionTimeout: 15_000,
    });
  }
  return _driver;
}

/** Run a read query; returns plain JS records. Returns [] if Neo4j is down. */
export async function readCypher<T = Record<string, unknown>>(
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<T[]> {
  const d = driver();
  if (!d) return [];
  const session = d.session({ database: env.neo4jDatabase, defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(cypher, params);
    return result.records.map((r) => {
      const obj: Record<string, unknown> = {};
      for (const key of r.keys) obj[key as string] = normalize(r.get(key));
      return obj as T;
    });
  } catch (e) {
    console.error("[neo4j] query failed:", (e as Error).message);
    return [];
  } finally {
    await session.close();
  }
}

// Convert Neo4j integers / nested structures into plain JS.
function normalize(v: unknown): unknown {
  if (v == null) return v;
  if (neo4j.isInt(v)) return (v as { toNumber: () => number }).toNumber();
  if (Array.isArray(v)) return v.map(normalize);
  if (typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) o[k] = normalize(val);
    return o;
  }
  return v;
}

export async function neo4jHealthy(): Promise<boolean> {
  const d = driver();
  if (!d) return false;
  try {
    await d.verifyConnectivity();
    return true;
  } catch {
    return false;
  }
}
