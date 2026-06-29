# รู้สิทธิ์ รู้สุข — Full-stack Next.js

AI Health-Rights Concierge สำหรับ **BDI Hackathon 2026**. เล่าเรื่องสุขภาพ (พิมพ์/พูด/แนบ PDF) → ได้ **action cards ที่ทำต่อได้**: ไปไหน อะไรฟรี มีสิทธิ์อะไร ฉุกเฉินโทรใคร — ทุกคำตอบมีที่มา

> **2 client, 1 API:** Web App (`/`) + LINE Mini App / LIFF (`/liff`) ใช้โค้ด/endpoint ชุดเดียวกัน
> ติดตั้ง: ดู **[SETUP.md](SETUP.md)**

## สถาปัตยกรรม (mapping จาก product-architecture.md)
| ชั้น | เทคโนโลยี | ไฟล์ |
|---|---|---|
| Orchestrator / NLU / synthesis / STT / embeddings | **Gemini** (`gemini-3.5-flash`) — แทน ThaiLLM-8B (เรื่อง cost) | `lib/gemini.ts`, `lib/orchestrator.ts` |
| Triage 27B + safety rails | **ThaiLLM-27B-Prescreen** บน **RunPod Serverless** (adapter `prescreen`) + ER-override/min-severity-floor | `lib/runpod/*` |
| Eligibility (deterministic) | rule engine 3-valued (ELIGIBLE/NOT/INDETERMINATE) + trace | `lib/ruleEngine.ts` |
| Knowledge graph | Neo4j Aura (template-first Cypher + static fallback) | `lib/neo4j.ts`, `lib/kg.ts` |
| Safety pre-check | keyword/red-flag → Emergency 1669 ก่อน LLM | `lib/safety.ts` |
| SQL + pgvector + Auth + Storage | Supabase | `lib/supabase/server.ts`, `lib/retrieve.ts`, `lib/documents.ts` |
| LINE auth bridge | LIFF idToken → Supabase session | `lib/line.ts`, `app/api/auth/line` |

**Pipeline (`lib/orchestrator.ts`):** safety pre-check → NLU (Gemini) → [prescreen(27B)+rails ∥ KG R1/R2/facility ∥ rule engine ∥ GraphRAG] → synthesis → ordered cards (Safety→Care→Rights→Benefit→Facility→Next→Evidence). LLM **ไม่ตัดสินสิทธิ์** — แค่เรียบเรียง trace จาก rule engine.

## โครงสร้าง
```
app/
  layout.tsx                 # root (Noto Sans Thai)
  providers.tsx              # TanStack Query + AuthProvider(surface)
  (web)/                     # ── Web App surface ── route group (no prefix)
    layout.tsx               #   Providers surface="web" + WebShell
    page.tsx chat/ rights/ facilities/ documents/ profile/ history/
  liff/                      # ── LINE Mini App surface ── /liff/*
    layout.tsx               #   Providers surface="line" + LiffShell (LIFF init)
    page.tsx chat/ rights/ facilities/ documents/ profile/ history/
  api/                       # ── shared API (both surfaces) ──
    health  auth/line  session  session/[id]/messages  sessions
    turn (SSE)  stt  documents (+/[id])  profile  consent  me
    eligibility  facilities/search  feedback  admin/review-queue  admin/audit/[sessionId]
components/  ui/ chat/ cards/ layout/ screens/
lib/         types · env · http · gemini · orchestrator · ruleEngine · safety
             runpod/ (prescreen+rails+vocab) · kg · neo4j · retrieve · documents
             line · supabase/ · client/ (api, auth, liff, supabaseBrowser)
hooks/ useVoice.ts   store/ ui.ts toast.ts   supabase/ schema.sql storage.sql
```

## API (สรุป)
| Method | Path | หน้าที่ |
|---|---|---|
| POST | `/api/auth/line` | LIFF idToken → Supabase session |
| POST | `/api/session` · GET `/api/sessions` · GET `/api/session/{id}/messages` | session + ประวัติ |
| POST | `/api/turn` | **หัวใจ** — 1 เทิร์น → AnswerCards (รองรับ SSE `Accept: text/event-stream`) |
| POST | `/api/stt` | เสียง → ข้อความ (Gemini) |
| POST/GET | `/api/documents` (+`/{id}`) | อัป PDF → ingest → user_doc_chunks |
| GET/PUT | `/api/profile` · POST `/api/consent` · DELETE `/api/me` | โปรไฟล์/ยินยอม/ลบข้อมูล (PDPA) |
| POST | `/api/eligibility` | ประเมินสิทธิ์ 1 รายการ (deterministic) |
| POST | `/api/facilities/search` | จับคู่สถานพยาบาล (+ระยะทาง) |
| POST | `/api/feedback` · GET `/api/admin/*` | feedback · review-queue · audit |

ทุก endpoint (ยกเว้น `health`, `auth/line`) ต้องมี `Authorization: Bearer <supabase_jwt>`

## รัน
```bash
npm run dev         # http://localhost:3000 (web) · /liff (LINE) · /api/health
npm run build       # production build
npm run typecheck   # tsc --noEmit
```

## ความปลอดภัย / PDPA
- กราฟสาธารณะไม่มี PII · ข้อมูลส่วนตัวอยู่ Supabase + RLS (`auth.uid() = user_id`)
- เชื่อม user↔สิทธิ์ ด้วย runtime parameter (ไม่มี Person node ในกราฟ)
- consent รายชั้น (chat/phr/wearable/doc) · ลบได้ทั้งหมด (`DELETE /api/me`, cascade + storage)
- ตัดสินสิทธิ์ด้วย rule engine ไม่ใช่ AI · ทุกคำตอบมี evidence + disclaimer "ไม่วินิจฉัยแทนแพทย์"
