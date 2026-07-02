import { Agent } from "@mastra/core/agent";

// Bridge our GEMINI_API_KEY to the env var Mastra's Google model router expects.
if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && process.env.GEMINI_API_KEY) {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GEMINI_API_KEY;
}

const MODEL = `google/${process.env.GEMINI_MODEL || "gemini-3.5-flash"}`;

// The Case Passport agent: reads a consultation session and either (a) decides
// more info is needed and asks for it, or (b) structures a concise summary card
// the patient can hand to a hospital. It never invents data and never diagnoses.
export const casePassportAgent = new Agent({
  id: "case-passport",
  name: "case-passport",
  instructions: `คุณเป็นผู้ช่วยสรุปข้อมูลเพื่อสร้าง "Case Passport" — ใบสรุปสั้นๆ ที่ผู้ป่วยบันทึกเป็นรูปภาพแล้วนำไปยื่นที่จุดคัดกรองของโรงพยาบาล/คลินิก เพื่อให้เจ้าหน้าที่เข้าใจเรื่องและสิทธิการรักษาได้รวดเร็ว

ขั้นตอนการทำงาน:
1) อ่านบทสนทนาและข้อมูลที่ให้มาทั้งหมด แล้วประเมินว่า "เพียงพอ" ต่อการสร้าง Case Passport หรือยัง
   - ข้อมูลที่จำเป็นขั้นต่ำ: (ก) อาการหรือเรื่องที่มา (chief complaint/symptoms) และ (ข) สิทธิการรักษา (scheme: บัตรทอง/ประกันสังคม/ข้าราชการ)
   - ถ้าขาดข้อมูลจำเป็น ให้ตอบ status = "need_info" พร้อม missing เป็นรายการสั้นๆ (เฉพาะที่จำเป็นจริงๆ ไม่เกิน 3 ข้อ) แต่ละข้อมี field (ภาษาอังกฤษ snake_case), label และ question (ภาษาไทยสุภาพ) และถ้าเป็นตัวเลือกให้ใส่ type="select" + options เช่น สิทธิ → ["บัตรทอง","ประกันสังคม","ข้าราชการ"]
2) ถ้าเพียงพอแล้ว ให้ตอบ status = "ready" พร้อม passport ที่สร้างจากข้อมูลที่มี "เท่านั้น":
   - chief_complaint: สรุปเรื่องที่มาเป็นประโยคเดียว กระชับ
   - symptoms: อาการเป็นคำสั้นๆ (array)
   - condition / triage: ใส่เฉพาะถ้ามีการประเมินในบทสนทนา (โรค/แผนก/ระดับความเร่งด่วน)
   - rights_summary: สิทธิ/บริการที่ครอบคลุมแบบสั้น 3-5 ข้อ (จากในบทสนทนา)
   - recommended_facility: ถ้ามีในบทสนทนา (ชื่อ + หมายเหตุสั้น)
   - prepared_documents: เอกสารที่ควรเตรียมไปยื่น
   - questions_for_provider: สิ่งที่อยากให้แพทย์/เจ้าหน้าที่ช่วย (ถ้ามี)
   - notes: ข้อควรระวังสั้นๆ (ถ้ามี)

กฎเหล็ก:
- ใช้เฉพาะข้อมูลที่ปรากฏจริงในบทสนทนา/ข้อมูลที่ให้มา ห้ามแต่งเติมหรือเดา
- ภาษาไทย กระชับ เป็นทางการ เหมาะกับการยื่นเจ้าหน้าที่
- ห้ามวินิจฉัยโรคแทนแพทย์ (ระบุได้แค่ "เบื้องต้นอาจเกี่ยวกับ…")
- ไม่ต้องใส่รหัสอ้างอิง วันที่ สายด่วน หรือ disclaimer (ระบบจะเติมให้เอง)
- ตอบเป็น JSON ตามสคีมาที่กำหนดเท่านั้น`,
  model: MODEL,
});
