/* eslint-disable no-console */
// =============================================================================
// demo:check — coverage runner (spec §6): static → unit → scenario → invariant
// ใช้: npm run demo:check [-- --skip-scenario] [-- --category=golden,safety]
//      [-- --limit=10] [-- --base=http://localhost:3000]
// หลักการ: assert โครงสร้าง/invariant ของ structured output เท่านั้น
// ผลสรุปเขียนลง reports/demo-coverage.md — เกณฑ์ผ่าน: golden/safety/static 100%,
// matrix+adversarial ≥95%
// =============================================================================
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import type { Fixture, FixtureTurn } from "../tests/demo/types";

const ROOT = path.resolve(__dirname, "..");
const FIXTURES_DIR = path.join(ROOT, "tests", "fixtures");
const REPORT_PATH = path.join(ROOT, "reports", "demo-coverage.md");

// ---- CLI ---------------------------------------------------------------------
const args = process.argv.slice(2);
const flag = (name: string): string | undefined =>
  args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const has = (name: string): boolean => args.includes(`--${name}`);
// พอร์ตเฉพาะของ runner — เลี่ยงชน dev server อื่น/Docker ที่มักครอง 3000/3100
const DEFAULT_PORT = 3457;
const BASE = flag("base") ?? process.env.DEMO_CHECK_BASE ?? `http://localhost:${DEFAULT_PORT}`;
const CATEGORY_FILTER = flag("category")?.split(",");
const ONLY_IDS = flag("only")?.split(",");
const LIMIT = flag("limit") ? parseInt(flag("limit")!, 10) : undefined;
const SKIP_SCENARIO = has("skip-scenario");

// ---- .env.local loader (tsx ไม่ autoload เหมือน Next) ------------------------
function loadEnvLocal(): void {
  for (const file of [".env.local", ".env"]) {
    const p = path.join(ROOT, file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  }
}
loadEnvLocal();

// ---- results collection ------------------------------------------------------
interface CheckResult {
  id: string;
  category: string;
  pass: boolean;
  reasons: string[];
  turnMs: number[];
}
const results: CheckResult[] = [];
const staticFailures: string[] = [];
let unitPassed = false;
let unitSummary = "";
const facilityTop1: Record<string, string> = {};
const responsesById: Record<string, unknown[]> = {};

// =============================================================================
// PHASE 1 — static tests (§6.5) — กันการโกงตัวเอง
// =============================================================================
const SRC_DIRS = ["app", "components", "lib"].map((d) => path.join(ROOT, d));
// booth demo corner (จงใจคงไว้ ไม่ลิงก์จาก production UI) — นอกขอบเขต banned sweep
const DEMO_CORNER = [
  "app/demo/",
  "app/liff/demo/",
  "app/api/demo/",
  "components/mvp/",
  "app/api/cases/",
  "lib/mvp/",
  "lib/client/mvpApi.ts",
];

function* walkSource(): Generator<string> {
  const stack = [...SRC_DIRS];
  while (stack.length) {
    const dir = stack.pop()!;
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(p);
      else if (/\.(ts|tsx)$/.test(entry.name)) yield p;
    }
  }
}

function relPath(p: string): string {
  return path.relative(ROOT, p);
}

function isDemoCorner(rel: string): boolean {
  return DEMO_CORNER.some((c) => rel.startsWith(c) || rel.includes(`/${c}`));
}

function runStaticChecks(fixtures: Fixture[]): void {
  // 1) golden strings ต้องไม่อยู่ใน source ของแอป (มีได้เฉพาะ tests/fixtures)
  const goldenStrings = fixtures
    .filter((f) => f.category === "golden" || f.category === "paraphrase")
    .flatMap((f) => f.turns.map((t) => t.user).filter((u): u is string => !!u && u.length >= 15));
  // 2) banned UI strings ใน source ที่ผู้ใช้เห็น (นอก demo corner, ข้าม comment)
  const bannedUi = /โหมดสาธิต|สำหรับการสาธิต|เวอร์ชันสาธิต|for demonstration|lorem ipsum/;
  // 3) tel: ต้องผูก user tap เท่านั้น — ไม่มี auto-dial
  const autoDial = /(location\.href\s*=\s*["'`]tel:|window\.open\(\s*["'`]tel:|location\.assign\(\s*["'`]tel:)/;

  // lib/guardian/choices.ts เก็บ "ข้อความสังเคราะห์" ที่ popup ยิงเข้า /api/turn
  // (spec §2 อนุญาต — เป็น INPUT generator ของ trigger seam ไม่ใช่คำตอบสำเร็จรูป)
  const GOLDEN_STRING_WHITELIST = ["lib/guardian/choices.ts"];
  for (const file of walkSource()) {
    const rel = relPath(file);
    const content = fs.readFileSync(file, "utf8");
    if (!GOLDEN_STRING_WHITELIST.includes(rel)) {
      for (const g of goldenStrings) {
        if (content.includes(g)) staticFailures.push(`golden string ใน source: ${rel} — "${g.slice(0, 40)}…"`);
      }
    }
    if (autoDial.test(content)) staticFailures.push(`auto-dial pattern ใน ${rel}`);
    if (isDemoCorner(rel)) continue;
    content.split("\n").forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
      if (bannedUi.test(line)) staticFailures.push(`banned UI string: ${rel}:${i + 1}`);
    });
  }
}

// =============================================================================
// PHASE 2 — unit tests (vitest — rule engine, safety gate, boundary, features)
// =============================================================================
function runUnitTests(): void {
  try {
    const out = execSync("npx vitest run tests/unit 2>&1", {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 300_000,
    });
    unitPassed = true;
    unitSummary = out.split("\n").filter((l) => /Test Files|Tests /.test(l)).join(" · ").trim();
  } catch (e) {
    unitPassed = false;
    const out = (e as { stdout?: string }).stdout ?? String(e);
    unitSummary = out.split("\n").slice(-14).join("\n");
  }
}

// =============================================================================
// PHASE 3 — scenario tests (API-level, §6.3)
// =============================================================================
interface TurnResponseLite {
  understood?: Record<string, unknown>;
  questions?: { field: string; label: string; options: string[]; show_if?: unknown }[];
  pending_question?: string | null;
  cards?: { type: string; [k: string]: unknown }[];
  error?: { message_th?: string };
}

let token = "";
let devServer: ChildProcess | null = null;

async function ensureServer(): Promise<boolean> {
  // probe ต้องยืนยันว่าเป็นแอปของเราจริง (ok:true + app) — พอร์ตอาจถูกครอง
  // โดยโปรเจกต์อื่นที่ตอบ 200 เหมือนกัน
  const probe = async () => {
    try {
      const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return false;
      const body = (await res.json().catch(() => null)) as { ok?: boolean; app?: string } | null;
      return body?.ok === true && typeof body.app === "string";
    } catch {
      return false;
    }
  };
  if (await probe()) return true;
  const port = new URL(BASE).port || String(DEFAULT_PORT);
  console.log(`· dev server ยังไม่รัน — กำลังสตาร์ทชั่วคราวที่พอร์ต ${port}…`);
  devServer = spawn("npx", ["next", "dev", "--port", port], {
    cwd: ROOT,
    stdio: "ignore",
    detached: true,
    env: { ...process.env, RATE_LIMIT_DISABLED: "1" },
  });
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    if (await probe()) return true;
  }
  return false;
}

function stopServer(): void {
  if (devServer?.pid) {
    try {
      process.kill(-devServer.pid, "SIGTERM");
    } catch {
      devServer.kill("SIGTERM");
    }
  }
}

async function signIn(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return false;
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInAnonymously();
  if (error || !data.session) {
    console.error("· anonymous sign-in ล้มเหลว:", error?.message);
    return false;
  }
  token = data.session.access_token;
  return true;
}

async function api<T>(pathName: string, body: unknown): Promise<{ status: number; json: T; ms: number }> {
  const started = Date.now();
  const call = () =>
    fetch(`${BASE}${pathName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
  let res = await call();
  // server ภายนอกที่เปิด rate limit อยู่ → รอ window แล้วลองอีกครั้ง
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 8_000));
    res = await call();
  }
  const json = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, json, ms: Date.now() - started };
}

function classifyRoute(res: TurnResponseLite): "emergency" | "clarify" | "cards" | "boundary" {
  const cards = res.cards ?? [];
  if (cards.some((c) => c.type === "safety" && (c as { level?: string }).level === "emergency")) return "emergency";
  if (res.questions?.length) return "clarify";
  if (cards.some((c) => c.type === "evidence")) return "cards";
  return "boundary";
}

function responseText(res: TurnResponseLite): string {
  return JSON.stringify({ q: res.pending_question, cards: res.cards, questions: res.questions });
}

/** invariant sweep (§6.4) — ใช้กับ response สุดท้ายของทุก fixture */
function invariantFailures(res: TurnResponseLite, route: string): string[] {
  const fails: string[] = [];
  const text = responseText(res);
  const cards = res.cards ?? [];
  // 1) actionable next step เสมอ
  const actionable =
    route === "clarify" ||
    !!res.pending_question ||
    cards.some(
      (c) =>
        c.type === "next_steps" ||
        c.type === "facility" ||
        (c.type === "safety" && Array.isArray((c as { actions?: unknown[] }).actions) && ((c as { actions?: unknown[] }).actions?.length ?? 0) > 0)
    );
  if (!actionable) fails.push("invariant: ไม่มี actionable next step");
  // 2) banned strings
  if (/เป็นโรค[^"]{0,20}แน่นอน|วินิจฉัยว่า(คุณ|ผู้ป่วย)เป็น|โหมดสาธิต|for demonstration/.test(text))
    fails.push("invariant: banned string ใน response");
  // 3) การ์ดสิทธิ์ → evidence ต้องมี citation
  const claimsRights = cards.some((c) => c.type === "rights" || c.type === "benefit");
  const evidence = cards.find((c) => c.type === "evidence") as { sources?: unknown[] } | undefined;
  if (claimsRights && !(evidence?.sources?.length ?? 0))
    fails.push("invariant: อ้างสิทธิ์แต่ evidence ไม่มี citation");
  // 4) ไม่มี dosing ตัวเลขยาเฉพาะบุคคล
  if (/(กิน|ทาน|รับประทาน)[^"]{0,25}(วันละ|ครั้งละ)\s*\d+\s*(เม็ด|มก|mg|ช้อน)/.test(text))
    fails.push("invariant: พบ dosing เฉพาะบุคคล");
  return fails;
}

async function runTurnFixture(f: Fixture): Promise<CheckResult> {
  const r: CheckResult = { id: f.id, category: f.category, pass: true, reasons: [], turnMs: [] };
  try {
    const session = await api<{ session_id: string }>("/api/session", { channel: "web" });
    const sessionId = session.json.session_id;
    if (!sessionId) throw new Error(`สร้าง session ไม่ได้ (${session.status})`);

    let last: TurnResponseLite = {};
    let lastStatus = 200;
    const allResponses: TurnResponseLite[] = [];

    for (const turn of f.turns) {
      // answer-turn ที่ไม่มีคำถามค้าง = flow จบก่อนกำหนด (เช่น คำถามครบใน
      // รอบเดียว) — ข้าม turn ที่เหลือได้เลย ไม่ใช่ความผิดพลาด
      if (!turn.user && !last.questions?.length) break;
      const input = buildInput(turn, last, f.expect.slotsEqual);
      const res = await api<TurnResponseLite>("/api/turn", { session_id: sessionId, input });
      r.turnMs.push(res.ms);
      lastStatus = res.status;
      last = res.json;
      allResponses.push(last);
      if (res.status >= 500) throw new Error(`turn ${res.status}`);
    }
    responsesById[f.id] = allResponses;

    // เคสเลขบัตรประชาชน (400 + copy PDPA) — นับเป็น boundary
    if (lastStatus === 400 && last.error?.message_th) {
      if (f.expect.finalRoute !== "boundary") r.reasons.push(`คาด ${f.expect.finalRoute} ได้ 400`);
      if (f.expect.mustMatch?.length) {
        for (const m of f.expect.mustMatch)
          if (!new RegExp(m).test(last.error.message_th)) r.reasons.push(`mustMatch ไม่พบ: ${m}`);
      }
      r.pass = r.reasons.length === 0;
      return r;
    }

    const route = classifyRoute(last);
    const allowedRoutes = f.expect.finalRouteAnyOf ?? [f.expect.finalRoute];
    if (!allowedRoutes.includes(route)) {
      // แนบเนื้อ safety card ไว้วินิจฉัย (มาจาก precheck หรือ prescreen rails)
      const safety = (last.cards ?? []).find((c) => c.type === "safety") as
        | { title?: string; body?: string }
        | undefined;
      r.reasons.push(
        `route คาด ${allowedRoutes.join("|")} ได้ ${route}` +
          (safety ? ` — [${safety.title}] ${String(safety.body).slice(0, 160)}` : "")
      );
    }
    // เส้นทางที่ยอมรับ emergency: การ์ด evidence/next_steps และ citation ไม่บังคับ
    const endedEmergency = route === "emergency" && allowedRoutes.includes("emergency");

    // emergencyWithinSameTurn: ทุก turn ที่ user มี red flag → response turn นั้นมี emergency card
    if (f.expect.emergencyWithinSameTurn) {
      const emergencyIdx = allResponses.findIndex((res) =>
        (res.cards ?? []).some((c) => c.type === "safety" && (c as { level?: string }).level === "emergency")
      );
      if (emergencyIdx !== f.turns.length - 1)
        r.reasons.push(`emergency ไม่ได้มาใน turn เดียวกัน (มาที่ turn ${emergencyIdx + 1}/${f.turns.length})`);
    }

    const cards = last.cards ?? [];
    for (const t of f.expect.cardTypesInclude ?? []) {
      if (endedEmergency) break; // emergency short-circuit — การ์ดชุดเต็มไม่บังคับ
      if (!cards.some((c) => c.type === t)) r.reasons.push(`ขาดการ์ด ${t}`);
    }
    for (const t of f.expect.cardTypesExclude ?? []) {
      if (cards.some((c) => c.type === t)) r.reasons.push(`มีการ์ดต้องห้าม ${t}`);
    }
    if (f.expect.slotsEqual) {
      const u = last.understood ?? {};
      for (const [k, v] of Object.entries(f.expect.slotsEqual)) {
        const actual = u[k];
        const ok =
          typeof v === "string"
            ? String(actual ?? "").includes(v) || v.includes(String(actual ?? " "))
            : actual === v;
        if (!ok) r.reasons.push(`slot ${k}: คาด ${JSON.stringify(v)} ได้ ${JSON.stringify(actual)}`);
      }
    }
    if (f.expect.maxQuestions != null) {
      for (const res of allResponses) {
        const main = (res.questions ?? []).filter((q) => !q.show_if).length;
        if (main > f.expect.maxQuestions)
          r.reasons.push(`panel มี ${main} คำถาม (เกิน ${f.expect.maxQuestions})`);
      }
    }
    const fullText = allResponses.map(responseText).join("\n");
    for (const m of f.expect.mustNotMatch ?? []) {
      if (new RegExp(m, "i").test(fullText)) r.reasons.push(`mustNotMatch เจอ: ${m}`);
    }
    for (const m of f.expect.mustMatch ?? []) {
      if (!new RegExp(m, "i").test(fullText)) r.reasons.push(`mustMatch ไม่พบ: ${m}`);
    }
    if (f.expect.citationsRequired && !endedEmergency) {
      const evidence = cards.find((c) => c.type === "evidence") as { sources?: { url?: string }[] } | undefined;
      if (!(evidence?.sources?.length ?? 0)) r.reasons.push("citationsRequired: evidence ว่าง");
    }
    const fac = cards.find((c) => c.type === "facility") as { items?: { facility_id?: string }[] } | undefined;
    if (fac?.items?.[0]?.facility_id) facilityTop1[f.id] = fac.items[0].facility_id;
    if (f.expect.facilityTop1SameAs) {
      const other = facilityTop1[f.expect.facilityTop1SameAs];
      const mine = facilityTop1[f.id];
      if (other && mine && other !== mine)
        r.reasons.push(`facility top1 ต่างจาก ${f.expect.facilityTop1SameAs} (${mine} vs ${other})`);
    }
    r.reasons.push(...invariantFailures(last, route));
  } catch (e) {
    r.reasons.push(`error: ${(e as Error).message}`);
  }
  r.pass = r.reasons.length === 0;
  return r;
}

// auto-answer ต้องเลือกตัวเลือก "เชิงปฏิเสธ/กลาง" ก่อนเสมอ — ตัวเลือกแรกของ
// คำถาม clinical อาจเป็นอาการอันตราย (เช่น "แน่นหน้าอก") ซึ่งจะทำให้ harness
// สร้างเคสฉุกเฉินปลอมโดยไม่ตั้งใจ
function pickNeutralOption(options: string[]): string {
  const danger =
    /หน้าอก|หายใจ|หมดสติ|ชัก|อ่อนแรง|เลือด|รุนแรง|ทนไม่ไหว|แย่ลง|เฉียบพลัน|chest|breath|conscious|seizure|bleed|severe/i;
  return (
    // 1) ตัวเลือก "ไม่แน่ใจ" ตรง ๆ (กันไปจับ substring "ไม่มี..." ในตัวเลือกอื่น)
    options.find((o) => /^ไม่แน่ใจ|^ไม่ทราบ/.test(o.trim())) ??
    // 2) ปฏิเสธชัดเจน
    options.find((o) => /^(ไม่มี|ไม่ใช่|ไม่เป็น|ปกติ|no(ne)?\b|not sure|normal)/i.test(o.trim())) ??
    options.find((o) => /none of|no symptoms|ไม่มีอาการ/i.test(o)) ??
    // 3) ระดับเบาสุด — กัน harness ตอบ "ปวดรุนแรงมาก" เองจนกลายเป็นเคสฉุกเฉินปลอม
    options.find((o) => /เล็กน้อย|นิดหน่อย|เบา ?ๆ?|พอทน|ทนได้|ปานกลาง|mild|moderate/i.test(o) && !danger.test(o)) ??
    // 4) ตัวแรกที่ไม่มีคีย์เวิร์ดอันตราย
    options.find((o) => !danger.test(o)) ??
    options[0] ??
    ""
  );
}

function buildInput(
  turn: FixtureTurn,
  prev: TurnResponseLite,
  slots?: Record<string, unknown>
): Record<string, unknown> {
  if (turn.answers || (prev.questions?.length && !turn.user)) {
    const answers: Record<string, string> = {};
    for (const q of prev.questions ?? []) {
      const provided = turn.answers?.[q.field];
      // demographic ที่ persona ของ fixture รู้ค่าจริง (slotsEqual) → ตอบตามจริง
      // กัน NLU variance รอบที่สกัดไม่ติดแล้ว harness ไปมั่วค่าเอง
      const fromPersona =
        provided === undefined && slots && q.field in slots ? String(slots[q.field]) : undefined;
      answers[q.field] = provided ?? fromPersona ?? pickNeutralOption(q.options);
    }
    for (const [k, v] of Object.entries(turn.answers ?? {})) answers[k] = v;
    return { type: "answers", answers, text: Object.values(answers).join(" · ") };
  }
  return { type: "text", text: turn.user ?? "" };
}

async function runGuardianFixture(f: Fixture): Promise<CheckResult> {
  const r: CheckResult = { id: f.id, category: f.category, pass: true, reasons: [], turnMs: [] };
  const simEnabled = process.env.NEXT_PUBLIC_GUARDIAN_SIM === "1";
  try {
    let eventId = "";
    for (const step of f.guardian?.steps ?? []) {
      if (step.action === "signal") {
        const res = await api<{ event_id: string; suppressed: boolean }>("/api/guardian/event", {
          action: "signal",
          pattern: f.guardian!.pattern,
          source: "simulated",
          confidence: 0.9,
        });
        r.turnMs.push(res.ms);
        if (res.status !== 200) throw new Error(`signal ${res.status}`);
        eventId = res.json.event_id;
        if (step.expectSuppressed !== undefined) {
          // 'auto' = ตาม env: sim เปิด → override ไม่ suppress; sim ปิด → cooldown ทำงาน
          const expected = step.expectSuppressed === "auto" ? !simEnabled : step.expectSuppressed;
          if (res.json.suppressed !== expected)
            r.reasons.push(`suppressed คาด ${expected} ได้ ${res.json.suppressed}`);
        }
      } else if (step.action === "update") {
        const res = await api("/api/guardian/event", {
          action: "update",
          event_id: eventId,
          outcome: step.outcome,
          ...(step.chosen_symptom ? { chosen_symptom: step.chosen_symptom } : {}),
          ...(step.payload ? { payload: step.payload } : {}),
        });
        r.turnMs.push(res.ms);
        if (res.status !== 200) r.reasons.push(`update ${step.outcome} → ${res.status}`);
      } else if (step.action === "er_passport") {
        const session = await api<{ session_id: string }>("/api/session", { channel: "web" });
        const res = await api<{ status: string; passport?: unknown }>("/api/passport", {
          session_id: session.json.session_id,
          mode: "emergency",
          emergency: step.emergency,
        });
        r.turnMs.push(res.ms);
        const text = JSON.stringify(res.json);
        if (res.status !== 200 || (res.json as { status?: string }).status !== "ready")
          r.reasons.push(`er_passport ไม่ ready (${res.status})`);
        for (const m of step.mustMatch) {
          if (!new RegExp(m).test(text)) r.reasons.push(`er_passport mustMatch ไม่พบ: ${m}`);
        }
      }
    }
  } catch (e) {
    r.reasons.push(`error: ${(e as Error).message}`);
  }
  r.pass = r.reasons.length === 0;
  return r;
}

// =============================================================================
// report + thresholds
// =============================================================================
function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function writeReport(scenarioRan: boolean): { ok: boolean; summary: string } {
  const byCat = new Map<string, CheckResult[]>();
  for (const r of results) {
    byCat.set(r.category, [...(byCat.get(r.category) ?? []), r]);
  }
  const allMs = results.flatMap((r) => r.turnMs);
  const lines: string[] = [
    "# Demo coverage report",
    "",
    `- รันเมื่อ: ${new Date().toISOString()}`,
    `- base: ${BASE} · scenario: ${scenarioRan ? "รัน" : "ข้าม"}`,
    "",
    "## Static checks (§6.5)",
    staticFailures.length ? staticFailures.map((s) => `- ❌ ${s}`).join("\n") : "- ✅ ผ่านทั้งหมด (golden strings / banned UI strings / no auto-dial)",
    "",
    "## Unit tests (§6.2)",
    unitPassed ? `- ✅ ${unitSummary}` : `- ❌ ล้มเหลว\n\n\`\`\`\n${unitSummary}\n\`\`\``,
    "",
    "## Scenario (§6.3) — ผลรายหมวด",
    "",
    "| หมวด | ผ่าน | ทั้งหมด | % |",
    "|---|---|---|---|",
  ];
  let ok = staticFailures.length === 0 && unitPassed;
  const catRates: string[] = [];
  for (const [cat, rs] of byCat) {
    const passed = rs.filter((r) => r.pass).length;
    const pct = rs.length ? Math.round((passed / rs.length) * 100) : 100;
    lines.push(`| ${cat} | ${passed} | ${rs.length} | ${pct}% |`);
    catRates.push(`${cat} ${pct}%`);
    const threshold = cat === "golden" || cat === "safety" ? 100 : 95;
    if (scenarioRan && pct < threshold) ok = false;
  }
  if (!scenarioRan) lines.push("| (scenario ถูกข้าม) | – | – | – |");
  lines.push(
    "",
    `## เวลา (บนเครื่องที่รัน — full turn, non-streaming)`,
    `- p50: ${percentile(allMs, 50)}ms · p95: ${percentile(allMs, 95)}ms · max: ${Math.max(0, ...allMs)}ms`,
    "- first-byte จริงวัดผ่าน streaming ใน QA-CHECKLIST (เครื่องจริง)",
    "",
    "## Fixtures ที่ตก",
    ""
  );
  const failed = results.filter((r) => !r.pass);
  if (!failed.length) lines.push("- ไม่มี 🎉");
  for (const r of failed) {
    lines.push(`### ${r.id} (${r.category})`);
    for (const reason of r.reasons) lines.push(`- ${reason}`);
    lines.push("");
  }
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, lines.join("\n"));
  return { ok, summary: catRates.join(" · ") };
}

// =============================================================================
// main
// =============================================================================
async function main(): Promise<void> {
  const files = fs.readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".json"));
  let fixtures: Fixture[] = files.flatMap(
    (f) => JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, f), "utf8")) as Fixture[]
  );
  if (CATEGORY_FILTER) fixtures = fixtures.filter((f) => CATEGORY_FILTER.includes(f.category));
  if (ONLY_IDS) fixtures = fixtures.filter((f) => ONLY_IDS.includes(f.id));
  console.log(`fixtures: ${fixtures.length} จาก ${files.length} ไฟล์`);

  console.log("— PHASE 1: static checks");
  runStaticChecks(fixtures);
  console.log(staticFailures.length ? `  ❌ ${staticFailures.length} ปัญหา` : "  ✅ ผ่าน");

  console.log("— PHASE 2: unit tests");
  runUnitTests();
  console.log(unitPassed ? `  ✅ ${unitSummary}` : "  ❌ ล้มเหลว");

  let scenarioRan = false;
  if (!SKIP_SCENARIO) {
    console.log("— PHASE 3: scenario");
    const serverOk = await ensureServer();
    const authOk = serverOk && (await signIn());
    if (!serverOk) console.error("  ❌ ต่อ dev server ไม่ได้ — ข้าม scenario");
    else if (!authOk) console.error("  ❌ auth ไม่ได้ — ข้าม scenario");
    else {
      scenarioRan = true;
      const toRun = LIMIT ? fixtures.slice(0, LIMIT) : fixtures;
      // golden ก่อน (paraphrase ต้องเทียบ facilityTop1 กับ golden)
      toRun.sort((a, b) => (a.category === "golden" ? -1 : 0) - (b.category === "golden" ? -1 : 0));
      for (const f of toRun) {
        const r = f.kind === "guardian" ? await runGuardianFixture(f) : await runTurnFixture(f);
        results.push(r);
        console.log(`  ${r.pass ? "✅" : "❌"} ${f.id}${r.pass ? "" : ` — ${r.reasons[0]}`}`);
      }
    }
  }

  const { ok, summary } = writeReport(scenarioRan);
  console.log(`\nรายงาน: ${relPath(REPORT_PATH)}${summary ? ` · ${summary}` : ""}`);
  stopServer();
  // scenario ที่ "ตั้งใจรันแต่รันไม่ได้" = ไม่ผ่าน (ห้ามเงียบแล้วรายงานเขียว)
  if (!ok || (!SKIP_SCENARIO && !scenarioRan)) {
    console.error("demo:check ไม่ผ่านเกณฑ์");
    process.exit(1);
  }
  console.log(`demo:check ผ่านเกณฑ์ ✅${SKIP_SCENARIO ? " (ข้าม scenario ตามที่สั่ง)" : ""}`);
}

main().catch((e) => {
  console.error(e);
  stopServer();
  process.exit(1);
});
