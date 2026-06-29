"use client";
// MediaRecorder voice capture with a live amplitude meter (for the waveform).
// Returns a webm/opus Blob that the caller sends to /api/stt.
import { useCallback, useRef, useState } from "react";

export type VoiceState = "idle" | "listening" | "transcribing" | "error";

export function useVoice() {
  const [state, setState] = useState<VoiceState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0); // 0..1 amplitude
  const [error, setError] = useState<string | null>(null);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    rafRef.current = null;
    timerRef.current = null;
    streamRef.current = null;
    audioCtxRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const rec = new MediaRecorder(stream, { mimeType: pickMime() });
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.start();
      mediaRef.current = rec;
      setState("listening");
      setSeconds(0);

      // timer + 60s cap
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= 60) stop();
          return s + 1;
        });
      }, 1000);

      // amplitude meter
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += (v - 128) ** 2;
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) / 40));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      setError("ไม่สามารถเข้าถึงไมโครโฟน — ขอพิมพ์แทนได้ไหมคะ");
      setState("error");
      cleanup();
      console.error("[voice]", (e as Error).message);
    }
  }, [cleanup]);

  const stop = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const rec = mediaRef.current;
      if (!rec || rec.state === "inactive") {
        cleanup();
        setState("idle");
        resolve(null);
        return;
      }
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType });
        cleanup();
        setState("transcribing");
        resolve(blob);
      };
      rec.stop();
    });
  }, [cleanup]);

  const cancel = useCallback(() => {
    const rec = mediaRef.current;
    if (rec && rec.state !== "inactive") {
      rec.onstop = null;
      rec.stop();
    }
    cleanup();
    setState("idle");
    setSeconds(0);
    setLevel(0);
  }, [cleanup]);

  const reset = useCallback(() => {
    setState("idle");
    setSeconds(0);
    setLevel(0);
    setError(null);
  }, []);

  return { state, seconds, level, error, start, stop, cancel, reset };
}

function pickMime(): string {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  for (const t of types) if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  return "";
}
