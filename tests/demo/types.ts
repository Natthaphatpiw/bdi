// Fixture contract สำหรับ demo coverage runner (spec §6.1)
// หลักการ: assert ที่โครงสร้างและ invariant (slots / ชนิดการ์ด / เส้นทาง /
// citation) — ไม่ assert ถ้อยคำจาก LLM ซึ่งเปลี่ยนได้ทุกครั้ง

export type FixtureCategory = 'golden' | 'paraphrase' | 'matrix' | 'adversarial' | 'safety';

export interface FixtureTurn {
  /** ข้อความอิสระจากผู้ใช้ */
  user?: string;
  /**
   * คำตอบต่อ questions panel ของ turn ก่อนหน้า — map field → value
   * คำถามที่ไม่อยู่ใน map (เช่น clinical clin_0 ที่ field ไดนามิก) runner
   * จะตอบด้วยตัวเลือกแรกให้อัตโนมัติ
   */
  answers?: Record<string, string>;
}

export interface FixtureExpect {
  finalRoute: 'cards' | 'emergency' | 'boundary' | 'clarify';
  /**
   * ยอมรับหลายเส้นทาง — ใช้เมื่อ prescreen เชิงลึกมีสิทธิ์ escalate โดยชอบ
   * (safety-first ไม่ใช่ความผิดพลาด) เช่น ใจสั่น+หน้ามืด อาจจบ cards หรือ emergency
   */
  finalRouteAnyOf?: ('cards' | 'emergency' | 'boundary' | 'clarify')[];
  /** boundary ประเภทใด (เทียบกับการ์ด/พฤติกรรม ไม่ใช่ internal audit) */
  cardTypesInclude?: string[];
  cardTypesExclude?: string[];
  /** slots ที่ต้องสกัดได้ (เทียบเท่ากับ understood ของ response สุดท้าย) */
  slotsEqual?: Record<string, unknown>;
  /** เทียบ facility อันดับ 1 กับ fixture id อื่น (paraphrase equivalence) */
  facilityTop1SameAs?: string;
  /** การ์ดสิทธิ์/เงื่อนไข → evidence ต้องมี citation ≥1 */
  citationsRequired?: boolean;
  /** จำนวนคำถามสูงสุดต่อ panel (นับเฉพาะคำถามหลัก ไม่รวม conditional show_if) */
  maxQuestions?: number;
  /** regex ที่ห้ามพบในทุกข้อความของ response (ชื่อโรคฟันธง, demo strings, dosing) */
  mustNotMatch?: string[];
  /** regex ที่ต้องพบอย่างน้อยหนึ่งแห่งใน response */
  mustMatch?: string[];
  /** red flag ต้องได้ safety emergency ภายใน turn เดียวกับที่พิมพ์ */
  emergencyWithinSameTurn?: boolean;
}

export interface Fixture {
  id: string;
  category: FixtureCategory;
  /** 'turn' (default) = ยิง /api/turn · 'guardian' = ลำดับ Guardian API */
  kind?: 'turn' | 'guardian';
  /** เฉพาะ kind guardian: ลำดับ action */
  guardian?: {
    pattern: 'tremor' | 'drops' | 'fall';
    steps: (
      | { action: 'signal'; expectSuppressed?: boolean | 'auto' }
      | { action: 'update'; outcome: string; chosen_symptom?: string; payload?: Record<string, unknown> }
      | { action: 'er_passport'; emergency: Record<string, unknown>; mustMatch: string[] }
    )[];
  };
  turns: FixtureTurn[];
  expect: FixtureExpect;
  note?: string;
}
