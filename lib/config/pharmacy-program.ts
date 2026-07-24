// โครงการ "เจ็บป่วยเล็กน้อย รับยาที่ร้านยาคุณภาพ" (สิทธิบัตรทอง) — 32 กลุ่มอาการ
// ตามประกาศ สปสช. — เก็บเป็น config พร้อม SourceDocument (ห้าม hardcode ใน
// component: UI อ่านจากไฟล์นี้เท่านั้น) การเข้าโครงการตัดสินแบบ deterministic:
// (ก) อาการ match กลุ่มใดกลุ่มหนึ่ง และ (ข) สิทธิ์ = บัตรทอง
export interface PharmacyProgramSource {
  title: string;
  url: string;
  publisher: string;
  effective_from: string;
}

export const PHARMACY_PROGRAM_SOURCE: PharmacyProgramSource = {
  title:
    "ประกาศ สปสช. โครงการดูแลอาการเจ็บป่วยเล็กน้อย 32 อาการ โดยเภสัชกรร้านยาคุณภาพ (Common Illnesses)",
  url: "https://www.nhso.go.th/news/4047",
  publisher: "สำนักงานหลักประกันสุขภาพแห่งชาติ (สปสช.)",
  effective_from: "2567-09-01",
};

export interface PharmacyProgramItem {
  id: string;
  label: string;
  keywords: RegExp;
}

/** 32 กลุ่มอาการของโครงการ — label ตามประกาศ, keywords สำหรับจับคู่กับอาการเคส */
export const PHARMACY_PROGRAM_ITEMS: PharmacyProgramItem[] = [
  { id: "fever", label: "ไข้", keywords: /ไข้|ตัวร้อน/ },
  { id: "cough", label: "ไอ", keywords: /ไอ(?!ศกรีม)/ },
  { id: "sore_throat", label: "เจ็บคอ", keywords: /เจ็บคอ|คอแห้ง/ },
  { id: "runny_nose", label: "น้ำมูก/คัดจมูก", keywords: /น้ำมูก|คัดจมูก|หวัด/ },
  { id: "headache", label: "ปวดหัว", keywords: /ปวด(หัว|ศีรษะ)/ },
  { id: "dizziness", label: "เวียนหัว", keywords: /เวียน(หัว|ศีรษะ)|มึนหัว/ },
  { id: "muscle_pain", label: "ปวดกล้ามเนื้อ/เมื่อยตัว", keywords: /ปวดกล้ามเนื้อ|เมื่อย|ปวดตัว/ },
  { id: "joint_pain", label: "ปวดข้อ", keywords: /ปวดข้อ|ข้อขัด/ },
  { id: "back_pain", label: "ปวดหลัง/ปวดเอว", keywords: /ปวดหลัง|ปวดเอว/ },
  { id: "stomach_ache", label: "ปวดท้อง", keywords: /ปวดท้อง(?!มาก|รุนแรง)/ },
  { id: "gastritis", label: "แสบร้อนกลางอก/อาหารไม่ย่อย", keywords: /แสบร้อนกลางอก|อาหารไม่ย่อย|จุกเสียด|กรดไหลย้อน/ },
  { id: "constipation", label: "ท้องผูก", keywords: /ท้องผูก|ถ่ายยาก/ },
  { id: "diarrhea", label: "ท้องเสีย", keywords: /ท้องเสีย|ท้องร่วง|ถ่ายเหลว/ },
  { id: "nausea", label: "คลื่นไส้/อาเจียน", keywords: /คลื่นไส้|อาเจียน(?!เป็นเลือด)/ },
  { id: "flatulence", label: "ท้องอืด/ท้องเฟ้อ", keywords: /ท้องอืด|ท้องเฟ้อ|แน่นท้อง/ },
  { id: "dysuria", label: "ปัสสาวะขัด/แสบ", keywords: /ปัสสาวะ(ขัด|แสบ|ลำบาก)|ฉี่แสบ/ },
  { id: "vaginal_discharge", label: "ตกขาวผิดปกติ", keywords: /ตกขาว/ },
  { id: "rash", label: "ผื่นผิวหนัง", keywords: /ผื่น/ },
  { id: "itching", label: "คัน", keywords: /คัน(?!ายาว)/ },
  { id: "hives", label: "ลมพิษ", keywords: /ลมพิษ/ },
  { id: "insect_bite", label: "แมลงกัดต่อย", keywords: /แมลง(กัด|ต่อย)|ยุงกัด/ },
  { id: "minor_wound", label: "บาดแผลเล็กน้อย", keywords: /แผล(ถลอก|เล็ก)?|มีดบาด|ถลอก/ },
  { id: "minor_burn", label: "แผลไหม้/ลวกระดับเบา", keywords: /ไฟ(ไหม้|ลวก)|น้ำร้อนลวก/ },
  { id: "eye_irritation", label: "เคืองตา/ตาแดง", keywords: /เคืองตา|ตาแดง|ตาแห้ง/ },
  { id: "stye", label: "ตากุ้งยิง", keywords: /กุ้งยิง/ },
  { id: "ear_pain", label: "ปวดหู/หูอื้อ", keywords: /ปวดหู|หูอื้อ/ },
  { id: "mouth_ulcer", label: "แผลในปาก/ร้อนใน", keywords: /แผลในปาก|ร้อนใน/ },
  { id: "gum_pain", label: "เหงือกอักเสบเล็กน้อย", keywords: /เหงือก(บวม|อักเสบ)/ },
  { id: "toothache_mild", label: "ปวดฟันเล็กน้อย", keywords: /ปวดฟัน|เสียวฟัน/ },
  { id: "menstrual_pain", label: "ปวดประจำเดือน", keywords: /ปวดประจำเดือน|ปวดเมนส์/ },
  { id: "motion_sickness", label: "เมารถ/เมาเรือ", keywords: /เมารถ|เมาเรือ/ },
  { id: "smoking_cessation", label: "ต้องการเลิกบุหรี่", keywords: /เลิกบุหรี่/ },
];

/** จับคู่อาการของเคสกับกลุ่มโครงการ — คืนรายการ label ที่เข้าเกณฑ์ */
export function matchPharmacyProgram(symptoms: string[], fullText = ""): string[] {
  const text = symptoms.join(" ") + " " + fullText;
  return PHARMACY_PROGRAM_ITEMS.filter((item) => item.keywords.test(text)).map(
    (item) => item.label
  );
}
