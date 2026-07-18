# Safety and Disclaimer

## ขอบเขตผลิตภัณฑ์

รู้สิทธิ์ รู้สุขเป็นระบบคัดกรองและนำทางเบื้องต้น ไม่ใช่ระบบวินิจฉัยโรค ใบส่งตัว ใบรับรองแพทย์ หรือคำยืนยันจากสถานพยาบาล. ชื่อภาวะต้องแสดงเป็น “ภาวะที่อาจเกี่ยวข้อง” และไม่เกินสามรายการ.

ข้อความมาตรฐาน:

> ข้อมูลนี้เป็นการคัดกรองและนำทางเบื้องต้น ไม่ใช่การวินิจฉัย โปรดให้บุคลากรทางการแพทย์ประเมินอีกครั้ง

## Safety pipeline

1. ตรวจ versioned deterministic safety rules ก่อนเรียก model.
2. ตรวจ negation/exclusion เช่น “ไม่เจ็บหน้าอก” ไม่ match เพียงเพราะมี keyword.
3. ถ้า high-confidence emergency: เปลี่ยนสถานะเป็น `emergency_escalated`, แสดง 1669 และยุติ normal primary facility route.
4. Model prescreen คืน urgency candidateผ่าน Zod.
5. ตรวจ deterministic rulesซ้ำกับ structured symptoms/red flags.
6. Final urgency = ระดับที่เร่งด่วนกว่าระหว่าง rule floor กับ model; model เพิ่มได้แต่ลดไม่ได้.
7. Follow-up message ทุกข้อความกลับเข้าสู่ safety gateก่อนตอบ.

Rules MVP ครอบคลุมหมดสติ, หายใจลำบากรุนแรง, เจ็บหน้าอกรุนแรง, แขนขาอ่อนแรง/พูดไม่ชัดเฉียบพลัน, ชัก, เลือดออกมาก, สับสนเฉียบพลัน และแพ้รุนแรง. Source/effective/verification metadata อยู่ใน `data/knowledge/v1/safety-rules.json`.

## Rights and cost guardrails

- Scheme มาจาก user/profile confirmation เท่านั้น; `UNKNOWN` ไม่ถูกเดาเป็น UCS.
- ไม่มี coverage factที่ active + sourced → cost เป็น “ยังไม่มีข้อมูลค่าใช้จ่ายที่ยืนยันได้”.
- `FREE` ใช้ข้อความ “อยู่ภายใต้สิทธิ์สำหรับบริการนี้ ตามเงื่อนไขที่ระบุ” และต้องเป็น verified fact.
- `FIXED` แสดงจำนวนตาม source/conditions; `VARIABLE` ให้โทรยืนยัน; expired factsไม่ถูกใช้.
- `INDETERMINATE` แปลว่า “ต้องยืนยันข้อมูลเพิ่ม” ไม่ใช่ eligible.
- Private insurance/options ปิดเป็น default และไม่เข้า Passport.

## Facility guardrails

Primary candidate ต้อง active, มี required service, ไม่ reject right, care levelเหมาะ, factยัง effective และมี source. Unknown acceptance อยู่ได้เฉพาะ backup พร้อม warning. ถ้าไม่มี coordinates ระบบใช้ “อยู่ในพื้นที่ที่เลือก” และไม่ใช้คำว่า “ใกล้ที่สุด”. Opening hoursเป็น seed ไม่ใช่ live dataและต้องมีคำเตือนให้โทรยืนยัน.

## Passport and privacy

Passport ไม่บรรจุเลขบัตรประชาชน 13 หลัก, model/provider name, prompt, chain-of-thought, debug label, definite diagnosis, private insurance หรือ unrelated benefits. “บัตรประชาชน” ใน preparation checklistหมายถึงให้นำเอกสารไป ไม่ใช่ให้กรอกเลข. Share ต้องมี consent, opaque token, hash, 72-hour default expiry, revoke, noindex และ no-cache.

## Incident handling

หากพบ under-triage, wrong-right, wrong-facility หรือ unsafe cost claim:

1. ปิด affected fact/rule (`active=false` หรือ `verification_status=EXPIRED`).
2. รัน knowledge validation และ safety/unit/integration tests.
3. บันทึก incident/source correctionโดยไม่เก็บ full narrativeใน analytics.
4. Feedback รายบุคคลไม่แก้ official factโดยตรง; ต้อง review/moderateก่อน.
