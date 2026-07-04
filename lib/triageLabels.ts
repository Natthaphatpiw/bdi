// Thai labels for the 27B prescreen vocabulary — shared by the chat cards and
// the Case Passport. Deterministic mappings only.
import kgStatic from "./runpod/kgStatic.json";

const DEPT_TH: Record<string, string> = {
  "Internal Medicine": "อายุรกรรม",
  "Emergency Medicine": "ฉุกเฉิน",
  "Primary Care Unit": "หน่วยบริการปฐมภูมิ (แพทย์ทั่วไป)",
  "Surgery": "ศัลยกรรม",
  "Orthopedics and Physical Therapy": "ออร์โธปิดิกส์/กายภาพบำบัด",
  "Ophthalmology": "จักษุวิทยา",
  "Otorhinolaryngology": "หูคอจมูก",
  "Dermatology": "ผิวหนัง",
  "Psychiatry": "จิตเวช",
  "Pediatrics": "กุมารเวช",
  "Obstetrics and Gynecology": "สูติ-นรีเวช",
  "Rehabilitation": "เวชศาสตร์ฟื้นฟู",
  "Forensic Medicine": "นิติเวชศาสตร์",
};

export function deptThai(dept: string | null | undefined): string | undefined {
  if (!dept) return undefined;
  return DEPT_TH[dept] ? `${DEPT_TH[dept]} (${dept})` : dept;
}

export function severityThai(s: string | null | undefined): string {
  const m: Record<string, string> = {
    "Observe at Home": "เฝ้าสังเกตที่บ้าน",
    "Visit Hospital / Clinic": "ควรไปพบแพทย์เมื่อสะดวก",
    "Visit Hospital / Clinic Urgently": "ควรไปพบแพทย์ภายใน 24 ชม.",
    Emergency: "ฉุกเฉิน ไปทันที",
  };
  return (s && m[s]) || s || "";
}

/** Thai condition name for a 27B disease_name_en, when it maps to our KG. */
export function conditionThaiFor(diseaseEn: string | null | undefined): string | undefined {
  if (!diseaseEn) return undefined;
  const c = (kgStatic.conditions as { disease_name_en: string; name_th: string }[]).find(
    (c) => c.disease_name_en === diseaseEn
  );
  return c?.name_th;
}
