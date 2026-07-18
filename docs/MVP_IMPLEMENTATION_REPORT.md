# MVP Implementation Report

วันที่ส่งมอบ: 18 กรกฎาคม 2026
ผลิตภัณฑ์: **รู้สิทธิ์ รู้สุข — Verified Rights-to-Care Navigation**

## ผลลัพธ์ที่ส่งมอบ

Repo นี้ได้รับการปรับจาก flow แบบ chat/card เดิมให้มี booth flow แยกที่ `/demo` และ `/liff/demo` สำหรับเส้นทางหลักแบบ end-to-end:

> เรื่องเล่าหนึ่งครั้ง → ตรวจความปลอดภัย → ถามข้อมูลที่จำเป็น → ทบทวนความเข้าใจ → สร้าง Verified Care Route → เปิดเหตุผลและหลักฐาน → สร้าง/พิมพ์/แชร์ Case Passport → ส่ง Proof of Access

โค้ดเดิมที่ยังใช้งานได้ถูกเก็บไว้เพื่อ backward compatibility. Killer journey ใหม่อยู่บน typed domain และ case-scoped API ชุดใหม่ จึงไม่ต้อง rewrite legacy web/LIFF surface ทั้งหมด.

## Runtime ที่ใช้จริง

| ส่วน | MVP runtime | พฤติกรรมเมื่อ provider ใช้งานไม่ได้ |
|---|---|---|
| Structured extraction, prescreen และ grounded follow-up | `ClaudeModelProvider` เมื่อกำหนด `MODEL_PROVIDER=claude`; provider มี explanation contract แต่ Why This Route ที่แสดงใน MVP เป็น deterministic trace | timeout ต่อ request ไม่เกิน 12 วินาทีและ retry/repair จำกัด; 3 scenario เป็น precomputed cache ส่วนเรื่องที่พิมพ์เองลอง provider ก่อน |
| Knowledge | `SupabaseKnowledgeProvider` เมื่อกำหนด `KNOWLEDGE_PROVIDER=supabase` | versioned JSON ใน `data/knowledge/v1`; เมื่อ fallback ถูกใช้ request จะเป็น degraded และ UI ให้โทรยืนยัน |
| Safety | deterministic pre-check และ post-model urgency floor | fail closed เป็น emergency/degraded result ตามกฎ; model ลดระดับกว่ากฎไม่ได้ |
| Eligibility, cost, facility order | deterministic engine | ข้อมูลไม่ครบเป็น `INDETERMINATE`/`UNKNOWN`; ไม่เติม claim หรือค่าใช้จ่ายจากการเดา |
| Booth case state | Supabase TTL snapshot ไม่เกิน 72 ชั่วโมงเมื่อตั้งค่า; in-process + browser `sessionStorage` เมื่อ offline | refresh/back และ cross-instance recovery; reset/expiry ลบแบบ cascade |
| Non-demo persistence | Supabase case/passport/feedback tables | fail-closed; ไม่ตอบ success เมื่อ write ล้ม และต้องติดตั้ง migration/credentials ก่อนใช้งานจริง |

`ThaiLLMModelProvider` และ `Neo4jKnowledgeProvider` เป็น adapter skeleton สำหรับอนาคตและ fail closed. Default MVP, build และ `/demo` **ไม่เรียก ThaiLLM, RunPod หรือ Neo4j**. ค่าเริ่มต้นปิด private/commercial options.

รายละเอียดเปรียบเทียบ runtime กับ target อยู่ที่ [ARCHITECTURE_TARGET_VS_RUNTIME.md](./ARCHITECTURE_TARGET_VS_RUNTIME.md).

## งานที่ทำตามลำดับความสำคัญ

### P0 — ทำให้ระบบปลอดภัยและรันซ้ำได้

- ทำ baseline audit ก่อนแก้ implementation ใน [CURRENT_ARCHITECTURE_AUDIT.md](./CURRENT_ARCHITECTURE_AUDIT.md).
- ทำให้ lint เป็น non-interactive และเพิ่ม Vitest, Playwright, knowledge validation และคำสั่ง `verify`.
- ถอด `neo4j-driver` ออกจาก runtime dependency; legacy Neo4j shim fail closed โดยไม่ทำให้ build/demo ล้ม.
- ปรับ environment flags ให้ Claude + Supabase/JSON เป็นความจริงของ MVP; ปิด RunPod/ThaiLLM, Neo4j และ private options โดย default.
- ตัด provider/model/debug/fallback wording ออกจาก user-facing result และ Passport.
- แก้ floating follow-up ให้ render เป็นข้อความปลอดภัย ไม่แสดง markdown syntax ดิบ และเพิ่ม quick questions ตามบริบทเคส.
- ปรับ cost copy เดิมไม่ให้ข้อมูลว่างกลายเป็นคำว่า “ฟรี”.
- เพิ่ม input limits, in-process rate limit, safe API errors, log/analytics redaction และ admin-debug guard.
- ปรับ tap target, focus state, zoom, overflow, reduced motion, security headers และ print CSS.

### P1 — Killer flow

- เพิ่ม explicit `CaseStatus` state machine ตั้งแต่ `draft` ถึง `closed` ใน `lib/mvp/contracts.ts` และ policy ใน `lib/mvp/state-policy.ts`.
- เพิ่ม deterministic safety rules พร้อมการตรวจ negation; emergency ตัด normal primary route และให้ 1669 เป็นการกระทำแรก.
- แยก prompt ออกจาก business logicใน `lib/ai/prompts/`; structured output ถูก validate ด้วย Zod ก่อนนำไปใช้.
- Required-slot policy ถามไม่เกิน 8 ข้อ มี reason code `SAFETY`, `ROUTING`, `ELIGIBILITY`, `COST` และมีตัวเลือก “ไม่ทราบ”.
- เพิ่มหน้า review ที่แก้ field ได้ก่อนยืนยัน, progress 5 ขั้น และผลลัพธ์ “เส้นทางดูแลของคุณ”.
- Verified Care Route แสดง urgency ก่อนชื่อภาวะ, primary/backup, preparation, rights เฉพาะเคส, deterministic Why This Route และ evidence accordion.
- Facility selection ใช้ hard filters และ score 0–100; LLM ไม่เลือกหรือ reorder สถานพยาบาล.
- Facility fact ต้อง resolve ถึง source document จริงก่อนเป็น primary; source ID ที่หาไม่พบถูก hard-filter ออก.

### P2 — Trust layer

- เพิ่ม graph-compatible relational schema บน Supabase: rights, conditions, symptoms, services, coverages, areas, facilities, benefits, sources, cases, assessments, routes, passports, feedback, audit และ consent.
- Migration อยู่ที่ `supabase/migrations/202607180001_verified_care_route_mvp.sql`; seed อยู่ที่ `supabase/seed_mvp.sql`.
- Migration มี foreign keys, indexes, effective dates, views/RPC, RLS, comments และ rollback notes โดยไม่พึ่ง PostGIS.
- เพิ่ม versioned JSON knowledge 15 ชุดใน `data/knowledge/v1` พร้อม stable namespaced IDs, source links, effective dates และ verification status.
- `scripts/validate-knowledge-data.ts` ตรวจ duplicate, orphan links, missing source, invalid effective dates, coverage/facility links และ eligibility required attributes.
- Eligibility เป็น three-valued logic พร้อม predicate trace. Required attribute ไม่ครบไม่ถูกตีความเป็น `false`.
- Cost renderer แยก verified-free/fixed/variable/unknown และไม่ใช้ expired fact.
- Opening-hours และ effective-date filtering ทั้ง app layer/SQL views ใช้เขตเวลา Asia/Bangkok; ระยะทางใช้ Haversine เมื่อมีพิกัด และไม่ใช้คำว่า “ใกล้ที่สุด” หากไม่ได้คำนวณจริง.

### P3 — Structured Health Handoff

- Case Passport ใช้ immutable structured snapshot ตาม contract แทนรายงาน AI แบบ free-form.
- มี mobile preview, A4 browser-print ที่ข้อความค้นหาได้, version increment และ history ฝั่ง server.
- Share ต้องได้รับ consent ก่อน; token เป็น opaque random value, server เก็บ hash, expiry เริ่มต้น 72 ชั่วโมง และ revoke ได้.
- Share page `/passport/share/[token]` มี noindex/nocache และแสดง snapshot ที่ sanitize แล้ว.
- Consent scope บังคับเป็น `PRE_VISIT_HANDOFF`; public share ใช้ minimal view ที่ตัด original narrative, medications และ allergies โดยปริยาย โดยไม่แก้ immutable owner snapshot.
- Passport ไม่แสดงชื่อ model, prompt, internal confidence, private options, เลขบัตรประชาชน 13 หลัก หรือ definite diagnosis และระบุว่าไม่ใช่ใบส่งตัว/ใบรับรองแพทย์.

### P4 — Booth readiness และ proof loop

- `/demo` เปิดได้โดยไม่ต้องผ่าน LINE/Supabase auth และมี 3 scenario, label “โหมดสาธิต”, persistent-in-tab state และ one-click reset.
- UI และ deterministic profiles ของทั้ง 3 scenario derive จาก `data/knowledge/v1/demo-cases.json` ชุดเดียว เพื่อลด data drift ระหว่าง demo card กับ precomputed route.
- Hero case มี deterministic/precomputed path จึงจบ flow ได้เมื่อ Claude timeout, quota error หรือ invalid structured output.
- ปุ่ม “พิมพ์เรื่องของฉันเอง” ลอง configured model/knowledge providers; หาก Supabase ล้มแล้ว JSON รับต่อ จะแสดง user-safe degraded notice โดยไม่เผยชื่อ provider.
- Progress UI แสดง 5 ขั้นแทน spinner เปล่า; public knowledge ถูกอ่าน server-side และไม่ ship JSON ก้อนใหญ่ไป client.
- Follow-up ใช้ sanitized case snapshot/evidence, ไม่สร้างตัวเลขค่าใช้จ่าย และ re-enter safety gate เมื่อข้อความใหม่มี red flag.
- Feedback prompt เก็บผลการเข้าถึงจริงแบบมี moderation; demo feedback ติด label “ข้อมูลตัวอย่างสำหรับการสาธิต”.
- Analytics abstractionบันทึก event ที่ไม่รวม full medical narrative; เมื่อไม่มี analytics provider จะใช้ `audit_events`.
- เพิ่ม unit/integration/mobile E2E scaffolding และคำสั่งตรวจแบบรวม.

## API contract ใหม่

API ใหม่ใช้ envelope เดียวกัน: `success`, `data`, `error`, `requestId`. Error ที่ส่งให้ client ไม่มี stack trace หรือ raw provider output.

| Method | Route | หน้าที่ |
|---|---|---|
| `POST` | `/api/cases` | สร้างเคสและทำ safety/extraction ขั้นต้น |
| `GET`, `DELETE` | `/api/cases/[id]` | โหลดหรือลบเคส |
| `POST` | `/api/cases/[id]/turn` | บันทึกคำตอบ clarification และคำนวณ next action |
| `POST` | `/api/cases/[id]/confirm` | ยืนยัน case review |
| `POST` | `/api/cases/[id]/generate-route` | สร้าง Verified Care Route |
| `GET` | `/api/cases/[id]/route` | โหลด route ที่สร้างแล้ว |
| `POST` | `/api/cases/[id]/passport` | สร้าง Passport version ใหม่ |
| `POST` | `/api/cases/[id]/follow-up` | ถามต่อจาก case snapshot/evidence |
| `POST` | `/api/cases/[id]/feedback` | บันทึก proof-of-access feedback |
| `POST` | `/api/cases/[id]/events` | บันทึก event metadata แบบ allow-list โดยไม่รับ narrative/PII |
| `GET` | `/api/passports/[id]` | โหลด Passport ที่เจ้าของเคสเข้าถึงได้ |
| `POST`, `DELETE` | `/api/passports/[id]/share` | สร้างหรือเพิกถอน share token |
| `GET` | `/api/passport/share/[token]` | อ่าน shared Passport ที่ยังไม่หมดอายุ/ไม่ถูก revoke |
| `POST` | `/api/demo/reset` | ล้างเคสใน demo session |

หน้า internal debug อยู่ที่ `/internal/debug/case/[caseId]` และเปิดเฉพาะ development หรือ `ADMIN_DEBUG=true`; raw provider fields ไม่อยู่ใน public response.

## Safety, privacy และ claim discipline

- Safety ทำก่อน model เสมอและทำซ้ำหลัง prescreen; final urgency เท่ากับค่าที่สูงกว่าระหว่าง rule floor กับ model.
- Negation เช่น “ไม่เจ็บหน้าอก” ไม่ match เป็น emergency แบบ naive.
- Scheme มาจาก user/prefill ที่ยืนยันเท่านั้น; `UNKNOWN` ไม่ถูกเดาเป็นบัตรทอง.
- Rights/cost/facility/evidence มาจาก KnowledgeProvider เท่านั้น. Explanation model ไม่สามารถแก้ eligibility, cost หรืออันดับ facility.
- Demo narrative อยู่ใน browser/in-process และเก็บชั่วคราวใน Supabase ไม่เกิน 72 ชั่วโมงเมื่อตั้งค่า; reset/`purge_expired_demo_cases()` ลบ child rows แบบ cascade.
- ระบบไม่ขอเลขบัตรประชาชน 13 หลัก. “บัตรประชาชน” ปรากฏเฉพาะ preparation checklist.
- Shared Passport ใช้ consent, opaque token, hash, expiry, revoke, noindex และ no-cache.
- ข้อจำกัดทางการแพทย์และการใช้ข้อมูลอยู่ที่ [SAFETY_AND_DISCLAIMER.md](./SAFETY_AND_DISCLAIMER.md).

## Data และการติดตั้ง

1. ติดตั้ง runtime ตาม `.node-version` และรัน `npm install`.
2. Copy `.env.example` เป็น `.env.local`; ใส่เฉพาะ secret ฝั่ง server ใน server variables.
3. รัน migration และ seed ตาม [SUPABASE_SETUP.md](./SUPABASE_SETUP.md).
4. ตรวจ JSON ด้วย `npm run validate:knowledge` ทุกครั้งที่แก้ fact.
5. ใช้ [DATA_UPDATE_GUIDE.md](./DATA_UPDATE_GUIDE.md) สำหรับ source/effective-date/verification workflow.

## Verification

ใช้คำสั่งนี้ก่อน deploy หรือส่งมอบ:

```bash
npm run validate:knowledge
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration
npm run build
npm run test:e2e
```

`npm run verify` รวม knowledge validation, typecheck, lint, Vitest ทั้งหมด และ production build. E2E แยกคำสั่งเพราะต้องติดตั้ง Playwright WebKit; test runner เปิด dev server ให้เอง.

ผลตรวจรอบส่งมอบจาก working tree ปัจจุบัน:

- Knowledge validation: ผ่าน 15 ไฟล์, 97 records และไม่พบ orphan link.
- TypeScript และ ESLint: ผ่านโดยไม่มี error/warning.
- Vitest: ผ่าน 10 files, 40 tests (unit 37 + integration journeys 3).
- Playwright mobile: ผ่าน 3/3 tests ครอบคลุม no-overflow ที่ 360/375/390/414/430px, hero end-to-end ที่ 390×844 และ emergency 1669/no-normal-route.
- Next.js production build: ผ่าน; สร้าง static pages 19 หน้าและ dynamic API/page routes สำเร็จ.
- Supabase SQL: migration + seed รันซ้ำสองรอบบน disposable PostgreSQL 18 สำเร็จ; RLS/candidate RPC, facility evidence, nullable no-facility feedback, demo TTL purge และ Bangkok effective-date ผ่าน.
- `npm audit --omit=dev`: ไม่มี moderate/high/critical; เหลือ low 3 รายการใน dependency chain ของ legacy Mastra path ซึ่งไม่อยู่ใน booth killer journey.

Manual API smoke บนเครื่องส่งมอบยืนยัน hero route, Passport version/share/revoke, feedback/reset, ownership denial, unknown scheme และ emergency. หลังแยก demo ให้ใช้ JSON knowledge โดยตรง เวลา generate route ที่สังเกตได้ประมาณ 0.27 วินาทีและ Passport แรกประมาณ 0.40 วินาทีบนเครื่องนี้; ตัวเลขนี้เป็น observation ไม่ใช่ production SLO.

นอกจาก automated checks ให้ทำ smoke test ตาม [DEMO_RUNBOOK.md](./DEMO_RUNBOOK.md): hero, emergency, unknown scheme, Passport/share/revoke, feedback และ one-click reset. Live Claude, LINE console และ Supabase RLS ต้องตรวจเพิ่มใน staging ที่มี secret จริง; tests ใน repoไม่เรียก paid provider.

## สิ่งที่ยังไม่กล่าวอ้าง

- ข้อมูลเวลาเปิด, คิว, service availability และ right acceptance ใน seed ไม่ใช่ real-time.
- Dataset เป็นขอบเขต hero/demo ไม่ใช่รายชื่อสถานพยาบาลทั่วประเทศ.
- Browser print เป็น PDF pipeline ของ MVP ไม่ใช่ server-side PDF rendering service.
- Passport ไม่ใช่เอกสารที่สถานพยาบาลรับรอง ไม่ใช่ใบส่งตัว และไม่ใช่ใบรับรองแพทย์.
- หากไม่ตั้ง Supabase, offline demo fallback ยังเป็น in-process และไม่ durable ข้าม cold start.
- MVP ไม่ได้ใช้งาน ThaiLLM หรือ Neo4j จริง.

ข้อจำกัดทั้งหมดอยู่ที่ [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md).
