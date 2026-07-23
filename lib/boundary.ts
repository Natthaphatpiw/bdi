// =============================================================================
// Boundary gate — deterministic, วิ่งหลัง safety pre-check และก่อน NLU/LLM เสมอ
// จับอินพุตที่อยู่นอก flow หลัก (ทักทาย/นอกเรื่อง/อ่านไม่ออก/ขอวินิจฉัย/ขอ dosing/
// ขอคุยกับคน/prompt injection/ร้องเรียนแพทย์) แล้วตอบด้วย copy มาตรฐาน (§7)
// ที่มี actionable next step เสมอ — LLM ไม่มีสิทธิ์ตัดสินขอบเขต
// =============================================================================
import { SYMPTOM_CLUSTERS } from "@/demo/scope";
import type { Card } from "./types";

export type BoundaryType =
  | "greeting"
  | "gibberish"
  | "off_topic"
  | "diagnosis_request"
  | "dosing_request"
  | "human_handoff"
  | "prompt_injection"
  | "complaint";

export interface BoundaryResult {
  type: BoundaryType;
  cards: Card[];
  pending_question: string | null;
  quick_replies?: string[];
}

// ---- health-signal detector --------------------------------------------------
const HEALTH_TH =
  /สิทธิ|ประกันสังคม|บัตรทอง|ข้าราชการ|เบิก|โรงพยาบาล|รพ|คลินิก|หมอ|แพทย์|พยาบาล|ยา|ตรวจ|รักษา|ผ่าตัด|ฉีด|วัคซีน|ไม่สบาย|ป่วย|เจ็บ|ปวด|แสบ|บวม|อักเสบ|เหนื่อย|อ่อนเพลีย|แผล|ท้อง|ไข้|ไอ|ฟัน|ตา|หู|ผื่น|ชา|สั่น|เวียน|คลื่นไส้|อาเจียน|สุขภาพ|อาการ|1330|1669|ทันตกรรม|ฝากครรภ์|ตั้งครรภ์/;
const HEALTH_EN =
  /fever|pain|ache|sick|ill|hurt|doctor|hospital|clinic|symptom|cough|dizzy|nausea|rash|wound|injur|health|insurance|dental|medicine|drug|emergency|breath/i;

export function hasHealthSignal(text: string): boolean {
  if (HEALTH_TH.test(text) || HEALTH_EN.test(text)) return true;
  return SYMPTOM_CLUSTERS.some((c) => c.keywords.test(text));
}

/** ข้อความส่วนใหญ่เป็นภาษาอังกฤษ (ตอบไทย + แนบประโยค EN ปิดท้าย — §7) */
export function isPredominantlyEnglish(text: string): boolean {
  const thai = (text.match(/[฀-๿]/g) ?? []).length;
  const latin = (text.match(/[a-zA-Z]/g) ?? []).length;
  return latin >= 6 && latin > thai * 2;
}

export const EN_NOTICE = "This version of the service is in Thai — happy to continue in Thai.";

// ---- individual detectors ----------------------------------------------------
const GREETING_RE =
  /^(สวัสดี(ครับ|ค่ะ|คับ|จ้า|ฮะ)?|หวัดดี|ดีครับ|ดีค่ะ|hello|hi|hey|เฮลโล|ฮัลโหล|ทัก(ทาย)?ครับ)[\s!.]*$/i;

const INJECTION_RE =
  /ignore (all|previous|the) (instructions|prompts?)|disregard (your|the) (instructions|rules)|system prompt|jailbreak|you are now|act as (?!a patient)|pretend to be|ลืมคำสั่ง(ก่อนหน้า|ทั้งหมด)|เพิกเฉยต่อคำสั่ง|แสดง(ระบบ)?พรอมต์|ทำตัวเป็น(?!ผู้ป่วย)/i;

const HUMAN_RE = /คุยกับ(คน|เจ้าหน้าที่|มนุษย์)|ขอสายเจ้าหน้าที่|คนจริง|โอเปอเรเตอร์|(talk|speak) to (a )?human|human agent/i;

const DOSING_RE =
  /(กี่เม็ด|กี่ช้อน|กี่ ?(mg|มก|มิลลิกรัม)|ขนาดยา|โดส|ปรับยา(เอง)?|เพิ่มยา|ลดยา|(วันละ|ครั้งละ)กี่(ครั้ง|เม็ด)?)/i;

const DIAGNOSIS_RE =
  /((ผม|ฉัน|หนู|เขา|แม่|พ่อ)?\s*เป็น\s*(โรค)?\s*(มะเร็ง|เบาหวาน|หัวใจ|ไต|ซึมเศร้า|ไทรอยด์|สโตรก|stroke|วัณโรค|เอดส์|hiv)[^ก-๙a-z]*(ไหม|มั้ย|หรือเปล่า|ใช่ไหม|รึเปล่า))|ช่วยวินิจฉัย|วินิจฉัยให้|ฟันธงว่า(ผม|ฉัน)เป็น/i;

const COMPLAINT_RE =
  /ฟ้อง(หมอ|แพทย์|โรงพยาบาล)|ร้องเรียน(หมอ|แพทย์|โรงพยาบาล|คลินิก)|หมอรักษาผิด|แพทย์ประมาท|เรียกค่าเสียหาย.*(หมอ|โรงพยาบาล)/;

const OFF_TOPIC_RE =
  /หุ้น|คริปโต|บิตคอยน์|ลอตเตอรี่|หวย|ผลบอล|ฟุตบอล|ดูดวง|เลขเด็ด|การบ้าน|เขียนโค้ด|แต่งเพลง|สูตรอาหาร(?!เบาหวาน)|ท่องเที่ยว|จองตั๋ว|สภาพอากาศ|stock|crypto|lottery|football/i;

/** ตัวอักษรไทยล้วนแบบสุ่มแป้น (ไม่มีสระ/วรรณยุกต์/คำจริง) หรือ latin มั่ว */
function isGibberish(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (t.length > 60) return false;
  if (hasHealthSignal(t)) return false;
  const thaiChars = t.match(/[฀-๿]/g) ?? [];
  if (thaiChars.length >= 3) {
    // ข้อความไทยจริงย่อมมีสระ/วรรณยุกต์หรือคำ function พื้นฐาน
    const hasVowelOrTone = /[ะาิีึืุูเแโใไำ่้๊๋็ั]/.test(t);
    const hasCommonWord = /ครับ|ค่ะ|ไม่|มี|เป็น|อยาก|ช่วย|ที่|และ|หรือ|ทำ|ไป|มา|ให้|ได้|คือ|อะไร/.test(t);
    return !hasVowelOrTone && !hasCommonWord;
  }
  const latin = t.replace(/[^a-zA-Z]/g, "");
  if (latin.length >= 3) {
    const vowels = latin.match(/[aeiou]/gi)?.length ?? 0;
    if (vowels === 0) return true; // "asdf", "qwrt"
    if (/^(asdf|qwer|zxcv|hjkl|test123)+$/i.test(latin)) return true;
    return false;
  }
  // สั้นมากและไม่มีสัญญาณอะไรเลย เช่น "???", "555"
  return !/[฀-๿a-zA-Z]/.test(t);
}

// ---- card builders (copy §7 — คำต่อคำ) --------------------------------------
function careCard(title: string, body: string): Card {
  return { type: "care", title, body };
}

function nextSteps(checklist: string[]): Card {
  return { type: "next_steps", title: "ขั้นตอนถัดไป", checklist };
}

const OFF_TOPIC_COPY =
  "ตอนนี้รู้สิทธิ์ รู้สุข ดูแลเรื่องสุขภาพและสิทธิ์การรักษาครับ ถ้ามีอาการอะไรอยู่ หรืออยากรู้ว่าสิทธิ์ของคุณใช้อะไรได้บ้าง เล่าให้ฟังได้เลย";

const RESPONSES: Record<BoundaryType, () => Omit<BoundaryResult, "type">> = {
  greeting: () => ({
    cards: [
      careCard(
        "สวัสดีครับ",
        "ผมคือรู้สิทธิ์ รู้สุข ผู้ช่วยนำทางสิทธิ์สุขภาพของคุณ เล่าอาการที่เป็นอยู่ หรือถามเรื่องสิทธิ์การรักษาได้เลยครับ"
      ),
    ],
    pending_question: "วันนี้มีอาการอะไร หรืออยากรู้เรื่องสิทธิ์ด้านไหนครับ",
    quick_replies: ["เล่าอาการ", "เช็คสิทธิ์ของฉัน", "หาสถานพยาบาลใกล้บ้าน"],
  }),
  gibberish: () => ({
    cards: [
      careCard(
        "ขออภัย ยังอ่านไม่เข้าใจ",
        "ขอโทษครับ ผมยังอ่านข้อความนี้ไม่เข้าใจ ลองเล่าอีกครั้งได้ไหมครับ เช่น อาการที่เป็น หรือเรื่องสิทธิ์ที่สงสัย"
      ),
    ],
    pending_question: "ลองเล่าอาการหรือเรื่องสิทธิ์ที่สงสัยอีกครั้งได้เลยครับ",
    quick_replies: ["เล่าอาการ", "ถามเรื่องสิทธิ์"],
  }),
  off_topic: () => ({
    cards: [careCard("ขอบเขตของรู้สิทธิ์ รู้สุข", OFF_TOPIC_COPY)],
    pending_question: "มีอาการหรือเรื่องสิทธิ์อะไรให้ช่วยดูไหมครับ",
    quick_replies: ["เล่าอาการ", "เช็คสิทธิ์ของฉัน"],
  }),
  prompt_injection: () => ({
    cards: [careCard("ขอบเขตของรู้สิทธิ์ รู้สุข", OFF_TOPIC_COPY)],
    pending_question: "มีอาการหรือเรื่องสิทธิ์อะไรให้ช่วยดูไหมครับ",
    quick_replies: ["เล่าอาการ", "เช็คสิทธิ์ของฉัน"],
  }),
  diagnosis_request: () => ({
    cards: [
      careCard(
        "เรื่องการวินิจฉัย",
        "ผมวินิจฉัยโรคแทนแพทย์ไม่ได้ครับ แต่ช่วยได้สองอย่าง: ประเมินเบื้องต้นว่าอาการนี้ควรไปพบแพทย์ที่ไหน เร็วแค่ไหน และเตรียมข้อมูลอาการให้คุณเล่าให้แพทย์ฟังได้ครบถ้วน — เริ่มจากเล่าอาการให้ฟังหน่อยครับ"
      ),
      nextSteps(["เล่าอาการที่เป็นอยู่ ให้ระบบช่วยประเมินและเตรียมข้อมูลพบแพทย์", "ถ้าอาการรุนแรง/ฉุกเฉิน โทร 1669"]),
    ],
    pending_question: "เล่าอาการที่กังวลให้ฟังหน่อยครับ",
    quick_replies: ["เล่าอาการตอนนี้"],
  }),
  dosing_request: () => ({
    cards: [
      careCard(
        "เรื่องขนาดยา",
        "เรื่องขนาดยาของแต่ละคนต้องให้เภสัชกรหรือแพทย์เป็นผู้แนะนำครับ เพราะขึ้นกับหลายปัจจัยเฉพาะตัว ผมช่วยหาร้านยาคุณภาพใกล้คุณที่ปรึกษาเภสัชกรได้ฟรีให้ไหมครับ"
      ),
      nextSteps([
        "ปรึกษาเภสัชกรที่ร้านยาคุณภาพใกล้บ้าน (บริการเภสัชกรฟรี)",
        "อ่านฉลากยาและใบกำกับยาก่อนใช้เสมอ",
        "ถ้าอาการรุนแรง/ฉุกเฉิน โทร 1669",
      ]),
    ],
    pending_question: "บอกเขต/พื้นที่ได้ไหมครับ จะช่วยหาร้านยาคุณภาพใกล้คุณให้",
    quick_replies: ["หาร้านยาใกล้ฉัน"],
  }),
  human_handoff: () => ({
    cards: [
      {
        type: "safety",
        level: "none",
        title: "ช่องทางติดต่อเจ้าหน้าที่",
        body: "คุยกับเจ้าหน้าที่ได้ตลอด 24 ชั่วโมงตามช่องทางนี้ครับ — สอบถามสิทธิ์บัตรทอง โทร สปสช. 1330 · สิทธิ์ประกันสังคม โทร 1506",
        actions: [
          { label: "โทร 1330 (สปสช.)", tel: "1330", style: "primary" },
          { label: "โทร 1506 (ประกันสังคม)", tel: "1506", style: "primary" },
        ],
      },
    ],
    pending_question: "หรือถ้าอยากให้ผมช่วยดูก่อน เล่าอาการหรือเรื่องสิทธิ์ได้เลยครับ",
  }),
  complaint: () => ({
    cards: [
      careCard(
        "ช่องทางร้องเรียนบริการทางการแพทย์",
        "เรื่องร้องเรียนการรักษา มีช่องทางที่เป็นกลางและเป็นทางการครับ: กรมสนับสนุนบริการสุขภาพ (สบส.) สายด่วน 1426 สำหรับสถานพยาบาลเอกชน หรือแพทยสภา (tmc.or.th) กรณีมาตรฐานการประกอบวิชาชีพ — เตรียมเอกสารการรักษาและลำดับเหตุการณ์ไว้จะช่วยให้เรื่องเดินเร็วขึ้น"
      ),
      nextSteps([
        "รวบรวมเอกสาร: ใบรับรองแพทย์ ผลตรวจ ใบเสร็จ และลำดับเหตุการณ์",
        "สถานพยาบาลเอกชน: โทร สบส. 1426",
        "มาตรฐานวิชาชีพแพทย์: ยื่นเรื่องที่แพทยสภา",
        "เรื่องสิทธิ์การรักษา โทร สปสช. 1330",
      ]),
    ],
    pending_question: null,
  }),
};

// ---- main gate ---------------------------------------------------------------
/**
 * @param hasContext เซสชันนี้มีเคสค้างอยู่แล้ว (slots เดิมมีอาการ/intent) —
 * ข้อความสั้น ๆ อย่าง "จริง ๆ ผมอายุ 70" คือการแก้ข้อมูล ไม่ใช่นอกเรื่อง
 * ห้ามให้ off_topic/gibberish/greeting กิน (เส้นทางป้องกันอื่นยังตรวจตามปกติ)
 */
export function detectBoundary(text: string, hasContext = false): BoundaryResult | null {
  const t = (text ?? "").trim();
  if (!t) return { type: "gibberish", ...RESPONSES.gibberish() };

  // ลำดับสำคัญ: injection ก่อน (กันข้อความสั่งระบบที่แนบเรื่องสุขภาพมาหลอก)
  if (INJECTION_RE.test(t)) return { type: "prompt_injection", ...RESPONSES.prompt_injection() };
  if (HUMAN_RE.test(t)) return { type: "human_handoff", ...RESPONSES.human_handoff() };
  if (COMPLAINT_RE.test(t)) return { type: "complaint", ...RESPONSES.complaint() };

  // dosing/วินิจฉัย: เฉพาะเมื่อไม่ได้เล่าอาการปัจจุบันมาด้วย — ถ้ามีอาการ ให้
  // pipeline หลักทำงาน (ซึ่งไม่ฟันธงโรค/ไม่ให้ dosing อยู่แล้วโดยโครงสร้าง)
  const mentionsSymptoms = SYMPTOM_CLUSTERS.some((c) => c.keywords.test(t));
  if (DOSING_RE.test(t) && !mentionsSymptoms && !hasContext)
    return { type: "dosing_request", ...RESPONSES.dosing_request() };
  if (DIAGNOSIS_RE.test(t) && !mentionsSymptoms && !hasContext)
    return { type: "diagnosis_request", ...RESPONSES.diagnosis_request() };

  if (GREETING_RE.test(t) && !hasContext) return { type: "greeting", ...RESPONSES.greeting() };
  if (!hasHealthSignal(t)) {
    if (OFF_TOPIC_RE.test(t)) return { type: "off_topic", ...RESPONSES.off_topic() };
    if (hasContext) return null; // ต่อบทสนทนาเดิม — ให้ NLU merge ตามปกติ
    if (isGibberish(t)) return { type: "gibberish", ...RESPONSES.gibberish() };
    // ยาวพอสมควรแต่ไม่มีสัญญาณสุขภาพเลย → ขอบเขต
    if (t.length >= 25) return { type: "off_topic", ...RESPONSES.off_topic() };
    return { type: "gibberish", ...RESPONSES.gibberish() };
  }
  return null;
}

/** copy §7 นอกพื้นที่ — orchestrator ใช้เมื่อ area เป็นจังหวัดไกล */
export const OUT_OF_AREA_COPY =
  "ข้อมูลสถานพยาบาลของระบบรุ่นนี้ครอบคลุมกรุงเทพฯ และปริมณฑลครับ เรื่องสิทธิ์ผมตอบให้ได้เลย ส่วนสถานพยาบาลในพื้นที่ของคุณ โทร 1330 ได้ตลอด 24 ชม. ครับ";

/** copy §7 เลขบัตรประชาชน — ใช้ที่ /api/turn */
export const NATIONAL_ID_COPY =
  "ไม่ต้องส่งเลขบัตรประชาชนให้ผมนะครับ ระบบไม่จัดเก็บและไม่จำเป็นต้องใช้ — ใช้แค่ อายุ สิทธิ์ พื้นที่ และอาการ ก็วางแผนให้ได้ครับ";

/** copy §7 ระบบขัดข้อง/ช้าเกิน */
export const DEGRADED_COPY =
  "ขอโทษครับ ระบบตอบช้ากว่าปกติ กำลังลองใหม่ให้อัตโนมัติ… ถ้ารีบและเป็นเรื่องเร่งด่วน โทร 1669 (ฉุกเฉิน) หรือ 1330 (สอบถามสิทธิ์) ได้ทันทีครับ";
