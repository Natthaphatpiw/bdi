import { describe, expect, it } from "vitest";
import {
  computeGaitFeatures,
  computeMotionFeatures,
  computeTapFeatures,
  computeTypingFeatures,
  sentenceAccuracy,
} from "@/lib/guardian/features";
import type { MotionSample, TapSample, TypingSample } from "@/lib/guardian/types";

function motionSine(hz: number, seconds: number, rate = 50, amplitude = 1): MotionSample[] {
  const samples: MotionSample[] = [];
  for (let i = 0; i < seconds * rate; i++) {
    const t = (i * 1000) / rate;
    samples.push({
      t,
      ax: amplitude * Math.sin((2 * Math.PI * hz * t) / 1000),
      ay: 0,
      az: 9.81,
      ra: 0,
      rb: 0,
      rg: 0,
    });
  }
  return samples;
}

describe("guardian features", () => {
  it("computes near-zero RMS for a perfectly still device", () => {
    const still: MotionSample[] = Array.from({ length: 200 }, (_, i) => ({
      t: i * 20,
      ax: 0.001,
      ay: -0.002,
      az: 9.81,
      ra: 0,
      rb: 0,
      rg: 0,
    }));
    const f = computeMotionFeatures(still);
    expect(f.rms_mag).toBeLessThan(0.01);
    expect(f.band_power_3_12).toBeLessThan(0.01);
    expect(f.sample_count).toBe(200);
  });

  it("finds the dominant frequency of a synthetic tremor in the 3–12 Hz band", () => {
    const f = computeMotionFeatures(motionSine(6, 8));
    expect(f.dominant_freq_hz).toBeGreaterThan(5);
    expect(f.dominant_freq_hz).toBeLessThan(7);
    expect(f.band_power_3_12).toBeGreaterThan(0.5);
  });

  it("counts steps from periodic peaks with plausible cadence", () => {
    // ~2 ก้าว/วินาที เดิน 10 วิ → ~20 ก้าว
    const f = computeGaitFeatures(motionSine(2, 10, 50, 3));
    expect(f.step_count).toBeGreaterThanOrEqual(15);
    expect(f.step_count).toBeLessThanOrEqual(25);
    expect(f.cadence_spm).toBeGreaterThan(80);
    expect(f.cadence_spm).toBeLessThan(160);
  });

  it("computes tap accuracy features", () => {
    const samples: TapSample[] = [
      { t: 100, tx: 100, ty: 100, px: 103, py: 104, rt: 350, miss: false },
      { t: 700, tx: 200, ty: 220, px: 200, py: 220, rt: 280, miss: false },
      { t: 1400, tx: 60, ty: 300, px: 120, py: 340, rt: 900, miss: true },
    ];
    const f = computeTapFeatures(samples);
    expect(f.tap_count).toBe(3);
    expect(f.miss_rate).toBeCloseTo(1 / 3, 2);
    expect(f.mean_reaction_ms).toBe(315); // mean ของ hit เท่านั้น
    expect(f.max_offset_px).toBeGreaterThan(70);
  });

  it("computes typing rhythm without ever touching text content", () => {
    const samples: TypingSample[] = Array.from({ length: 10 }, (_, i) => ({
      t: i * 200,
      len: i + 1,
      del: i === 5,
    }));
    const f = computeTypingFeatures(samples, 0.95);
    expect(f.iki_mean_ms).toBe(200);
    expect(f.backspace_count).toBe(1);
    expect(f.total_time_ms).toBe(1800);
    expect(f.accuracy).toBeCloseTo(0.95, 3);
  });

  it("sentence accuracy: exact = 1, empty = 0, near-match is high", () => {
    const target = "วันนี้ฉันดูแลสุขภาพของตัวเองได้ดี";
    expect(sentenceAccuracy(target, target)).toBe(1);
    expect(sentenceAccuracy("", target)).toBe(0);
    expect(sentenceAccuracy("วันนี้ฉันดูแลสุขภาพของตัวเองได้", target)).toBeGreaterThan(0.85);
  });
});
