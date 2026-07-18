"use client";
// Haptic + soft audio cue for the Anomaly Popup and station completions.
// Sound is optional (toggle ใน ตั้งค่า > ความเป็นส่วนตัว); vibration is a
// short pattern only. Both no-op cleanly when the platform lacks support.

export function vibrate(pattern: number | number[] = 120): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}

/** เสียงเตือนสั้นเบา ๆ ผ่าน WebAudio (ไม่ต้องมีไฟล์เสียง) */
export function playAlertTone(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => void ctx.close().catch(() => undefined);
  } catch {
    /* autoplay policy or unsupported — เงียบไว้ */
  }
}
