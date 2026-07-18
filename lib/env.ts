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

  // Claude (primary text LLM) — CLAUDE_API_KEY or the standard ANTHROPIC_API_KEY
  claudeApiKey: get("CLAUDE_API_KEY") || get("ANTHROPIC_API_KEY"),
  claudeModel: get("CLAUDE_MODEL", "claude-sonnet-5"),

  // Optional legacy media helpers. Gemini is not a reasoning fallback unless
  // the explicit legacy flag is enabled outside the MVP killer journey.
  geminiApiKey: get("GEMINI_API_KEY"),
  geminiModel: get("GEMINI_MODEL", "gemini-3.5-flash"),
  embedModel: get("EMBED_MODEL", "gemini-embedding-001"),
  embedDim: parseInt(get("EMBED_DIM", "768"), 10),

  // Future/legacy ThaiLLM adapter configuration. Never active unless
  // MODEL_PROVIDER=thaillm is selected explicitly.
  runpodEndpointId: get("RUNPOD_ENDPOINT_ID"),
  runpodApiKey: get("RUNPOD_API_KEY"),
  runpodAdapter: get("RUNPOD_PRESCREEN_ADAPTER", "prescreen"),
  // Timeout retained for the legacy /api/turn compatibility path only.
  runpodTimeoutMs: parseInt(get("RUNPOD_TIMEOUT_MS", "20000"), 10),

  // Future Neo4j-compatible adapter configuration. The default runtime does
  // not load a Neo4j driver or make a Neo4j connection.
  neo4jUri: get("NEO4J_URI"),
  neo4jUser: get("NEO4J_USERNAME", "neo4j"),
  neo4jPassword: get("NEO4J_PASSWORD"),
  neo4jDatabase: get("NEO4J_DATABASE", "neo4j"),

  // Verified Care Route runtime. Future providers are opt-in only: merely
  // having an old credential in .env must never reactivate them.
  modelProvider: get("MODEL_PROVIDER", "claude").toLowerCase(),
  knowledgeProvider: get("KNOWLEDGE_PROVIDER", "supabase").toLowerCase(),
  enableJsonKnowledgeFallback: get("ENABLE_JSON_KNOWLEDGE_FALLBACK", "true") !== "false",
  // Booth entry is available out of the box; production operators can disable
  // it explicitly with DEMO_MODE=false after the event.
  demoMode: get("DEMO_MODE", "true") === "true",
  enablePrivateOptions: get("ENABLE_PRIVATE_OPTIONS", "false") === "true",
  enableFacilityFeedback: get("ENABLE_FACILITY_FEEDBACK", "true") !== "false",
  enablePassportShare: get("ENABLE_PASSPORT_SHARE", "true") !== "false",
  adminDebug: get("ADMIN_DEBUG", "false") === "true",
  legacyGeminiTextFallback: get("LEGACY_ENABLE_GEMINI_TEXT_FALLBACK", "false") === "true",

  // LINE
  liffId: get("NEXT_PUBLIC_LIFF_ID"),
  lineChannelId: get("LINE_CHANNEL_ID"),
  lineChannelSecret: get("LINE_CHANNEL_SECRET"),

  appName: get("NEXT_PUBLIC_APP_NAME", "รู้สิทธิ์ รู้สุข"),

  // Guardian Mode — client components read these NEXT_PUBLIC_* statically;
  // mirrored here for server-side checks/telemetry only.
  guardianSimEnabled: get("NEXT_PUBLIC_GUARDIAN_SIM") === "1",
  rideAppUrl: get("NEXT_PUBLIC_RIDE_APP_URL"),

  // Admin allow-list (comma-separated Supabase user ids) for /api/admin/*
  adminUserIds: get("ADMIN_USER_IDS")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};

export const featureFlags = {
  hasSupabase: () => !!env.supabaseUrl && !!env.supabaseServiceKey,
  hasSupabaseClient: () => !!env.supabaseUrl && !!env.supabaseAnonKey,
  hasClaude: () => !!env.claudeApiKey,
  hasGemini: () => !!env.geminiApiKey,
  hasLLM: () =>
    !!env.claudeApiKey || (env.legacyGeminiTextFallback && !!env.geminiApiKey),
  hasRunpod: () =>
    env.modelProvider === "thaillm" && !!env.runpodEndpointId && !!env.runpodApiKey,
  hasNeo4j: () =>
    env.knowledgeProvider === "neo4j" && !!env.neo4jUri && !!env.neo4jPassword,
  hasLine: () => !!env.lineChannelId && !!env.lineChannelSecret,
  privateOptionsEnabled: () => env.enablePrivateOptions,
};
