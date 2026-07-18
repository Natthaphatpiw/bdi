// Guardian / Health Check tunables — kept in one place so thresholds are
// reviewable and adjustable without touching flow code.
import type { StationId } from './types';

export const GUARDIAN_CONSENT_VERSION = '2026-07-01';

/** cooldown หลังผู้ใช้ตอบ "ฉันสบายดี" — บังคับฝั่ง server (§9.5) */
export const DISMISS_COOLDOWN_HOURS = 24;

/** payload ต่อ request ของ /api/health-check/samples */
export const MAX_SAMPLES_PAYLOAD_BYTES = 200 * 1024;
/** raw samples ต่อสถานี (ฝั่ง client ตัดก่อนส่ง) */
export const MAX_SAMPLES_PER_STATION = 1500;
/** ถ้า chunk JSONB ใหญ่กว่านี้ ให้แตก seq ต่อเนื่อง */
export const SAMPLES_CHUNK_BYTES = 150 * 1024;

export const HOLD_STILL_SECONDS = 10;
export const TAP_TARGET_COUNT = 12;
export const GAIT_TARGET_STEPS = 20;
export const GAIT_MAX_SECONDS = 30;

/** ประโยคสถานีพิมพ์ (§11.9) — เก็บเฉพาะ timing + ผลเทียบประโยคนี้ */
export const TYPING_SENTENCE = 'วันนี้ฉันดูแลสุขภาพของตัวเองได้ดี';

/** นัดเช็คซ้ำหลัง BEFAST ปกติ (นาที) */
export const BEFAST_RECHECK_MINUTES = 60;

/** เช็คสุขภาพครบกำหนดเมื่อเกินกี่วัน */
export const HEALTH_CHECK_DUE_DAYS = 30;

/** เกณฑ์ "ต่างจากเส้นฐาน": |z| >= Z_DEVIATION อย่างน้อย MIN_DEVIATED_METRICS ตัว */
export const Z_DEVIATION = 2;
export const MIN_DEVIATED_METRICS = 2;
/**
 * z-score ต้องมีตัวหาร: ใช้ std ของ session ก่อนหน้า; ถ้ามี session เดียว
 * (baseline เท่านั้น) หรือ std = 0 ให้ใช้สัดส่วนของค่า baseline แทน
 */
export const Z_FALLBACK_STD_FRACTION = 0.15;

/** metric ต่อสถานีที่ใช้เทียบ baseline (ชื่อคีย์ใน summary.features) */
export const COMPARE_METRICS: Record<StationId, string[]> = {
  hold_still: ['rms_mag', 'band_power_3_12'],
  tap_target: ['mean_offset_px', 'mean_reaction_ms', 'miss_rate'],
  typing: ['iki_mean_ms', 'iki_std_ms', 'total_time_ms'],
  gait: ['cadence_spm', 'step_interval_std_ms'],
};

/** ป้ายภาษาไทยของ metric ที่โชว์ในหน้าออกผล/ประวัติ */
export const METRIC_LABELS: Record<string, string> = {
  rms_mag: 'ความนิ่งของมือ',
  band_power_3_12: 'แรงสั่นสะเทือน',
  mean_offset_px: 'ความแม่นยำการแตะ',
  mean_reaction_ms: 'ความไวการตอบสนอง',
  miss_rate: 'อัตราแตะพลาด',
  iki_mean_ms: 'จังหวะการพิมพ์',
  iki_std_ms: 'ความสม่ำเสมอการพิมพ์',
  total_time_ms: 'เวลาพิมพ์รวม',
  cadence_spm: 'จังหวะการเดิน',
  step_interval_std_ms: 'ความสม่ำเสมอของก้าว',
};

export const STATION_LABELS: Record<StationId, string> = {
  hold_still: 'ถือนิ่ง',
  tap_target: 'แตะตามจุด',
  typing: 'พิมพ์ประโยค',
  gait: 'เดิน 20 ก้าว',
};

/** ข้อความกำกับทางการแพทย์ประจำแอป — สะกดชื่อแอปตามแบรนด์จริงใน repo */
export const MEDICAL_DISCLAIMER =
  'รู้สิทธิ์ รู้สุข ช่วยคัดกรองเบื้องต้นและนำทางการใช้สิทธิ์ ไม่ใช่การวินิจฉัยทางการแพทย์';
