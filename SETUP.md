# คู่มือติดตั้ง — รู้สิทธิ์ รู้สุข (Next.js full-stack)

ระบบเดียว เสิร์ฟ **2 client**: **Web App** (`/`) และ **LINE Mini App / LIFF** (`/liff`) โดยใช้ **API ชุดเดียวกัน**
- 8B router เดิม (ThaiLLM-8B) → ใช้ **Gemini** แทน (เรื่อง cost) · model = `gemini-3.5-flash`
- 27B prescreen → **RunPod Serverless** (OpenAI-compatible route, adapter `prescreen`)
- KG = Neo4j Aura · Vector/SQL/Auth/Storage = Supabase · STT/embeddings = Gemini

---

## 0) ติดตั้ง dependency
```bash
cd rusit-rusuk
npm install          # ติดตั้งแล้ว (มี node_modules)
```

## 1) ตั้งค่า `.env.local`
ไฟล์ `.env.local` ใส่ค่าจริงให้แล้วเกือบครบ — **เหลือ 1 ค่าที่คุณต้องเติมเอง**:
```
NEXT_PUBLIC_SUPABASE_ANON_KEY=   # ← Supabase → Project Settings → API → "anon public"
```
> ฝั่ง browser ต้องมี anon key เพื่อ sign-in (web = anonymous, line = แลก token จาก LINE) ถ้าไม่ใส่ หน้าเว็บจะขึ้น error ตอนล็อกอิน

ค่าอื่นที่ใส่ให้แล้ว: `SUPABASE_SERVICE_KEY`, `GEMINI_API_KEY`, `RUNPOD_ENDPOINT_ID`, `RUNPOD_API_KEY`, `NEO4J_*`, `NEXT_PUBLIC_LIFF_ID`, `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET`

## 2) Supabase — สร้างฐานข้อมูล (ทำครั้งเดียว)
1. เปิด **Supabase → SQL Editor** วางและรัน 2 ไฟล์นี้ตามลำดับ:
   - `supabase/schema.sql` (ตาราง + pgvector + RLS + RPC) — รันซ้ำได้ปลอดภัย
   - `supabase/storage.sql` (bucket `documents` สำหรับ PDF + policy)
2. เปิด **Authentication → Sign In / Providers → Anonymous Sign-ins = ON**
   (เว็บใช้ anonymous login; LINE Mini App ใช้ bridge — ทั้งคู่ต้องเปิด)
3. (ออปชัน) seed GraphRAG เพื่อให้มี citations เพิ่ม — ใช้สคริปต์ Python เดิมในโฟลเดอร์แม่ `bdi/`:
   ```bash
   cd ..                       # กลับไปที่ ~/Downloads/bdi
   .venv/bin/python app/export_kg_chunks.py     # Neo4j → kg_chunks
   .venv/bin/python app/seed_fewshots.py        # → kg_fewshots
   ```
   > ไม่ทำก็ได้ — ระบบ degrade ได้เอง (ใช้ KG + rule engine เป็นหลัก)

## 3) Neo4j Aura
มีข้อมูลโหลดอยู่แล้ว (309 nodes / 587 rels) — ใช้ได้ทันที ไม่ต้องทำอะไร
ถ้าต้องโหลดใหม่: `cd ..; .venv/bin/python load_to_neo4j.py --reset`

## 4) RunPod (ThaiLLM-27B-Prescreen)
Endpoint รันอยู่แล้ว (`dupmzwus7iv7vq`, adapter `prescreen`) — ใช้ได้ทันที
> ครั้งแรกอาจ cold start ~10-30 วิ; ถ้า endpoint ล่ม ระบบ fallback เป็น mock + safety rails ยังทำงาน

## 5) รัน dev
```bash
npm run dev
```
- Web App: <http://localhost:3000>
- LIFF: <http://localhost:3000/liff> (ดูข้อ 6 — LIFF ต้องเปิดผ่าน HTTPS จริง)
- ตรวจสุขภาพระบบ: <http://localhost:3000/api/health>

## 6) LINE LIFF — หลายแอป (1 LIFF ต่อ 1 หน้า) · domain `https://bdi-lac.vercel.app`
ใช้ **LINE LIFF หลายแอป** ภายใต้ **LINE Login channel** เดียว (Channel ID `2010548037`).
สร้างแต่ละ LIFF ใน **LINE Developers → channel → LIFF → Add**, ตั้งเหมือนกันทุกตัว:
**Scopes = `openid` + `profile`**, **Size = `Full`**, ตั้ง **Endpoint URL** ตามตาราง แล้วเอา LIFF ID ไปใส่ใน `.env.local`:

| หน้า | ตัวแปร .env | Endpoint URL |
|---|---|---|
| หน้าแรก | `NEXT_PUBLIC_LIFF_ID_HOME` | `https://bdi-lac.vercel.app/liff` |
| ปรึกษา/แชต | `NEXT_PUBLIC_LIFF_ID_CHAT` | `https://bdi-lac.vercel.app/liff/chat` |
| สิทธิ์ | `NEXT_PUBLIC_LIFF_ID_RIGHTS` | `https://bdi-lac.vercel.app/liff/rights` |
| หาสถานพยาบาล | `NEXT_PUBLIC_LIFF_ID_FACILITIES` | `https://bdi-lac.vercel.app/liff/facilities` |
| เอกสาร | `NEXT_PUBLIC_LIFF_ID_DOCUMENTS` | `https://bdi-lac.vercel.app/liff/documents` |
| โปรไฟล์ | `NEXT_PUBLIC_LIFF_ID_PROFILE` | `https://bdi-lac.vercel.app/liff/profile` |
| ประวัติ | `NEXT_PUBLIC_LIFF_ID_HISTORY` | `https://bdi-lac.vercel.app/liff/history` |

- ตัวที่เว้นว่าง → fallback ไป `NEXT_PUBLIC_LIFF_ID_HOME` อัตโนมัติ (เริ่มทำ HOME + CHAT ก่อนได้)
- โค้ดเลือก LIFF ID ตาม path ให้เอง (`lib/client/liffConfig.ts`) — คุณแค่ใส่ ID ให้ตรงช่อง
- เปิดผ่าน `https://liff.line.me/<LIFF_ID>` หรือผูกกับ Rich menu แต่ละปุ่ม → LIFF ของแต่ละหน้า
- **ใส่ env เดียวกันนี้บน Vercel ด้วย** (Settings → Environment Variables) แล้ว redeploy

> Auth flow: LIFF `getIDToken()` → `POST /api/auth/line` (verify กับ channel `2010548037`) → Supabase session. ทุก LIFF ใต้ channel เดียวใช้ `LINE_CHANNEL_ID/SECRET` ชุดเดียว

## 7) Deploy (แนะนำ Vercel)
1. push โค้ด `rusit-rusuk/` ขึ้น Git แล้ว Import เข้า Vercel
2. ตั้ง Environment Variables ทั้งหมดจาก `.env.local` (รวม `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
3. หลัง deploy: ตั้ง LIFF Endpoint URL = `https://<vercel-domain>/liff`
4. (ถ้าใช้ Supabase Storage จาก region อื่น/โดเมน custom เพิ่มใน `next.config.mjs` images)

---

## สรุปสิ่งที่ต้องทำเอง (เพราะต้องใช้สิทธิ์/คอนโซลของคุณ)
| # | สิ่งที่ต้องทำ | ที่ไหน |
|---|---|---|
| 1 | ใส่ `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` |
| 2 | รัน `schema.sql` + `storage.sql` | Supabase SQL Editor |
| 3 | เปิด Anonymous Sign-ins | Supabase Auth settings |
| 4 | ตั้ง LIFF Endpoint = `/liff`, scopes openid+profile, size Full | LINE Developers |
| 5 | (ออปชัน) seed kg_chunks/kg_fewshots | `python app/export_kg_chunks.py`, `seed_fewshots.py` |

ทุกอย่างนอกเหนือจากนี้ (API, หน้า web, หน้า LIFF, orchestrator, prescreen+rails, rule engine, STT, เอกสาร RAG) โค้ดพร้อมรันแล้ว
