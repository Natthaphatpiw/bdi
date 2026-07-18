# คู่มือติดตั้ง — รู้สิทธิ์ รู้สุข MVP

ระบบเดียวให้บริการ Web, LINE LIFF และ API ด้วย Next.js App Router การตั้งค่าด้านล่างแยก “booth fallback” ที่รันได้ทันที ออกจาก “connected runtime” ที่เรียก Claude และ Supabase จริง

## 1. Prerequisites

- Node.js 22.13 ขึ้นไป (`.node-version` ระบุเวอร์ชันที่แนะนำ)
- npm
- Supabase project สำหรับ persistent cases/knowledge
- Claude API key สำหรับ live structured extraction/prescreen
- LINE Login/LIFF channel เฉพาะเมื่อทดสอบผ่าน LINE จริง

## 2. ติดตั้งและตั้งค่า environment

```bash
npm install
cp .env.example .env.local
```

ค่าขั้นต่ำสำหรับ booth fallback:

```dotenv
MODEL_PROVIDER=claude
KNOWLEDGE_PROVIDER=supabase
ENABLE_JSON_KNOWLEDGE_FALLBACK=true
DEMO_MODE=true
ENABLE_PRIVATE_OPTIONS=false
ENABLE_FACILITY_FEEDBACK=true
ENABLE_PASSPORT_SHARE=true
```

ถ้าไม่ได้ใส่ Claude/Supabase secrets หน้า `/demo` ยังใช้ precomputed result และ JSON knowledge ได้ หากตั้ง `DEMO_MODE=false` หรือใช้งาน non-demo ต้องตั้ง:

```dotenv
CLAUDE_API_KEY=
CLAUDE_MODEL=claude-sonnet-5
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=
```

`SUPABASE_SERVICE_KEY` และ `CLAUDE_API_KEY` เป็น server-only ห้ามใช้ prefix `NEXT_PUBLIC_` และห้าม commit `.env.local`

## 3. Supabase

เปิด SQL Editor แล้วรันไฟล์ต่อไปนี้ตามลำดับ:

1. `supabase/migrations/202607180001_verified_care_route_mvp.sql`
2. `supabase/seed_mvp.sql`
3. `supabase/storage.sql` เฉพาะเมื่อใช้ document upload ของ legacy surface

Migration รันซ้ำได้ในขอบเขตที่ระบุด้วย `create ... if not exists`/upsert, สร้าง indexes, effective-date views, candidate RPC และ RLS. Seed ใช้ข้อมูล demo เท่านั้นและระบุ verification/source/effective dates ทุก fact ที่นำไปใช้ routing. Rollback notes อยู่ท้าย migration

จากนั้น:

1. เปิด Authentication → Providers → Anonymous Sign-ins ถ้าจะใช้ web account/legacy surface
2. ตรวจว่า service-role key อยู่เฉพาะ server/Vercel secrets
3. เรียก `/api/health` และคาดหวังเพียง readiness โดยไม่เปิดเผย provider/config detail
4. ทดสอบ RLS และการลบเคสใน staging ก่อนรับข้อมูลจริง

รายละเอียด table/policy และคำสั่งตรวจ seed อยู่ใน `docs/SUPABASE_SETUP.md`

## 4. ตรวจ knowledge data

```bash
npm run validate:knowledge
```

Validator ต้องผ่านก่อน deploy และจะ fail เมื่อมี duplicate ID, source หาย, effective dates ผิด, orphan relationship, coverage ชี้ service/right ที่ไม่มี, facility links เสีย หรือ eligibility rule ขาด required attributes

## 5. รัน local

```bash
npm run dev
```

เปิด:

- Web MVP: <http://localhost:3000/demo>
- LINE layout preview: <http://localhost:3000/liff/demo>
- Legacy web: <http://localhost:3000>
- Health: <http://localhost:3000/api/health>

Internal debug ใช้ `/internal/debug/case/[caseId]` เฉพาะ `NODE_ENV=development` หรือเมื่อ `ADMIN_DEBUG=true` ห้ามเปิด public ใน production

## 6. LINE LIFF

สร้าง LIFF app ใต้ LINE Login channel เดียว ตั้ง scope `openid profile`, size `Full` และ endpoint หลักเป็น:

```text
https://<domain>/liff/demo
```

ตั้งค่า:

```dotenv
LINE_CHANNEL_ID=
LINE_CHANNEL_SECRET=
NEXT_PUBLIC_LIFF_ID_HOME=
NEXT_PUBLIC_LIFF_ID=
```

Route demo ถูกออกแบบให้เปิดได้โดยไม่บังคับ auth เพื่อความพร้อมที่บูท ส่วน personal/legacy routes ยังคงใช้ LIFF ID token → Supabase session

## 7. Verification ก่อน deploy

```bash
npm run validate:knowledge
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration
npm run build
```

สำหรับ browser test:

```bash
npx playwright install webkit
npm run test:e2e
```

Smoke-test อย่างน้อย: hero case, emergency phrase, unknown scheme, Claude unavailable fallback, Passport create/share/revoke, feedback และ reset

## 8. Deploy บน Vercel

1. Import repository และใช้ Node.js 22
2. ตั้ง environment variables จาก `.env.example` แยก Preview/Production
3. รัน Supabase migration/seed ก่อนเปิด traffic
4. Deploy แล้วทดสอบ `/api/health`, `/demo`, shared Passport noindex/no-store และ LINE endpoint
5. ตั้ง LIFF endpoint เป็น production HTTPS URL

ไม่ต้องตั้ง Neo4j, RunPod หรือ ThaiLLM สำหรับ MVP นี้ Future adapter variables ใน `.env.example` เป็น documentation เท่านั้น

## 9. Booth degraded-mode check

ก่อนเริ่มบูท ให้ทดลองลบ/ปิด `CLAUDE_API_KEY` ชั่วคราวใน local/preview แล้วรัน hero case A ระบบต้องยังจบ flow ด้วย deterministic result, มี primary/backup/evidence และแสดงคำเตือนให้โทรยืนยัน โดยไม่แสดงชื่อ provider หรือคำว่า fallback ใน UI

ขั้นตอนสาธิตเต็มอยู่ใน `docs/DEMO_RUNBOOK.md`
