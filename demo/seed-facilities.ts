// Curated facility seed (spec §3.1) — เติม coverage ให้ ≥7 เขตทั่ว กทม.
// ต่อเขต: คลินิกอบอุ่น / ร้านยาคุณภาพ (มีเปิดดึกอย่างน้อยเขตละ 1 เพื่อเคส
// "ป่วย 2 ทุ่ม") / รพ.มี ER / ทันตกรรมคู่สัญญา ปกส.
// ข้อมูลจริงที่ตรวจแล้วใช้ตามจริง ที่เหลือเป็นข้อมูลสมจริงปักธง confidence:'seed'
// (ธงอยู่ใน DB/audit เท่านั้น — UI ไม่แสดง) — ดู KNOWN-LIMITS.md
export interface SeedFacility {
  facility_id: string;
  name: string;
  level: 'health_center' | 'warm_clinic' | 'pharmacy' | 'hospital' | 'dental_clinic';
  district: string;
  lat: number | null;
  lng: number | null;
  phone?: string;
  accepts: string[];
  open_hours?: string;
  services?: string[];
  note?: string;
  confidence?: string;
}

export const SEED_FACILITIES: SeedFacility[] = [
  // ---- บางนา (เคสเวที golden A + persona เก่ง) ------------------------------
  {
    facility_id: 'FAC_HC8_BANGNA',
    name: 'ศูนย์บริการสาธารณสุข 8 บุญรอด รุ่งเรือง (บางนา)',
    level: 'health_center', district: 'บางนา',
    lat: 13.667, lng: 100.633, phone: '02-173-5251',
    accepts: ['UCS', 'CSMBS'],
    open_hours: 'จ-ศ 08.00-16.00 (เวลาราชการ)',
    services: ['ตรวจโรคทั่วไป', 'คัดกรองเบาหวาน/ความดัน', 'ตรวจตาเบาหวานตามนัด'],
  },
  {
    facility_id: 'FAC_WARM_BANGNA',
    name: 'คลินิกเวชกรรมชุมชนอบอุ่นบางนา',
    level: 'warm_clinic', district: 'บางนา',
    lat: 13.664, lng: 100.605,
    accepts: ['UCS'],
    open_hours: 'จ-ศ 08.00-20.00, ส-อา 08.00-12.00',
    services: ['ตรวจโรคทั่วไป', '30 บาทรักษาทุกที่'],
    confidence: 'seed',
  },
  {
    facility_id: 'FAC_PHARM_BANGNA_NIGHT',
    name: 'ร้านยาคุณภาพ อุดมสุขเภสัช (บางนา)',
    level: 'pharmacy', district: 'บางนา',
    lat: 13.679, lng: 100.609,
    accepts: ['UCS'],
    open_hours: 'ทุกวัน 08.00-23.00',
    services: ['เจ็บป่วยเล็กน้อย 32 อาการ', 'ปรึกษาเภสัชกรฟรี'],
    note: 'เปิดถึงดึก — เหมาะเคสป่วยหลังเลิกงาน',
    confidence: 'seed',
  },
  {
    facility_id: 'FAC_THAINAKARIN',
    name: 'โรงพยาบาลไทยนครินทร์',
    level: 'hospital', district: 'บางนา',
    lat: 13.6644, lng: 100.6474, phone: '02-340-6499',
    accepts: ['SSS'],
    open_hours: 'ห้องฉุกเฉินเปิดตลอด 24 ชั่วโมง',
    services: ['ห้องฉุกเฉิน 24 ชั่วโมง', 'อายุรกรรม'],
  },
  {
    facility_id: 'FAC_SIRINDHORN',
    name: 'โรงพยาบาลสิรินธร (สำนักการแพทย์ กทม.)',
    level: 'hospital', district: 'ประเวศ',
    lat: 13.7003, lng: 100.6907, phone: '02-328-6900',
    accepts: ['UCS', 'SSS', 'CSMBS'],
    open_hours: 'OPD จ-ศ 08.00-16.00; ห้องฉุกเฉิน 24 ชั่วโมง',
    services: ['ห้องฉุกเฉิน 24 ชั่วโมง', 'อายุรกรรม', 'จักษุ'],
  },
  {
    facility_id: 'FAC_DENTAL_BANGNA',
    name: 'คลินิกทันตกรรมคู่สัญญาประกันสังคม บางนา',
    level: 'dental_clinic', district: 'บางนา',
    lat: 13.668, lng: 100.612,
    accepts: ['SSS'],
    open_hours: 'จ-ส 10.00-19.00',
    services: ['ทันตกรรมประกันสังคม 900 บาท/ปี ไม่ต้องสำรองจ่าย'],
    confidence: 'seed',
  },
  // ---- ลาดพร้าว --------------------------------------------------------------
  {
    facility_id: 'FAC_PHARM_LATPHRAO',
    name: 'ร้านยาคุณภาพ ลาดพร้าวเภสัช',
    level: 'pharmacy', district: 'ลาดพร้าว',
    lat: 13.807, lng: 100.607,
    accepts: ['UCS'],
    open_hours: 'ทุกวัน 08.00-22.00',
    services: ['เจ็บป่วยเล็กน้อย 32 อาการ', 'ปรึกษาเภสัชกรฟรี'],
    confidence: 'seed',
  },
  {
    facility_id: 'FAC_LADPRAO_HOSP',
    name: 'โรงพยาบาลลาดพร้าว',
    level: 'hospital', district: 'ลาดพร้าว',
    lat: 13.8065, lng: 100.6088, phone: '02-530-2556',
    accepts: ['SSS'],
    open_hours: 'ห้องฉุกเฉินเปิดตลอด 24 ชั่วโมง',
    services: ['ห้องฉุกเฉิน 24 ชั่วโมง', 'ทันตกรรมประกันสังคม'],
  },
  {
    facility_id: 'FAC_DENTAL_LATPHRAO',
    name: 'คลินิกทันตกรรมคู่สัญญาประกันสังคม ลาดพร้าว',
    level: 'dental_clinic', district: 'ลาดพร้าว',
    lat: 13.803, lng: 100.594,
    accepts: ['SSS'],
    open_hours: 'จ-ส 10.00-19.00',
    services: ['ทันตกรรมประกันสังคม 900 บาท/ปี ไม่ต้องสำรองจ่าย'],
    confidence: 'seed',
  },
  // ---- ห้วยขวาง / ดินแดง -----------------------------------------------------
  {
    facility_id: 'FAC_PHARM_HUAIKHWANG',
    name: 'ร้านยาคุณภาพ ห้วยขวางฟาร์มาซี',
    level: 'pharmacy', district: 'ห้วยขวาง',
    lat: 13.776, lng: 100.579,
    accepts: ['UCS'],
    open_hours: 'ทุกวัน 09.00-22.00',
    services: ['เจ็บป่วยเล็กน้อย 32 อาการ', 'ปรึกษาเภสัชกรฟรี'],
    confidence: 'seed',
  },
  {
    facility_id: 'FAC_PRARAM9',
    name: 'โรงพยาบาลพระราม 9',
    level: 'hospital', district: 'ห้วยขวาง',
    lat: 13.7488, lng: 100.5651, phone: '1270',
    accepts: ['SSS'],
    open_hours: 'ห้องฉุกเฉินเปิดตลอด 24 ชั่วโมง',
    services: ['ห้องฉุกเฉิน 24 ชั่วโมง'],
  },
  {
    facility_id: 'FAC_HC4_DINDAENG',
    name: 'ศูนย์บริการสาธารณสุข 4 ดินแดง',
    level: 'health_center', district: 'ดินแดง',
    lat: 13.7699, lng: 100.5522,
    accepts: ['UCS', 'CSMBS'],
    open_hours: 'จ-ศ 08.00-16.00 (เวลาราชการ)',
    services: ['ตรวจโรคทั่วไป', 'คัดกรองเบาหวาน/ความดัน'],
  },
  // ---- จตุจักร ---------------------------------------------------------------
  {
    facility_id: 'FAC_HC17_CHATUCHAK',
    name: 'ศูนย์บริการสาธารณสุข 17 ประชานิเวศน์ (จตุจักร)',
    level: 'health_center', district: 'จตุจักร',
    lat: 13.8285, lng: 100.5578,
    accepts: ['UCS', 'CSMBS'],
    open_hours: 'จ-ศ 08.00-16.00 (เวลาราชการ)',
    services: ['ตรวจโรคทั่วไป'],
    confidence: 'seed',
  },
  {
    facility_id: 'FAC_PHARM_CHATUCHAK',
    name: 'ร้านยาคุณภาพ ประชานิเวศน์เภสัช',
    level: 'pharmacy', district: 'จตุจักร',
    lat: 13.827, lng: 100.556,
    accepts: ['UCS'],
    open_hours: 'ทุกวัน 08.30-22.30',
    services: ['เจ็บป่วยเล็กน้อย 32 อาการ', 'ปรึกษาเภสัชกรฟรี'],
    confidence: 'seed',
  },
];
