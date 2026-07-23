/* eslint-disable no-console */
// seed:demo — idempotent (spec §3): (1) merge curated facilities เข้า
// lib/data/kgFallback.json (แหล่งข้อมูลจริงของ /api/facilities/search เมื่อ
// Neo4j ว่าง) และ (2) upsert ลงตาราง Supabase `facilities` เมื่อ config ครบ
// (best-effort — booth ออฟไลน์ยังทำงานด้วย fallback JSON)
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { SEED_FACILITIES } from "../demo/seed-facilities";

const ROOT = path.resolve(__dirname, "..");
const KG_FALLBACK = path.join(ROOT, "lib", "data", "kgFallback.json");

function loadEnvLocal(): void {
  for (const file of [".env.local", ".env"]) {
    const p = path.join(ROOT, file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

async function main(): Promise<void> {
  loadEnvLocal();

  // ---- 1) merge เข้า kgFallback.json (idempotent ด้วย facility_id) ----------
  const kg = JSON.parse(fs.readFileSync(KG_FALLBACK, "utf8")) as {
    facilities: Record<string, unknown>[];
  };
  const byId = new Map(kg.facilities.map((f) => [f.facility_id as string, f]));
  let added = 0;
  let updated = 0;
  for (const seed of SEED_FACILITIES) {
    const row = {
      facility_id: seed.facility_id,
      name: seed.name,
      level: seed.level,
      district: seed.district,
      lat: seed.lat,
      lng: seed.lng,
      ...(seed.phone ? { phone: seed.phone } : {}),
      accepts: seed.accepts,
      open_hours: seed.open_hours ?? "",
      ...(seed.services ? { services: seed.services } : {}),
      ...(seed.note ? { note: seed.note } : {}),
      ...(seed.confidence ? { confidence: seed.confidence } : {}),
    };
    if (byId.has(seed.facility_id)) {
      Object.assign(byId.get(seed.facility_id)!, row);
      updated++;
    } else {
      kg.facilities.push(row);
      byId.set(seed.facility_id, row);
      added++;
    }
  }
  fs.writeFileSync(KG_FALLBACK, JSON.stringify(kg, null, 2) + "\n");
  console.log(`kgFallback.json: เพิ่ม ${added} · อัปเดต ${updated} · รวม ${kg.facilities.length} แห่ง`);

  // ---- 2) upsert Supabase `facilities` (best-effort) -------------------------
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.log("Supabase ไม่ได้ config — ข้ามการ upsert ตาราง facilities (fallback JSON ใช้งานได้อยู่แล้ว)");
    return;
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // 2a) source document ของชุด seed (FK ของ areas/facilities)
  const SOURCE_ID = "doc:seed:demo-facility-curation";
  const { error: srcErr } = await sb.from("source_documents").upsert(
    {
      id: SOURCE_ID,
      title: "ชุดข้อมูลสถานพยาบาลที่ทีมรวบรวมสำหรับพื้นที่ให้บริการ กทม.",
      publisher: "ทีมรู้สิทธิ์ รู้สุข (รวบรวมจากแหล่งสาธารณะ)",
      document_type: "TEAM_CURATION",
      effective_from: "2026-07-01",
      verification_status: "NEEDS_CONFIRMATION",
      is_official: false,
    },
    { onConflict: "id" }
  );
  if (srcErr) {
    console.log(`Supabase source_documents ล้มเหลว (${srcErr.message}) — fallback JSON ยังครบ`);
    return;
  }

  // 2b) areas ของเขตที่ยังไม่มี (FK: parent area:bkk)
  const districtToArea = (district: string): string =>
    `area:bkk:${district
      .replace("บางนา", "bang-na").replace("ลาดพร้าว", "lat-phrao").replace("บางกะปิ", "bang-kapi")
      .replace("ห้วยขวาง", "huai-khwang").replace("ดินแดง", "din-daeng").replace("จตุจักร", "chatuchak")
      .replace("ประเวศ", "prawet")}`;
  const districts = [...new Set(SEED_FACILITIES.map((s) => s.district))];
  const { error: areaErr } = await sb.from("areas").upsert(
    districts.map((d) => ({
      id: districtToArea(d),
      area_code: districtToArea(d).replace("area:bkk:", "bkk-"),
      name_th: d,
      level: "DISTRICT",
      parent_id: "area:bkk",
      source_id: SOURCE_ID,
      effective_from: "2026-07-01",
      verification_status: "NEEDS_CONFIRMATION",
    })),
    { onConflict: "id", ignoreDuplicates: true }
  );
  if (areaErr) {
    console.log(`Supabase areas ล้มเหลว (${areaErr.message}) — fallback JSON ยังครบ`);
    return;
  }

  // 2c) facilities — ธง verified: ข้อมูลสมจริงที่ยังไม่ยืนยัน = DEMO_ONLY (อยู่ใน
  // DB เท่านั้น UI ไม่แสดง), ข้อมูลจริง = NEEDS_CONFIRMATION รอทีมตรวจ
  const rows = SEED_FACILITIES.map((s) => ({
    id: `fac:seed:${s.facility_id.toLowerCase()}`,
    name_th: s.name,
    facility_type:
      s.level === "hospital" ? "PUBLIC_HOSPITAL"
      : s.level === "pharmacy" ? "QUALITY_PHARMACY"
      : s.level === "dental_clinic" ? "DENTAL_CLINIC"
      : s.level === "warm_clinic" ? "WARM_CLINIC"
      : "PUBLIC_HEALTH_CENTER",
    care_level: s.services?.some((v) => v.includes("ฉุกเฉิน")) ? "EMERGENCY" : "PRIMARY",
    address_th: `เขต${s.district} กรุงเทพมหานคร`,
    area_id: districtToArea(s.district),
    lat: s.lat,
    lng: s.lng,
    phone: s.phone ?? null,
    opening_hours: { note_th: s.open_hours ?? "" },
    call_before_visit: true,
    source_id: SOURCE_ID,
    effective_from: "2026-07-01",
    verification_status: s.confidence === "seed" ? "DEMO_ONLY" : "NEEDS_CONFIRMATION",
    active: true,
  }));
  const { error } = await sb.from("facilities").upsert(rows, { onConflict: "id" });
  if (error) console.log(`Supabase upsert ล้มเหลว (${error.message}) — fallback JSON ยังครบ`);
  else console.log(`Supabase facilities: upsert ${rows.length} แถวสำเร็จ`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
