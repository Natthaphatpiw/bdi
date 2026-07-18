# Architecture: Target vs Runtime

## Runtime ที่ใช้งานใน MVP

เส้นทางหลักของ Verified Care Route ใช้ provider boundary และตั้งค่าเริ่มต้นดังนี้:

| Layer | MVP runtime | Fallback ที่อนุญาต |
|---|---|---|
| Structured extraction / prescreen / explanation / follow-up | Claude ผ่าน `ClaudeModelProvider` | deterministic/precomputed demo result; ไม่ใช้ invalid model output |
| Knowledge | Supabase PostgreSQL normalized tables | versioned JSON ใน `data/knowledge/v1` |
| Eligibility | deterministic three-valued rule engine | `INDETERMINATE` เมื่อข้อมูลไม่ครบ |
| Safety | deterministic pre-check + post-model urgency floor | emergency route และ 1669; model ลด urgency ไม่ได้ |
| Facility selection | deterministic hard filters + 0–100 score | degraded route/phone verification เมื่อ facts ไม่พอ |
| Case/demo persistence | Supabase case tables; non-demo write fail-closed; demo writeแบบ TTL 72 ชั่วโมงเมื่อตั้งค่า | in-process + browser cache ยังทำให้บูทรันได้เมื่อ offline |
| Passport | immutable structured snapshot, version, token hash, expiry/revoke; browser printเป็น searchable PDF | mobile preview เสมอ |

ค่าหลัก:

```env
MODEL_PROVIDER=claude
KNOWLEDGE_PROVIDER=supabase
ENABLE_JSON_KNOWLEDGE_FALLBACK=true
ENABLE_PRIVATE_OPTIONS=false
```

Neo4j, RunPod และ ThaiLLM ไม่จำเป็นต่อ install, build, `/demo` หรือ Verified Care Route. การมี credential เก่าใน `.env.local` จะไม่เปิด provider เหล่านี้เอง.

## Target production architecture

เป้าหมายระยะถัดไปคือเปลี่ยน implementation หลัง interface โดยไม่เปลี่ยน product/API contract:

- `ThaiLLMModelProvider` ที่ผ่าน structured-output evaluation, latency SLO และ safety reviewเดียวกับ Claude adapter.
- `Neo4jKnowledgeProvider` หรือ graph database ที่รองรับ semantics อาการ → ภาวะ → บริการ → สิทธิ์ → สถานพยาบาล → แหล่งข้อมูล.
- Shared distributed rate-limit/cache layer และ scheduled retention monitoring; case/demo state ที่ตั้ง Supabase มี TTL recovery แล้วแต่ offline fallback ยังเป็น in-process.
- Moderation workflow และ reliability aggregationจาก proof-of-access feedback.
- Generated PDF serviceสำหรับไฟล์ downloadable ที่ deterministic และเก็บตาม consent policy.

Adapters สำหรับ ThaiLLM/Neo4j ใน repo เป็น skeleton เท่านั้นและ intentionally fail closed. เอกสารนี้ไม่กล่าวอ้างว่า MVP เรียกสอง provider นั้นจริง.

## Trust boundary

- User narrative เป็น untrusted data ไม่ใช่ instruction.
- Claude คืน structured candidate outputที่ต้องผ่าน Zod; output ที่ parse/validate ไม่ผ่านถูก discard.
- สิทธิ์, coverage, cost, facility และ evidence มาจาก `KnowledgeProvider` เท่านั้น.
- Eligibility result และ facility order เป็น deterministic; model แก้ผลหรือ reorder ไม่ได้.
- `provider_internal`, raw prompt, raw model output และ debug traceไม่อยู่ใน public case/passport contract.
- Share token เป็น opaque random value; serverเก็บเฉพาะ hash, มี expiry และ revoke.
- Public share สร้าง sanitized view จาก immutable owner snapshot และตัด original narrative, medications และ allergies โดยปริยาย.
- เมื่อ Supabase knowledge ล้มและ JSON รับช่วงต่อ request scope จะถูก mark `degraded`; ชื่อ provider ไม่ออกสู่ UI.

## Legacy boundary

Routes เดิม (`/api/session`, `/api/turn`, legacy result/passport) ถูกเก็บเพื่อไม่ทำลาย surface ที่มีอยู่ แต่ booth flow และ API ใหม่อยู่ใต้ `/api/cases/**`. Legacy Neo4j shim คืน empty และ fallback ไป local data; RunPod/ThaiLLM ไม่ถูกเปิดถ้า `MODEL_PROVIDER=claude`. งาน productionถัดไปควร migrate legacy chat/document entryเข้าสู่ case APIs แล้วถอด legacy card contracts.
