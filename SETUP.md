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

## 6) LINE Mini App (LIFF) — Published: BDI
ค่าที่ตั้งไว้: Channel ID `2010548037`, LIFF ID `2010548037-5rV4ZG6L`

ต้องทำใน **LINE Developers Console**:
1. **LIFF → Endpoint URL** = `https://<โดเมนที่ deploy>/liff`  (ต้องเป็น HTTPS จริง — localhost ใช้ไม่ได้กับ LIFF)
2. **LIFF → Scopes** = เปิด `openid` + `profile` (ต้องมี `openid` เพื่อให้ `getIDToken()` ใช้ได้)
3. **LIFF → Size** = `Full`
4. ทดสอบ local: ใช้ tunnel เช่น `npx localtunnel --port 3000` หรือ `cloudflared tunnel --url http://localhost:3000` แล้วเอา HTTPS URL ไปตั้งเป็น Endpoint `/liff` ชั่วคราว
5. เปิดผ่าน `https://miniapp.line.me/2010548037-5rV4ZG6L` ในแอป LINE

> Auth flow: LIFF `getIDToken()` → `POST /api/auth/line` (verify กับ LINE ด้วย channel id/secret) → คืน Supabase session → ใช้เป็น Bearer ทุก API

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
