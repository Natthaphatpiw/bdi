// Centralized env access. Server-only values must NOT be read in client components.
// `optional` returns "" when unset so callers can feature-detect gracefully.

function get(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  // Supabase
  supabaseUrl: get("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: get("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceKey: get("SUPABASE_SERVICE_KEY"),

  // Gemini
  geminiApiKey: get("GEMINI_API_KEY"),
  geminiModel: get("GEMINI_MODEL", "gemini-3.5-flash"),
  embedModel: get("EMBED_MODEL", "gemini-embedding-001"),
  embedDim: parseInt(get("EMBED_DIM", "768"), 10),

  // RunPod (ThaiLLM-27B-Prescreen)
  runpodEndpointId: get("RUNPOD_ENDPOINT_ID"),
  runpodApiKey: get("RUNPOD_API_KEY"),
  runpodAdapter: get("RUNPOD_PRESCREEN_ADAPTER", "prescreen"),
  // Max wait for the 27B before falling back to mock+rails. Must stay well under
  // the serverless function limit so /api/turn never 504s on a RunPod cold start.
  runpodTimeoutMs: parseInt(get("RUNPOD_TIMEOUT_MS", "20000"), 10),

  // Neo4j
  neo4jUri: get("NEO4J_URI"),
  neo4jUser: get("NEO4J_USERNAME", "neo4j"),
  neo4jPassword: get("NEO4J_PASSWORD"),
  neo4jDatabase: get("NEO4J_DATABASE", "neo4j"),

  // LINE
  liffId: get("NEXT_PUBLIC_LIFF_ID"),
  lineChannelId: get("LINE_CHANNEL_ID"),
  lineChannelSecret: get("LINE_CHANNEL_SECRET"),

  appName: get("NEXT_PUBLIC_APP_NAME", "รู้สิทธิ์ รู้สุข"),

  // Admin allow-list (comma-separated Supabase user ids) for /api/admin/*
  adminUserIds: get("ADMIN_USER_IDS")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};

export const featureFlags = {
  hasSupabase: () => !!env.supabaseUrl && !!env.supabaseServiceKey,
  hasSupabaseClient: () => !!env.supabaseUrl && !!env.supabaseAnonKey,
  hasGemini: () => !!env.geminiApiKey,
  hasRunpod: () => !!env.runpodEndpointId && !!env.runpodApiKey,
  hasNeo4j: () => !!env.neo4jUri && !!env.neo4jPassword,
  hasLine: () => !!env.lineChannelId && !!env.lineChannelSecret,
};
