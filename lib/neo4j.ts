// Neo4j Aura driver (read-only Cypher against the Civic Knowledge Graph).
// Lazily created; safe to import even when Neo4j isn't configured.
// Serverless-hardened: the module-level singleton can outlive its TCP
// connections/routing table on warm lambda invocations, so we cap connection
// lifetime, ping idle connections before reuse, and rebuild the driver once
// on transient routing/connection failures.
import neo4j, { type Driver } from "neo4j-driver";
import { env, featureFlags } from "./env";

let _driver: Driver | null = null;

const TRANSIENT_ERROR =
  /routing|discovery|ServiceUnavailable|Session.*expired|connection|ECONNRESET|EPIPE|closed|Pool is closed/i;

function driver(): Driver | null {
  if (!featureFlags.hasNeo4j()) return null;
  if (!_driver) {
    _driver = neo4j.driver(env.neo4jUri, neo4j.auth.basic(env.neo4jUser, env.neo4jPassword), {
      maxConnectionPoolSize: 10,
      connectionAcquisitionTimeout: 15_000,
      // Recycle connections before idle lambdas accumulate dead sockets.
      maxConnectionLifetime: 4 * 60_000,
      // Ping pooled connections idle longer than this before reuse.
      connectionLivenessCheckTimeout: 30_000,
    });
  }
  return _driver;
}

/**
 * Best-effort teardown of the singleton so the next call builds a fresh driver.
 * Pass the driver instance the caller was using: concurrent queries all fail on
 * the same dead driver, and without this guard a slow failure would close the
 * fresh driver a faster retry just built.
 */
export async function resetDriver(expected?: Driver): Promise<void> {
  if (expected && _driver !== expected) return; // already rebuilt by another caller
  const old = _driver;
  _driver = null;
  try {
    await old?.close();
  } catch {
    // Ignore: the driver may already be unusable.
  }
}

/** Run a read query; returns plain JS records. Returns [] if Neo4j is down. */
export async function readCypher<T = Record<string, unknown>>(
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<T[]> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const d = driver();
    if (!d) return [];
    const session = d.session({
      database: env.neo4jDatabase,
      defaultAccessMode: neo4j.session.READ,
    });
    try {
      const result = await session.run(cypher, params);
      return result.records.map((r) => {
        const obj: Record<string, unknown> = {};
        for (const key of r.keys) obj[key as string] = normalize(r.get(key));
        return obj as T;
      });
    } catch (e) {
      const msg = (e as Error).message;
      if (attempt === 1 && TRANSIENT_ERROR.test(msg)) {
        console.warn("[neo4j] transient failure, retrying with fresh driver:", msg);
        await resetDriver(d);
        continue;
      }
      console.error("[neo4j] query failed:", msg);
      return [];
    } finally {
      // Best-effort: closing a session on a dead connection can itself throw,
      // which would otherwise swallow the retry / surface to callers.
      await session.close().catch(() => {});
    }
  }
  return [];
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
    await resetDriver(d);
    return false;
  }
}
