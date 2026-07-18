# Demo Runbook — BDI Hackathon 2026

เอกสารนี้ออกแบบสำหรับ demo 2–5 นาทีที่บูท. เส้นทางแนะนำคือเคส A; เคส B/C และ emergency ใช้ตอบคำถามหรือ smoke test เพิ่ม.

## 1. เตรียมก่อนเปิดบูท

### รันบนเครื่อง

```bash
npm install
npm run validate:knowledge
npm run dev
```

เปิด:

- Web booth: `http://localhost:3000/demo`
- LINE-size surface: `http://localhost:3000/liff/demo`
- Health check: `http://localhost:3000/api/health`

`/demo` ไม่ต้อง sign in LINE หรือ Supabase. สำหรับ demo offline/degraded ให้ตั้ง `ENABLE_JSON_KNOWLEDGE_FALLBACK=true` และใช้ scenario ที่เตรียมไว้. หากมี staging Supabase/Claude ให้ตั้งค่าใน `.env.local` ตาม `.env.example`; ห้ามฉาย secret บนจอ.

### เช็กล่วงหน้า 5 นาที

- หน้าแรกมีข้อความ “เล่าอาการครั้งเดียว ได้เส้นทางดูแลที่ทำตามได้” และ label “โหมดสาธิต”.
- ปุ่ม “เริ่มใหม่” อยู่ด้านบนและใช้งานได้.
- viewport มือถือ 390×844 ไม่มี horizontal overflow; CTA ล่างกดได้.
- โทรศัพท์/แผนที่จาก seed เปิดได้ แต่ย้ำว่าเวลาเปิดและการรับสิทธิ์ต้องโทรยืนยัน.
- ทดลองสร้าง Passport, พิมพ์ และแชร์หนึ่งครั้งบน browser ที่จะใช้จริง.
- ถ้าใช้ share link ข้ามอุปกรณ์/cold start ต้องตั้ง Supabase; ระบบเก็บ demo แบบ TTL 72 ชั่วโมง. โหมดไม่มี Supabase ยังเป็น instance-local.

## 2. Hero demo script (ประมาณ 3 นาที)

### ขั้นที่ 1 — เริ่มเคสในคลิกเดียว

เปิด `/demo` แล้วกด **“ทดลองด้วยเคสตัวอย่าง”** หรือ card **“ลูกชายถามแทนพ่อ 68 ปี มีอาการที่อาจเกี่ยวข้องกับเบาหวาน”**.

ข้อความ hero ที่ระบบกรอกคือ:

> พ่ออายุ 68 ปี ช่วง 5 วันที่ผ่านมาเพลียมาก ปัสสาวะบ่อยและกระหายน้ำบ่อย อยู่ลาดพร้าว ใช้สิทธิข้าราชการ และได้รับบำนาญจากรัฐ อยากรู้ว่าควรไปตรวจที่ไหนและต้องเตรียมอะไร

สิ่งที่ควรพูดกับกรรมการ:

> “ผู้ใช้เล่าครั้งเดียว ระบบเก็บเรื่องเดิมไว้ แล้วดึงเฉพาะข้อมูลที่เปลี่ยนความปลอดภัย สิทธิ์ และเส้นทาง”

### ขั้นที่ 2 — ตอบ minimal clarification

scripted hero path ควรถามคำถามด้านความปลอดภัยหนึ่งข้อ:

> “ตอนนี้มีหมดสติ หายใจลำบากรุนแรง เจ็บหน้าอกรุนแรง ชัก หรือแขนขาอ่อนแรงเฉียบพลันหรือไม่”

กด **“ไม่มี”**.

หาก provider ถาม field เพิ่มเพราะข้อมูลยังไม่มั่นใจ ให้ยืนยันค่าต่อไปนี้และอย่าคาดเดานอกเคส:

- ผู้ป่วย: พ่อ
- อายุ: 68 ปี
- ระยะเวลา: 5 วัน
- พื้นที่: ลาดพร้าว
- สิทธิ์: ข้าราชการ (`CSMBS`)
- สัญญาณอันตรายที่ถาม: ไม่มี
- ได้รับบำนาญ/รายได้ประจำจากรัฐ: มี

### ขั้นที่ 3 — Review ก่อนประมวลผล

หน้า **“เราเข้าใจเคสนี้ว่า”** ต้องแสดงผู้ป่วย อายุ สิทธิ์ พื้นที่ อาการ ระยะเวลา และเป้าหมาย. ชี้ให้เห็นว่าแต่ละ field แก้ได้ แล้วกด **“ยืนยันและสร้างเส้นทางดูแล”**.

ระหว่างรอให้ชี้ progress 5 ขั้น:

1. ทำความเข้าใจเรื่องเล่า
2. ตรวจความปลอดภัย
3. ตรวจสิทธิ์
4. จับคู่สถานที่
5. สร้างเส้นทาง

### ขั้นที่ 4 — อ่าน Verified Care Route

ผลที่คาดจาก hero seed/precomputed result:

- ไม่พบ emergency จากข้อมูลตั้งต้น.
- Urgency: **“ควรพบแพทย์ภายใน 1–3 วัน”**; หน้าไม่เปิดด้วยชื่อโรค.
- ภาวะปรากฏในบริบทว่า **“ภาวะที่อาจเกี่ยวข้องกับเบาหวาน”** ไม่ใช่การวินิจฉัย.
- เส้นทางหลัก: **ศูนย์บริการสาธารณสุข 66 ตำหนักพระแม่กวนอิม โชคชัย 4** สำหรับประเมินอาการ/ความเสี่ยงเบาหวาน.
- เส้นทางสำรอง: **โรงพยาบาลราชวิถี** เมื่อเส้นทางแรกไม่พร้อมหรือจำเป็นต้องยกระดับบริการ.
- การรับ CSMBS ที่เส้นทางหลักเป็นข้อมูลมีเงื่อนไขและต้องโทรยืนยัน; เวลาเปิดไม่ใช่ real-time.
- ค่าใช้จ่ายแสดงว่า **“ยังไม่มีข้อมูลค่าใช้จ่ายที่ยืนยันได้”** ตามรายการบริการจริง ไม่ใช้คำว่า “ฟรี”.
- ผลกฎเบี้ยยังชีพผู้สูงอายุของ demo case เป็น `NOT_ELIGIBLE` จากข้อมูลว่ารับบำนาญ/รายได้รัฐ; UI/Passport ต้องไม่กล่าวว่าได้รับ 600 บาท.
- Checklist เฉพาะเคส เช่น บัตรประชาชนสำหรับนำไปยืนยันตัวตน, ข้อมูลสิทธิ์, รายการยา และผลตรวจเดิมถ้ามี.

หมายเหตุ: หาก source/facility fact ถูกปรับเวอร์ชันหลัง runbook นี้ deterministic rank อาจเปลี่ยน primary/backup ได้ แต่ทุกสถานที่ต้องผ่าน service/right hard filters และแสดงเหตุผล/evidence. ก่อนบูทให้เทียบกับ `data/knowledge/v1/demo-cases.json` และรัน knowledge validator.

### ขั้นที่ 5 — เปิด killer feature “ทำไมแนะนำเส้นทางนี้”

เลื่อนหลังส่วนสิทธิ์แล้วกด **“ทำไมแนะนำเส้นทางนี้”**. Drawer ต้องแบ่งเหตุผลเป็น:

- เหตุผลด้านความปลอดภัย
- เหตุผลด้านการดูแล
- เหตุผลด้านสิทธิ์
- เหตุผลด้านสถานที่
- ความใหม่ของหลักฐาน

สิ่งที่ควรพูด:

> “นี่เป็น summarized deterministic trace ไม่ใช่ chain-of-thought. Model ไม่ได้เป็นผู้เลือกหรือ reorder สถานพยาบาล”

ปิด drawer แล้วกด **“ดูหลักฐาน”** ใน route card หรือเปิด **“หลักฐานและที่มาของคำแนะนำ”**. ชี้ publisher, effective/retrieved date และสถานะ official/verification. อย่าบอกว่า seed เป็นข้อมูลสด.

### ขั้นที่ 6 — สร้าง Case Passport

กด **“สร้าง Case Passport”** หลังผู้ใช้เห็น route. Preview ควรมี:

- บริบทผู้ป่วยและเรื่องเดิม
- urgency/safety answers และสิ่งที่ต้องเฝ้าระวัง
- “ภาวะที่อาจเกี่ยวข้อง” สูงสุด 3 รายการพร้อม disclaimer
- สิทธิ์เฉพาะบริการในเคส
- primary/backup และเหตุผล
- preparation และคำถามสำหรับบุคลากร
- evidence และ consent/disclaimer

ชี้ให้ชัดว่า Passport เป็น **ข้อมูลสรุปก่อนเข้ารับบริการ** ไม่ใช่ใบส่งตัว ใบรับรองแพทย์ หรือผลวินิจฉัย และไม่กล่าวอ้างว่าสถานพยาบาลรับรอง.

การพิมพ์/PDF:

1. กด **“พิมพ์ / บันทึก PDF”**.
2. ใน print dialog เลือก A4 และ “Save as PDF”.
3. ข้อความยังค้นหา/เลือกได้; section สำคัญใช้ page-break protection.

การแชร์:

1. ติ๊ก consent **“ฉันยินยอมให้สร้างลิงก์ชั่วคราว…”**.
2. กด **“สร้างลิงก์แชร์”**.
3. แสดงลิงก์/QR แล้วเปิด `/passport/share/[token]` เพื่อดู sanitized snapshot.
4. อธิบายว่า token เป็น opaque, server เก็บ hash, หมดอายุไม่เกิน 72 ชั่วโมง, share page noindex/nocache และเพิกถอนได้. Public view ตัดเรื่องเล่าต้นฉบับ, รายการยา และข้อมูลแพ้ยาโดยปริยาย.
5. กด **“เพิกถอน”** แล้วทดสอบลิงก์เดิม: ต้องเปิดไม่ได้.

การสร้างเวอร์ชันใหม่: กด **“สร้างเวอร์ชันใหม่”**; snapshot เดิมไม่ถูก overwrite และเลขเวอร์ชันเพิ่ม.

### ขั้นที่ 7 — Proof of Access และ reset

ด้านล่าง result ตอบ prompt **“ได้รับบริการตามเส้นทางที่แนะนำหรือไม่”** ไม่เกิน 3 ขั้น. อธิบายว่า feedback คนเดียวไม่แก้ official fact; ต้องผ่าน moderation/aggregate และแยก “ข้อมูลทางการ” จาก “การเข้าถึงที่ผู้ใช้รายงาน”. Demo feedback ต้องมี label **“ข้อมูลตัวอย่างสำหรับการสาธิต”**.

จบ demo ด้วยปุ่ม **“เริ่มใหม่”** ด้านบน. Expected:

- กลับหน้าเลือก scenario ทันที.
- ล้าง case/route/checklist ใน `sessionStorage`.
- ขอ server reset แบบ best effort; UI ไม่ค้างแม้ server reset ไม่ตอบ.

## 3. Demo ทางเลือก

### Case B — บัตรทองต่างจังหวัดในกรุงเทพฯ

เลือก card **“บัตรทองต่างจังหวัด ป่วยในกรุงเทพฯ”**.

Expected:

- ไม่เดากฎข้ามพื้นที่หรือค่าใช้จ่าย.
- แสดงการประเมินอาการเจ็บป่วยเฉียบพลันในพื้นที่บางกะปิ และขั้นตอนตรวจสอบสิทธิ/หน่วยบริการ.
- มี **1330** เป็นช่องทางตรวจสอบ/backup เมื่อจำเป็น พร้อมคำเตือนให้ยืนยันขั้นตอนเพราะสิทธิลงทะเบียนต่างจังหวัด.
- ไม่กล่าวว่ารับบริการได้แน่นอนหรือไม่มีค่าใช้จ่าย.

### Case C — ประกันสังคม ทันตกรรม

เลือก card **“ประกันสังคม ต้องการใช้สิทธิ์ทันตกรรม”**.

Expected:

- Urgency เป็น routine appointment เมื่อไม่มี red flag.
- แสดงบริการทันตกรรมและการตรวจสอบสิทธิประกันสังคมเท่านั้น ไม่ปนสิทธิ์เบาหวาน/benefit อื่น.
- ใช้ active effective-dated rule. หากวงเงินปี 2569 ยัง `NEEDS_CONFIRMATION` ต้องไม่แสดงตัวเลขเก่าและให้ตรวจสอบกับ **1506**.
- สายด่วน/ระบบตรวจสอบสิทธิเป็น navigation service ไม่กล่าวว่าเป็นสถานพยาบาล.

### Emergency smoke test

กด **“พิมพ์เรื่องของฉันเอง”** แล้วใช้ข้อความ:

> พ่อเจ็บหน้าอกรุนแรงและหายใจลำบากมาก เริ่มทันที ตอนนี้อยู่ลาดพร้าว ใช้สิทธิ์ข้าราชการ

Expected:

- deterministic pre-check ทำงานก่อนเรียก model.
- แสดงข้อความ **“อาการที่เล่ามาอาจต้องได้รับความช่วยเหลือฉุกเฉิน โทร 1669 ทันที”**.
- Normal facility/rights route ไม่เป็น primary และไม่มีคำแนะนำให้รอดูอาการ.
- หาก model ให้ระดับต่ำกว่า rule ผลสุดท้ายยังเป็น `EMERGENCY_NOW`.

### Unknown-scheme smoke test

พิมพ์อาการ/พื้นที่แต่เลือก **“ไม่ทราบสิทธิ์”**.

Expected:

- ระบบถามหรือแสดงวิธีตรวจสอบสิทธิ์; ไม่เดาเป็นบัตรทอง.
- Route ที่ไม่ผูกสิทธิ์อาจเป็น degraded/scheme-agnostic.
- ค่าใช้จ่ายเป็น **“ยังไม่มีข้อมูลค่าใช้จ่ายที่ยืนยันได้”**.

## 4. เมื่อ API/Claude/Supabase มีปัญหา

### Claude timeout, quota หรือ structured output ไม่ผ่าน

- ระบบจำกัด timeout 12 วินาทีและ retry/repair หนึ่งครั้ง.
- สำหรับ 3 demo scenarios ให้ใช้ deterministic extraction/prescreen และ precomputed/cached result; flow ไม่ควรจบด้วย blank spinner.
- UI อาจแสดง degraded notice ว่า **“ขณะนี้ไม่สามารถตรวจสอบข้อมูลบางส่วนได้ กรุณาโทรยืนยันกับหน่วยงาน/สถานพยาบาล”**.
- ห้ามบอกกรรมการว่าผล fallback มาจาก model อื่น และห้ามเติม fact เพื่อให้ demo ดูสมบูรณ์.

### Supabase ไม่พร้อม

- เมื่อ `ENABLE_JSON_KNOWLEDGE_FALLBACK=true`, booth flow อ่าน versioned JSON ที่ validate แล้ว.
- UI ต้องแสดง degraded notice เมื่อ JSON รับต่อจาก Supabase; ห้ามอ้างว่าตรวจสอบ remote fact ได้สมบูรณ์.
- ถ้าตั้ง Supabase, demo case/passport/share มี TTL recovery ข้าม cold start; ถ้าไม่ตั้ง จะเหลือ expiring in-memory/browser session และอาจหายเมื่อ server restart.
- ถ้าหน้า error ให้กด **“เริ่มใหม่”**, refresh `/demo`, แล้วเลือกเคส A อีกครั้ง. หาก server process ล้มให้ restart `npm run dev`.

### Network/LINE in-app browser ไม่เปิด map/share

- ใช้หมายเลขโทรและ evidence copy บนหน้าจอแทน; อย่ากล่าวว่า map/queue เป็น real-time.
- เปิด `/demo` ใน Chrome เป็น backup. `/liff/demo` ใช้ layout สำหรับ LINE แต่ booth flow ไม่ต้องพึ่ง LINE login.
- การพิมพ์/PDF แนะนำ Chrome หรือ external browser.

## 5. Q&A ที่ตอบอย่างโปร่งใส

**ตอนนี้ใช้ Neo4j หรือไม่?**

ไม่ใช้ใน MVP runtime. Knowledge หลักอยู่ใน normalized Supabase PostgreSQL และ versioned JSON เป็น booth fallback. `Neo4jKnowledgeProvider` เป็น skeleton สำหรับ target architecture และไม่จำเป็นต่อ build/demo.

**ตอนนี้ใช้ ThaiLLM หรือ RunPod หรือไม่?**

ไม่ใช้ใน default runtime. MVP ใช้ Claude ผ่าน provider interface ชั่วคราว; ThaiLLM adapter เป็น skeleton ที่ยังไม่ถูกเปิดจนกว่าจะผ่าน structured-output, latency และ safety evaluation.

**Claude เป็นผู้ตัดสินสิทธิ์หรือเลือกโรงพยาบาลหรือไม่?**

ไม่. ใน non-demo flow model ใช้แปลงเรื่องเล่าและ prescreen เป็น structured candidate; follow-up ที่เรียก model ต้องอ้าง evidence ที่อยู่ในเคส. Why This Route, safety floor, eligibility, cost wording, facility hard filters/ranking และ evidence ที่แสดงเป็น deterministic/server-side. Hero demo ใช้ deterministic profile ที่เตรียมไว้ จึงไม่ต้องรอ model.

**นี่คือระบบวินิจฉัยโรคหรือไม่?**

ไม่. ระบบแสดง “ภาวะที่อาจเกี่ยวข้อง” เพื่อการนำทาง และมี disclaimer ให้บุคลากรทางการแพทย์ประเมินอีกครั้ง.

**ข้อมูลโรงพยาบาลและเวลาเปิดเป็น real-time หรือไม่?**

ไม่. เป็นข้อมูล source-backed ที่อัปเดตล่าสุดตาม effective/verified date. ทุก route แสดงให้โทรยืนยันก่อนเดินทาง และไม่เรียกว่า “ใกล้ที่สุด” หากไม่มีพิกัดคำนวณจริง.

**รับประกันว่าจะใช้สิทธิ์หรือไม่เสียค่าใช้จ่ายได้หรือไม่?**

ไม่ได้. Coverage/acceptance มี status และเงื่อนไข; เมื่อไม่มีข้อมูลยืนยันระบบแสดง `UNKNOWN` และไม่ใช้คำว่า “ฟรี”.

**Case Passport เป็นเอกสารทางการหรือไม่?**

ไม่. เป็น structured pre-visit handoff เพื่อลดการเล่าเรื่องซ้ำ ไม่ใช่ใบส่งตัว ใบรับรองแพทย์ หรือเอกสารที่สถานพยาบาลรับรอง.

**ข้อมูล demo ถูกเก็บอย่างไร?**

เก็บชั่วคราวใน browser/in-process; เมื่อตั้ง Supabase จะเก็บแบบ TTL ไม่เกิน 72 ชั่วโมงเพื่อ cold-start recovery. “เริ่มใหม่” ลบ session และ DB rows แบบ cascade; server เรียก purge function และ production ควร schedule ซ้ำ.

**Feedback เปลี่ยน official fact ทันทีหรือไม่?**

ไม่. ต้องแยก observed access, sample size, moderation และ official source; feedback รายเดียวไม่แก้ fact.

**ทำไมไม่มีประกันเอกชน?**

`ENABLE_PRIVATE_OPTIONS=false` เป็น default เพราะ MVP เน้น public rights-to-care และหลีกเลี่ยง commercial recommendation. Private options ไม่อยู่ใน primary route หรือ Passport.

## 6. Final verification ก่อนขึ้นบูท

```bash
npm run validate:knowledge
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration
npm run build
npm run test:e2e
```

Manual checklist:

- [ ] Hero case จบ intake → clarification → review → route.
- [ ] Primary/backup มี service/right/evidence และ call warning.
- [ ] Why This Route เปิดได้และไม่แสดง raw model reasoning.
- [ ] Passport mobile/print/share/revoke ใช้งานได้; ไม่มีชื่อ model/debug.
- [ ] Emergency ให้ 1669 ก่อนและไม่มี normal primary.
- [ ] Unknown scheme ไม่ถูกเดา.
- [ ] Follow-up ค่าใช้จ่ายไม่สร้างตัวเลข และ red flag ใหม่ escalate.
- [ ] Feedback ส่งได้; demo feedback มี label.
- [ ] Refresh/back รักษาเคสใน tab; “เริ่มใหม่” ล้างได้ในคลิกเดียว.
- [ ] 390×844 ไม่มี horizontal overflow และ sticky CTA กดได้.
- [ ] UI ไม่อ้าง queue/เวลาเปิดเป็น real-time.
