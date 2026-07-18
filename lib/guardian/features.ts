// Feature extraction for the Monthly Health Check stations — pure functions,
// hand-rolled math only (spec §7.4: no heavy DSP libs). Runs isomorphically:
// the client computes features per station, the server re-aggregates them
// into the session summary.
import type {
  GaitFeatures,
  MotionFeatures,
  MotionSample,
  TapFeatures,
  TapSample,
  TypingFeatures,
  TypingSample,
} from './types';

const round = (v: number, digits = 3): number => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/** magnitude ของ acceleration หลังหักค่าเฉลี่ย (ตัด gravity/DC ออก) */
function detrendedMagnitude(samples: MotionSample[]): number[] {
  const mx = mean(samples.map((s) => s.ax));
  const my = mean(samples.map((s) => s.ay));
  const mz = mean(samples.map((s) => s.az));
  return samples.map((s) =>
    Math.sqrt((s.ax - mx) ** 2 + (s.ay - my) ** 2 + (s.az - mz) ** 2)
  );
}

/**
 * Naive DFT บน window ท้ายสุด ≤512 จุด เฉพาะ bin 1–15 Hz (O(n·k) — จุดน้อย
 * ไม่ต้องใช้ FFT จริง) คืน power ต่อความถี่ไว้หา dominant freq + band power
 */
function spectrum(signal: number[], sampleRateHz: number): { freq: number; power: number }[] {
  const n = Math.min(signal.length, 512);
  if (n < 16 || sampleRateHz <= 0) return [];
  const xs = signal.slice(-n);
  const m = mean(xs);
  const centered = xs.map((x) => x - m);
  const out: { freq: number; power: number }[] = [];
  const df = sampleRateHz / n;
  for (let k = 1; k < n / 2; k++) {
    const freq = k * df;
    if (freq < 1) continue;
    if (freq > 15) break;
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * k * i) / n;
      re += centered[i] * Math.cos(angle);
      im -= centered[i] * Math.sin(angle);
    }
    out.push({ freq, power: (re * re + im * im) / n });
  }
  return out;
}

export function computeMotionFeatures(samples: MotionSample[]): MotionFeatures {
  if (samples.length < 2) {
    return {
      rms_mag: 0, std_x: 0, std_y: 0, std_z: 0,
      dominant_freq_hz: 0, band_power_3_12: 0,
      sample_count: samples.length, duration_ms: 0,
    };
  }
  const durationMs = samples[samples.length - 1].t - samples[0].t;
  const rateHz = durationMs > 0 ? ((samples.length - 1) * 1000) / durationMs : 0;
  const mag = detrendedMagnitude(samples);
  // Spectrum ต้องคำนวณต่อแกนแล้วรวม power — ถ้าใช้ magnitude ของสัญญาณ
  // zero-mean จะเป็นการ rectify ทำให้ความถี่เด่นเพี้ยนเป็นสองเท่า
  const mx = mean(samples.map((s) => s.ax));
  const my = mean(samples.map((s) => s.ay));
  const mz = mean(samples.map((s) => s.az));
  const axes = [
    samples.map((s) => s.ax - mx),
    samples.map((s) => s.ay - my),
    samples.map((s) => s.az - mz),
  ];
  const powerByFreq = new Map<number, number>();
  for (const axis of axes) {
    for (const { freq, power } of spectrum(axis, rateHz)) {
      powerByFreq.set(freq, (powerByFreq.get(freq) ?? 0) + power);
    }
  }
  let dominant = 0;
  let dominantPower = 0;
  let bandPower = 0;
  for (const [freq, power] of powerByFreq) {
    if (power > dominantPower) {
      dominantPower = power;
      dominant = freq;
    }
    if (freq >= 3 && freq <= 12) bandPower += power;
  }
  return {
    rms_mag: round(Math.sqrt(mean(mag.map((v) => v * v)))),
    std_x: round(std(samples.map((s) => s.ax))),
    std_y: round(std(samples.map((s) => s.ay))),
    std_z: round(std(samples.map((s) => s.az))),
    dominant_freq_hz: round(dominant, 2),
    band_power_3_12: round(bandPower),
    sample_count: samples.length,
    duration_ms: Math.round(durationMs),
  };
}

export function computeTapFeatures(samples: TapSample[]): TapFeatures {
  if (!samples.length) {
    return { mean_offset_px: 0, max_offset_px: 0, mean_reaction_ms: 0, miss_rate: 0, tap_count: 0 };
  }
  const offsets = samples.map((s) => Math.sqrt((s.px - s.tx) ** 2 + (s.py - s.ty) ** 2));
  const hits = samples.filter((s) => !s.miss);
  return {
    mean_offset_px: round(mean(offsets), 1),
    max_offset_px: round(Math.max(...offsets), 1),
    mean_reaction_ms: Math.round(mean(hits.length ? hits.map((s) => s.rt) : samples.map((s) => s.rt))),
    miss_rate: round(samples.filter((s) => s.miss).length / samples.length),
    tap_count: samples.length,
  };
}

export function computeTypingFeatures(samples: TypingSample[], accuracy: number): TypingFeatures {
  if (samples.length < 2) {
    return {
      iki_mean_ms: 0, iki_std_ms: 0, backspace_count: 0,
      total_time_ms: 0, accuracy: round(accuracy), input_count: samples.length,
    };
  }
  const intervals: number[] = [];
  for (let i = 1; i < samples.length; i++) intervals.push(samples[i].t - samples[i - 1].t);
  return {
    iki_mean_ms: Math.round(mean(intervals)),
    iki_std_ms: Math.round(std(intervals)),
    backspace_count: samples.filter((s) => s.del).length,
    total_time_ms: Math.round(samples[samples.length - 1].t - samples[0].t),
    accuracy: round(accuracy),
    input_count: samples.length,
  };
}

/**
 * Step detection: moving-average smoothing บน magnitude แล้วหา peak เกิน
 * threshold แบบ adaptive (mean + 0.6·std) โดย peak ต้องห่างกัน ≥250ms
 */
export function computeGaitFeatures(samples: MotionSample[]): GaitFeatures {
  if (samples.length < 8) {
    return { step_count: 0, cadence_spm: 0, step_interval_std_ms: 0, duration_ms: 0 };
  }
  const durationMs = samples[samples.length - 1].t - samples[0].t;
  const mag = detrendedMagnitude(samples);

  const win = 5;
  const smooth: number[] = mag.map((_, i) => {
    const from = Math.max(0, i - Math.floor(win / 2));
    const to = Math.min(mag.length, i + Math.ceil(win / 2));
    return mean(mag.slice(from, to));
  });

  const threshold = mean(smooth) + 0.6 * std(smooth);
  const minGapMs = 250;
  const peakTimes: number[] = [];
  for (let i = 1; i < smooth.length - 1; i++) {
    if (smooth[i] < threshold) continue;
    if (smooth[i] < smooth[i - 1] || smooth[i] < smooth[i + 1]) continue;
    const t = samples[i].t;
    if (peakTimes.length && t - peakTimes[peakTimes.length - 1] < minGapMs) continue;
    peakTimes.push(t);
  }

  const intervals: number[] = [];
  for (let i = 1; i < peakTimes.length; i++) intervals.push(peakTimes[i] - peakTimes[i - 1]);

  return {
    step_count: peakTimes.length,
    cadence_spm: durationMs > 0 ? round((peakTimes.length * 60000) / durationMs, 1) : 0,
    step_interval_std_ms: Math.round(std(intervals)),
    duration_ms: Math.round(durationMs),
  };
}

/** accuracy สถานีพิมพ์ = normalized Levenshtein เทียบประโยค target (ไม่เก็บข้อความ) */
export function sentenceAccuracy(typed: string, target: string): number {
  if (!target.length) return 0;
  const a = typed.trim();
  const b = target.trim();
  if (!a.length) return 0;
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = tmp;
    }
  }
  return Math.max(0, 1 - dp[b.length] / Math.max(a.length, b.length));
}
