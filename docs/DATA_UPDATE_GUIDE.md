# Knowledge Data Update Guide

## Source of truth

Supabase normalized tablesเป็น runtime knowledge store. `data/knowledge/v1/*.json` เป็น versioned fallback/seed และต้องรักษา graph-compatible stable IDs:

- `right:*`, `cond:*`, `sym:*`, `svc:*`, `fac:*`, `area:*`, `benefit:*`, `rule:*`, `doc:*`.
- ห้ามเปลี่ยน ID เมื่อแก้ชื่อ display.
- ทุก recordต้องมี `source_id`, `effective_from`, `effective_to`, `verification_status`.

## Update workflow

1. เลือก primary/official source และเพิ่ม/แก้ `sources.json` ก่อน.
2. เพิ่ม fact ในไฟล์ domain และเชื่อมด้วย stable IDs; ห้าม hardcode factใน React component.
3. ถ้า sourceใหม่แทน sourceเดิม ให้ปิด factเดิมด้วย `effective_to` แทนการลบ history.
4. ใช้ `VERIFIED` เฉพาะ factที่ reviewerตรวจ source/date/conditionsแล้ว; ใช้ `NEEDS_CONFIRMATION` เมื่อ facility hours/acceptanceยังต้องโทรยืนยัน.
5. Cost `FREE` ต้องมี source officialและ `verification_status=VERIFIED`; validatorจะ fail หากไม่ครบ.
6. รัน:

```bash
npm run validate:knowledge
npm run test:unit
npm run test:integration
npm run build
```

7. สร้าง/ทดสอบ SQL seed diff; รัน migrationก่อน seedใน Supabase staging.
8. Review demo casesเพื่อไม่ให้ expected routeอ้าง inactive/expired record.

## Validation failures

`scripts/validate-knowledge-data.ts` fail เมื่อพบ duplicate ID, missing source, invalid date range, orphan coverage/facility link, missing eligibility required attrs, invalid negation regex หรือ demo referenceที่ไม่มีจริง. Build/CI ต้องเรียก validatorก่อน typecheck.

## Facility feedback

Feedback เป็น observed access ไม่ใช่ official fact. เก็บ sample size, success count, last confirmation และ moderation statusแยกจาก official information. แสดง confidenceได้เมื่อ moderated sample sizeถึง threshold (default 3). Demo feedbackต้องมี `is_demo=true`, `verification_status=DEMO_ONLY` และ label “ข้อมูลตัวอย่างสำหรับการสาธิต”.

## Migrating to a graph database

Relational edges (`symptom_condition_links`, `condition_service_links`, `service_right_coverages`, `facility_services`, `facility_rights`, `fact_sources`) mapตรงเป็น graph relationships. Exportต้องคง namespaced IDs, effective dates และ source IDs เพื่อเปลี่ยน providerได้โดยไม่เปลี่ยน case/route/passport contracts.
