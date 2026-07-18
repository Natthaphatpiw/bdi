// Anomaly Popup copy + routing config (spec §3, copy §11.1 — คำต่อคำ).
// choice.route ตัดสินเส้นทาง: emergency = เข้า Emergency Mode ทันที,
// befast = BEFAST Quick Check, triage = ส่งเข้า flow หลักแบบ prefill,
// dismiss = ปิด + cooldown 24 ชม. ฝั่ง server
import type { GuardianPattern, GuardianPatternConfig } from './types';

export const GUARDIAN_QUESTION = 'ตอนนี้คุณมีอาการเหล่านี้ไหม';

export const PATTERN_CONFIGS: Record<GuardianPattern, GuardianPatternConfig> = {
  tremor: {
    pattern: 'tremor',
    title: 'ระบบสังเกตว่ามือของคุณสั่นมากกว่าปกติ',
    question: GUARDIAN_QUESTION,
    choices: [
      { id: 'tremor_grip', label: 'มือสั่นจนหยิบจับของลำบาก', route: 'befast' },
      { id: 'tremor_weak_one_side', label: 'แขนหรือมืออ่อนแรงข้างเดียว', route: 'befast' },
      {
        id: 'tremor_palpitation',
        label: 'ใจสั่น เหงื่อแตก หน้ามืด',
        route: 'triage',
        triageText: 'มีอาการใจสั่น เหงื่อแตก และหน้ามืดเฉียบพลันเมื่อสักครู่',
      },
      { id: 'tremor_chest', label: 'เจ็บหน้าอก หรือหายใจลำบาก', route: 'emergency' },
      { id: 'tremor_fine', label: 'ไม่มีอาการ ฉันสบายดี', route: 'dismiss' },
    ],
  },
  drops: {
    pattern: 'drops',
    title: 'ช่วงนี้เครื่องหลุดจากมือคุณบ่อยผิดปกติ',
    question: GUARDIAN_QUESTION,
    choices: [
      { id: 'drops_weak_one_side', label: 'แขนหรือมืออ่อนแรงข้างเดียว', route: 'befast' },
      { id: 'drops_numb_half', label: 'ชาครึ่งซีกของร่างกาย', route: 'befast' },
      { id: 'drops_headache', label: 'ปวดศีรษะรุนแรงเฉียบพลัน', route: 'emergency' },
      {
        id: 'drops_vertigo',
        label: 'เวียนศีรษะ บ้านหมุน',
        route: 'triage',
        triageText: 'มีอาการเวียนศีรษะ บ้านหมุนเฉียบพลันเมื่อสักครู่',
      },
      { id: 'drops_fine', label: 'ไม่มีอาการ ฉันสบายดี', route: 'dismiss' },
    ],
  },
  fall: {
    pattern: 'fall',
    title: 'ระบบตรวจพบแรงกระแทกเมื่อสักครู่ — คุณโอเคไหม',
    question: GUARDIAN_QUESTION,
    choices: [
      { id: 'fall_cannot_rise', label: 'ล้มและลุกเองไม่ไหว หรือเจ็บมาก', route: 'emergency' },
      { id: 'fall_lost_consciousness', label: 'หมดสติไปชั่วครู่', route: 'emergency' },
      { id: 'fall_dizzy_before', label: 'เวียนศีรษะก่อนล้ม', route: 'befast' },
      { id: 'fall_phone_only', label: 'เครื่องตกเฉย ๆ ฉันไม่เป็นไร', route: 'dismiss' },
    ],
  },
};

// ---- BEFAST copy (§11.2) -----------------------------------------------------
export const BEFAST_CARDS = [
  {
    key: 'f' as const,
    letter: 'F',
    title: 'ใบหน้า',
    instruction: 'ลองยิ้มกว้าง ๆ ให้กล้องหรือกระจก',
    question: 'มุมปากตกหรือหน้าเบี้ยวข้างหนึ่งไหม',
  },
  {
    key: 'a' as const,
    letter: 'A',
    title: 'แขน',
    instruction: 'หลับตา ยกแขนตรงไปข้างหน้าทั้งสองข้าง ค้างไว้ 10 วินาที',
    question: 'แขนข้างหนึ่งตกลงเองไหม',
  },
  {
    key: 's' as const,
    letter: 'S',
    title: 'การพูด',
    instruction: "พูดประโยคนี้ช้า ๆ: 'วันนี้อากาศแจ่มใสดี'",
    question: 'พูดไม่ชัด ลิ้นแข็ง หรือนึกคำไม่ออกไหม',
  },
];

export const BEFAST_SPEECH_SENTENCE = 'วันนี้อากาศแจ่มใสดี';

export const ONSET_QUESTION = 'อาการเริ่มเมื่อไหร่';
export const ONSET_OPTIONS = [
  'เพิ่งเริ่มตอนนี้',
  'ภายใน 1 ชั่วโมง',
  '1–4 ชั่วโมง',
  'เกิน 4 ชั่วโมง หรือตื่นนอนมาก็เป็นแล้ว',
  'ไม่แน่ใจ',
];

/** ข้อความสังเคราะห์เข้า flow หลักเมื่อ BEFAST ปกติแต่ผู้ใช้อยากเล่าต่อ */
export function befastTriageText(symptom?: string): string {
  return symptom
    ? `เมื่อสักครู่มีอาการ${symptom} ตรวจเช็คเบื้องต้นแล้วยังไม่พบสัญญาณเร่งด่วน อยากให้ช่วยประเมินอาการต่อ`
    : 'เมื่อสักครู่มีอาการผิดปกติ ตรวจเช็คเบื้องต้นแล้วยังไม่พบสัญญาณเร่งด่วน อยากให้ช่วยประเมินอาการต่อ';
}
