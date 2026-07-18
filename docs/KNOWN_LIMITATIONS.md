# Known Limitations

## Booth MVP limitations

- เวลาเปิด บริการที่มี และการรับสิทธิ์ของสถานพยาบาลเป็น versioned seed/last-verified data ไม่ใช่ข้อมูลคิวหรือสถานะ real-time. UI จึงแสดง “โปรดโทรยืนยันก่อนเดินทาง”.
- Dataset ครอบคลุม hero cases และสถานที่ตัวอย่างในกรุงเทพฯ เท่านั้น ไม่ใช่ฐานสถานพยาบาลทั่วประเทศ.
- Fact ของ CSMBS/UCS/SSS ที่เป็น `NEEDS_CONFIRMATION` จะถูกลดคะแนนหรือแสดงคำเตือน; ระบบไม่เติม claim เมื่อหลักฐานไม่พอ.
- Case B (สิทธิลงทะเบียนต่างจังหวัด) จงใจให้ยืนยันขั้นตอนกับ 1330 แทนการเดากติกาหรือหน่วยบริการ.
- Case C ไม่ hardcode วงเงินทันตกรรมเมื่อ active verified coverage ยังยืนยันตัวเลขไม่ได้; ให้ตรวจสอบกับ 1506.
- พิกัดเป็นข้อมูล optional. หากผู้ใช้ไม่ให้พิกัด ระบบใช้ area match และไม่ใช้คำว่า “ใกล้ที่สุด”.
- Service Access Confidence แสดงเฉพาะ moderated aggregate ที่มี sample size อย่างน้อย 3. Aggregate สำหรับ demo ต้องติด label ว่าเป็นข้อมูลตัวอย่าง.

## Runtime and persistence

- เมื่อตั้ง Supabase, `/demo` เก็บ case/route/Passport/share แบบชั่วคราวไม่เกิน 72 ชั่วโมง และ purge/reset แบบ cascade จึง recover ข้าม serverless instance ได้. หากไม่ตั้ง Supabase จะเหลือ in-process memory + browser `sessionStorage`; โหมดนี้เหมาะกับบูท instance เดียวและไม่ durable ข้าม cold start.
- Non-demo durable case/passport persistence ต้องรัน Supabase migration/seed และตั้ง environment variables ให้ครบ. การเขียนเคสจริงเป็น fail-closed: ฐานข้อมูลล้มแล้ว API จะไม่ตอบ success.
- In-process rate limit เป็นการป้องกันสำหรับ MVP instance เดียว ไม่ใช่ distributed quota; production ควรใช้ shared rate-limit store.
- JSON fallback อ่านไฟล์จาก repo และต้อง deploy ใหม่เมื่อแก้ข้อมูล.
- Production dependency audit รอบส่งมอบไม่มี moderate/high/critical แต่ยังมี low advisories 3 รายการใน transitive AI SDK ของ legacy Mastra Passport path. Booth flow ใหม่ไม่ import path นี้; ควรถอด legacy Passport/Mastra หลัง migrate surface เดิมครบ หรืออัปเดตเมื่อ upstream ออกรุ่นแก้.

## Model behavior

- Claude เป็น runtime provider ชั่วคราว; extraction/prescreen ต้องผ่าน Zod และ deterministic rails เสมอ. Timeout, quota error หรือ invalid JSON จะใช้ deterministic/precomputed demo result หรือ degraded result ไม่สลับไป model อื่น.
- ThaiLLM และ Neo4j adapters เป็น future skeleton และไม่ถูกเรียกในค่าเริ่มต้นของ MVP.
- Follow-up ตอบได้เฉพาะ case snapshot/evidence. เมื่อไม่มี exact cost จะตอบว่าไม่มีข้อมูลตัวเลขยืนยัน.

## Passport

- “พิมพ์ / บันทึก PDF” ใช้ browser print pipeline เพื่อให้ข้อความไทยค้นหาได้. คุณภาพและ page break ขึ้นกับ browser; สำหรับบูทแนะนำ browser ปัจจุบันที่ทดสอบไว้.
- Share token มีอายุเริ่มต้น 72 ชั่วโมงและอาศัย configured Supabase เพื่อใช้ข้าม instance. Public snapshot เป็น minimal sanitized view; เจ้าของยังเห็น immutable full handoff snapshot ตาม consent.
- Passport ไม่ใช่เอกสารที่สถานพยาบาลรับรอง และไม่แทนใบส่งตัวหรือใบรับรองแพทย์.

## Legacy surface

- Legacy chat/document/history routes ยังอยู่เพื่อ backward compatibility และใช้ AnswerCards contract. Booth flow ใช้ `/demo`, `/liff/demo` และ `/api/cases/**`; ควร migrate legacy routes ก่อนขยาย production.
- Voice/document RAG เดิมยังใช้ optional Gemini services และไม่อยู่ใน killer journey acceptance path.

## Verification scope

- Automated tests ครอบคลุม deterministic engines, API hero journeys และ mobile viewport หลัก. Live Claude, LINE console และ Supabase project policies ต้อง smoke-test ด้วย real secrets ใน staging; tests ใน repo ไม่เรียก paid providers.
