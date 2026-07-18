"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import type { MvpCaseRecord, VerifiedCareRoute } from "@/lib/mvp/contracts";
import { CaseRecordSchema, VerifiedCareRouteSchema } from "@/lib/mvp/contracts";
import {
  confirmCase,
  createCase,
  generateCareRoute,
  getCareRoute,
  getMvpCase,
  resetDemo,
  turnCase,
} from "@/lib/client/mvpApi";
import { DemoWelcome, type DemoScenario } from "@/components/mvp/DemoWelcome";
import {
  CaseUnderstandingReview,
  ClarificationWizard,
  EmergencyEscalation,
  RouteGenerationProgress,
  StoryInput,
  type ReviewDraft,
  type StoryDraft,
} from "@/components/mvp/IntakeFlow";
import { CareRoutePage } from "@/components/mvp/CareRoutePage";
import { cn } from "@/lib/cn";

type DemoPhase =
  | "welcome"
  | "intake"
  | "starting"
  | "clarification"
  | "review"
  | "processing"
  | "result"
  | "emergency";

interface PersistedDemoState {
  version: 1;
  expiresAt: number;
  demoSessionId: string;
  phase: DemoPhase;
  story: StoryDraft;
  caseRecord: MvpCaseRecord | null;
  route: VerifiedCareRoute | null;
  checkedPreparation: Record<string, boolean>;
  clarificationProgress: number;
  clarificationTotal: number;
}

const EMPTY_STORY: StoryDraft = {
  narrative: "",
  patientRelation: "self",
  scheme: "UNKNOWN",
  area: "",
};

function storageKey(surface: "web" | "line") {
  return `rusit-mvp-demo-v1:${surface}`;
}

function newDemoSessionId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `demo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function reviewFromCase(caseRecord: MvpCaseRecord): ReviewDraft {
  return {
    patientRelation: caseRecord.extracted.patientRelation,
    age: caseRecord.extracted.age == null ? "" : String(caseRecord.extracted.age),
    scheme: caseRecord.extracted.scheme,
    area: caseRecord.extracted.area.name ?? "",
    symptoms: caseRecord.extracted.symptoms.filter((symptom) => symptom.present).map((symptom) => symptom.text).join(", "),
    duration: caseRecord.extracted.duration.raw ?? (caseRecord.extracted.duration.value == null ? "ไม่ทราบ" : `${caseRecord.extracted.duration.value} ${caseRecord.extracted.duration.unit}`),
    userGoal: caseRecord.extracted.userGoal,
  };
}

function nextPhase(caseRecord: MvpCaseRecord): DemoPhase {
  if (caseRecord.safety.emergency || caseRecord.status === "emergency_escalated") return "emergency";
  if (caseRecord.questions.length > 0 || caseRecord.status === "collecting_information") return "clarification";
  if (caseRecord.status === "route_ready" || caseRecord.status === "passport_ready") return "result";
  return "review";
}

export function DemoModeBadge() {
  return (
    <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full bg-benefit-soft px-3 py-1 text-sm font-bold text-benefit">
      <ShieldCheck className="h-4 w-4" aria-hidden="true" /> โหมดสาธิต
    </span>
  );
}

export function DemoApp({ surface = "web" }: { surface?: "web" | "line" }) {
  const [hydrated, setHydrated] = useState(false);
  const [demoSessionId, setDemoSessionId] = useState("");
  const [phase, setPhase] = useState<DemoPhase>("welcome");
  const [story, setStory] = useState<StoryDraft>(EMPTY_STORY);
  const [caseRecord, setCaseRecord] = useState<MvpCaseRecord | null>(null);
  const [route, setRoute] = useState<VerifiedCareRoute | null>(null);
  const [review, setReview] = useState<ReviewDraft | null>(null);
  const [checkedPreparation, setCheckedPreparation] = useState<Record<string, boolean>>({});
  const [clarificationProgress, setClarificationProgress] = useState(0);
  const [clarificationTotal, setClarificationTotal] = useState(0);
  const [progressStage, setProgressStage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const saveState = useCallback(() => {
    if (!hydrated || !demoSessionId) return;
    const state: PersistedDemoState = {
      version: 1,
      expiresAt: Date.now() + 2 * 60 * 60 * 1000,
      demoSessionId,
      phase,
      story,
      caseRecord,
      route,
      checkedPreparation,
      clarificationProgress,
      clarificationTotal,
    };
    try {
      sessionStorage.setItem(storageKey(surface), JSON.stringify(state));
    } catch {
      // The flow remains usable when storage is blocked by the in-app browser.
    }
  }, [caseRecord, checkedPreparation, clarificationProgress, clarificationTotal, demoSessionId, hydrated, phase, route, story, surface]);

  useEffect(() => {
    let restored: PersistedDemoState | null = null;
    try {
      const raw = sessionStorage.getItem(storageKey(surface));
      if (raw) restored = JSON.parse(raw) as PersistedDemoState;
    } catch {
      restored = null;
    }
    if (restored?.version === 1 && restored.expiresAt > Date.now()) {
      const parsedCase = restored.caseRecord ? CaseRecordSchema.safeParse(restored.caseRecord) : null;
      const parsedRoute = restored.route ? VerifiedCareRouteSchema.safeParse(restored.route) : null;
      setDemoSessionId(restored.demoSessionId || newDemoSessionId());
      setStory(restored.story ?? EMPTY_STORY);
      setCaseRecord(parsedCase?.success ? parsedCase.data : null);
      setRoute(parsedRoute?.success ? parsedRoute.data : null);
      setCheckedPreparation(restored.checkedPreparation ?? {});
      setClarificationProgress(restored.clarificationProgress ?? 0);
      setClarificationTotal(restored.clarificationTotal ?? 0);
      if (parsedCase?.success) setReview(reviewFromCase(parsedCase.data));
      const restoredPhase = parsedCase?.success ? nextPhase(parsedCase.data) : restored.phase;
      setPhase(parsedRoute?.success ? "result" : restoredPhase === "result" ? "processing" : restoredPhase);
    } else {
      try { sessionStorage.removeItem(storageKey(surface)); } catch { /* noop */ }
      setDemoSessionId(newDemoSessionId());
    }
    setHydrated(true);
  }, [surface]);

  useEffect(() => {
    saveState();
  }, [saveState]);

  useEffect(() => {
    if (!hydrated || phase !== "processing" || !caseRecord || route || busy) return;
    let active = true;
    setBusy(true);
    getMvpCase(caseRecord.id)
      .then(async ({ case: current }) => {
        if (!active) return;
        setCaseRecord(current);
        if (current.safety.emergency) {
          setPhase("emergency");
          return;
        }
        try {
          const cached = await getCareRoute(current.id);
          if (!active) return;
          setRoute(cached.route);
          setPhase(cached.route.emergency ? "emergency" : "result");
        } catch {
          if (active) await buildRoute(current.id);
        }
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "โหลดเคสเดิมไม่สำเร็จ"); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
    // buildRoute intentionally excluded: this recovery path runs only once after hydration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRecord, hydrated, phase, route]);

  function applyCase(next: MvpCaseRecord) {
    setCaseRecord(next);
    setReview(reviewFromCase(next));
    const nextStep = nextPhase(next);
    setPhase(nextStep);
    if (nextStep === "clarification") {
      setClarificationTotal((current) => Math.max(current, clarificationProgress + next.questions.length));
    }
  }

  async function startCase(draft: StoryDraft, scenarioId?: string) {
    if (!demoSessionId) return;
    setStory(draft);
    setError("");
    setBusy(true);
    setPhase("starting");
    setProgressStage(0);
    const stageTimer = window.setTimeout(() => setProgressStage(1), 700);
    try {
      const response = await createCase({
        narrative: draft.narrative.trim(),
        patientRelation: draft.patientRelation,
        scheme: draft.scheme,
        area: draft.area.trim(),
        demoSessionId,
        demoScenarioId: scenarioId,
        demo: true,
      });
      setClarificationProgress(0);
      setClarificationTotal(response.case.questions.length);
      applyCase(response.case);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "เริ่มเคสไม่สำเร็จ กรุณาลองอีกครั้ง");
      setPhase(scenarioId ? "welcome" : "intake");
    } finally {
      window.clearTimeout(stageTimer);
      setBusy(false);
    }
  }

  function selectScenario(scenario: DemoScenario) {
    void startCase(
      {
        narrative: scenario.narrative,
        patientRelation: scenario.patientRelation,
        scheme: scenario.scheme,
        area: scenario.area,
      },
      scenario.id,
    );
  }

  async function answerQuestion(value: string) {
    if (!caseRecord || !currentQuestion) return;
    setBusy(true);
    setError("");
    try {
      const response = await turnCase(caseRecord.id, {
        message: value,
        answers: { [currentQuestion.slotKey]: value },
        answer: { questionId: currentQuestion.id, slotKey: currentQuestion.slotKey, value },
      });
      setClarificationProgress((current) => current + 1);
      applyCase(response.case);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "บันทึกคำตอบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function buildRoute(caseId: string) {
    setPhase("processing");
    setProgressStage(0);
    setError("");
    const timer = window.setInterval(() => setProgressStage((current) => Math.min(4, current + 1)), 1_050);
    try {
      const response = await generateCareRoute(caseId);
      setCaseRecord(response.case);
      setRoute(response.route);
      setProgressStage(5);
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      setPhase(response.route.emergency ? "emergency" : "result");
    } catch (cause) {
      try {
        const cached = await getCareRoute(caseId);
        setRoute(cached.route);
        setPhase(cached.route.emergency ? "emergency" : "result");
      } catch {
        setError(cause instanceof Error ? cause.message : "สร้างเส้นทางไม่สำเร็จ");
        setPhase("review");
      }
    } finally {
      window.clearInterval(timer);
    }
  }

  async function confirmReview() {
    if (!caseRecord || !review) return;
    setBusy(true);
    setError("");
    try {
      const response = await confirmCase(caseRecord.id, {
        patientRelation: review.patientRelation,
        age: review.age.trim() ? Number(review.age) : null,
        scheme: review.scheme,
        area: review.area.trim(),
        symptoms: review.symptoms.split(",").map((item) => item.trim()).filter(Boolean),
        duration: review.duration.trim(),
        userGoal: review.userGoal.trim(),
      });
      setCaseRecord(response.case);
      if (response.case.safety.emergency) setPhase("emergency");
      else await buildRoute(response.case.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ยืนยันข้อมูลไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    const previousSession = demoSessionId;
    try {
      for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
        const key = sessionStorage.key(index);
        if (key?.startsWith("rusit-mvp-demo-v1:")) sessionStorage.removeItem(key);
      }
    } catch { /* noop */ }
    setDemoSessionId(newDemoSessionId());
    setPhase("welcome");
    setStory(EMPTY_STORY);
    setCaseRecord(null);
    setRoute(null);
    setReview(null);
    setCheckedPreparation({});
    setClarificationProgress(0);
    setClarificationTotal(0);
    setProgressStage(0);
    setError("");
    setBusy(false);
    if (previousSession) {
      try { await resetDemo(previousSession); } catch { /* local reset is intentionally not blocked */ }
    }
  }

  function escalateFromFollowUp(safety: { hotline: string; message: string }) {
    setCaseRecord((current) => current ? CaseRecordSchema.parse({
      ...current,
      status: "emergency_escalated",
      route: null,
      safety: {
        ...current.safety,
        emergency: true,
        finalUrgency: "EMERGENCY_NOW",
        hotline: safety.hotline,
        messageTh: safety.message,
      },
      updatedAt: new Date().toISOString(),
    }) : current);
    setRoute(null);
    setPhase("emergency");
  }

  const currentQuestion = useMemo(() => caseRecord?.questions[0] ?? null, [caseRecord]);

  if (!hydrated) {
    return (
      <div className="grid min-h-[50vh] place-items-center" role="status" aria-live="polite">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand" aria-hidden="true" />
          <p className="text-base font-semibold text-ink">กำลังเตรียมโหมดสาธิต…</p>
        </div>
      </div>
    );
  }

  const RootElement = surface === "web" ? "main" : "div";

  return (
    <RootElement className={cn("min-h-screen bg-canvas", surface === "web" ? "px-3 py-4 sm:px-6 sm:py-6" : "-mx-1") }>
      <div className="mx-auto mb-4 flex w-full max-w-3xl items-center justify-between gap-3 rounded-2xl border border-hairline bg-white px-3 py-2 shadow-card sm:px-4">
        <div className="min-w-0">
          <DemoModeBadge />
          <p className="mt-1 truncate text-sm text-ink-muted">ข้อมูลเคสสาธิตจะถูกล้างเมื่อกดเริ่มใหม่ และหมดอายุจากอุปกรณ์นี้ภายใน 2 ชั่วโมง</p>
        </div>
        <button
          type="button"
          onClick={() => void reset()}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-hairline bg-white px-3 text-sm font-bold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" /> เริ่มใหม่
        </button>
      </div>

      {error && (
        <div className="mx-auto mb-4 flex w-full max-w-3xl items-start gap-3 rounded-xl border border-safety/30 bg-safety-soft p-3 text-sm text-safety" role="alert">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1"><p className="font-bold">ดำเนินการไม่สำเร็จ</p><p className="mt-0.5 break-words">{error}</p></div>
          {caseRecord && phase === "review" && <button type="button" onClick={() => void confirmReview()} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg bg-white px-3 font-bold"><RefreshCw className="h-4 w-4" aria-hidden="true" />ลองใหม่</button>}
        </div>
      )}

      {phase === "welcome" && <DemoWelcome onSelectScenario={selectScenario} onOwnStory={() => { setStory(EMPTY_STORY); setPhase("intake"); }} busy={busy} />}
      {phase === "intake" && <StoryInput value={story} onChange={setStory} onSubmit={() => void startCase(story)} onBack={() => setPhase("welcome")} busy={busy} />}
      {phase === "starting" && <RouteGenerationProgress stage={progressStage} />}
      {phase === "clarification" && currentQuestion && (
        <ClarificationWizard
          key={currentQuestion.id}
          question={currentQuestion}
          index={clarificationProgress}
          total={Math.max(clarificationTotal, clarificationProgress + caseRecord!.questions.length)}
          busy={busy}
          onAnswer={(value) => void answerQuestion(value)}
        />
      )}
      {phase === "clarification" && !currentQuestion && caseRecord && (
        <CaseUnderstandingReview caseRecord={caseRecord} value={review ?? reviewFromCase(caseRecord)} onChange={setReview} onConfirm={() => void confirmReview()} busy={busy} />
      )}
      {phase === "review" && caseRecord && (
        <CaseUnderstandingReview caseRecord={caseRecord} value={review ?? reviewFromCase(caseRecord)} onChange={setReview} onConfirm={() => void confirmReview()} busy={busy} />
      )}
      {phase === "processing" && <RouteGenerationProgress stage={progressStage} />}
      {phase === "emergency" && caseRecord && <EmergencyEscalation safety={caseRecord.safety} onReset={() => void reset()} />}
      {phase === "result" && caseRecord && route && (
        <CareRoutePage
          caseRecord={caseRecord}
          route={route}
          surface={surface}
          checkedPreparation={checkedPreparation}
          onTogglePreparation={(itemId) => setCheckedPreparation((current) => ({ ...current, [itemId]: !current[itemId] }))}
          onEmergency={escalateFromFollowUp}
        />
      )}
    </RootElement>
  );
}
