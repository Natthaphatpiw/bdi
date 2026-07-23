# Demo coverage report

- รันเมื่อ: 2026-07-23T18:25:12.117Z
- base: http://localhost:3457 · scenario: รัน

## Static checks (§6.5)
- ✅ ผ่านทั้งหมด (golden strings / banned UI strings / no auto-dial)

## Unit tests (§6.2)
- ✅ Test Files  13 passed (13) ·       Tests  97 passed (97)

## Scenario (§6.3) — ผลรายหมวด

| หมวด | ผ่าน | ทั้งหมด | % |
|---|---|---|---|
| golden | 4 | 4 | 100% |
| adversarial | 18 | 18 | 100% |
| matrix | 40 | 40 | 100% |
| paraphrase | 10 | 10 | 100% |
| safety | 12 | 12 | 100% |

## เวลา (บนเครื่องที่รัน — full turn, non-streaming)
- p50: 9423ms · p95: 18578ms · max: 27224ms
- first-byte จริงวัดผ่าน streaming ใน QA-CHECKLIST (เครื่องจริง)

## Fixtures ที่ตก

- ไม่มี 🎉