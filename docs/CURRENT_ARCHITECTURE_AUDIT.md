# Current Architecture Audit

วันที่ตรวจ: 18 กรกฎาคม 2026  
ขอบเขต: source code และ configuration ทั้ง repo `rusit-rusuk` (ไม่อ่านค่าความลับใน `.env.local`)

## Executive summary

Repo ปัจจุบันเป็น Next.js App Router ที่มี Web (`app/(web)`) และ LINE LIFF (`app/liff`) ใช้ component และ API ชุดเดียวกัน โครง UI, Supabase auth/session, deterministic eligibility engine และ safety rail บางส่วนสามารถนำไปต่อได้ แต่ runtime หลักยังไม่ตรงกับ MVP spec: orchestration ยังเรียก Claude/Gemini + RunPod และ query Neo4j ก่อน fallback, knowledge ใน Supabase มีเพียง vector chunks ไม่ใช่ relational graph-compatible schema, emergency flow ยังสร้าง normal route ต่อได้, facility matching ไม่มี hard filters/score/opening-hours, และ Case Passport ยังเป็น LLM-generated transient card ที่ไม่มี version/share/expiry/revoke.

แนวทาง implementation คือ preserve shell, auth, shared UI primitives, legacy routes และส่วน deterministic ที่ปลอดภัย แล้วสร้าง Verified Care Route domain layer และ typed case APIs ใหม่แบบ server-side โดยใช้ Claude + Supabase/JSON เป็น runtime ที่เปิดใช้จริง และไม่ให้ Neo4j/ThaiLLM เป็น dependency ของ hero flow.

## Repository and framework

- Framework: Next.js App Router; `package.json` ระบุ `next ^15.1.3` และ lockfile ติดตั้งจริงเป็น Next.js 15.5.19, React 19, TypeScript 5.7, Tailwind 3.4.
- Routing: App Router ทั้งหมด ไม่มี Pages Router.
- Web surface: `app/(web)` ใช้ `WebShell`; route group ทำให้ URL ไม่มี prefix.
- LINE surface: `app/liff` ใช้ `LiffShell` และ route `/liff/**`.
- Shared route handlers: `app/api/**/route.ts`, Node runtime สำหรับ orchestration และ document work.
- Path alias: `@/*` ชี้ project root; strict TypeScript เปิดใช้งาน.
- Build config: `next.config.mjs` externalizes `pdf-parse`, `neo4j-driver`, `@mastra/core`; มี LIFF frame headers.
- Styling: Tailwind semantic tokensใน `tailwind.config.ts`; Noto Sans Thai ผ่าน `next/font`.

## UI and component architecture

UI แบ่งเป็น `components/screens`, `layout`, `chat`, `cards`, `case`, `passport`, `ui` และแชร์ระหว่าง web/LIFF ได้ดี. `HomeScreen` มี intake → question panel → editable review → result navigation อยู่แล้ว ส่วน `ChatScreen` เป็น legacy conversational flow. Result ปัจจุบันอยู่ที่ `components/case/CaseResultScreen.tsx`; passport อยู่ที่ `components/passport/PassportModal.tsx` และ `PassportCard.tsx`; floating chat อยู่ที่ `components/case/CaseChatWidget.tsx`.

ช่องว่างสำคัญ:

- Result ยังใช้ชื่อ “Result Dashboard”, วาง Passport CTA ก่อน route, และยังมี private insurance/options.
- `CaseResultScreen.tsx` เป็น component ขนาดใหญ่และ route/rights/evidence ไม่ได้ใช้ Verified Care Route contract.
- Floating chat แสดงข้อความเป็น plain text จึงเห็น markdown syntax ดิบ และไม่มี quick questions ตาม spec.
- Passport UI มี provider/model/fallback label จาก `lib/passport.ts` และใช้ถ้อยคำคล้ายเอกสารยื่นสถานพยาบาลเกินขอบเขต.
- Loading หลักยังเป็น spinner เดี่ยว; ไม่มี 5-stage progress.
- `app/layout.tsx` ปิด user zoom (`userScalable: false`, `maximumScale: 1`) ซึ่งขัด accessibility.
- Tap targets บาง primitive ต่ำกว่า 44px (`Button md`, `Chip`).
- ไม่มี `/demo`, demo reset, demo label หรือ persisted demo state.

## Auth, session, and case state

- Web ใช้ Supabase anonymous auth; LIFF ใช้ LINE ID token → `/api/auth/line` → Supabase session.
- Personal data ใช้ RLS-aware `userClient(token)`; trusted server workใช้ lazy `adminClient()`.
- Current session tables: `sessions`, `session_state`, `messages`; slot state เก็บเป็น JSONB.
- Current case loader (`lib/caseData.ts`) ประกอบ snapshot จาก session, latest assistant card JSON และ audit log.
- ยังไม่มี explicit `CaseStatus` state machine, `cases`, `case_slots`, `triage_assessments`, `care_routes`, `case_passports` หรือ proof-of-access lifecycle ตาม spec.
- Demo mode ยังต้องผ่าน Supabase auth จึงไม่ booth-safe เมื่อ config/auth ล้ม.

## Orchestrator and model integrations

`lib/orchestrator.ts` ปัจจุบันทำ safety pre-check → NLU/slot filling → RunPod prescreen with rails → Neo4j/static KG + rule engine + GraphRAG → LLM synthesis → ordered cards. `lib/llm.ts` ใช้ Claude ก่อนและ Gemini เป็น text fallback; `lib/gemini.ts` ยังใช้กับ STT/embedding; `lib/runpod/prescreen.ts` ใช้ ThaiLLM adapter บน RunPod และ fallback ไป Claude/Gemini/mock.

ช่องว่างสำคัญ:

- ไม่มี `ModelProvider` interface ตาม contract.
- Prompt ยาวยังอยู่ใน business logic/API บางจุด; structured extraction/prescreen contract ยังไม่ใช่ Zod source of truth.
- Provider timeout/retry/repair ไม่ตรง 12 วินาที + retry 1 ครั้ง.
- Runtime ยังพึ่ง RunPod path และมี Gemini text fallback ซึ่งขัด runtime truth ใหม่.
- Provider/internal output ถูกเก็บและบางส่วนถูกส่ง/แสดงใน Passport.
- Follow-up API ส่ง case snapshot ทั้งก้อนไป LLM และไม่มี deterministic red-flag re-entry.

## Safety and eligibility

- `lib/safety.ts` มี deterministic keyword pre-check และ 1669 card.
- `lib/runpod/prescreen.ts` มี ER override และ minimum severity floor.
- `lib/ruleEngine.ts` มี three-valued logic, missing attributes และ predicate trace ที่ควร preserve/refactor.

ช่องว่างสำคัญ:

- Safety patterns hardcode ใน TS ไม่ใช่ versioned facts และไม่มี source/effective dates.
- Negation ไม่ถูกตรวจ เช่น “ไม่เจ็บหน้าอก” ยัง match แบบ naive.
- Emergency pre-check ไม่หยุด normal facility/rights route; emergency card เพียงถูกเพิ่มด้านบน.
- Coverage/cost เดิมมี default “ไม่มีค่าใช้จ่าย/ฟรี” เมื่อ fact ไม่ครบหรือ fallback ซึ่งไม่ผ่าน cost safety.
- Rule JSON เดิมไม่มี schema/version/source metadata ครบตามใหม่.

## Knowledge and facility runtime

- `lib/kg.ts` เป็น Neo4j-first (`readCypher`) แล้ว fallback ไป `lib/data/kgFallback.json`.
- `lib/neo4j.ts` สร้าง Neo4j driver แบบ lazy และ retry connection.
- Supabase schema ปัจจุบันมี `kg_chunks`, `kg_fewshots` และ vector RPC แต่ไม่มี normalized right/condition/service/facility relations.
- Static data เดิมกระจายใน `lib/data/*.json`, บางไฟล์ไม่มี version envelope และมี claim/cost wording ที่ต้อง review.

ช่องว่างสำคัญ:

- Hero flow สามารถเรียก Neo4j หาก env มีค่า; จึงยังไม่เป็น Supabase runtime.
- `searchFacilities()` ไม่ใช้ `conditionId`/`serviceId` เป็น hard filter, ไม่มี acceptance statuses, effective-date filter, source hard filter หรือ 0–100 score breakdown.
- Opening hours ไม่ถูก parse; `open_now` เป็น unknown เสมอ.
- Static fallback facility links ไม่มี relational source/service/right validation.
- ไม่มี `KnowledgeProvider`, Supabase provider, JSON provider หรือ future adapter boundary.

## Case Passport

`lib/passport.ts` โหลด transcript/slots/audit แล้วให้ Mastra/LLM สร้าง object; `PassportModal` แปลง card เป็น PNG. ไม่มี persistence/version history/share token/PDF/QR/expiry/revoke/consent-scope enforcement. Provider labels เช่น Claude/Gemini/RunPod/fallback ถูกประกอบใน `screened_by` และส่งไป UI. Snapshot เดิมไม่ตรง structured handoff contract และสามารถมี benefit/value ที่ไม่เกี่ยวข้อง.

## API surface

Existing APIs ใช้ `/api/session`, `/api/turn`, `/api/case/[id]`, `/api/passport`, `/api/case-chat`, `/api/feedback` และ ancillary auth/profile/documents/facility/eligibility/admin routes. Response success ปัจจุบันคืน raw data; error คืน `{ error }` จึงยังไม่ตรง envelope `{ success, data, error, requestId }`. ไม่มี case-scoped confirm/generate-route/passport/share/follow-up/feedback/demo-reset routes ตาม contract ใหม่.

## Database and privacy

`supabase/schema.sql` มี pgvector, auth/profile/consent/session/message/document/audit tables และ RLS per-user; `supabase/storage.sql` มี private document bucket policies. จุดที่ควร preserve คือ RLS pattern, no-national-ID design และ deletion API. จุดที่ยังขาดคือ 16 public knowledge tables, 10 case/personal tables, effective dating, fact_sources, route/passport/share/feedback schemas, demo expiry, views/RPC และ restricted provider-internal data.

`.env.local` มีอยู่และถูก ignore; audit ไม่อ่านหรือคัดลอกค่า secret. `.env.example` ยังอธิบาย Gemini/RunPod/Neo4j เป็น runtime และไม่มี provider/feature flags ใหม่.

## Tests, lint, build, and deployment

- ไม่มี dedicated unit/integration/E2E suite และไม่มี `test` script.
- `npm run typecheck` ผ่าน baseline.
- `npm run build` ผ่าน baseline; generated routes 17 static/dynamic groupsตาม App Router.
- `npm run lint` เปิด interactive Next.js ESLint setup prompt จึงไม่ใช่ repeatable CI check แม้ process exit 0.
- ไม่มี `vercel.json`, Dockerfile หรือ CI workflow; deployment documented as Vercel manual setup.
- README/SETUP อธิบาย Gemini + RunPod + Neo4j เป็น runtime ซึ่งไม่ตรง target MVP truth.

## Preserve versus refactor

Preserve:

- Next.js App Router, Web/LIFF shared component pattern, Noto Sans Thai/Tailwind tokens.
- Supabase lazy server clients, LINE auth bridge, existing profile/document routes.
- Deterministic three-valued rule evaluation concepts and audit discipline.
- Existing UI primitives where accessibility can be fixed without rewriting.

Refactor or replace for MVP:

- Add explicit case state machine and typed Verified Care Route contracts.
- Replace hero orchestration with `ModelProvider` and `KnowledgeProvider` boundaries.
- Make Claude the only active model provider for extraction/prescreen/explanation; use deterministic cached demo output when unavailable.
- Make Supabase normalized knowledge the configured primary provider and versioned JSON the booth fallback; prevent Neo4j/ThaiLLM calls in default runtime.
- Replace facility/cost/passport/feedback flows with deterministic, source-backed implementations.
- Add standalone booth-safe `/demo` that does not require Supabase auth or durable PII.

## Implementation sequence

1. P0: establish repeatable lint/tests, safe env flags, remove provider/debug copy and unsafe legacy cost/private-option defaults.
2. P1: contracts/state machine/safety/required slots/review/route composition + `/demo` hero and emergency paths.
3. P2: versioned JSON + validation, Supabase relational migration/seed, providers, eligibility/facility/cost/evidence.
4. P3: structured Passport persistence/version/share/print/QR/consent.
5. P4: access feedback, analytics abstraction, demo reset/fallback, integration/mobile checks and operating documentation.

## Baseline conclusion

Current repo is buildable and has reusable foundations, but it is not yet a Verified Rights-to-Care Navigation MVP and is not truthful to the required Claude + Supabase/JSON runtime. The implementation following this audit will add the new flow alongside preserved legacy surfaces, then make the demo/LIFF entry use the safe flow without requiring Neo4j, ThaiLLM, RunPod or a live Claude response.
