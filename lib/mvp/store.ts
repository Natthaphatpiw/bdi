import { createHash, randomBytes, randomUUID } from "crypto";
import type {
  FeedbackOutcome,
  MvpCaseRecord,
  StoredPassport,
  VerifiedCareRoute,
} from "./contracts";
import { CaseRecordSchema, PassportSnapshotSchema } from "./contracts";

export interface CaseAccessContext {
  ownerUserId?: string | null;
  demoSessionId?: string | null;
  internal?: boolean;
}

interface CaseOwner {
  ownerUserId: string | null;
  demoSessionId: string | null;
}

export class StoreAccessDeniedError extends Error {
  constructor() {
    super("CASE_ACCESS_DENIED");
    this.name = "StoreAccessDeniedError";
  }
}

export class StorePersistenceUnavailableError extends Error {
  constructor() {
    super("STORE_PERSISTENCE_UNAVAILABLE");
    this.name = "StorePersistenceUnavailableError";
  }
}

type SupabaseClient = import("@supabase/supabase-js").SupabaseClient;

export interface MvpStoreOptions {
  /** Dependency injection is intentionally server-only and primarily supports
   * deterministic persistence tests. A null client means persistence is not
   * configured and must fail closed for every non-demo write. */
  clientFactory?: () => Promise<SupabaseClient | null>;
  /** Demo writes are opportunistic: configured deployments get TTL-backed
   * cold-start recovery, while an offline booth remains fully in-memory. */
  persistDemo?: boolean;
}

export interface AuditEntry {
  id: string;
  caseId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface StoredFeedback {
  id: string;
  caseId: string;
  facilityId: string | null;
  routeId: string | null;
  outcome: FeedbackOutcome;
  rightAccepted: boolean | null;
  discrepancy: string | null;
  submittedAt: string;
}

export interface StoredEligibilityDecision {
  benefitId: string;
  ruleId: string;
  sourceId: string;
  decision: import("./eligibility").EligibilityDecision;
  facts: Record<string, unknown>;
}

interface ShareRecord {
  tokenHash: string;
  passportId: string;
  expiresAt: string;
  revokedAt: string | null;
}

interface MemoryState {
  cases: Map<string, MvpCaseRecord>;
  passports: Map<string, StoredPassport>;
  shares: Map<string, ShareRecord>;
  feedback: Map<string, StoredFeedback>;
  eligibility: Map<string, StoredEligibilityDecision[]>;
  owners: Map<string, CaseOwner>;
  audit: AuditEntry[];
}

const GLOBAL_KEY = "__rusitMvpStoreV1";

function memory(): MemoryState {
  const globalState = globalThis as typeof globalThis & { [GLOBAL_KEY]?: MemoryState };
  globalState[GLOBAL_KEY] ??= {
    cases: new Map(),
    passports: new Map(),
    shares: new Map(),
    feedback: new Map(),
    eligibility: new Map(),
    owners: new Map(),
    audit: [],
  };
  return globalState[GLOBAL_KEY];
}

export class MvpStore {
  private readonly state = memory();
  private readonly clientFactory: () => Promise<SupabaseClient | null>;
  private readonly persistDemo: boolean;

  constructor(options: MvpStoreOptions = {}) {
    this.clientFactory = options.clientFactory ?? configuredClient;
    this.persistDemo = options.persistDemo ?? true;
  }

  async saveCase(record: MvpCaseRecord, ownerUserId?: string | null): Promise<MvpCaseRecord> {
    const previousOwner = this.state.owners.get(record.id);
    const owner: CaseOwner = {
      ownerUserId: ownerUserId !== undefined ? ownerUserId : previousOwner?.ownerUserId ?? null,
      demoSessionId: record.demoSessionId,
    };
    if (record.demoSessionId) {
      await this.tryDemoPersistence(async (client) => {
        await this.persistCase(record, null, client);
        const { error } = await client.rpc("purge_expired_demo_cases");
        if (error) throw error;
      });
    } else {
      await this.persistCase(record, owner.ownerUserId);
    }
    this.state.cases.set(record.id, structuredClone(record));
    this.state.owners.set(record.id, owner);
    return structuredClone(record);
  }

  async getCase(id: string, access?: CaseAccessContext): Promise<MvpCaseRecord | null> {
    let record = this.state.cases.get(id);
    if (!record) record = await this.hydrateCase(id) ?? undefined;
    if (!record) return null;
    this.assertAccess(id, access);
    if (record.expiresAt && Date.parse(record.expiresAt) <= Date.now()) {
      await this.deleteCase(id);
      return null;
    }
    return structuredClone(record);
  }

  async saveRoute(record: MvpCaseRecord, route: VerifiedCareRoute): Promise<void> {
    await this.saveCase({ ...record, route });
    if (record.demoSessionId) await this.tryDemoPersistence((client) => this.persistRoute(route, client));
    else await this.persistRoute(route);
  }

  async getRoute(caseId: string): Promise<VerifiedCareRoute | null> {
    return (await this.getCase(caseId))?.route ?? null;
  }

  async savePassport(passport: StoredPassport): Promise<StoredPassport> {
    const record = await this.getCase(passport.caseId);
    if (!record) throw new Error("PASSPORT_CASE_NOT_FOUND");
    if (record.demoSessionId) await this.tryDemoPersistence((client) => this.persistPassport(passport, client));
    else await this.persistPassport(passport);
    this.state.passports.set(passport.id, structuredClone(passport));
    return structuredClone(passport);
  }

  async getPassport(id: string): Promise<StoredPassport | null> {
    let value = this.state.passports.get(id);
    if (!value) value = await this.hydratePassport(id) ?? undefined;
    return value ? structuredClone(value) : null;
  }

  async latestPassportVersion(caseId: string, includePersistent = true): Promise<number> {
    let latest = 0;
    for (const value of this.state.passports.values()) {
      if (value.caseId === caseId) latest = Math.max(latest, value.snapshot.passport.version);
    }
    if (latest || !includePersistent) return latest;
    const isDemo = Boolean(this.state.cases.get(caseId)?.demoSessionId);
    try {
      const client = await this.clientFactory();
      if (!client) {
        if (isDemo) return 0;
        throw new StorePersistenceUnavailableError();
      }
      const versionQuery = Promise.resolve(
        client.from("case_passports")
          .select("version")
          .eq("case_id", caseId)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle(),
      );
      const { data, error } = isDemo
        ? await withTimeout(versionQuery, 1_000)
        : await versionQuery;
      if (error) {
        if (isDemo) return 0;
        throw error;
      }
      return Number(data?.version ?? 0);
    } catch (error) {
      if (isDemo) return 0;
      throw error;
    }
  }

  async createShare(passportId: string, expiresInHours = 72): Promise<{ token: string; expiresAt: string }> {
    const passport = await this.getPassport(passportId);
    if (!passport) throw new Error("PASSPORT_NOT_FOUND");
    if (!passport.snapshot.consent.shareAllowed) throw new Error("SHARE_CONSENT_REQUIRED");
    const boundedHours = Math.min(72, Math.max(1, Math.floor(expiresInHours || 72)));
    const token = randomBytes(32).toString("base64url");
    const tokenHash = sha256(token);
    const expiresAt = new Date(Date.now() + boundedHours * 3_600_000).toISOString();
    const record = await this.getCase(passport.caseId);
    if (!record) throw new Error("PASSPORT_CASE_NOT_FOUND");
    if (record.demoSessionId) {
      await this.tryDemoPersistence((client) => this.updatePassportShare(passportId, tokenHash, expiresAt, client));
    } else {
      await this.updatePassportShare(passportId, tokenHash, expiresAt);
    }
    this.state.shares.set(tokenHash, { tokenHash, passportId, expiresAt, revokedAt: null });
    return { token, expiresAt };
  }

  async getSharedPassport(token: string): Promise<StoredPassport | null> {
    const tokenHash = sha256(token);
    let share = this.state.shares.get(tokenHash);
    if (!share) share = await this.hydrateShare(tokenHash) ?? undefined;
    if (!share || share.revokedAt || Date.parse(share.expiresAt) <= Date.now()) return null;
    const passport = await this.getPassport(share.passportId);
    if (!passport || passport.revokedAt) return null;
    return passport;
  }

  async revokeShare(passportId: string): Promise<boolean> {
    const now = new Date().toISOString();
    const passport = await this.getPassport(passportId);
    if (passport) {
      const record = await this.getCase(passport.caseId);
      if (!record) throw new Error("PASSPORT_CASE_NOT_FOUND");
      if (record.demoSessionId) {
        await this.tryDemoPersistence((client) => this.revokePersistedShare(passportId, client));
      } else {
        await this.revokePersistedShare(passportId);
      }
    }
    let revoked = false;
    for (const [hash, share] of this.state.shares.entries()) {
      if (share.passportId !== passportId || share.revokedAt) continue;
      this.state.shares.set(hash, { ...share, revokedAt: now });
      revoked = true;
    }
    return revoked || Boolean(passport);
  }

  async saveFeedback(input: Omit<StoredFeedback, "id" | "submittedAt">): Promise<StoredFeedback> {
    const value: StoredFeedback = {
      ...input,
      id: randomUUID(),
      submittedAt: new Date().toISOString(),
    };
    const record = await this.getCase(value.caseId);
    if (!record) throw new Error("FEEDBACK_CASE_NOT_FOUND");
    if (record.demoSessionId) await this.tryDemoPersistence((client) => this.persistFeedback(value, true, client));
    else await this.persistFeedback(value, false);
    this.state.feedback.set(value.id, value);
    return structuredClone(value);
  }

  async saveEligibilityDecisions(caseId: string, values: StoredEligibilityDecision[]): Promise<void> {
    const record = await this.getCase(caseId);
    if (!record) throw new Error("ELIGIBILITY_CASE_NOT_FOUND");
    if (values.length) {
      const persist = async (client: SupabaseClient) => {
        const { error } = await client.from("eligibility_decisions").insert(values.map((value) => ({
        id: randomUUID(),
        case_id: caseId,
        rule_id: value.ruleId,
        benefit_id: value.benefitId,
        result: value.decision.result,
        input_facts: value.facts,
        trace: value.decision.trace,
        source_id: value.sourceId,
        decided_at: new Date().toISOString(),
      })));
        if (error) throw error;
      };
      if (record.demoSessionId) await this.tryDemoPersistence(persist);
      else await persist(await this.requireClient());
    }
    this.state.eligibility.set(caseId, structuredClone(values));
  }

  async getEligibilityDecisions(caseId: string): Promise<StoredEligibilityDecision[]> {
    return structuredClone(this.state.eligibility.get(caseId) ?? []);
  }

  async addAudit(caseId: string, eventType: string, payload: Record<string, unknown> = {}): Promise<AuditEntry> {
    const value: AuditEntry = {
      id: randomUUID(),
      caseId,
      eventType,
      payload: sanitizeAnalyticsPayload(payload),
      createdAt: new Date().toISOString(),
    };
    const record = await this.getCase(caseId);
    if (!record) throw new Error("AUDIT_CASE_NOT_FOUND");
    if (record.demoSessionId) await this.tryDemoPersistence((client) => this.persistAudit(value, client));
    else await this.persistAudit(value);
    this.state.audit.push(value);
    if (this.state.audit.length > 5_000) this.state.audit.splice(0, this.state.audit.length - 5_000);
    return value;
  }

  async getAudit(caseId: string): Promise<AuditEntry[]> {
    return this.state.audit.filter((value) => value.caseId === caseId).map((value) => structuredClone(value));
  }

  async resetDemo(demoSessionId: string): Promise<boolean> {
    const caseIds = [...this.state.cases.values()]
      .filter((record) => record.demoSessionId === demoSessionId)
      .map((record) => record.id);
    for (const caseId of caseIds) {
      await this.addAudit(caseId, "case_reset", { status: "closed" });
      await this.deleteCase(caseId);
    }
    await this.deletePersistedDemoSession(demoSessionId);
    return true;
  }

  async deleteCase(caseId: string): Promise<boolean> {
    const record = this.state.cases.get(caseId);
    if (record?.demoSessionId) {
      await this.tryDemoPersistence((client) => this.deletePersistedCase(caseId, client));
    } else if (record) {
      await this.deletePersistedCase(caseId);
    }
    this.state.cases.delete(caseId);
    this.state.owners.delete(caseId);
    const passportIds = [...this.state.passports.values()]
      .filter((passport) => passport.caseId === caseId)
      .map((passport) => passport.id);
    for (const id of passportIds) this.state.passports.delete(id);
    for (const [hash, share] of this.state.shares.entries()) if (passportIds.includes(share.passportId)) this.state.shares.delete(hash);
    for (const [id, value] of this.state.feedback.entries()) if (value.caseId === caseId) this.state.feedback.delete(id);
    this.state.eligibility.delete(caseId);
    this.state.audit = this.state.audit.filter((value) => value.caseId !== caseId);
    return Boolean(record);
  }

  private async persistCase(
    record: MvpCaseRecord,
    ownerUserId: string | null,
    injectedClient?: SupabaseClient,
  ): Promise<void> {
    const client = injectedClient ?? await this.requireClient();
    const { error } = await client.from("cases").upsert({
      id: record.id,
      user_id: ownerUserId,
      demo_session_id: record.demoSessionId,
      status: record.status,
      original_narrative: record.originalNarrative,
      patient_relation: record.extracted.patientRelation,
      age: record.extracted.age,
      sex: record.extracted.sex,
      scheme: record.extracted.scheme,
      area_code: record.extracted.area.code,
      preferred_time: record.extracted.preferredTime,
      current_lat: record.extracted.currentLocation?.lat ?? null,
      current_lng: record.extracted.currentLocation?.lng ?? null,
      updated_at: record.updatedAt,
      expires_at: record.expiresAt,
    });
    if (error) throw error;
    const { error: slotError } = await client.from("case_slots").upsert({
      case_id: record.id,
      slot_key: "mvp_case_snapshot",
      slot_value: record,
      source: "RULE_DERIVED",
      confidence: 1,
      confirmed: ["ready_for_review", "processing", "route_ready", "passport_ready"].includes(record.status),
      updated_at: record.updatedAt,
    });
    if (slotError) throw slotError;
  }

  private assertAccess(caseId: string, access?: CaseAccessContext): void {
    if (!access || access.internal) return;
    const owner = this.state.owners.get(caseId);
    if (!owner) throw new StoreAccessDeniedError();
    const allowed = owner.ownerUserId
      ? Boolean(access.ownerUserId && access.ownerUserId === owner.ownerUserId)
      : Boolean(owner.demoSessionId && access.demoSessionId === owner.demoSessionId);
    if (!allowed) throw new StoreAccessDeniedError();
  }

  private async hydrateCase(id: string): Promise<MvpCaseRecord | null> {
    try {
      const client = await this.clientFactory();
      if (!client) return null;
      const [{ data: row, error }, { data: slot, error: slotError }] = await Promise.all([
        client.from("cases").select("*").eq("id", id).maybeSingle(),
        client.from("case_slots").select("slot_value").eq("case_id", id).eq("slot_key", "mvp_case_snapshot").maybeSingle(),
      ]);
      if (error || slotError || !row || !slot?.slot_value) return null;
      const parsed = CaseRecordSchema.safeParse(slot.slot_value);
      if (!parsed.success) return null;
      this.state.cases.set(id, parsed.data);
      this.state.owners.set(id, {
        ownerUserId: typeof row.user_id === "string" ? row.user_id : null,
        demoSessionId: typeof row.demo_session_id === "string" ? row.demo_session_id : null,
      });
      return parsed.data;
    } catch { return null; }
  }

  private async hydratePassport(id: string): Promise<StoredPassport | null> {
    try {
      const client = await this.clientFactory();
      if (!client) return null;
      const { data, error } = await client.from("case_passports").select("id,case_id,snapshot,revoked_at").eq("id", id).maybeSingle();
      if (error || !data) return null;
      const snapshot = PassportSnapshotSchema.safeParse(data.snapshot);
      if (!snapshot.success) return null;
      const passport: StoredPassport = { id: String(data.id), caseId: String(data.case_id), snapshot: snapshot.data, revokedAt: typeof data.revoked_at === "string" ? data.revoked_at : null };
      this.state.passports.set(id, passport);
      return passport;
    } catch { return null; }
  }

  private async hydrateShare(tokenHash: string): Promise<ShareRecord | null> {
    try {
      const client = await this.clientFactory();
      if (!client) return null;
      const now = new Date().toISOString();
      const { data, error } = await client
        .from("case_passports")
        .select("id,case_id,snapshot,revoked_at,share_expires_at")
        .eq("share_token_hash", tokenHash)
        .is("revoked_at", null)
        .gt("share_expires_at", now)
        .maybeSingle();
      if (error || !data || typeof data.share_expires_at !== "string") return null;
      const snapshot = PassportSnapshotSchema.safeParse(data.snapshot);
      if (!snapshot.success) return null;
      const passport: StoredPassport = { id: String(data.id), caseId: String(data.case_id), snapshot: snapshot.data, revokedAt: null };
      this.state.passports.set(passport.id, passport);
      const share: ShareRecord = { tokenHash, passportId: passport.id, expiresAt: data.share_expires_at, revokedAt: null };
      this.state.shares.set(tokenHash, share);
      return share;
    } catch { return null; }
  }

  private async persistRoute(route: VerifiedCareRoute, injectedClient?: SupabaseClient): Promise<void> {
    const client = injectedClient ?? await this.requireClient();
    const rows = [
      route.primary ? { type: "PRIMARY", facility: route.primary } : null,
      route.backup ? { type: "BACKUP", facility: route.backup } : null,
      route.emergency ? { type: "EMERGENCY", facility: null } : null,
    ].filter((row): row is NonNullable<typeof row> => Boolean(row));
    if (!rows.length) return;
    const { error } = await client.from("care_routes").insert(rows.map((row, index) => ({
      id: index === 0 ? route.id : randomUUID(),
      case_id: route.caseId,
      route_type: row.type,
      facility_id: row.facility?.facilityId ?? null,
      service_ids: row.facility ? [row.facility.serviceId] : ["svc:emergency-response"],
      urgency: route.urgency,
      score: row.facility?.score ?? 100,
      score_breakdown: row.facility?.scoreBreakdown ?? {},
      why_selected: row.facility?.whySelected ?? route.whyThisRoute.safety,
      cost_summary: row.facility ? { text: row.facility.costSummary } : {},
      preparation_items: route.preparationItems,
      evidence_ids: row.facility?.evidenceIds ?? route.evidence.map((item) => item.id),
      created_at: route.generatedAt,
    })));
    if (error) throw error;
  }

  private async persistPassport(passport: StoredPassport, injectedClient?: SupabaseClient): Promise<void> {
    const client = injectedClient ?? await this.requireClient();
    const { error } = await client.from("case_passports").insert({
      id: passport.id,
      case_id: passport.caseId,
      passport_code: passport.snapshot.passport.code,
      version: passport.snapshot.passport.version,
      snapshot: passport.snapshot,
      created_at: passport.snapshot.passport.createdAt,
      revoked_at: passport.revokedAt,
    });
    if (error) throw error;
  }

  private async updatePassportShare(
    id: string,
    tokenHash: string,
    expiresAt: string,
    injectedClient?: SupabaseClient,
  ): Promise<void> {
    const client = injectedClient ?? await this.requireClient();
    const { data, error } = await client.from("case_passports")
      .update({ share_token_hash: tokenHash, share_expires_at: expiresAt, revoked_at: null })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("PASSPORT_SHARE_UPDATE_FAILED");
  }

  private async revokePersistedShare(id: string, injectedClient?: SupabaseClient): Promise<void> {
    const client = injectedClient ?? await this.requireClient();
    const { data, error } = await client.from("case_passports")
      .update({ share_token_hash: null, share_expires_at: null })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("PASSPORT_SHARE_REVOKE_FAILED");
  }

  private async persistFeedback(
    value: StoredFeedback,
    isDemo: boolean,
    injectedClient?: SupabaseClient,
  ): Promise<void> {
    const client = injectedClient ?? await this.requireClient();
    const { error } = await client.from("facility_access_feedback").insert({
      id: value.id,
      case_id: value.caseId,
      facility_id: value.facilityId,
      route_id: value.routeId,
      outcome: value.outcome,
      right_accepted: value.rightAccepted,
      notes: value.discrepancy,
      submitted_at: value.submittedAt,
      moderation_status: isDemo ? "DEMO_APPROVED" : "PENDING",
      is_demo: isDemo,
    });
    if (error) throw error;
  }

  private async persistAudit(value: AuditEntry, injectedClient?: SupabaseClient): Promise<void> {
    const client = injectedClient ?? await this.requireClient();
    const { error } = await client.from("audit_events").insert({ id: value.id, case_id: value.caseId, event_type: value.eventType, payload: value.payload, created_at: value.createdAt });
    if (error) throw error;
  }

  private async deletePersistedCase(caseId: string, injectedClient?: SupabaseClient): Promise<void> {
    const client = injectedClient ?? await this.requireClient();
    const { error } = await client.from("cases").delete().eq("id", caseId);
    if (error) throw error;
  }

  private async requireClient(): Promise<SupabaseClient> {
    const client = await this.clientFactory();
    if (!client) throw new StorePersistenceUnavailableError();
    return client;
  }

  private async tryDemoPersistence(
    operation: (client: SupabaseClient) => Promise<void>,
  ): Promise<void> {
    if (!this.persistDemo) return;
    try {
      const client = await this.clientFactory();
      if (client) await withTimeout(operation(client), 1_000);
    } catch {
      // Demo is deliberately available without infrastructure. The browser
      // session cache and in-process state remain the final booth fallback.
    }
  }

  private async deletePersistedDemoSession(demoSessionId: string): Promise<void> {
    if (!this.persistDemo) return;
    const client = await this.clientFactory();
    if (!client) return;
    const { error } = await client.from("cases").delete().eq("demo_session_id", demoSessionId);
    if (error) throw error;
  }
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("DEMO_PERSISTENCE_TIMEOUT")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function sanitizeAnalyticsPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const blocked = new Set(["narrative", "originalNarrative", "original_narrative", "message", "content", "story"]);
  return Object.fromEntries(Object.entries(payload).filter(([key, value]) => !blocked.has(key) && typeof value !== "object"));
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function configuredClient(): Promise<SupabaseClient | null> {
  try {
    const { adminClient } = await import("@/lib/supabase/server");
    return adminClient();
  } catch {
    return null;
  }
}
