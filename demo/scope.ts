// =============================================================================
// Scope — source of truth เชิงโปรแกรมของ "ระบบรุ่นนี้ทำอะไรได้/ไม่ได้"
// (demo/SCOPE.md คือฉบับอ่านสำหรับทีม) — การลด scope ต้องแก้ไฟล์นี้ก่อนเสมอ
// ใช้ร่วมกันโดย: lib/boundary.ts (gate), orchestrator, และ test suite
// =============================================================================

export type ServiceLevel = 'pharmacy' | 'primary_care' | 'opd' | 'emergency';

export interface SymptomCluster {
  id: string;
  label: string;
  /** คำ/วลีภาษาไทยที่เข้าคลัสเตอร์นี้ (ใช้ตรวจ coverage ใน test ไม่ใช่ตอบแทน NLU) */
  keywords: RegExp;
  /** ระดับบริการเริ่มต้นสำหรับผู้ใหญ่ที่ไม่มี red flag */
  defaultLevel: ServiceLevel;
  department?: string;
}

/** 12 กลุ่มอาการที่ประกาศรองรับ (§1.1) — map ระดับบริการแบบ deterministic */
export const SYMPTOM_CLUSTERS: SymptomCluster[] = [
  { id: 'fever_flu', label: 'ไข้/หวัด/เจ็บคอ', keywords: /ไข้|หวัด|เจ็บคอ|คัดจมูก|น้ำมูก/, defaultLevel: 'pharmacy', department: 'อายุรกรรม' },
  { id: 'headache', label: 'ปวดหัว/ไมเกรน', keywords: /ปวด(หัว|ศีรษะ)|ไมเกรน/, defaultLevel: 'pharmacy', department: 'อายุรกรรม' },
  { id: 'dizziness', label: 'เวียนหัว/บ้านหมุน', keywords: /เวียน(หัว|ศีรษะ)|บ้านหมุน|หน้ามืด/, defaultLevel: 'primary_care', department: 'อายุรกรรม' },
  { id: 'gi', label: 'ปวดท้อง/ท้องเสีย/อาหารเป็นพิษ', keywords: /ปวดท้อง|ท้อง(เสีย|ร่วง)|อาหารเป็นพิษ|อาเจียน|คลื่นไส้/, defaultLevel: 'primary_care', department: 'อายุรกรรม' },
  { id: 'dental', label: 'ปวดฟัน/เหงือก', keywords: /ปวดฟัน|เหงือก|ฟันผุ|ฟันคุด|ขูดหินปูน/, defaultLevel: 'primary_care', department: 'ทันตกรรม' },
  { id: 'musculo', label: 'ปวดหลัง/กล้ามเนื้อ/ข้อ', keywords: /ปวดหลัง|ปวดเอว|กล้ามเนื้อ|ปวดข้อ|เคล็ด|ขัดยอก/, defaultLevel: 'pharmacy', department: 'ออร์โธปิดิกส์' },
  { id: 'wound', label: 'บาดแผลเล็กน้อย/ไฟไหม้ระดับเบา', keywords: /แผล|มีดบาด|ถลอก|ไฟ(ไหม้|ลวก)|น้ำร้อนลวก/, defaultLevel: 'primary_care', department: 'ศัลยกรรม' },
  // (?<!แก้) กัน "ยาแก้แพ้" (ชื่อยา ไม่ใช่อาการ) — (?!รุนแรง) ให้แพ้รุนแรงไป safety gate
  { id: 'rash', label: 'ผื่น/แพ้', keywords: /ผื่น|คัน|ลมพิษ|(?<!แก้)แพ้(อาหาร|ยา)?(?!รุนแรง)/, defaultLevel: 'pharmacy', department: 'ผิวหนัง' },
  { id: 'eye', label: 'ตาแดง/ตาพร่า', keywords: /ตาแดง|ตาพร่า|ตามัว|เคืองตา|ตาแห้ง/, defaultLevel: 'primary_care', department: 'จักษุ' },
  { id: 'chronic', label: 'อาการโรคเรื้อรังพบบ่อย (เบาหวาน/ความดัน)', keywords: /เบาหวาน|ความดัน|น้ำตาล(ใน)?เลือด|เพลีย|อ่อนเพลีย|ปัสสาวะบ่อย|กระหายน้ำ/, defaultLevel: 'primary_care', department: 'อายุรกรรม' },
  { id: 'respiratory', label: 'ทางเดินหายใจ (ไอเรื้อรัง หอบเบา)', keywords: /ไอ(เรื้อรัง|นาน|แห้ง|มีเสมหะ)?|หอบ(?!เหนื่อยมาก)|หลอดลม/, defaultLevel: 'primary_care', department: 'อายุรกรรม' },
  { id: 'neuro_mild', label: 'ระบบประสาทไม่วิกฤต (ชา เหน็บ มือสั่นเล็กน้อย)', keywords: /ชา(ปลาย)?(มือ|เท้า|นิ้ว)|เหน็บ|มือสั่น/, defaultLevel: 'opd', department: 'อายุรกรรมประสาท' },
];

/** เขต กทม. ทั้ง 50 เขต — ใช้เป็น deterministic backstop สกัดพื้นที่จากข้อความ
 * เมื่อ NLU พลาด (เรียงยาว→สั้น กันชื่อที่เป็น substring กัน เช่น บางรัก/บางรักใหญ่) */
export const BKK_DISTRICTS = [
  'ป้อมปราบศัตรูพ่าย', 'ราษฎร์บูรณะ', 'บางกอกน้อย', 'บางกอกใหญ่', 'ทวีวัฒนา', 'หนองแขม',
  'ทุ่งครุ', 'บางขุนเทียน', 'บางแค', 'ภาษีเจริญ', 'ตลิ่งชัน', 'จอมทอง', 'ธนบุรี', 'คลองสาน',
  'สัมพันธวงศ์', 'พระนคร', 'ดุสิต', 'บางซื่อ', 'จตุจักร', 'หลักสี่', 'ดอนเมือง', 'สายไหม',
  'บางเขน', 'ลาดพร้าว', 'วังทองหลาง', 'ห้วยขวาง', 'ดินแดง', 'พญาไท', 'ราชเทวี', 'ปทุมวัน',
  'บางรัก', 'สาทร', 'บางคอแหลม', 'ยานนาวา', 'คลองเตย', 'วัฒนา', 'สวนหลวง', 'ประเวศ',
  'บางนา', 'พระโขนง', 'บางกะปิ', 'บึงกุ่ม', 'คันนายาว', 'สะพานสูง', 'มีนบุรี', 'ลาดกระบัง',
  'หนองจอก', 'คลองสามวา', 'สายไหม', 'ราชบูรณะ',
].sort((a, b) => b.length - a.length);

/** พื้นที่ให้บริการ facility data รุ่นนี้ */
export const SERVICE_AREA_PROVINCES = [
  'กรุงเทพ', 'กรุงเทพมหานคร', 'นนทบุรี', 'ปทุมธานี', 'สมุทรปราการ', 'สมุทรสาคร', 'นครปฐม',
];

/** จังหวัดไกล (นอกพื้นที่ facility) — ตอบสิทธิ์ได้ แต่ router แจ้งขอบเขต + 1330 */
export const FAR_PROVINCES = [
  'เชียงใหม่', 'เชียงราย', 'ลำปาง', 'ลำพูน', 'แพร่', 'น่าน', 'พะเยา', 'แม่ฮ่องสอน', 'อุตรดิตถ์',
  'ตาก', 'สุโขทัย', 'พิษณุโลก', 'กำแพงเพชร', 'พิจิตร', 'เพชรบูรณ์', 'นครสวรรค์', 'อุทัยธานี',
  'ขอนแก่น', 'อุดรธานี', 'เลย', 'หนองคาย', 'หนองบัวลำภู', 'บึงกาฬ', 'สกลนคร', 'นครพนม', 'มุกดาหาร',
  'กาฬสินธุ์', 'มหาสารคาม', 'ร้อยเอ็ด', 'ยโสธร', 'อำนาจเจริญ', 'อุบลราชธานี', 'ศรีสะเกษ', 'สุรินทร์',
  'บุรีรัมย์', 'นครราชสีมา', 'ชัยภูมิ', 'สระบุรี', 'ลพบุรี', 'สิงห์บุรี', 'ชัยนาท', 'อ่างทอง',
  'พระนครศรีอยุธยา', 'สุพรรณบุรี', 'กาญจนบุรี', 'ราชบุรี', 'เพชรบุรี', 'ประจวบคีรีขันธ์',
  'ชลบุรี', 'ระยอง', 'จันทบุรี', 'ตราด', 'ฉะเชิงเทรา', 'ปราจีนบุรี', 'นครนายก', 'สระแก้ว',
  'ชุมพร', 'ระนอง', 'สุราษฎร์ธานี', 'พังงา', 'ภูเก็ต', 'กระบี่', 'นครศรีธรรมราช', 'ตรัง', 'พัทลุง',
  'สงขลา', 'สตูล', 'ปัตตานี', 'ยะลา', 'นราธิวาส',
];

export function isFarProvince(area: string | undefined | null): boolean {
  if (!area) return false;
  const a = String(area);
  if (SERVICE_AREA_PROVINCES.some((p) => a.includes(p))) return false;
  return FAR_PROVINCES.some((p) => a.includes(p));
}

/** อายุที่ถือเป็นเด็ก — เส้นทางอนุรักษ์นิยม (ไม่แนะนำ self-care/ร้านยาเป็นทางหลัก) */
export const CHILD_AGE_LIMIT = 15;

export function isChildCase(age: number | undefined | null): boolean {
  return typeof age === 'number' && age > 0 && age < CHILD_AGE_LIMIT;
}

/** สิทธิ์ที่รองรับ (ใช้ใน SCOPE.md + test coverage) */
export const SUPPORTED_SCHEMES = [
  { code: 'UCS', label: 'บัตรทอง (รวมสิทธิ์ต่างจังหวัด + 30 บาทรักษาทุกที่)' },
  { code: 'SSS', label: 'ประกันสังคม ม.33/39 (รวมทันตกรรม + เปลี่ยน รพ.)' },
  { code: 'CSMBS', label: 'ข้าราชการ/เบิกได้ (ระดับข้อมูลทั่วไป)' },
  { code: 'UNKNOWN', label: 'ไม่รู้สิทธิ์ → ซักอาชีพเพื่ออนุมานแล้วให้ยืนยัน' },
] as const;

/** จำนวนคำถามสูงสุดต่อ panel หนึ่งรอบ (นับรวม clinical follow-up) */
export const MAX_QUESTIONS_PER_PANEL = 4;
/** clinical follow-up สูงสุดเมื่อ battery คำถามสิทธิ์ยังเหลือหลายข้อ */
export const MAX_CLINICAL_QUESTIONS = 2;
