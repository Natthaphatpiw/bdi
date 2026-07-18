# รู้สิทธิ์ รู้สุข

Verified Rights-to-Care Navigation สำหรับ BDI Hackathon 2026: ผู้ใช้เล่าอาการครั้งเดียว ระบบตรวจสัญญาณอันตราย ถามข้อมูลที่จำเป็น ตรวจสิทธิ์ จับคู่บริการและสถานที่ และสร้างเส้นทางที่ตรวจสอบหลักฐานได้

> ข้อมูลในระบบเป็นการคัดกรองและนำทางเบื้องต้น ไม่ใช่การวินิจฉัย โปรดให้บุคลากรทางการแพทย์ประเมินอีกครั้ง

## ทดลอง MVP

- Booth demo: <http://localhost:3000/demo>
- LINE LIFF demo: <http://localhost:3000/liff/demo>
- Health check: <http://localhost:3000/api/health>
- Internal debug (development หรือ `ADMIN_DEBUG=true` เท่านั้น): `/internal/debug/case/[caseId]`

หน้า `/demo` มีเคสตัวอย่าง 3 เคสที่เป็น precomputed cache จึงทำงานได้แม้ Claude หรือ Supabase ไม่พร้อม; เมื่อเลือก “พิมพ์เรื่องของฉันเอง” ระบบจะลอง provider ที่ตั้งค่าก่อนและแสดง degraded warning หากต้องใช้ JSON. Neo4j และ ThaiLLM ไม่จำเป็นต่อ flow นี้

## Runtime ที่ใช้อยู่จริง

| ความรับผิดชอบ | MVP runtime | Fallback/อนาคต |
|---|---|---|
| Structured extraction, prescreen, explanation, follow-up | Claude ผ่าน `ModelProvider` | deterministic demo result; ThaiLLM เป็น adapter skeleton |
| Rights, services, facilities, evidence | Supabase PostgreSQL ผ่าน `KnowledgeProvider` | versioned JSON; Neo4j-compatible adapter skeleton |
| Safety, eligibility, cost wording, facility ranking | deterministic TypeScript rules | ไม่ให้โมเดล override ผล |
| Case/Passport persistence | Supabase แบบ fail-closed สำหรับเคสจริง; demo เก็บชั่วคราวพร้อม TTL เมื่อตั้ง Supabase | in-process + browser session เมื่อ offline |

ค่าปริยายคือ:

```dotenv
MODEL_PROVIDER=claude
KNOWLEDGE_PROVIDER=supabase
ENABLE_JSON_KNOWLEDGE_FALLBACK=true
DEMO_MODE=true
ENABLE_PRIVATE_OPTIONS=false
```

Neo4j, RunPod และ ThaiLLM ไม่ใช่ dependency ของ killer journey และไม่จำเป็นต่อ build/demo ปัจจุบัน ดูรายละเอียดที่ [Architecture target vs runtime](docs/ARCHITECTURE_TARGET_VS_RUNTIME.md)

## เริ่มใช้งาน

ต้องใช้ Node.js 22.13 ขึ้นไป

```bash
npm install
cp .env.example .env.local
npm run validate:knowledge
npm run dev
```

เคสตัวอย่างบนการ์ดรันได้โดยไม่ใส่ secret. หากต้องการให้เรื่องที่ผู้ใช้พิมพ์เองเรียก Claude/Supabase และให้ state รอด cold start ให้ใส่ `CLAUDE_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` และ `SUPABASE_SERVICE_KEY` ใน `.env.local`

ตั้งฐานข้อมูลโดยรันตามลำดับใน Supabase SQL Editor:

1. `supabase/migrations/202607180001_verified_care_route_mvp.sql`
2. `supabase/seed_mvp.sql`

Migration มี knowledge/case/passport/feedback tables, indexes, views, RPC และ RLS ส่วน seed ใช้ stable namespaced IDs เดียวกับ JSON fallback รายละเอียดอยู่ใน [Supabase setup](docs/SUPABASE_SETUP.md)

## คำสั่งตรวจสอบ

```bash
npm run validate:knowledge  # schema, source links, effective dates, orphan links
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration
npm run test:e2e
npm run build
npm run verify              # ทุกอย่างยกเว้น browser E2E
```

## Killer flow

```text
เรื่องเล่าครั้งเดียว
  → deterministic safety gate
  → structured extraction + required-slot policy
  → clarification ไม่เกินข้อมูลที่ทำให้คำตอบเปลี่ยน
  → review และยืนยัน
  → prescreen + deterministic urgency floor
  → rights/service/facility matching
  → Verified Care Route (primary + backup + evidence)
  → Case Passport (mobile/print/share)
  → Proof of Access feedback
```

ระบบไม่ให้ LLM ตัดสินสิทธิ์ เลือกหรือเรียงสถานพยาบาล เปลี่ยน urgency ให้ต่ำกว่ากฎ หรือสร้างค่าใช้จ่ายที่ไม่มี fact รองรับ

## โครงสร้างสำคัญ

```text
app/demo, app/liff/demo              booth entry
app/api/cases/**                     typed case state-machine APIs
app/api/passports/**                 Passport owner/share APIs
components/mvp/**                    intake, route, Passport, feedback UI
lib/mvp/contracts.ts                 Zod contracts
lib/mvp/providers/**                 model/knowledge adapters
lib/mvp/safety.ts                    deterministic safety gate
lib/mvp/eligibility.ts               three-valued eligibility + trace
lib/mvp/facility-ranking.ts          hard filters + 0–100 score
data/knowledge/v1/**                 versioned JSON fallback
scripts/validate-knowledge-data.ts   build-time data validation
supabase/migrations/**               relational graph-compatible schema
supabase/seed_mvp.sql                booth knowledge seed
```

Legacy web/LIFF chat, document and history surfaces ยังอยู่เพื่อ backward compatibility แต่การสาธิต MVP ให้ใช้ `/demo` หรือ `/liff/demo`

## Privacy และการลบข้อมูล

- ระบบไม่ขอหรือเก็บเลขบัตรประชาชน 13 หลัก คำว่า “บัตรประชาชน” ใน checklist หมายถึงให้นำเอกสารไปด้วยเท่านั้น
- Demo narrative เก็บใน browser session/in-process; เมื่อเชื่อม Supabase จะเก็บแบบชั่วคราวไม่เกิน 72 ชั่วโมง และลบแบบ cascade ด้วย reset/`purge_expired_demo_cases()`; ไม่ใช้เป็น analytics payload
- Passport share ใช้ opaque random token เก็บเฉพาะ hash ฝั่ง server หมดอายุปริยายใน 72 ชั่วโมง และ revoke ได้
- Shared Passport ตั้ง `noindex` และ `no-store`; แสดงเฉพาะ consent scope และตัดเรื่องเล่าต้นฉบับ/รายการยา/ข้อมูลแพ้ยาจาก public share โดยปริยาย
- ผู้ใช้เดิมลบบัญชีและข้อมูลได้ผ่าน `DELETE /api/me`; MVP case API รองรับลบเคสผ่าน `DELETE /api/cases/[id]`
- Logs/analytics ไม่เก็บ full medical narrative และ provider raw output ไม่ถูกส่งถึง client

ก่อนใช้งานกับข้อมูลจริง ต้องรัน migration/RLS ใน Supabase, ตั้ง retention policy และทดสอบ right-to-erasure ใน staging

## เอกสาร

- [Current architecture audit](docs/CURRENT_ARCHITECTURE_AUDIT.md)
- [Demo runbook](docs/DEMO_RUNBOOK.md)
- [MVP implementation report](docs/MVP_IMPLEMENTATION_REPORT.md)
- [Architecture target vs runtime](docs/ARCHITECTURE_TARGET_VS_RUNTIME.md)
- [Known limitations](docs/KNOWN_LIMITATIONS.md)
- [Data update guide](docs/DATA_UPDATE_GUIDE.md)
- [Safety and disclaimer](docs/SAFETY_AND_DISCLAIMER.md)
- [Setup แบบละเอียด](SETUP.md)
