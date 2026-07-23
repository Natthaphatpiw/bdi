// Safety gate — red flags §1.2 ทุกตัวต้อง match และ negative cases ต้องไม่ match
// (deterministic — วิ่งก่อน LLM เสมอ ทั้งข้อความไทยและอังกฤษพื้นฐาน)
import { describe, expect, it } from "vitest";
import { safetyPreCheck } from "@/lib/safety";
import { detectRedFlags } from "@/lib/runpod/prescreen";

describe("safety gate — red flags ครบตาม scope §1.2", () => {
  const RED_FLAGS = [
    "เจ็บแน่นหน้าอก ร้าวไปแขนซ้าย",
    "แน่นหน้าอก หายใจไม่ออก",
    "พ่อหมดสติ เรียกไม่รู้ตัว",
    "น้องชัก เกร็งกระตุกทั้งตัว",
    "ปากเบี้ยว พูดไม่ชัด แขนอ่อนแรงข้างเดียว",
    "หายใจลำบาก หอบรุนแรง",
    "อาเจียนเป็นเลือด",
    "ถ่ายเป็นเลือดเยอะมาก",
    "ปวดหัวรุนแรงเฉียบพลัน ไม่เคยเป็นมาก่อน",
    "ตั้งครรภ์ 7 เดือน ปวดท้องมาก มีเลือดออก",
    "แม่ซึมลง เหงื่อแตก ตัวเย็น",
    "แพ้รุนแรง หน้าบวมลิ้นบวม",
    "ลูกไข้สูง ซึม ปลุกยาก",
    "กินยาเกินขนาด",
    "chest pain and can't breathe",
    "my father is unconscious",
  ];
  it.each(RED_FLAGS)("จับ: %s", (text) => {
    expect(safetyPreCheck(text).emergency).toBe(true);
  });

  it("ภาวะวิกฤตสุขภาพจิต → พ่วงสายด่วน 1323 เสมอ", () => {
    const pre = safetyPreCheck("ไม่อยากมีชีวิตอยู่แล้ว");
    expect(pre.emergency).toBe(true);
    expect(JSON.stringify(pre.card)).toContain("1323");
  });

  // negative cases ≥10 — คำใกล้เคียงที่ไม่ใช่ภาวะฉุกเฉิน ต้องไม่ยิง emergency
  const NEGATIVES = [
    "เจ็บหน้าอกเวลากดกล้ามเนื้อหลังออกกำลังกาย",
    "ไม่มีอาการเจ็บหน้าอกเลย",
    "ไม่เคยหมดสติ",
    "ไม่มีอาการชัก",
    "ปวดหัวนิดหน่อยตั้งแต่เมื่อวาน",
    "ปวดหัวเวลาอดนอน เป็นประจำ",
    "ไอมีเสมหะตอนเช้า",
    "เหนื่อยง่ายเวลาเดินขึ้นบันได",
    "แพ้ฝุ่น จามบ่อย",
    "มีดบาดนิ้ว เลือดหยุดแล้ว",
    "ท้องเสียถ่ายเหลวสองรอบ",
    "ปวดฟันมากจนนอนไม่หลับ",
  ];
  it.each(NEGATIVES)("ไม่จับ: %s", (text) => {
    expect(safetyPreCheck(text).emergency).toBe(false);
  });
});

describe("prescreen rails — detectRedFlags ต้องไม่ over-triage จาก token เดี่ยวทั่วไป", () => {
  // false positives ที่เคยเกิดจริง: "กราม"→หัวใจขาดเลือด, "ปวดท้อง"→DKA,
  // "มีไข้"→ติดเชื้อในข้อ — เคสธรรมดาเหล่านี้ต้องไม่ยิง red flag ใด
  const NO_FLAGS = [
    "ปวดฟันกรามล่างขวา เสียวฟันเวลาเคี้ยว",
    "ปวดท้องท้องเสียตั้งแต่เมื่อคืน ถ่ายเหลวสามรอบ",
    "มีไข้ต่ำ ๆ เจ็บคอ คัดจมูกมาสองวัน",
    "เวียนหัวเวลาลุกเร็ว ๆ มาหลายวัน",
    "ปวดหลังล่างจากยกของหนักเมื่อวาน",
    "ผื่นคันขึ้นที่แขนสองข้าง",
    "เป็นเบาหวาน ช่วงนี้เพลียและปัสสาวะบ่อย",
  ];
  it.each(NO_FLAGS)("ไม่ยิง flag: %s", (text) => {
    expect(detectRedFlags(text).map((r) => r.id)).toEqual([]);
  });

  // true positives — วลีฉุกเฉินเฉพาะเจาะจงต้องยังยิงได้ครบ
  it("ยังจับวลีฉุกเฉินเฉพาะเจาะจงได้", () => {
    expect(detectRedFlags("แน่นหน้าอกร้าวไปแขนซ้าย เหงื่อแตก").some((r) => r.id === "RF_CHEST_MI")).toBe(true);
    expect(detectRedFlags("อาเจียนเป็นเลือดสองรอบ").some((r) => r.id === "RF_GI_BLEED")).toBe(true);
    expect(detectRedFlags("ปากเบี้ยว พูดไม่ชัด แขนขาอ่อนแรง").some((r) => r.id === "RF_STROKE")).toBe(true);
    expect(detectRedFlags("ซึมลง หมดสติ เรียกไม่ตื่น").length).toBeGreaterThan(0);
    expect(detectRedFlags("อยากตาย คิดสั้น").some((r) => r.id === "RF_SUICIDAL")).toBe(true);
    expect(detectRedFlags("หอบจนพูดไม่เป็นประโยค ปากเขียว").some((r) => r.id === "RF_ASTHMA_SEVERE")).toBe(true);
  });
});
