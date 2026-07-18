import type { z } from "zod";
import { OpeningStatusSchema } from "./contracts";

export type OpeningStatus = z.infer<typeof OpeningStatusSchema>;

export interface OpeningHoursResult {
  status: OpeningStatus;
  text: string;
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** Evaluates seeded weekly hours in Asia/Bangkok. It never implies live availability. */
export function getOpeningStatus(
  openingHours: unknown,
  atTime: Date | string = new Date(),
  timezone = "Asia/Bangkok",
): OpeningHoursResult {
  const root = asRecord(openingHours);
  const weekly = asRecord(root.weekly ?? root);
  if (!Object.keys(weekly).length) {
    return { status: "HOURS_UNKNOWN", text: note(root) ?? "ยังต้องยืนยันเวลาเปิดให้บริการ" };
  }

  const instant = atTime instanceof Date ? atTime : new Date(atTime);
  if (Number.isNaN(instant.getTime())) {
    return { status: "HOURS_UNKNOWN", text: "ยังต้องยืนยันเวลาเปิดให้บริการ" };
  }
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: String(root.timezone ?? timezone),
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const weekday = parts.find((part) => part.type === "weekday")?.value.toLowerCase().slice(0, 3);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const key = DAY_KEYS.includes(weekday as (typeof DAY_KEYS)[number])
    ? (weekday as (typeof DAY_KEYS)[number])
    : null;
  if (!key || !(key in weekly)) {
    return { status: "HOURS_UNKNOWN", text: note(root) ?? "ยังต้องยืนยันเวลาเปิดให้บริการ" };
  }

  const ranges = parseRanges(weekly[key]);
  if (!ranges.length) return { status: "CLOSED", text: "ปิดตามเวลาที่ระบุไว้ โปรดโทรยืนยัน" };
  const nowMinutes = hour * 60 + minute;
  const open = ranges.some(([start, end]) => nowMinutes >= start && nowMinutes < end);
  const display = ranges.map(([start, end]) => `${formatMinutes(start)}–${formatMinutes(end)}`).join(", ");
  return open
    ? { status: "OPEN_NOW", text: `เปิดตามข้อมูลล่าสุด ${display} โปรดโทรยืนยัน` }
    : { status: "CLOSED", text: `ปิดในขณะนี้ (เวลาที่ระบุ ${display}) โปรดโทรยืนยัน` };
}

function parseRanges(value: unknown): Array<[number, number]> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((range): Array<[number, number]> => {
    if (!Array.isArray(range) || range.length < 2) return [];
    const start = parseClock(range[0]);
    const end = parseClock(range[1]);
    return start == null || end == null || end <= start ? [] : [[start, end]];
  });
}

function parseClock(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour === 24 && minute === 0) return 24 * 60;
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function formatMinutes(value: number): string {
  if (value === 24 * 60) return "24:00";
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function note(root: Record<string, unknown>): string | null {
  const value = root.note_th ?? root.noteTh;
  return typeof value === "string" && value.trim() ? value : null;
}
