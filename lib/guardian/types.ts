// =============================================================================
// Guardian Mode + Monthly Health Check — shared contract types.
// The detection engine is behind a seam: today signals come from the
// simulation trigger; a real on-device engine will call the same
// triggerGuardian(signal) without any UI change.
// =============================================================================

export type GuardianPattern = 'fall' | 'tremor' | 'drops';

export interface GuardianSignal {
  pattern: GuardianPattern;
  confidence: number;        // 0..1 (simulation ใช้ 0.9)
  source: 'simulated' | 'sensor';  // internal เท่านั้น ห้ามแสดงใน UI
  detectedAt: string;        // ISO
}

/** Where a chosen symptom sends the user next. */
export type GuardianRoute = 'emergency' | 'befast' | 'triage' | 'dismiss';

export interface GuardianChoice {
  id: string;
  label: string;
  route: GuardianRoute;
  /** ข้อความสังเคราะห์ส่งเข้า /api/turn เมื่อ route = 'triage' */
  triageText?: string;
}

export interface GuardianPatternConfig {
  pattern: GuardianPattern;
  title: string;
  question: string;
  choices: GuardianChoice[];
}

// ---- guardian_events ---------------------------------------------------------
export type GuardianOutcome =
  | 'signal_shown'
  | 'suppressed_cooldown'
  | 'dismissed'
  | 'routed_triage'
  | 'befast_started'
  | 'befast_negative'
  | 'emergency_opened'
  | 'tel_1669_tapped'
  | 'tel_1646_tapped'
  | 'ucep_shown'
  | 'family_notified'
  | 'er_passport_created';

export interface GuardianEventRecord {
  event_id: string;
  suppressed: boolean;
}

export type BefastAnswer = 'yes' | 'no';

export interface BefastResult {
  f?: BefastAnswer;
  a?: BefastAnswer;
  s?: BefastAnswer;
  onset?: string;
}

/** Context handed from popup/BEFAST into the Emergency Co-pilot route. */
export interface EmergencyContext {
  eventId?: string;
  pattern?: GuardianPattern;
  symptom?: string;
  onset?: string;
  befast?: BefastResult;
  enteredAt: string; // ISO
}

// ---- Monthly Health Check ----------------------------------------------------
export type StationId = 'hold_still' | 'tap_target' | 'typing' | 'gait';

/** DeviceMotion sample — ปัดทศนิยม 3 ตำแหน่ง ลดขนาด payload */
export interface MotionSample {
  t: number;  // ms since capture start
  ax: number; ay: number; az: number;      // accelerationIncludingGravity
  ra: number; rb: number; rg: number;      // rotationRate alpha/beta/gamma
}

export interface TapSample {
  t: number;   // ms since station start
  tx: number; ty: number;   // target center (px)
  px: number; py: number;   // touch point (px)
  rt: number;  // reaction time ms
  miss: boolean;
}

/** Typing sample — timing เท่านั้น ไม่มีเนื้อหาข้อความ (Guardrail §9.7) */
export interface TypingSample {
  t: number;    // performance.now() offset ms
  len: number;  // field length after the input event
  del: boolean; // this input event shrank the field (deletion)
}

export interface MotionFeatures {
  rms_mag: number;
  std_x: number; std_y: number; std_z: number;
  dominant_freq_hz: number;
  band_power_3_12: number;
  sample_count: number;
  duration_ms: number;
}

export interface TapFeatures {
  mean_offset_px: number;
  max_offset_px: number;
  mean_reaction_ms: number;
  miss_rate: number;
  tap_count: number;
}

export interface TypingFeatures {
  iki_mean_ms: number;   // inter-input interval
  iki_std_ms: number;
  backspace_count: number;
  total_time_ms: number;
  accuracy: number;      // 0..1 เทียบประโยค target
  input_count: number;
}

export interface GaitFeatures {
  step_count: number;
  cadence_spm: number;          // steps per minute
  step_interval_std_ms: number;
  duration_ms: number;
}

export type StationFeatures = MotionFeatures | TapFeatures | TypingFeatures | GaitFeatures;

export interface HealthCheckSummary {
  stations_completed: StationId[];
  features: Partial<Record<StationId, Record<string, number>>>;
  zscores?: Record<string, number>;
  deviated?: boolean;
}

export interface HealthCheckStartResponse {
  session_id: string;
  is_baseline: boolean;
}

export interface HealthCheckCompleteResponse {
  session_id: string;
  is_baseline: boolean;
  summary: HealthCheckSummary;
}

export interface HealthCheckHistoryEntry {
  session_id: string;
  started_at: string;
  completed_at: string | null;
  is_baseline: boolean;
  summary: HealthCheckSummary;
}

export interface GuardianConsentStatus {
  active: boolean;
  consent_id?: string;
  version?: string;
  granted_at?: string;
}
