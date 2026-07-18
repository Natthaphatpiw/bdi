"use client";
// HomeScreen — one-shot case intake. The product creates a Case Passport and
// result dashboard from a health story; chat is only a follow-up assistant.
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, FileText, History, Loader2, MapPin, Pencil, ShieldCheck, UserRound } from "lucide-react";
import { QuestionPanel } from "@/components/chat/QuestionPanel";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { createSession, turn } from "@/lib/client/api";
import type { Scheme, TurnQuestion, Understood } from "@/lib/types";
import { useToast } from "@/store/toast";
import { useUi } from "@/store/ui";
import { useAuth } from "@/lib/client/auth";
import { cn } from "@/lib/cn";

interface Props {
  surface: "web" | "line";
  basePath: string;
}

type Flow = "input" | "questions" | "review" | "submitting";

const EXAMPLE =
  "พ่ออายุ 68 เป็นเบาหวาน น้ำตาลขึ้นบ่อย อยู่บางกะปิ ใช้บัตรทอง ต้องไปไหน";
const EXAMPLES = [
  EXAMPLE,
  "ฉันอายุ 26 เพลียมาก ปัสสาวะบ่อย กระหายน้ำ อยู่ลาดพร้าว ประกันสังคม",
  "แม่ความดันสูง เวียนหัว อยู่ห้วยขวาง ไม่แน่ใจว่าสิทธิอะไร",
];
const ROLE_OPTIONS = ["ผู้ป่วยเอง", "พ่อแม่", "ลูก", "ญาติ"];
const SCHEME_OPTIONS = [
  { label: "บัตรทอง", value: "บัตรทอง" },
  { label: "ประกันสังคม", value: "ประกันสังคม" },
  { label: "ข้าราชการ", value: "ข้าราชการ" },
  { label: "ไม่แน่ใจ", value: "ไม่แน่ใจ" },
];
const AREA_OPTIONS = ["บางกะปิ", "ลาดพร้าว", "ห้วยขวาง", "วังทองหลาง"];

const SCHEME_LABEL: Record<Scheme, string> = {
  UCS: "บัตรทอง",
  SSS: "ประกันสังคม",
  CSMBS: "ข้าราชการ",
};

function schemeFromDraft(v?: string): string {
  if (!v) return "";
  if (v === "UCS" || v === "SSS" || v === "CSMBS") return SCHEME_LABEL[v];
  return v;
}

function ReviewField({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-btn border border-hairline bg-surface p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
        {icon}
        {label}
        <Pencil className="ml-auto h-3.5 w-3.5" aria-hidden="true" />
      </div>
      {children}
    </div>
  );
}

export function HomeScreen({ surface, basePath }: Props) {
  const router = useRouter();
  const toast = useToast();
  const { displayName } = useAuth();
  const setSessionId = useUi((s) => s.setSessionId);

  const [flow, setFlow] = useState<Flow>("input");
  const [session, setSession] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [role, setRole] = useState("ผู้ป่วยเอง");
  const [scheme, setScheme] = useState("");
  const [area, setArea] = useState("");
  const [questions, setQuestions] = useState<TurnQuestion[]>([]);
  const [questionsKey, setQuestionsKey] = useState(0);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const busy = flow === "submitting";
  const resultHref = session ? `${basePath}/case/${session}/result` : "";

  const canSubmit = text.trim().length >= 8 && !busy;

  function setReviewState(u: Understood) {
    setDraft({
      patient_role: (u.patient_role as string | undefined) ?? role,
      age: typeof u.age === "number" ? String(u.age) : "",
      scheme: schemeFromDraft(u.scheme as string | undefined) || scheme,
      area: (u.area as string | undefined) ?? area,
      symptoms: (u.symptoms ?? []).join(", "),
      condition_hint: (u.condition_hint as string | undefined) ?? "",
    });
    setFlow("review");
  }

  async function startCase() {
    if (!canSubmit) return;
    setFlow("submitting");
    try {
      const { session_id } = await createSession(surface === "line" ? "line" : "web");
      setSession(session_id);
      setSessionId(session_id);
      const resp = await turn(session_id, {
        type: "text",
        text: text.trim(),
        prefill: {
          patient_role: role,
          ...(scheme ? { scheme } : {}),
          ...(area ? { area } : {}),
        },
      });
      if (resp.cards.some((card) => card.type === "safety" && card.level === "emergency")) {
        router.push(`${basePath}/case/${session_id}/result`);
        return;
      }
      if (resp.questions?.length) {
        setQuestions(resp.questions);
        setQuestionsKey((k) => k + 1);
        setFlow("questions");
      } else {
        setReviewState(resp.understood);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "สร้างเคสไม่สำเร็จ", "error");
      setFlow("input");
    }
  }

  async function answerQuestions(answers: Record<string, string>, summary: string) {
    if (!session) return;
    setFlow("submitting");
    try {
      const resp = await turn(session, { type: "answers", answers, text: summary });
      if (resp.cards.some((card) => card.type === "safety" && card.level === "emergency")) {
        router.push(`${basePath}/case/${session}/result`);
        return;
      }
      if (resp.questions?.length) {
        setQuestions(resp.questions);
        setQuestionsKey((k) => k + 1);
        setFlow("questions");
      } else {
        setReviewState(resp.understood);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "ส่งคำตอบไม่สำเร็จ", "error");
      setFlow("questions");
    }
  }

  async function confirmReview() {
    if (!session) return;
    setFlow("submitting");
    try {
      const answers = Object.fromEntries(
        Object.entries(draft).filter(([, v]) => String(v ?? "").trim().length)
      ) as Record<string, string>;
      answers.__review_confirm = "1";
      const summary = [
        "ยืนยันข้อมูลเคส",
        answers.patient_role && `ผู้ป่วย: ${answers.patient_role}`,
        answers.age && `อายุ: ${answers.age}`,
        answers.scheme && `สิทธิ์: ${answers.scheme}`,
        answers.area && `พื้นที่: ${answers.area}`,
        answers.symptoms && `อาการ: ${answers.symptoms}`,
        answers.condition_hint && `ภาวะที่เกี่ยวข้อง: ${answers.condition_hint}`,
      ]
        .filter(Boolean)
        .join(" · ");
      const resp = await turn(session, { type: "answers", answers, text: summary });
      if (resp.questions?.length) {
        setQuestions(resp.questions);
        setQuestionsKey((k) => k + 1);
        setFlow("questions");
        return;
      }
      router.push(resultHref);
    } catch (e) {
      toast(e instanceof Error ? e.message : "ยืนยันข้อมูลไม่สำเร็จ", "error");
      setFlow("review");
    }
  }

  const understoodRows = useMemo(
    () => [
      { label: "ผู้ป่วย", value: draft.patient_role || "—" },
      { label: "อายุ", value: draft.age || "—" },
      { label: "สิทธิ์", value: draft.scheme || "—" },
      { label: "พื้นที่", value: draft.area || "—" },
      { label: "อาการ", value: draft.symptoms || "—" },
      { label: "ภาวะที่เกี่ยวข้อง", value: draft.condition_hint || "—" },
    ],
    [draft]
  );

  return (
    <div className="flex flex-col gap-5">
      <header className="card-enter">
        <h1 className="text-2xl font-bold leading-tight text-ink">
          รู้สิทธิ์ รู้สุข{displayName ? ` · ${displayName}` : ""}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          เล่าอาการครั้งเดียว ได้เส้นทางดูแลที่ทำตามได้
        </p>
        <Link href={surface === "line" ? "/liff/demo" : "/demo"} className="mt-3 block">
          <Button variant="outline" fullWidth>
            ทดลองโหมดสาธิตสำหรับบูท
          </Button>
        </Link>
      </header>

      {flow === "input" && (
        <section className="card-enter rounded-card border border-hairline bg-surface p-4 shadow-card">
          <label htmlFor="case-story" className="text-lg font-bold text-ink">
            เล่าอาการหรือสถานการณ์ของคุณได้เลย
          </label>
          <p className="mt-1 text-sm text-ink-muted">เช่น “{EXAMPLE}”</p>
          <textarea
            id="case-story"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            placeholder={EXAMPLE}
            className="mt-3 min-h-[180px] w-full resize-none rounded-card border border-hairline bg-canvas px-4 py-3 text-base leading-relaxed text-ink focus:border-brand focus:bg-surface focus:outline-none"
          />

          <div className="mt-4 flex flex-col gap-3">
            <div>
              <p className="mb-2 text-xs font-semibold text-ink-muted">ผู้ป่วย</p>
              <div className="flex flex-wrap gap-2">
                {ROLE_OPTIONS.map((opt) => (
                  <Chip key={opt} selected={role === opt} onClick={() => setRole(opt)} tone="brand">
                    {opt}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-ink-muted">สิทธิ์</p>
              <div className="flex flex-wrap gap-2">
                {SCHEME_OPTIONS.map((opt) => (
                  <Chip
                    key={opt.value}
                    selected={scheme === opt.value}
                    onClick={() => setScheme((current) => (current === opt.value ? "" : opt.value))}
                    tone="info"
                  >
                    {opt.label}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-ink-muted">เลือกพื้นที่</p>
              <div className="flex flex-wrap gap-2">
                {AREA_OPTIONS.map((opt) => (
                  <Chip key={opt} selected={area === opt} onClick={() => setArea(opt)} tone="neutral">
                    {opt}
                  </Chip>
                ))}
              </div>
            </div>
          </div>

          <Button
            size="lg"
            fullWidth
            className="mt-5"
            disabled={!canSubmit}
            onClick={() => void startCase()}
            leftIcon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          >
            สร้างแผนเคส
          </Button>
        </section>
      )}

      {flow === "questions" && (
        <QuestionPanel
          key={questionsKey}
          questions={questions}
          disabled={busy}
          onSubmit={(answers, summary) => void answerQuestions(answers, summary)}
        />
      )}

      {flow === "submitting" && (
        <div className="card-enter rounded-card border border-hairline bg-surface p-6 text-center shadow-card">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand" aria-hidden="true" />
          <p className="mt-3 text-sm text-ink-soft">กำลังประมวลผลเคส…</p>
        </div>
      )}

      {flow === "review" && (
        <section className="card-enter rounded-card border border-hairline bg-surface p-4 shadow-card">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-rights" aria-hidden="true" />
            <div>
              <h2 className="text-lg font-bold text-ink">เราเข้าใจเคสนี้ว่า</h2>
              <p className="mt-1 text-sm text-ink-muted">ตรวจและแก้ข้อมูลให้ตรง ก่อนสร้างเส้นทางดูแล</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <ReviewField label="ผู้ป่วย" icon={<UserRound className="h-3.5 w-3.5" />}>
              <select
                value={draft.patient_role ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, patient_role: e.target.value }))}
                className="w-full rounded-btn border border-hairline px-3 py-2 text-sm text-ink"
              >
                {ROLE_OPTIONS.map((opt) => <option key={opt}>{opt}</option>)}
              </select>
            </ReviewField>
            <ReviewField label="อายุ" icon={<UserRound className="h-3.5 w-3.5" />}>
              <input
                value={draft.age ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, age: e.target.value }))}
                type="number"
                className="w-full rounded-btn border border-hairline px-3 py-2 text-sm text-ink"
                placeholder="เช่น 26"
              />
            </ReviewField>
            <ReviewField label="สิทธิ์" icon={<ShieldCheck className="h-3.5 w-3.5" />}>
              <select
                value={draft.scheme ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, scheme: e.target.value }))}
                className="w-full rounded-btn border border-hairline px-3 py-2 text-sm text-ink"
              >
                <option value="">ยังไม่ระบุ</option>
                {SCHEME_OPTIONS.map((opt) => <option key={opt.value}>{opt.value}</option>)}
              </select>
            </ReviewField>
            <ReviewField label="พื้นที่" icon={<MapPin className="h-3.5 w-3.5" />}>
              <input
                value={draft.area ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, area: e.target.value }))}
                className="w-full rounded-btn border border-hairline px-3 py-2 text-sm text-ink"
                placeholder="เช่น ลาดพร้าว"
              />
            </ReviewField>
            <div className="md:col-span-2">
              <ReviewField label="อาการ" icon={<Pencil className="h-3.5 w-3.5" />}>
                <input
                  value={draft.symptoms ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, symptoms: e.target.value }))}
                  className="w-full rounded-btn border border-hairline px-3 py-2 text-sm text-ink"
                  placeholder="คั่นด้วย comma เช่น เพลีย, ปัสสาวะบ่อย"
                />
              </ReviewField>
            </div>
            <div className="md:col-span-2">
              <ReviewField label="ภาวะที่เกี่ยวข้อง" icon={<ShieldCheck className="h-3.5 w-3.5" />}>
                <input
                  value={draft.condition_hint ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, condition_hint: e.target.value }))}
                  className="w-full rounded-btn border border-hairline px-3 py-2 text-sm text-ink"
                  placeholder="เช่น เสี่ยงเบาหวาน/น้ำตาลในเลือดผิดปกติ"
                />
              </ReviewField>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {understoodRows.map((row) => (
              <Chip key={row.label} tone="info" className={cn(row.value === "—" && "opacity-60")}>
                {row.label}: {row.value}
              </Chip>
            ))}
          </div>
          <Button
            size="lg"
            fullWidth
            className="mt-5"
            onClick={() => void confirmReview()}
            leftIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
          >
            สร้างเส้นทางดูแล
          </Button>
        </section>
      )}

      {flow === "input" && (
        <>
          <section className="flex flex-col gap-2">
            <p className="text-sm font-medium text-ink-soft">ตัวอย่าง</p>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setText(ex)}
                className="card-enter rounded-btn border border-hairline bg-surface px-4 py-3 text-left text-sm text-ink shadow-card transition-colors hover:border-brand/40"
              >
                {ex}
              </button>
            ))}
          </section>
          <div className="grid grid-cols-2 gap-3">
            <Link href={`${basePath}/documents`} className="rounded-card border border-hairline bg-surface p-4 text-sm font-semibold text-ink shadow-card">
              <FileText className="mb-2 h-5 w-5 text-brand" aria-hidden="true" />
              เอกสาร / ประกัน
            </Link>
            <Link href={`${basePath}/history`} className="rounded-card border border-hairline bg-surface p-4 text-sm font-semibold text-ink shadow-card">
              <History className="mb-2 h-5 w-5 text-brand" aria-hidden="true" />
              ประวัติ
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
