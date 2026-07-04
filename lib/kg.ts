// Civic Knowledge Graph access — template-first Cypher (verified queries from
// cypher/demo_rights_queries.cypher) with a static fallback so the product still
// answers when Neo4j is unreachable.
import { readCypher } from "./neo4j";
import fallback from "./data/kgFallback.json";
import type { FacilityResult, Scheme } from "./types";

const FB = fallback as {
  facilities: FbFacility[];
  rights: FbRight[];
  benefits: FbBenefit[];
  hotlines: { number: string; name: string; use_when: string; hours: string }[];
  services: FbService[];
};

interface FbFacility {
  facility_id: string;
  name: string;
  level?: string;
  district?: string;
  subdistrict?: string;
  lat: number | null;
  lng: number | null;
  phone?: string;
  accepts: string[];
  open_hours?: string;
  note?: string;
  confidence?: string;
  review_required?: boolean;
}
interface FbRight {
  code: string;
  name_th: string;
  coverage?: string;
  where?: string;
  contact?: string;
  source_url?: string;
  source_title?: string;
  publisher?: string;
}
interface FbBenefit {
  benefit_id: string;
  name: string;
  scheme: string;
  value?: string;
  apply?: string;
  agency?: string;
  documents?: string;
  source_url?: string;
  source_title?: string;
  publisher?: string;
  review_required?: boolean;
}
interface FbService {
  service_id: string;
  name: string;
  type?: string;
  covered_by: string[];
  copay?: string;
  interval_months?: string;
  age_min?: string;
  source_url?: string;
  source_title?: string;
  publisher?: string;
}

// ---- distance (haversine, km) ----------------------------------------------
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)) * 10) / 10;
}

function intervalText(months?: string | number): string | undefined {
  const m = typeof months === "string" ? parseInt(months, 10) : months;
  if (!m || Number.isNaN(m)) return undefined;
  if (m === 12) return "ปีละครั้ง";
  if (m % 12 === 0) return `ทุก ${m / 12} ปี`;
  return `ทุก ${m} เดือน`;
}

// ---- R1: services covered under a scheme (rights card) ---------------------
export interface CoveredService {
  service_id?: string;
  name: string;
  type?: string;
  copay: string;
  interval?: string;
  facilities?: string[];
  age_min?: number;
}
export async function servicesForScheme(scheme: Scheme): Promise<CoveredService[]> {
  const rows = await readCypher<{
    service_id: string;
    name: string;
    type: string;
    copay: string;
    interval: number | null;
    age_min: number | null;
    facilities: string[];
  }>(
    `MATCH (r:HealthRight {code:$scheme})<-[cov:COVERED_BY]-(s:Service)
     OPTIONAL MATCH (s)-[:PROVIDED_AT]->(f:Facility)-[:ACCEPTS]->(r)
     RETURN coalesce(s.service_id, elementId(s)) AS service_id,
            coalesce(s.name, s.service_name_th) AS name,
            s.service_type AS type, coalesce(cov.copay, s.copay, 'ไม่มีค่าใช้จ่าย') AS copay,
            toInteger(s.interval_months) AS interval,
            toInteger(s.eligible_age_min) AS age_min,
            collect(DISTINCT coalesce(f.name, f.name_th))[..3] AS facilities
     ORDER BY type`,
    { scheme }
  );
  if (rows.length) {
    return rows.map((r) => ({
      service_id: r.service_id,
      name: r.name,
      type: r.type,
      copay: r.copay || "ไม่มีค่าใช้จ่าย",
      interval: intervalText(r.interval ?? undefined),
      age_min: r.age_min ?? undefined,
      facilities: (r.facilities || []).filter(Boolean),
    }));
  }
  // fallback
  return FB.services
    .filter((s) => s.covered_by.includes(scheme))
    .map((s) => ({
      service_id: s.service_id,
      name: s.name,
      type: s.type,
      copay: s.copay || "ไม่มีค่าใช้จ่าย",
      interval: intervalText(s.interval_months),
      age_min: s.age_min ? parseInt(s.age_min, 10) || undefined : undefined,
    }));
}

// ---- relevance-first: services the KG RECOMMENDS for a condition ------------
// Used after prescreen so the rights card shows only what matters for THIS case
// (e.g. diabetes → HbA1c/eye/kidney/foot) instead of the whole catalog.
// AGE-FILTERED: a service with eligible_age_min above the patient's age is
// excluded (no elder-screening package for a 26-year-old).
export async function recommendedServices(params: {
  conditionId?: string;
  diseaseNameEn?: string;
  scheme: Scheme;
  age?: number;
}): Promise<CoveredService[]> {
  const { conditionId = "", diseaseNameEn = "", scheme, age } = params;
  if (!conditionId && !diseaseNameEn) return [];
  const rows = await readCypher<{
    service_id: string;
    name: string;
    type: string;
    copay: string;
    interval: number | null;
  }>(
    `MATCH (c:Condition)-[:RECOMMENDS]->(s:Service)-[cov:COVERED_BY]->(r:HealthRight {code:$scheme})
     WHERE (($conditionId <> '' AND c.condition_id = $conditionId)
        OR ($disease <> '' AND c.disease_name_en = $disease))
       AND (s.eligible_age_min IS NULL OR s.eligible_age_min = '' OR toInteger(s.eligible_age_min) <= $age)
       AND (s.eligible_age_max IS NULL OR s.eligible_age_max = '' OR toInteger(s.eligible_age_max) >= $age)
     RETURN DISTINCT coalesce(s.service_id, elementId(s)) AS service_id,
            coalesce(s.name, s.service_name_th) AS name,
            s.service_type AS type,
            coalesce(cov.copay, s.copay, 'ไม่มีค่าใช้จ่าย') AS copay,
            toInteger(s.interval_months) AS interval
     LIMIT 6`,
    { conditionId, disease: diseaseNameEn, scheme, age: age ?? 999 }
  );
  return rows.map((r) => ({
    service_id: r.service_id,
    name: r.name,
    type: r.type,
    copay: r.copay || "ไม่มีค่าใช้จ่าย",
    interval: intervalText(r.interval ?? undefined),
  }));
}

// ---- R2: benefits under a scheme (benefit card source) ---------------------
export interface SchemeBenefit {
  benefit_id: string;
  name: string;
  value?: string;
  apply_at?: string;
  documents?: string[];
  logic_json?: string | null;
  source_url?: string;
  source_title?: string;
  publisher?: string;
  review_required?: boolean;
}
export async function benefitsForScheme(scheme: Scheme): Promise<SchemeBenefit[]> {
  const rows = await readCypher<{
    benefit_id: string;
    name: string;
    value: string;
    agency: string;
    logic: string | null;
  }>(
    `MATCH (r:HealthRight {code:$scheme})-[:HAS_BENEFIT]->(b:Benefit)
     OPTIONAL MATCH (b)-[:APPLIED_VIA]->(ag:Agency)
     OPTIONAL MATCH (rule:EligibilityRule)-[:GRANTS]->(b)
     RETURN coalesce(b.benefit_id, elementId(b)) AS benefit_id,
            coalesce(b.name, b.benefit_name_th) AS name, b.value_th AS value,
            coalesce(ag.name, ag.name_th) AS agency, rule.rule_json AS logic
     ORDER BY benefit_id`,
    { scheme }
  );
  if (rows.length) {
    return rows.map((r) => ({
      benefit_id: r.benefit_id,
      name: r.name,
      value: r.value,
      apply_at: r.agency,
      logic_json: r.logic,
    }));
  }
  return FB.benefits
    .filter((b) => b.scheme === scheme)
    .map((b) => ({
      benefit_id: b.benefit_id,
      name: b.name,
      value: b.value,
      apply_at: b.agency,
      documents: b.documents ? b.documents.split(";").map((d) => d.trim()).slice(0, 4) : undefined,
      source_url: b.source_url,
      source_title: b.source_title,
      publisher: b.publisher,
      review_required: b.review_required,
    }));
}

// universal-ish benefit (OAA has no scheme but applies to elders on any scheme)
export function benefitById(benefitId: string): FbBenefit | undefined {
  return FB.benefits.find((b) => b.benefit_id === benefitId);
}

// ---- facility match + ranking ----------------------------------------------
export interface FacilitySearchParams {
  scheme: Scheme;
  conditionId?: string;
  serviceId?: string;
  area?: string;
  lat?: number;
  lng?: number;
  limit?: number;
}
export async function searchFacilities(p: FacilitySearchParams): Promise<FacilityResult[]> {
  const limit = p.limit ?? 3;
  let candidates: FbFacility[] = [];

  const rows = await readCypher<{
    facility_id: string;
    name: string;
    level: string;
    phone: string;
    lat: number | null;
    lng: number | null;
    accepts: string[];
    district: string;
    review_required: boolean;
    note: string;
  }>(
    `MATCH (f:Facility)-[:ACCEPTS]->(r:HealthRight {code:$scheme})
     RETURN coalesce(f.facility_id, elementId(f)) AS facility_id,
            coalesce(f.name, f.name_th) AS name, f.level AS level, f.phone AS phone,
            toFloat(f.lat) AS lat, toFloat(f.lng) AS lng,
            [x IN split(coalesce(f.accepted_rights,''),';') WHERE x<>''] AS accepts,
            f.district AS district, coalesce(f.review_required,false) AS review_required,
            coalesce(f.notes,'') AS note`,
    { scheme: p.scheme }
  );
  if (rows.length) {
    candidates = rows.map((r) => ({
      facility_id: r.facility_id,
      name: r.name,
      level: r.level,
      lat: r.lat,
      lng: r.lng,
      phone: (r.phone || "").split(",")[0].trim(),
      accepts: r.accepts?.length ? r.accepts : [p.scheme],
      district: r.district,
      review_required: r.review_required,
      note: r.note,
    }));
  } else {
    candidates = FB.facilities.filter((f) => f.accepts.includes(p.scheme));
  }

  // area soft-filter (prefer same district, but never drop everything)
  if (p.area) {
    const inArea = candidates.filter((f) => (f.district || "").includes(p.area!));
    if (inArea.length) candidates = inArea;
  }

  const results: FacilityResult[] = candidates.map((f) => {
    const distance =
      p.lat != null && p.lng != null && f.lat != null && f.lng != null
        ? distanceKm(p.lat, p.lng, f.lat, f.lng)
        : undefined;
    return {
      facility_id: f.facility_id,
      name: f.name,
      level: f.level,
      distance_km: distance,
      accepts: schemeLabels(f.accepts),
      phone: f.phone,
      map_url:
        f.lat != null && f.lng != null
          ? `https://www.google.com/maps/search/?api=1&query=${f.lat},${f.lng}`
          : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(f.name)}`,
      note: f.note,
      confidence: f.confidence,
      review_required: f.review_required,
      open_now: f.open_hours ? undefined : undefined,
    };
  });

  results.sort((a, b) => (a.distance_km ?? 999) - (b.distance_km ?? 999));
  return results.slice(0, limit);
}

// ---- comorbidity (NCD cluster) ---------------------------------------------
export async function comorbidityFor(conditionId: string, scheme: Scheme) {
  return readCypher<{ disease: string; services: string[] }>(
    `MATCH (c:Condition {condition_id:$conditionId})-[:LEADS_TO]->(c2:Condition)
     OPTIONAL MATCH (c2)-[:RECOMMENDS]->(s:Service)-[:COVERED_BY]->(:HealthRight {code:$scheme})
     RETURN coalesce(c2.name, c2.condition_name_th) AS disease,
            collect(DISTINCT coalesce(s.name, s.service_name_th))[..4] AS services`,
    { conditionId, scheme }
  );
}

// ---- prescreen disease/department → KG services ----------------------------
export async function servicesForDisease(diseaseNameEn: string, scheme: Scheme) {
  return readCypher<{ condition: string; condition_id: string; services: string[] }>(
    `MATCH (c:Condition {disease_name_en:$diseaseNameEn})
     OPTIONAL MATCH (c)-[:RECOMMENDS]->(s:Service)-[:COVERED_BY]->(:HealthRight {code:$scheme})
     RETURN coalesce(c.name, c.condition_name_th) AS condition,
            c.condition_id AS condition_id,
            collect(DISTINCT coalesce(s.name, s.service_name_th))[..5] AS services`,
    { diseaseNameEn, scheme }
  );
}

// ---- rights metadata + citations -------------------------------------------
export function rightInfo(scheme: Scheme): FbRight | undefined {
  return FB.rights.find((r) => r.code === scheme);
}
export function allHotlines() {
  return FB.hotlines;
}
export function hotlineByNumber(num: string) {
  return FB.hotlines.find((h) => h.number === num);
}

export const SCHEME_LABELS: Record<string, string> = {
  UCS: "บัตรทอง",
  SSS: "ประกันสังคม",
  CSMBS: "ข้าราชการ",
};
function schemeLabels(codes: string[]): string[] {
  return codes.map((c) => SCHEME_LABELS[c] ?? c);
}
